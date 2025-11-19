import _ from "lodash";
import { D2Api, MetadataPick } from "../../../types/d2-api";
import { Id, NamedRef, Ref } from "../../../domain/entities/ReferenceObject";
import { DataElement, NRCModuleMetadata } from "../../../domain/entities/templates/NRCModuleMetadata";
import { NRCModuleMetadataRepository } from "../../../domain/repositories/templates/NRCModuleMetadataRepository";
import { User } from "../../../domain/entities/User";
import { Maybe } from "../../../types/utils";

type DataSetCategories = {
    projects: boolean;
    phaseOfEmergency: boolean;
    actualTargets: boolean;
};

export class NRCModuleMetadataD2Repository implements NRCModuleMetadataRepository {
    attributeCodes = {
        createdByApp: "GL_CREATED_BY_DATASET_CONFIGURATION",
    };

    categoryComboCodes = {
        all: "GL_CATBOMBO_ProjectCCTarAct",
    };

    categoryCodes = {
        project: "GL_Project",
        phaseOfEmergency: "GL_CORECOMP_CATCOMBO",
        actualTargets: "GL_Actual_Targets",
    };

    constructor(private api: D2Api) {}

    async get(options: { currentUser: User; dataSetId: Id }): Promise<NRCModuleMetadata> {
        const dataSet = await this.getDataSet(options);
        const dataSetCategories = this.getDataSetCategories(dataSet);
        const projectCategoryOptions = await this.getProjectCategoryOptions(dataSetCategories, dataSet);
        const categoryOptions = await this.getCategoryOptions(dataSetCategories, projectCategoryOptions);
        const categoryOptionCombos = await this.getCategoryOptionCombos(dataSet, projectCategoryOptions);

        return {
            dataSet: dataSet,
            dataElements: await this.getDataElementsWithDisaggregation(dataSet),
            organisationUnits: this.getOrganisationUnits(options.currentUser, projectCategoryOptions, dataSet),
            periods: this.getPeriods(dataSet),
            categoryCombo: {
                categories: {
                    projects: projectCategoryOptions ? { categoryOptions: projectCategoryOptions } : undefined,
                    phasesOfEmergency: categoryOptions.phasesOfEmergency
                        ? { categoryOptions: categoryOptions.phasesOfEmergency }
                        : undefined,
                    targetActual: categoryOptions.targetActual
                        ? { categoryOptions: categoryOptions.targetActual }
                        : undefined,
                },
                categoryOptionCombos: categoryOptionCombos,
            },
        };
    }

