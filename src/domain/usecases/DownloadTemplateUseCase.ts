import { saveAs } from "file-saver";
import * as fs from "fs";
import _ from "lodash";
import { Moment } from "moment";
import { UseCase } from "../../CompositionRoot";
import { RelationshipOrgUnitFilter } from "../../data/Dhis2RelationshipTypes";
import { getExtensionFile, XLSX_EXTENSION } from "../../utils/files";
import Settings from "../../webapp/logic/settings";
import { getGeneratedTemplateId, SheetBuilder } from "../../webapp/logic/sheetBuilder";
import { DataForm, DataFormType } from "../entities/DataForm";
import { OrgUnit } from "../entities/OrgUnit";
import { Id } from "../entities/ReferenceObject";
import {
    getDataFormRef,
    hasMultiTextDataElementDelimiter,
    Template,
    templateFromDataPackage,
    TemplateType,
} from "../entities/Template";
import { ExcelBuilder } from "../helpers/ExcelBuilder";
import { ExcelRepository } from "../repositories/ExcelRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";
import { ModulesRepositories } from "../repositories/ModulesRepositories";
import { TemplateMetadataRepository, toSheetBuilderMetadata } from "../repositories/TemplateMetadataRepository";
import { TemplateRepository } from "../repositories/TemplateRepository";
import { UsersRepository } from "../repositories/UsersRepository";
import { buildAllPossiblePeriods } from "../../webapp/utils/periods";
import { applyFilter } from "../entities/TemplateFilter";
import { DataElementDisaggregationsMappingRepository } from "../repositories/DataElementDisaggregationsMappingRepository";
import { getCaptureOrgUnitIdsForDataForm } from "./utils/orgUnits";

export interface DownloadTemplateProps {
    type: DataFormType;
    id: Id;
    language: string;
    orgUnits?: string[];
    theme?: Id;
    startDate?: Moment;
    endDate?: Moment;
    populate: boolean;
    populateStartDate?: Moment;
    populateEndDate?: Moment;
    writeFile?: string;
    settings: Settings;
    downloadRelationships: boolean;
    filterTEIEnrollmentDate?: boolean;
    relationshipsOuFilter?: RelationshipOrgUnitFilter;
    templateId: string;
    templateType: TemplateType;
    splitDataEntryTabsBySection: boolean;
    useCodesForMetadata: boolean;
    showLanguage: boolean;
    showPeriod: boolean;
    orgUnitShortName?: boolean;
    dataFilter: {
        teiFilterId?: string;
    };
}

export class DownloadTemplateUseCase implements UseCase {
    constructor(
        private instanceRepository: InstanceRepository,
        private templateRepository: TemplateRepository,
        private excelRepository: ExcelRepository,
        private modulesRepositories: ModulesRepositories,
        private usersRepository: UsersRepository,
        private dataElementDisaggregationsMappingRepository: DataElementDisaggregationsMappingRepository,
        private templateMetadataRepository: TemplateMetadataRepository
    ) {}

