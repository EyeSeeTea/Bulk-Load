import _ from "lodash";
import moment from "moment";
import { UseCase } from "../../CompositionRoot";
import { cleanOrgUnitPath } from "../../utils/dhis";
import { isString, removeCharacters } from "../../utils/string";
import Settings from "../../webapp/logic/settings";
import { DuplicateExclusion, DuplicateToleranceUnit } from "../entities/AppSettings";
import { DataForm, DataOption } from "../entities/DataForm";
import { DataPackage, DataPackageData, DataPackageDataValue, TrackerProgramPackage } from "../entities/DataPackage";
import { Either } from "../entities/Either";
import { OrgUnit } from "../entities/OrgUnit";
import { ErrorMessage, SynchronizationResult } from "../entities/SynchronizationResult";
import { Template } from "../entities/Template";
import { ExcelReader } from "../helpers/ExcelReader";
import { ExcelRepository } from "../repositories/ExcelRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";
import { TemplateRepository } from "../repositories/TemplateRepository";
import { FileRepository } from "../repositories/FileRepository";
import { FileResource } from "../entities/FileResource";
import { ImportSourceRepository } from "../repositories/ImportSourceRepository";
import { AttributeValue, TrackedEntityInstance } from "../entities/TrackedEntityInstance";
import { Maybe, Optional } from "../../types/utils";

export type ImportTemplateError =
    | {
          type: "INVALID_DATA_FORM_ID" | "DATA_FORM_NOT_FOUND" | "INVALID_OVERRIDE_ORG_UNIT" | "MALFORMED_TEMPLATE";
      }
    | { type: "INVALID_ORG_UNITS"; dataValues: DataPackage; invalidDataValues: DataPackage }
    | {
          type: "DUPLICATE_VALUES";
          dataValues: DataPackage;
          existingDataValues: DataPackage;
          instanceDataValues: DataPackage;
      };

export type DuplicateImportStrategy = "ERROR" | "IMPORT" | "IGNORE" | "IMPORT_WITHOUT_DELETE";
export type OrganisationUnitImportStrategy = "ERROR" | "IGNORE";

export interface ImportTemplateUseCaseParams {
    file: File;
    useBuilderOrgUnits?: boolean;
    selectedOrgUnits?: string[];
    duplicateStrategy?: DuplicateImportStrategy;
    organisationUnitStrategy?: OrganisationUnitImportStrategy;
    settings: Settings;
}

type CustomErrorMatch = {
    regex: RegExp;
    getErrorMessage: (value: string) => string;
};

const ORG_UNIT_GLOBAL_LEVEL = 1;
type ActionPermissionType = "read" | "write";

function getDefaultOrgUnitMessage(name: string, action: ActionPermissionType) {
    return `The user cannot ${action.toUpperCase()} in OU ${name}`;
}

const customErrorMatches: CustomErrorMatch[] = [
    {
        regex: /Organisation unit: `(\w+)` not in hierarchy of current user: `(\w+)`/,
        getErrorMessage: (name: string) => {
            return getDefaultOrgUnitMessage(name, "write");
        },
    },
];

export class ImportTemplateUseCase implements UseCase {
    constructor(
        private instanceRepository: InstanceRepository,
        private templateRepository: TemplateRepository,
        private excelRepository: ExcelRepository,
        private fileRepository: FileRepository,
        private importSourceRepository: ImportSourceRepository
    ) {}

