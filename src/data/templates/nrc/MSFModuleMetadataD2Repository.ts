import { D2Api, MetadataPick } from "../../../types/d2-api";
import { i18nShortCode, Id } from "../../../domain/entities/ReferenceObject";
import { CategoryOptionCombo, MSFModuleMetadata } from "../../../domain/entities/templates/MSFModuleMetadata";
import { MSFModuleMetadataRepository } from "../../../domain/repositories/templates/MSFModuleMetadataRepository";
import { Maybe } from "../../../types/utils";
import { promiseMap } from "../../../utils/promises";

export class MSFModuleMetadataD2Repository implements MSFModuleMetadataRepository {
    constructor(private api: D2Api) {}

    async get(options: {
        dataSetId: Id;
        catOptionCombinationIds: Id[];
        language: Maybe<i18nShortCode>;
    }): Promise<MSFModuleMetadata> {
        const d2DataSet = await this.getDataSet(options);
        const categoryOptionCombos = await this.getAllCategoryOptionCombos(
            options.catOptionCombinationIds,
            options.language
        );

        return {
            dataSet: {
                id: d2DataSet.id,
                name: this.getValueFromTranslation(d2DataSet.translations, options.language, d2DataSet.displayName),
                dataSetElements: d2DataSet.dataSetElements.map(d2SetElement => {
                    const categoryCombo = d2SetElement.categoryCombo
                        ? d2SetElement.categoryCombo
                        : d2SetElement.dataElement.categoryCombo;
                    return {
                        dataElement: {
                            id: d2SetElement.dataElement.id,
                            name: this.getValueFromTranslation(
                                d2SetElement.dataElement.translations,
                                options.language,
                                d2SetElement.dataElement.displayFormName
                            ),
                            valueType: d2SetElement.dataElement.valueType,
                        },
                        categoryCombo: {
                            id: categoryCombo.id,
                            name: this.getValueFromTranslation(
                                d2SetElement.dataElement.translations,
                                options.language,
                                categoryCombo.displayName
                            ),
                            categories: categoryCombo.categories.map(d2Category => {
                                return {
                                    id: d2Category.id,
                                    name: this.getValueFromTranslation(
                                        d2Category.translations,
                                        options.language,
                                        d2Category.displayName
                                    ),
                                    categoryOptions: d2Category.categoryOptions.map(d2CatOption => {
                                        return {
                                            id: d2CatOption.id,
                                            name: this.getValueFromTranslation(
                                                d2CatOption.translations,
                                                options.language,
                                                d2CatOption.displayName
                                            ),
                                        };
                                    }),
                                };
                            }),
                        },
                    };
                }),
                sections: d2DataSet.sections.map(d2Section => {
                    return {
                        id: d2Section.id,
                        greyedFields: d2Section.greyedFields,
                        name: this.getValueFromTranslation(
                            d2Section.translations,
                            options.language,
                            d2Section.displayName
                        ),
                        dataElements: d2Section.dataElements.map(d2SectionDe => {
                            return {
                                id: d2SectionDe.id,
                                name: this.getValueFromTranslation(
                                    d2SectionDe.translations,
                                    options.language,
                                    d2SectionDe.displayFormName
                                ),
                            };
                        }),
                    };
                }),
            },
            categoryOptionCombos: categoryOptionCombos,
        };
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

    private async getAllCategoryOptionCombos(
        ids: Id[],
        language: Maybe<i18nShortCode>
    ): Promise<CategoryOptionCombo[]> {
        const result = await promiseMap(_.chunk(ids, 100), catOptionCombosIds => {
            return this.getPaginatedCategoryOptionCombos(catOptionCombosIds, 1, [], language);
        });
        return result.flat();
    }

    private async getPaginatedCategoryOptionCombos(
        ids: Id[],
        page: number,
        acum: CategoryOptionCombo[],
        language: Maybe<i18nShortCode>
    ): Promise<CategoryOptionCombo[]> {
        const d2Response = await this.getCategoryOptionCombos(ids, page);
        const catOptionCombos = d2Response.objects.map(d2CatOptionCombo => {
            return {
                id: d2CatOptionCombo.id,
                categoryCombo: { id: d2CatOptionCombo.categoryCombo.id },
                name: this.getValueFromTranslation(
                    d2CatOptionCombo.translations,
                    language,
                    d2CatOptionCombo.displayName
                ),
                categoryOptions: d2CatOptionCombo.categoryOptions.map(d2CatOption => {
                    return {
                        id: d2CatOption.id,
                        name: this.getValueFromTranslation(d2CatOption.translations, language, d2CatOption.displayName),
                    };
                }),
            };
        });
        const newRecords = [...acum, ...catOptionCombos];
        if (d2Response.pager.page >= d2Response.pager.pageCount) {
            return newRecords;
        } else {
            return this.getPaginatedCategoryOptionCombos(ids, d2Response.pager.page + 1, newRecords, language);
        }
    }

    private async getCategoryOptionCombos(ids: Id[], page: number) {
        const response = await this.api.models.categoryOptionCombos
            .get({
                fields: {
                    id: true,
                    displayName: true,
                    translations: translationFields,
                    categoryCombo: { id: true },
                    categoryOptions: { id: true, displayName: true, translations: translationFields },
                },
                filter: {
                    id: { in: ids },
                },
                page,
                pageSize: 100,
            })
            .getData();

        return response;
    }

    private getValueFromTranslation(
        translations: D2Translation[],
        locale: Maybe<i18nShortCode>,
        defaultValue: string,
        isDescription = false
    ): string {
        if (!locale) return defaultValue;
        const localeTranslations = translations.filter(t => t.locale === locale);
        if (isDescription) {
            const descriptionLocale = localeTranslations.find(translation => translation.property === "DESCRIPTION");
            return descriptionLocale?.value || defaultValue;
        } else {
            const formNameLocale = localeTranslations.find(translation => translation.property === "FORM_NAME");
            const nameLocale = localeTranslations.find(translation => translation.property === "NAME");
            return formNameLocale?.value || nameLocale?.value || defaultValue;
        }
    }
}

const translationFields = {
    property: true,
    locale: true,
    value: true,
};

const categoryComboFields = {
    id: true,
    displayName: true,
    translations: translationFields,
    categories: {
        id: true,
        displayName: true,
        translations: translationFields,
        categoryOptions: { id: true, translations: translationFields, displayName: true },
    },
};

const dataSetFields = {
    id: true,
    displayDescription: true,
    displayName: true,
    translations: translationFields,
    dataSetElements: {
        dataElement: {
            id: true,
            valueType: true,
            displayFormName: true,
            categoryCombo: categoryComboFields,
            translations: translationFields,
        },
        categoryCombo: categoryComboFields,
    },
    sections: {
        id: true,
        displayName: true,
        translations: translationFields,
        greyedFields: {
            id: true,
            categoryOptionCombo: true,
            dataElement: true,
        },
        dataElements: {
            id: true,
            displayFormName: true,
            translations: translationFields,
        },
    },
} as const;

type D2DataSet = MetadataPick<{ dataSets: { fields: typeof dataSetFields } }>["dataSets"][number];
type D2Translation = {
    property: string;
    locale: string;
    value: string;
};