    private getOrganisationUnits(
        currentUser: User,
        projects: Maybe<D2CategoryOption[]>,
        dataSet: D2DataSet
    ): NamedRef[] {
        const projectsOrgUnits = projects
            ? _(projects)
                  .flatMap(project => project.organisationUnits)
                  .uniqBy(ou => ou.id)
                  .value()
            : [];

        function isOrgUnitAvailableForCurrentUserAndProject(dataSetOrgUnit: { path: string }) {
            const canUserAccessDataSetOrgUnit = () =>
                currentUser.orgUnits.some(userOrgUnit => dataSetOrgUnit.path.includes(userOrgUnit.id));

            const isProjectAssignedToDataSetOrgUnit = () =>
                projectsOrgUnits.length === 0 ||
                projectsOrgUnits.some(projectOrgUnit => dataSetOrgUnit.path.includes(projectOrgUnit.id));

            return canUserAccessDataSetOrgUnit() && isProjectAssignedToDataSetOrgUnit();
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

    private async getCategoryOptionCombos(
        dataSet: D2DataSet,
        projectCategoryOptions: Maybe<D2CategoryOption[]>
    ): Promise<D2Coc[]> {
        const { categoryOptionCombos } = await this.api.metadata
            .get({
                categoryOptionCombos: {
                    fields: { id: true, name: true, categoryOptions: { id: true } },
                    filter: {
                        ...(projectCategoryOptions
                            ? { "categoryOptions.id": { in: projectCategoryOptions.map(co => co.id) } }
                            : {}),
                        "categoryCombo.id": { eq: dataSet.categoryCombo.id },
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

    private async getCategoryOptions(
        dataSetCategories: DataSetCategories,
        projectCategoryOptions: Maybe<D2CategoryOption[]>
    ) {
        const { categoryCodes } = this;

        const { categories } = await this.api.metadata
            .get({
                categories: {
                    fields: {
                        id: true,
                        code: true,
                        categoryOptions: { id: true, name: true },
                    },
                    filter: {
                        code: {
                            in: _.compact([
                                dataSetCategories.phaseOfEmergency ? categoryCodes.phaseOfEmergency : null,
                                dataSetCategories.actualTargets ? categoryCodes.actualTargets : null,
                                "@@@", // placeholder to prevent passing an empty filter
                            ]),
                        },
                    },
                },
            })
            .getData();

        const categoriesByCode = _.keyBy(categories, category => category.code);
        const categoryPhaseOfEmergency = categoriesByCode[categoryCodes.phaseOfEmergency];
        const categoryActualTargets = categoriesByCode[categoryCodes.actualTargets];

        return {
            projects: projectCategoryOptions,
            phasesOfEmergency: categoryPhaseOfEmergency
                ? _(categoryPhaseOfEmergency.categoryOptions || [])
                      .reject(categoryOption => categoryOption.name.includes("DEPRECATED"))
                      .value()
                : undefined,
            targetActual: categoryActualTargets ? categoryActualTargets.categoryOptions || [] : undefined,
        };
    }

    private getDataSetCategories(dataSet: D2DataSet): DataSetCategories {
        const codes = this.categoryCodes;
        const allCategories = [codes.project, codes.phaseOfEmergency, codes.actualTargets];
        const dataSetCategoryCodes = dataSet.categoryCombo.categories.map(category => category.code);

        const dataSetCategoriesAreASubSetOfSupportedCategories =
            _.intersection(allCategories, dataSetCategoryCodes).length >= 1 &&
            _.difference(dataSetCategoryCodes, allCategories).length === 0;

        if (!dataSetCategoriesAreASubSetOfSupportedCategories) {
            throw new Error(`Data set categories must be a subset of: ${allCategories.join(", ")}`);
        } else {
            return {
                projects: dataSetCategoryCodes.includes(codes.project),
                phaseOfEmergency: dataSetCategoryCodes.includes(codes.phaseOfEmergency),
                actualTargets: dataSetCategoryCodes.includes(codes.actualTargets),
            };
        }
    }

    private async getProjectCategoryOptions(
        dataSetCategories: DataSetCategories,
        dataSet: D2DataSet
    ): Promise<Maybe<D2CategoryOption[]>> {
        if (!dataSetCategories.projects) {
            return undefined;
        } else if (this.isCreatedByDataSetConfigurationApp(dataSet)) {
            const categoryOptionCode = dataSet.code ? dataSet.code.replace(/Data Set$/, "").trim() : undefined;

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
                return [projectCategoryOption];
            }
        } else {
            // It's not a project dataSet, get list of projects accessible for the user (limited)
            const res = await this.api.models.categoryOptions
                .get({
                    fields: { id: true, name: true, organisationUnits: { id: true } },
                    filter: { "categories.code": { eq: this.categoryCodes.project } },
                    order: "name:asc",
                    paging: true,
                    pageSize: 300,
                })
                .getData();

            return res.objects;
        }
    }

    private isCreatedByDataSetConfigurationApp(dataSet: D2DataSet): boolean {
        const attributeValue = dataSet.attributeValues.find(attributeValue => {
            return attributeValue.attribute.code === this.attributeCodes.createdByApp;
        });

        return attributeValue?.value === "true";
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
    attributeValues: {
        attribute: { code: true },
        value: true,
    },
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