    public async execute({
        file,
        useBuilderOrgUnits = false,
        selectedOrgUnits = [],
        duplicateStrategy = "ERROR",
        organisationUnitStrategy = "ERROR",
        settings,
    }: ImportTemplateUseCaseParams): Promise<Either<ImportTemplateError, SynchronizationResult[]>> {
        const { spreadSheet, images } = await this.importSourceRepository.import(file);

        if (useBuilderOrgUnits && selectedOrgUnits.length !== 1) {
            return Either.error({ type: "INVALID_OVERRIDE_ORG_UNIT" });
        }

        const templateId = await this.excelRepository.loadTemplate({ type: "file", file: spreadSheet });
        const template = await this.templateRepository.getTemplate(templateId);

        const dataFormId = removeCharacters(
            await this.excelRepository.readCell(templateId, template.dataFormId, {
                formula: true,
            })
        );
        if (!dataFormId || typeof dataFormId !== "string") {
            return Either.error({ type: "INVALID_DATA_FORM_ID" });
        }

        const [dataForm] = await this.instanceRepository.getDataForms({ ids: [dataFormId] });
        if (!dataForm) {
            return Either.error({ type: "DATA_FORM_NOT_FOUND" });
        }

        const dataPackage = await this.readTemplate(template, dataForm);
        if (!dataPackage) {
            return Either.error({ type: "MALFORMED_TEMPLATE" });
        }

        const orgUnits = await this.instanceRepository.getDataFormOrgUnits(dataForm.type, dataFormId);
        this.validateOrgUnitAccess(dataPackage, orgUnits, selectedOrgUnits, settings);

        const filesToUpload =
            images.length === 0 ? [] : this.validateImagesExistInZip(dataPackage.dataEntries, dataForm, images);

        const uploadedFiles = await this.fileRepository.uploadAll(filesToUpload);

        const { dataValues, invalidDataValues, existingDataValues, instanceDataValues } = await this.readDataValues(
            dataPackage,
            dataForm,
            useBuilderOrgUnits,
            selectedOrgUnits,
            settings,
            duplicateStrategy,
            uploadedFiles
        );

        if (organisationUnitStrategy === "ERROR" && invalidDataValues.dataEntries.length > 0) {
            return Either.error({ type: "INVALID_ORG_UNITS", dataValues, invalidDataValues });
        }

        if (duplicateStrategy === "ERROR" && existingDataValues.dataEntries.length > 0) {
            return Either.error({
                type: "DUPLICATE_VALUES",
                dataValues,
                existingDataValues,
                instanceDataValues,
            });
        }

        const shouldDeleteExistingData =
            dataForm.type === "dataSets" ? this.shouldDeleteAggregatedData(duplicateStrategy) : false;

        const deleteResult = shouldDeleteExistingData
            ? await this.instanceRepository.deleteAggregatedData(instanceDataValues)
            : undefined;

        const importResult = await this.instanceRepository.importDataPackage(dataValues, {
            createAndUpdate: duplicateStrategy === "IMPORT_WITHOUT_DELETE" || duplicateStrategy === "ERROR",
            multiTextTeiDelimiter: this.getMultiTextTeiDelimiter(template),
        });

        const importResultHasErrors = importResult.flatMap(result => result.errors);
        if (importResultHasErrors.length > 0 || deleteResult) {
            const importResultWithErrorsDetails = this.getImportResultsWithDetailsErrors(importResult, orgUnits);

            const deleteResultWithErrorsDetails = deleteResult
                ? {
                      ...deleteResult,
                      errors: this.generateErrorDetails(deleteResult.errors || [], customErrorMatches, orgUnits),
                  }
                : undefined;

            return Either.success(_.compact([deleteResultWithErrorsDetails, ...importResultWithErrorsDetails]));
        } else {
            return Either.success(_.compact([deleteResult, ...importResult]));
        }
    }

    private getMultiTextTeiDelimiter(template: Template): Maybe<string> {
        if (template.type !== "custom") return undefined;

        return _(template.dataSources)
            .map(dataSource => {
                if (typeof dataSource === "function") {
                    return undefined;
                } else if (dataSource.type !== "rowTei") {
                    return undefined;
                } else {
                    return dataSource.multiTextDelimiter;
                }
            })
            .compact()
            .first();
    }

    private shouldDeleteAggregatedData(strategy: DuplicateImportStrategy): boolean {
        return strategy === "IMPORT";
    }

