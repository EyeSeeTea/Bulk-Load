import _ from "lodash";
import { D2Api, MetadataPick } from "@eyeseetea/d2-api/2.33";
import { Id, NamedRef, Ref } from "../../../domain/entities/ReferenceObject";
import { DataElement, NRCModuleMetadata } from "../../../domain/entities/templates/NRCModuleMetadata";
import { NRCModuleMetadataRepository } from "../../../domain/repositories/templates/NRCModuleMetadataRepository";
import { User } from "../../../domain/entities/User";

export class NRCModuleMetadataD2Repository implements NRCModuleMetadataRepository {
    categoryComboCodes = {
        phaseOfEmergency: "GL_CORECOMP_CATCOMBO",
        actualTargets: "GL_Actual_Targets",
        all: "GL_CATBOMBO_ProjectCCTarAct",
    };

    constructor(private api: D2Api) {}

    async get(options: { currentUser: User; dataSetId: Id }): Promise<NRCModuleMetadata> {
        const dataSet = await this.getDataSet(options);
        const projectCategoryOption = await this.getProjectCategoryOption(dataSet);
        const categoryOptions = await this.getCategoryOptions(projectCategoryOption);
        const categoryOptionCombos = await this.getCategoryOptionCombos(projectCategoryOption);

        return {
            dataSet: dataSet,
            dataElements: await this.getDataElementsWithDisaggregation(dataSet),
            organisationUnits: this.getOrganisationUnits(options.currentUser, projectCategoryOption, dataSet),
            periods: this.getPeriods(dataSet),
            categoryCombo: {
                categories: {
                    project: { categoryOption: projectCategoryOption },
                    phasesOfEmergency: { categoryOptions: categoryOptions.phasesOfEmergency },
                    targetActual: { categoryOptions: categoryOptions.targetActual },
                },
                categoryOptionCombos: categoryOptionCombos,
            },
        };
    }

    private getOrganisationUnits(
        currentUser: User,
        projectCategoryOption: D2CategoryOption,
        dataSet: D2DataSet
    ): NamedRef[] {
        const projectOrgUnits = projectCategoryOption.organisationUnits;

        function isOrgUnitAvailableForCurrentUserAndProject(dataSetOrgUnit: { path: string }) {
            const canUserAccessDataSetOrgUnit = currentUser.orgUnits.some(userOrgUnit =>
                dataSetOrgUnit.path.includes(userOrgUnit.id)
            );

            const isProjectAssignedToDataSetOrgUnit =
                projectOrgUnits.length === 0 ||
                projectOrgUnits.some(projectOrgUnit => dataSetOrgUnit.path.includes(projectOrgUnit.id));

            return canUserAccessDataSetOrgUnit && isProjectAssignedToDataSetOrgUnit;
        }

        return _(dataSet.organisationUnits)
            .filter(isOrgUnitAvailableForCurrentUserAndProject)
            .sortBy(orgUnit => orgUnit.name)
            .value();
    }

    private getPeriods(dataSet: D2DataSet) {
        return _(dataSet.dataInputPeriods)
            .map(dip => ({ id: dip.period.id, name: dip.period.id }))
            .sortBy(period => period.id)
            .value();
    }

    private async getCategoryOptionCombos(projectCategoryOption: D2CategoryOption): Promise<D2Coc[]> {
        const { categoryOptionCombos } = await this.api.metadata
            .get({
                categoryOptionCombos: {
                    fields: { id: true, name: true, categoryOptions: { id: true } },
                    filter: {
                        "categoryOptions.id": { eq: projectCategoryOption.id },
                        "categoryCombo.code": { eq: this.categoryComboCodes.all },
                    },
                },
            })
            .getData();

        return categoryOptionCombos;
    }