    public async execute(options: DownloadTemplateProps): Promise<void> {
        const {
            type,
            id,
            theme: themeId,
            orgUnits = [],
            startDate,
            endDate,
            language,
            populate,
            populateStartDate,
            populateEndDate,
            writeFile,
            settings,
            downloadRelationships,
            filterTEIEnrollmentDate,
            relationshipsOuFilter,
            templateId: customTemplateId,
            templateType,
            splitDataEntryTabsBySection,
            useCodesForMetadata,
            showLanguage,
            orgUnitShortName,
            dataFilter,
        } = options;

        const useShortNameInOrgUnit = orgUnitShortName || false;
        const templateId =
            templateType === "custom" && customTemplateId ? customTemplateId : getGeneratedTemplateId(type);
        const currentUser = await this.usersRepository.getCurrentUser();
        const template = await this.templateRepository.getTemplate(templateId);
        const theme = themeId ? await this.templateRepository.getTheme(themeId) : undefined;
        const [dataForm] = await this.instanceRepository.getDataForms({ ids: [id] });
        if (!dataForm) throw new Error(`Data form not found: ${id}`);
        const name = dataForm.name;
        const dataFormOrgUnits = await this.instanceRepository.getDataFormOrgUnits(type, id);

        const orgUnitIds =
            _.isEmpty(orgUnits) && settings.orgUnitSelection === "import"
                ? getCaptureOrgUnitIdsForDataForm(dataFormOrgUnits, currentUser.orgUnits)
                : orgUnits;

        const getGenerateFile = async (maxTeiRows?: number) => {
            const result = await this.templateMetadataRepository.get({
                type,
                id,
                downloadRelationships,
                orgUnitIds,
                startDate: startDate?.toDate(),
                endDate: endDate?.toDate(),
                populateStartDate: populateStartDate?.toDate(),
                populateEndDate: populateEndDate?.toDate(),
                relationshipsOuFilter,
                orgUnitShortName: useShortNameInOrgUnit,
            });

            // FIXME: Legacy code, sheet generator
            const sheetBuilder = new SheetBuilder({
                ...result,
                ...toSheetBuilderMetadata(result),
                startDate,
                endDate,
                language,
                theme,
                template,
                settings,
                downloadRelationships,
                splitDataEntryTabsBySection,
                useCodesForMetadata,
                orgUnitShortName: useShortNameInOrgUnit,
                maxTeiRows,
                includeMetadataCodes: template.includeMetadataCodes ?? false,
            });

            const workbook = await sheetBuilder.generate();
            return workbook.writeToBuffer();
        };

        const enablePopulate = populate && !!populateStartDate && !!populateEndDate;

        let dataPackage = enablePopulate
            ? await this.instanceRepository.getDataPackage({
                  type,
                  id,
                  orgUnits,
                  startDate: populateStartDate,
                  endDate: populateEndDate,
                  filterTEIEnrollmentDate,
                  relationshipsOuFilter,
                  includeCompletionStatus: true,
              })
            : undefined;

        if (dataPackage && template.type === "custom" && template.filters) {
            const teiFilter = dataFilter?.teiFilterId
                ? template.filters.teiFilters?.filters.find(filter => filter.id === dataFilter.teiFilterId)
                : undefined;

            if (teiFilter) {
                dataPackage = applyFilter({
                    dataPackage,
                    teiFilter: teiFilter,
                });
            }
        }

        if (dataPackage?.type === "dataSets" && template.type === "custom" && template.orgUnitSort === "ALPHABETICAL") {
            dataPackage = {
                ...dataPackage,
                dataEntries: sortDataEntriesByOrgUnitName(dataPackage.dataEntries, dataFormOrgUnits),
            };
        }

        const maxTeiRows =
            dataPackage?.type === "trackerPrograms" && enablePopulate
                ? dataPackage.trackedEntityInstances.length
                : undefined;

        if (template.type === "custom") {
            if (template.generateMetadata) {
                const file = await getGenerateFile(maxTeiRows);
                await this.excelRepository.loadTemplate({ type: "file", file: file });
            } else {
                await this.excelRepository.loadTemplate({
                    type: "file-base64",
                    contents: template.file.contents,
                    templateId: template.id,
                });
            }
        } else {
            const file = await getGenerateFile(maxTeiRows);
            await this.excelRepository.loadTemplate({ type: "file", file });
        }

        const builder = new ExcelBuilder(
            this.excelRepository,
            this.instanceRepository,
            this.modulesRepositories,
            this.dataElementDisaggregationsMappingRepository
        );

        await builder.templateCustomization(template, {
            currentUser,
            type,
            id,
            populate,
            dataPackage: dataPackage ? templateFromDataPackage(dataPackage) : undefined,
            orgUnits,
            language: showLanguage ? language : undefined,
        });

        if (theme) await builder.applyTheme(template, theme);

        if (template.type === "custom" && template.fixedOrgUnit) {
            await this.excelRepository.writeCell(
                template.id,
                template.fixedOrgUnit,
                dataPackage?.dataEntries[0]?.orgUnit ?? this.getFirstValueOrEmpty(orgUnits)
            );
        }

        if (template.type === "custom" && template.fixedPeriod) {
            const periods = buildAllPossiblePeriods(dataForm?.periodType, populateStartDate, populateEndDate);
            await this.excelRepository.writeCell(
                template.id,
                template.fixedPeriod,
                dataPackage?.dataEntries[0]?.period ?? this.getFirstValueOrEmpty(periods)
            );
        }

        if (enablePopulate) {
            if (dataPackage) {
                const dataForm = await this.getDataForm(template);
                await builder.populateTemplate(template, dataPackage, settings, dataForm);
            }
        }

        const extension = template.type === "custom" ? getExtensionFile(template.file.name) : XLSX_EXTENSION;
        const filename = `${name}.${extension}`;

        if (writeFile) {
            const buffer = await this.excelRepository.toBuffer(templateId);
            fs.writeFileSync(writeFile, buffer);
        } else {
            const data = await this.excelRepository.toBlob(templateId);
            saveAs(data, filename);
        }
    }

    private async getDataForm(template: Template): Promise<DataForm | undefined> {
        if (template.type !== "custom") return undefined;

        const hasMultiText = template.dataSources?.some(
            ds => hasMultiTextDataElementDelimiter(ds) && ds.multiTextDataElementDelimiter
        );
        if (!hasMultiText) return undefined;

        const dataFormRef = getDataFormRef(template);
        if (!dataFormRef.id) return undefined;

        return (await this.instanceRepository.getDataForms({ ids: [dataFormRef.id] }))[0];
    }

    private getFirstValueOrEmpty(model: string[]): string {
        return _(model).first() || "";
    }
}

// Joins an org unit's ancestor names into one sortable key. The NUL char is the separator because it is
// the only one guaranteed to sort before every real character and to never appear in a name, so a
// parent's key is always a prefix of its children's. Sorting these keys reproduces the org unit tree:
// pre-order (parent before children), siblings ordered by name.
const ANCESTOR_NAME_SEPARATOR = "\u0000";

function sortDataEntriesByOrgUnitName<T extends { orgUnit: Id }>(
    dataEntries: T[],
    organisationUnits: Pick<OrgUnit, "id" | "path" | "name">[]
): T[] {
    const ouById = _.keyBy(organisationUnits, ou => ou.id);

    const ancestorNameKey = (orgUnitId: Id): string =>
        _(ouById[orgUnitId]?.path ?? orgUnitId)
            .split("/")
            .compact()
            .map(segmentId => ouById[segmentId]?.name ?? segmentId)
            .join(ANCESTOR_NAME_SEPARATOR);

    return _.sortBy(dataEntries, entry => ancestorNameKey(entry.orgUnit));
}