    private validateOrgUnitAccess(
        dataPackage: DataPackage,
        orgUnits: OrgUnit[],
        selectedOrgUnits: string[],
        settings: Settings
    ): void {
        const orgUnitsIdsToCheck = [...dataPackage.dataEntries.map(de => de.orgUnit), ...selectedOrgUnits];
        const orgUnitsToCheck = _(orgUnitsIdsToCheck)
            .map(orgUnitId => {
                const orgUnitDetails = orgUnits.find(ou => ou.id === orgUnitId);
                if (!orgUnitDetails) return undefined;
                return {
                    ...orgUnitDetails,
                };
            })
            .compact()
            .value();

        this.hasOrgUnitAccessOrThrow(orgUnitsToCheck, settings, "read");
        this.hasOrgUnitAccessOrThrow(orgUnitsToCheck, settings, "write");
    }

    private hasOrgUnitAccessOrThrow(orgUnitsToCheck: OrgUnit[], settings: Settings, permission: ActionPermissionType) {
        const orgUnitFieldName = permission === "read" ? "orgUnitsView" : "orgUnits";
        if (settings.currentUser[orgUnitFieldName].some(ou => ou.level === ORG_UNIT_GLOBAL_LEVEL)) return;

        orgUnitsToCheck.forEach(orgUnit => {
            const hasPermission = settings.currentUser[orgUnitFieldName].some(userOrgUnit => {
                const diffLevel = orgUnit.level - userOrgUnit.level;
                if (diffLevel === 0) {
                    return orgUnit.path === userOrgUnit.path;
                } else {
                    const orgUnitPath = _(orgUnit.path).split("/").dropRight(diffLevel).value().join("/");
                    return orgUnitPath === userOrgUnit.path;
                }
            });
            if (!hasPermission) {
                const errorMessage = getDefaultOrgUnitMessage(orgUnit.name, permission);
                throw Error(errorMessage);
            }
        });
    }

    private async readTemplate(template: Template, dataForm: DataForm): Promise<DataPackage | undefined> {
        const reader = new ExcelReader(this.excelRepository, this.instanceRepository);
        const excelDataValues = await reader.readTemplate(template, dataForm);
        if (!excelDataValues) return undefined;

        const customDataValues = await reader.templateCustomization(template, excelDataValues);
        const dataPackage = customDataValues ?? excelDataValues;

        const trackedEntityPackage =
            dataPackage.type === "trackerPrograms" ? this.formatTrackedEntityInstances(dataPackage, dataForm) : {};

        return {
            ...dataPackage,
            ...trackedEntityPackage,
            dataEntries: dataPackage.dataEntries.map(({ dataValues, ...dataEntry }) => {
                return {
                    ...dataEntry,
                    dataValues: _.compact(dataValues.map(value => formatDataValue(value, dataForm))),
                };
            }),
        };
    }

    private formatTrackedEntityInstances(dataPackage: TrackerProgramPackage, dataForm: DataForm) {
        return {
            ...dataPackage,
            trackedEntityInstances: dataPackage.trackedEntityInstances.map(tei => {
                return {
                    ...tei,
                    attributeValues: tei.attributeValues.map(attribute => {
                        const formattedValue = formatAttributeValue(attribute, dataForm);
                        return formattedValue ? { ...formattedValue, attribute: attribute.attribute } : undefined;
                    }),
                };
            }),
        };
    }

