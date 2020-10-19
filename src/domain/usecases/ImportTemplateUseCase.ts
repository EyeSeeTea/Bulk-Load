import _ from "lodash";
import moment from "moment";
import { UseCase } from "../../CompositionRoot";
import Settings from "../../webapp/logic/settings";
import { DuplicateExclusion, DuplicateToleranceUnit } from "../entities/AppSettings";
import { DataForm } from "../entities/DataForm";
import { DataPackage, DataPackageData, DataPackageDataValue } from "../entities/DataPackage";
import { Either } from "../entities/Either";
import { ImportSummary } from "../entities/ImportSummary";
import { ExcelReader } from "../helpers/ExcelReader";
import { ExcelRepository } from "../repositories/ExcelRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";
import { TemplateRepository } from "../repositories/TemplateRepository";

export type ImportTemplateError =
    | {
          type:
              | "INVALID_DATA_FORM_ID"
              | "DATA_FORM_NOT_FOUND"
              | "INVALID_OVERRIDE_ORG_UNIT"
              | "MALFORMED_TEMPLATE";
      }
    | { type: "INVALID_ORG_UNITS"; dataValues: DataPackage; invalidDataValues: DataPackage }
    | { type: "DUPLICATE_VALUES"; dataValues: DataPackage; existingDataValues: DataPackage };

export type DuplicateImportStrategy = "ERROR" | "IMPORT" | "IGNORE";
export type OrganisationUnitImportStrategy = "ERROR" | "IGNORE";

export interface ImportTemplateUseCaseParams {
    file: File;
    useBuilderOrgUnits?: boolean;
    selectedOrgUnits?: string[];
    duplicateStrategy?: DuplicateImportStrategy;
    organisationUnitStrategy?: OrganisationUnitImportStrategy;
    settings: Settings;
}

export class ImportTemplateUseCase implements UseCase {
    constructor(
        private instanceRepository: InstanceRepository,
        private templateRepository: TemplateRepository,
        private excelRepository: ExcelRepository
    ) {}

    public async execute({
        file,
        useBuilderOrgUnits = false,
        selectedOrgUnits = [],
        duplicateStrategy = "ERROR",
        organisationUnitStrategy = "ERROR",
        settings,
    }: ImportTemplateUseCaseParams): Promise<Either<ImportTemplateError, ImportSummary>> {
        if (useBuilderOrgUnits && selectedOrgUnits.length !== 1) {
            return Either.error({ type: "INVALID_OVERRIDE_ORG_UNIT" });
        }

        const templateId = await this.excelRepository.loadTemplate({ type: "file", file });
        const template = this.templateRepository.getTemplate(templateId);

        const dataFormId = await this.excelRepository.readCell(templateId, template.dataFormId);
        if (!dataFormId || typeof dataFormId !== "string") {
            return Either.error({ type: "INVALID_DATA_FORM_ID" });
        }

        const [dataForm] = await this.instanceRepository.getDataForms({ ids: [dataFormId] });
        if (!dataForm) {
            return Either.error({ type: "DATA_FORM_NOT_FOUND" });
        }

        const reader = new ExcelReader(this.excelRepository);
        const excelDataValues = await reader.readTemplate(template);
        if (!excelDataValues) {
            return Either.error({ type: "MALFORMED_TEMPLATE" });
        }

        const { dataValues, invalidDataValues, existingDataValues } = await this.readDataValues(
            excelDataValues,
            dataForm,
            useBuilderOrgUnits,
            selectedOrgUnits,
            settings,
            duplicateStrategy
        );

        if (organisationUnitStrategy === "ERROR" && invalidDataValues.dataEntries.length > 0) {
            return Either.error({ type: "INVALID_ORG_UNITS", dataValues, invalidDataValues });
        }

        if (duplicateStrategy === "ERROR" && existingDataValues.dataEntries.length > 0) {
            return Either.error({ type: "DUPLICATE_VALUES", dataValues, existingDataValues });
        }

        // TODO: @SferaDev DELETE EXISTING
        const result = await this.instanceRepository.importDataPackage(dataValues);

        return Either.success(result);
    }

    private async readDataValues(
        excelDataValues: DataPackage,
        dataForm: DataForm,
        useBuilderOrgUnits: boolean,
        selectedOrgUnits: string[],
        settings: Settings,
        duplicateStrategy: DuplicateImportStrategy
    ) {
        const { duplicateExclusion, duplicateTolerance, duplicateToleranceUnit } = settings;

        const instanceDataValues = await this.getInstanceDataValues(dataForm, excelDataValues);
        const dataFormOrgUnits = await this.instanceRepository.getDataFormOrgUnits(
            dataForm.type,
            dataForm.id
        );

        // Override org unit if needed
        const dataValues = excelDataValues.dataEntries.map(({ orgUnit, ...rest }) => ({
            ...rest,
            orgUnit: useBuilderOrgUnits ? selectedOrgUnits[0] : orgUnit,
        }));

        // Remove data values assigned to invalid org unit
        const invalidDataValues = _.remove(
            dataValues,
            ({ orgUnit }) => !dataFormOrgUnits.find(({ id }) => id === orgUnit)
        );

        const existingDataValues =
            duplicateStrategy === "IMPORT"
                ? []
                : _.remove(dataValues, base => {
                      return instanceDataValues.dataEntries.find(dataPackage =>
                          compareDataPackages(
                              dataForm,
                              base,
                              dataPackage,
                              duplicateExclusion,
                              duplicateTolerance,
                              duplicateToleranceUnit
                          )
                      );
                  });

        return {
            dataValues: {
                type: dataForm.type,
                dataEntries: dataValues,
                trackedEntityInstances: [],
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
        };
    }

    private async getInstanceDataValues(dataForm: DataForm, excelDataValues: DataPackage) {
        const periods = _.uniq(excelDataValues.dataEntries.map(({ period }) => period.toString()));
        const orgUnits = _.uniq(excelDataValues.dataEntries.map(({ orgUnit }) => orgUnit));

        return this.instanceRepository.getDataPackage({
            id: dataForm.id,
            type: dataForm.type,
            periods,
            orgUnits,
            translateCodes: false,
        });
    }
}

const compareDataPackages = (
    dataForm: DataForm,
    base: Partial<DataPackageData>,
    compare: DataPackageData,
    duplicateExclusion: DuplicateExclusion,
    duplicateTolerance: number,
    duplicateToleranceUnit: DuplicateToleranceUnit
): boolean => {
    const properties = _.compact([
        dataForm.type === "dataSets" ? "period" : undefined,
        "orgUnit",
        "attribute",
    ]);

    for (const property of properties) {
        const baseValue = _.get(base, property);
        const compareValue = _.get(compare, property);
        const areEqual = _.isEqual(baseValue, compareValue);
        if (baseValue && compareValue && !areEqual) return false;
    }

    if (dataForm.type === "programs") {
        if (
            moment
                .duration(moment(base.period).diff(moment(compare.period)))
                .abs()
                .as(duplicateToleranceUnit) > duplicateTolerance
        ) {
            return false;
        }

        // Ignore data packages with event id set
        if (base.id && compare.id) return false;

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
                    const values = ({ dataElement, value }: DataPackageDataValue) =>
                        `${dataElement}-${value}`;
                    const intersection = _.intersectionBy(base, compare, values);
                    return base.length === compare.length && intersection.length === base.length;
                }
            )
        ) {
            return false;
        }
    }

    return true;
};