    private async getDataElementsWithDisaggregation(dataSet: D2DataSet) {
        const dataElements = dataSet.dataSetElements.map(dse => dse.dataElement);
        const categoryComboByDataElement = _.keyBy(dataElements, dataElement => dataElement.id);
        const categoryComboIds = _(dataSet.dataSetElements)
            .map(dse => dse.categoryCombo || categoryComboByDataElement[dse.dataElement.id]?.categoryCombo)
            .compact()
            .map(categoryCombo => categoryCombo.id)
            .uniq()
            .value();

        const { categoryCombos } = await this.api.metadata
            .get({
                categoryCombos: {
                    fields: { id: true, name: true, categoryOptionCombos: { id: true, name: true } },
                    filter: { id: { in: categoryComboIds } },
                },
            })
            .getData();

        const categoryCombosById = _.keyBy(categoryCombos, cc => cc.id);
        const dataElementsById = _.keyBy(dataElements, cc => cc.id);

        const greyedFields = new Set(
            _(dataSet.sections)
                .flatMap(section => section.greyedFields)
                .map(gf => [gf.dataElement.id, gf.categoryOptionCombo.id].join("."))
                .value()
        );

        return _(dataSet.dataSetElements)
            .map((dse): DataElement | undefined => {
                const dataElement = dataElementsById[dse.dataElement.id];
                const categoryComboRef =
                    dse.categoryCombo || categoryComboByDataElement[dse.dataElement.id]?.categoryCombo;
                if (!dataElement || !categoryComboRef) return undefined;
                const categoryCombo = categoryCombosById[categoryComboRef.id];
                if (!categoryCombo) return undefined;
                const categoryOptionCombos = _.reject(categoryCombo.categoryOptionCombos, coc => {
                    const key = [dataElement.id, coc.id].join(".");
                    return greyedFields.has(key);
                });
                const categoryCombo2 = { ...categoryCombo, categoryOptionCombos };
                return { ...dataElement, categoryCombo: categoryCombo2 };
            })
            .compact()
            .sortBy(dataElement => dataElement.name)
            .value();
    }

    private async getCategoryOptions(projectCategoryOption: D2CategoryOption) {
        const { categoryComboCodes } = this;

        const { categories } = await this.api.metadata
            .get({
                categories: {
                    fields: { id: true, code: true, categoryOptions: { id: true, name: true } },
                    filter: {
                        code: {
                            in: [categoryComboCodes.phaseOfEmergency, categoryComboCodes.actualTargets],
                        },
                    },
                },
            })
            .getData();

        const categoriesByCode = _.keyBy(categories, category => category.code);
        const categoryPhaseOfEmergency = categoriesByCode[categoryComboCodes.phaseOfEmergency];

        return {
            project: [projectCategoryOption],
            phasesOfEmergency: _(categoryPhaseOfEmergency?.categoryOptions || [])
                .reject(categoryOption => categoryOption.name.includes("DEPRECATED"))
                .value(),
            targetActual: categoriesByCode[categoryComboCodes.actualTargets]?.categoryOptions || [],
        };
    }

    private async getProjectCategoryOption(dataSet: D2DataSet) {
        const categoryOptionCode = dataSet.code.replace(/Data Set$/, "").trim();

        const res = await this.api.metadata
            .get({
                categoryOptions: {
                    fields: { id: true, name: true, organisationUnits: { id: true } },
                    filter: { code: { eq: categoryOptionCode } },
                },
            })
            .getData();

        const projectCategoryOption = res.categoryOptions[0];

        if (!projectCategoryOption) {
            throw new Error(`Project category option not found (code: ${categoryOptionCode})`);
        } else {
            return projectCategoryOption;
        }
    }

    private async getDataSet(options: { dataSetId: Id }): Promise<D2DataSet> {
        const { dataSets } = await this.api.metadata
            .get({
                dataSets: {
                    fields: dataSetFields,
                    filter: { id: { eq: options.dataSetId } },
                },
            })
            .getData();

        const dataSet = dataSets[0];

        if (!dataSet) {
            throw new Error(`Data set not found: ${options.dataSetId}`);
        } else if (!dataSet.code) {
            throw new Error(`Data set has no code, it's required to get the project category option`);
        } else {
            return dataSet;
        }
    }
}

const dataSetFields = {
    id: true,
    name: true,
    code: true,
    categoryCombo: { id: true, categories: { id: true, code: true } },
    dataSetElements: {
        dataElement: { id: true, name: true, categoryCombo: { id: true } },
        categoryCombo: { id: true },
    },
    organisationUnits: { id: true, name: true, path: true },
    dataInputPeriods: { period: { id: true } },
    sections: { greyedFields: { dataElement: { id: true }, categoryOptionCombo: { id: true } } },
} as const;

type D2DataSet = MetadataPick<{ dataSets: { fields: typeof dataSetFields } }>["dataSets"][number];

interface D2CategoryOption extends NamedRef {
    organisationUnits: Ref[];
}

interface D2Coc extends NamedRef {
    categoryOptions: Ref[];
}