    private async readDataValues(
        excelDataPackage: DataPackage,
        dataForm: DataForm,
        useBuilderOrgUnits: boolean,
        selectedOrgUnits: string[],
        settings: Settings,
        duplicateStrategy: DuplicateImportStrategy,
        files: FileResource[]
    ) {
        const { duplicateEnabled, duplicateExclusion, duplicateTolerance, duplicateToleranceUnit } = settings;

        // Override org unit if needed
        const excelFile = this.parseExcelFile(excelDataPackage, useBuilderOrgUnits, selectedOrgUnits);

        const instanceDataValues = duplicateEnabled
            ? await this.getExistingDataValues(excelDataPackage, dataForm, useBuilderOrgUnits, selectedOrgUnits)
            : [];

        const dataFormOrgUnits = await this.instanceRepository.getDataFormOrgUnits(dataForm.type, dataForm.id);
        const [defaultCategory] = await this.instanceRepository.getDefaultIds("categoryOptionCombos");

        // Remove data values assigned to invalid org unit
        const invalidDataValues = _.remove(
            excelFile,
            ({ orgUnit }) => !dataFormOrgUnits.find(({ id }) => id === orgUnit)
        );

        const existingDataValues =
            duplicateStrategy === "IMPORT_WITHOUT_DELETE" || duplicateStrategy === "IMPORT"
                ? []
                : _.remove(excelFile, base => {
                      return instanceDataValues.find(dataPackage =>
                          compareDataPackages(
                              dataForm,
                              base,
                              dataPackage,
                              duplicateExclusion,
                              duplicateTolerance,
                              duplicateToleranceUnit,
                              defaultCategory
                          )
                      );
                  });

        const trackedEntityInstances = getTrackedEntityInstances(
            excelDataPackage,
            useBuilderOrgUnits,
            selectedOrgUnits
        );

        return {
            dataValues: {
                type: dataForm.type,
                dataEntries: files.length === 0 ? excelFile : this.addImagesToDataEntries(files, excelFile, dataForm),
                trackedEntityInstances:
                    files.length === 0 ? trackedEntityInstances : this.addImagesToTeis(files, trackedEntityInstances),
            },
            invalidDataValues: {
                type: dataForm.type,
                dataEntries: invalidDataValues,
                trackedEntityInstances: [],
            },
            existingDataValues: {
                type: dataForm.type,
                dataEntries: existingDataValues,
                trackedEntityInstances: [],
            },
            instanceDataValues: {
                type: dataForm.type,
                dataEntries: instanceDataValues,
                trackedEntityInstances: [],
            },
        };
    }

    private addImagesToDataEntries(files: FileResource[], dataEntries: DataPackageData[], dataForm: DataForm) {
        const imageDataElementsIds = this.getImageDataElementIds(dataForm);
        return dataEntries.map(dataEntry => {
            return {
                ...dataEntry,
                dataValues: dataEntry.dataValues.map(dataValue => {
                    if (!imageDataElementsIds.includes(dataValue.dataElement)) {
                        return dataValue;
                    }
                    const fileInfo = files.find(
                        file => file.name.toLowerCase() === String(dataValue.value).toLowerCase()
                    );
                    return {
                        ...dataValue,
                        value: fileInfo?.id || "",
                    };
                }),
            };
        });
    }

    private addImagesToTeis(files: FileResource[], trackedEntityInstances: TrackedEntityInstance[]) {
        return trackedEntityInstances.map(tei => {
            return {
                ...tei,
                attributeValues: tei.attributeValues.map(attribute => {
                    const imageAttribute = files.find(file => file.name === attribute.value);
                    if (attribute.attribute.valueType !== "IMAGE" || !imageAttribute) {
                        return attribute;
                    }

                    return {
                        ...attribute,
                        value: imageAttribute.id,
                    };
                }),
            };
        });
    }

    private validateImagesExistInZip(dataEntries: DataPackageData[], dataForm: DataForm, images: FileResource[]) {
        const imagesInExcel = this.getImageDataValuesOnly(dataEntries, dataForm);
        const imagesNames = images.map(image => image.name);
        const fileNotInZip = _.differenceBy(imagesInExcel, imagesNames);
        if (fileNotInZip.length > 0) {
            console.error(_.differenceBy(imagesInExcel, imagesNames));
            const message = `Cannot found files: ${fileNotInZip.join(", ")} in zip.`;
            throw new Error(message);
        }
        return images;
    }

    private getImageDataValuesOnly(dataEntries: DataPackageData[], dataForm: DataForm) {
        const imageDataElementsIds = this.getImageDataElementIds(dataForm);
        const fileNameInDataValues = _(dataEntries)
            .flatMap(de => de.dataValues)
            .filter(dv => imageDataElementsIds.includes(dv.dataElement))
            .map(dv => String(dv.value))
            .compact()
            .value();

        return fileNameInDataValues;
    }

    private getImageDataElementIds(dataForm: DataForm) {
        return dataForm.dataElements.filter(de => de.valueType === "IMAGE").map(de => de.id);
    }

    private parseExcelFile(dataPackage: DataPackage, useBuilderOrgUnits: boolean, selectedOrgUnits: string[]) {
        const dataEntries =
            dataPackage.type === "dataSets"
                ? _.flatMap(dataPackage.dataEntries, entry =>
                      entry.dataValues.map(value => ({ ...entry, dataValues: [value] }))
                  )
                : dataPackage.dataEntries;

        return useBuilderOrgUnits && selectedOrgUnits[0]
            ? this.overrideOrgUnit(dataEntries, selectedOrgUnits[0])
            : dataEntries;
    }

    private async getExistingDataValues(
        excelDataPackage: DataPackage,
        dataForm: DataForm,
        useBuilderOrgUnits: boolean,
        selectedOrgUnits: string[]
    ): Promise<DataPackageData[]> {
        const originalDataValues =
            useBuilderOrgUnits && selectedOrgUnits[0]
                ? this.overrideOrgUnit(excelDataPackage.dataEntries, selectedOrgUnits[0])
                : excelDataPackage.dataEntries;

        const { dataEntries } = await this.getInstanceDataValues(dataForm, originalDataValues);
        return dataEntries;
    }

    private overrideOrgUnit(dataValues: DataPackageData[], replaceOrgUnit: string): DataPackageData[] {
        return dataValues.map(dataValue => ({
            ...dataValue,
            orgUnit: cleanOrgUnitPath(replaceOrgUnit),
        }));
    }

    private async getInstanceDataValues(dataForm: DataForm, dataValues: DataPackageData[]) {
        const periods = _.uniq(dataValues.map(({ period }) => period.toString()));
        const orgUnits = _.uniq(dataValues.map(({ orgUnit }) => orgUnit));

        return this.instanceRepository.getDataPackage({
            id: dataForm.id,
            type: dataForm.type,
            periods,
            orgUnits,
            translateCodes: false,
        });
    }

    private getImportResultsWithDetailsErrors(
        importResult: SynchronizationResult[],
        orgUnits: OrgUnit[]
    ): SynchronizationResult[] {
        const importResultsWithErrorsDetails = importResult.map(result => {
            return {
                ...result,
                errors: this.generateErrorDetails(result.errors || [], customErrorMatches, orgUnits),
            };
        });
        return importResultsWithErrorsDetails;
    }

    private generateErrorDetails(errors: ErrorMessage[], allowedMessages: CustomErrorMatch[], orgUnits: OrgUnit[]) {
        return errors.map(error => {
            const orgUnit = orgUnits.find(ou => ou.id === error.id);
            const matches = allowedMessages.find(regex => error.message.match(regex.regex));
            return {
                ...error,
                details: matches && orgUnit ? matches.getErrorMessage(orgUnit.name) : "",
            };
        });
    }
}

function getTrackedEntityInstances(
    excelDataValues: DataPackage,
    useBuilderOrgUnits: boolean,
    selectedOrgUnitPaths: string[]
) {
    const orgUnitOverridePath = useBuilderOrgUnits ? selectedOrgUnitPaths[0] : null;
    const teis = excelDataValues.type === "trackerPrograms" ? excelDataValues.trackedEntityInstances : [];

    return orgUnitOverridePath
        ? teis.map(tei => ({ ...tei, orgUnit: { id: cleanOrgUnitPath(orgUnitOverridePath) } }))
        : teis;
}

// This method should not be exposed, remove as soon as not used in legacy code
export const compareDataPackages = (
    dataForm: Pick<DataForm, "type" | "id">,
    base: Partial<DataPackageData>,
    compare: DataPackageData,
    duplicateExclusion: DuplicateExclusion,
    duplicateTolerance: number,
    duplicateToleranceUnit: DuplicateToleranceUnit,
    defaultCategory?: string
): boolean => {
    const properties = _.compact([dataForm.type === "dataSets" ? "period" : undefined, "orgUnit", "attribute"]);

    for (const property of properties) {
        const baseValue = _.get(base, property);
        const compareValue = _.get(compare, property);
        const areEqual = _.isEqual(baseValue, compareValue);
        if (baseValue && compareValue && !areEqual) return false;
    }

    if (dataForm.type === "programs" || dataForm.type === "trackerPrograms") {
        const isWithToleranceRange =
            moment
                .duration(moment(base.period).diff(moment(compare.period)))
                .abs()
                .as(duplicateToleranceUnit) > duplicateTolerance;
        if (isWithToleranceRange) return false;

        if (base.id && base.id === compare.id) return false;

        const exclusions = duplicateExclusion[dataForm.id] ?? [];
        const filter = (values: DataPackageDataValue[]) => {
            return values.filter(({ dataElement }) => !exclusions.includes(dataElement));
        };

        if (
            base.dataValues &&
            !_.isEqualWith(
                filter(base.dataValues),
                filter(compare.dataValues),
                (base: DataPackageDataValue[], compare: DataPackageDataValue[]) => {
                    const values = ({ dataElement, value }: DataPackageDataValue) => `${dataElement}-${value}`;
                    const intersection = _.intersectionBy(base, compare, values);
                    return base.length === compare.length && intersection.length === base.length;
                }
            )
        ) {
            return false;
        }
    }

    if (dataForm.type === "dataSets") {
        return _.some(base.dataValues, ({ dataElement: baseDataElement, category: baseCategory = defaultCategory }) =>
            compare.dataValues.find(
                ({ dataElement, category = defaultCategory }) =>
                    dataElement === baseDataElement && category === baseCategory
            )
        );
    }

    return true;
};

const trueValues = ["y", "yes", "true", "1"];
const falseValues = ["n", "no", "false", "0"];

function getBooleanValue(item: DataPackageDataValue): Maybe<boolean> {
    const strValue = String(item.value).toLowerCase();

    switch (true) {
        case String(item.optionId) === "true" || item.optionId === "true":
            return true;
        case String(item.optionId) === "false" || item.optionId === "false":
            return false;
        case trueValues.includes(strValue):
            return true;
        case falseValues.includes(strValue):
            return false;
        default:
            return undefined;
    }
}

function getOptionValue(originalValue: string, options?: DataOption[]): Optional<DataOption> {
    if (!options) return undefined;

    return options.find(({ id, name }) => originalValue === id || originalValue === name);
}

function formatDataValue(item: DataPackageDataValue, dataForm: DataForm): Optional<DataPackageDataValue> {
    const dataElement = dataForm.dataElements.find(({ id }) => item.dataElement === id);
    const booleanValue = getBooleanValue(item);

    if (dataElement?.valueType === "BOOLEAN") {
        return { ...item, value: booleanValue ?? "" };
    }

    if (dataElement?.valueType === "TRUE_ONLY") {
        return booleanValue ? { ...item, value: true } : undefined;
    }

    const optionValue = isString(item.value) ? getOptionValue(item.value, dataElement?.options) : undefined;
    const value = optionValue?.code ?? item.value;

    if (item.contentType === "function") {
        return { ...item, value, optionId: optionValue?.id };
    } else {
        return { ...item, value };
    }
}

function formatAttributeValue(item: AttributeValue, dataForm: DataForm): AttributeValue | undefined {
    const attribute = dataForm.teiAttributes?.find(({ id }) => item.attribute.id === id);
    if (!attribute) return undefined;

    const optionValue = getOptionValue(item.value, attribute.options);
    const value = optionValue?.code ?? item.value;

    if (item.contentType === "function") {
        return { ...item, value, optionId: optionValue?.id };
    } else {
        return { ...item, value };
    }
}
