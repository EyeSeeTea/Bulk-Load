import _ from "lodash";
import { getRelationshipMetadata } from "./Dhis2RelationshipTypes";
import { DataFormType, dataFormTypeMap } from "../domain/entities/DataForm";
import { Id, Ref } from "../domain/entities/ReferenceObject";
import {
    TemplateMetadata,
    GetTemplateMetadataOptions,
    MetadataOrgUnit,
    MetadataItem,
    TemplateMetadataRepository,
} from "../domain/repositories/TemplateMetadataRepository";
import { D2Api } from "../types/d2-api";
import { promiseMap } from "../utils/promises";

// MetadataItem intentionally mirrors the raw DHIS2 dataSet/program response, not the
// domain DataForm entity: SheetBuilder (webapp/logic/sheetBuilder.ts, legacy) reads fields off
// `element` that DataForm doesn't model at all (categoryCombo, formType, raw programStages with
// per-stage `access`, raw programTrackedEntityAttributes) — it was written against this shape,
// not against DataForm. Unifying the two means reworking SheetBuilder itself (see PR description).
export class TemplateMetadataD2Repository implements TemplateMetadataRepository {
    constructor(private api: D2Api) {}

    private async getElement(type: DataFormType, id: Id): Promise<MetadataItem> {
        const endpoint = type === dataFormTypeMap.dataSets ? "dataSets" : "programs";
        const fields = [
            "id",
            "displayName",
            "organisationUnits[id,path,name]",
            "attributeValues[attribute[code],value]",
            "categoryCombo",
            "dataSetElements",
            "formType",
            "sections[id,sortOrder,dataElements[id]]",
            "periodType",
            "programStages[id,access,featureType]",
            "programType",
            "enrollmentDateLabel",
            "incidentDateLabel",
            "trackedEntityType[id,featureType]",
            "captureCoordinates",
            "programTrackedEntityAttributes[trackedEntityAttribute[id,name,valueType,confidential,optionSet[id,name,options[id]]]],",
        ].join(",");
        const response = await this.api.get<any>(`/${endpoint}/${id}`, { fields }).getData();
        return { ...response, type };
    }

    async get({
        type,
        id,
        orgUnitIds,
        startDate,
        endDate,
        populateStartDate,
        populateEndDate,
        downloadRelationships,
        relationshipsOuFilter,
        orgUnitShortName,
    }: GetTemplateMetadataOptions): Promise<TemplateMetadata> {
        const api = this.api;
        const element = await this.getElement(type, id);
        const elementMetadataMap = new Map();
        const endpoint = element.type === dataFormTypeMap.dataSets ? "dataSets" : "programs";
        const elementMetadata = await api.get<RawElementMetadata>(`/${endpoint}/${element.id}/metadata.json`).getData();

        const rawMetadata = await this.filterRawMetadata({ element, elementMetadata, orgUnitIds, startDate, endDate });

        _.forOwn(rawMetadata, (value, type) => {
            if (Array.isArray(value)) {
                _.forEach(value, (object: any) => {
                    if (object.id) elementMetadataMap.set(object.id, { ...object, type });
                });
            }
        });

        // FIXME: This is needed for getting all possible org units for a program/dataSet
        const requestOrgUnits: Id[] =
            relationshipsOuFilter === "DESCENDANTS" || relationshipsOuFilter === "CHILDREN"
                ? elementMetadataMap.get(element.id)?.organisationUnits?.map(({ id }: { id: string }) => id) ??
                  orgUnitIds
                : orgUnitIds;

        const responses = await promiseMap(_.chunk(_.uniq(requestOrgUnits), 400), orgUnits =>
            api.models.organisationUnits
                .get({
                    paging: false,
                    fields: { id: true, displayName: true, code: true, translations: true, displayShortName: true },
                    filter: { id: { in: orgUnits } },
                    order: orgUnitShortName ? "displayShortName:asc" : "displayName:asc",
                })
                .getData()
        );

        const organisationUnits: MetadataOrgUnit[] = _.flatMap(responses, ({ objects }) =>
            objects.map(orgUnit => ({
                type: "organisationUnits",
                ...orgUnit,
            }))
        );

        // trackedEntityType is present whenever type === "trackerPrograms": guaranteed by the
        // `trackedEntityType[id,featureType]` field requested in getElement().
        const relationshipsMetadata =
            element.type === "trackerPrograms" && downloadRelationships && element.trackedEntityType
                ? await getRelationshipMetadata({ id: element.id, trackedEntityType: element.trackedEntityType }, api, {
                      organisationUnits,
                      startDate: populateStartDate,
                      endDate: populateEndDate,
                      ouMode: relationshipsOuFilter,
                  })
                : {};

        return { element, relationshipsMetadata, elementMetadata: elementMetadataMap, organisationUnits, rawMetadata };
    }

    /* Return the raw metadata filtering out non-relevant category option combos.

        /api/dataSets/ID/metadata returns categoryOptionCombos that may not be relevant for the
        data set. Here we filter out category option combos with categoryOptions not matching these
        conditions:

         - categoryOption.startDate/endDate outside the startDate -> endDate interval
         - categoryOption.orgUnit EMPTY or assigned to the dataSet orgUnits (intersected with the requested).
    */
    private async filterRawMetadata(options: {
        element: MetadataItem;
        elementMetadata: RawElementMetadata;
        orgUnitIds: Id[];
        startDate: Date | undefined;
        endDate: Date | undefined;
    }): Promise<RawElementMetadata & unknown> {
        const { element, elementMetadata, orgUnitIds } = options;

        if (element.type === "dataSets") {
            const categoryOptions = await this.getCategoryOptions();
            const categoryOptionIdsToInclude = getCategoryOptionIdsToInclude(
                element.organisationUnits,
                orgUnitIds,
                categoryOptions,
                options
            );

            const categoryOptionCombosFiltered = elementMetadata.categoryOptionCombos.filter(coc =>
                _(coc.categoryOptions).every(categoryOption => {
                    return categoryOptionIdsToInclude.has(categoryOption.id);
                })
            );

            return { ...elementMetadata, categoryOptionCombos: categoryOptionCombosFiltered };
        } else {
            return elementMetadata;
        }
    }

    private async getCategoryOptions(): Promise<DataSetCategoryOption[]> {
        const { categoryOptions } = await this.api.metadata
            .get({
                categoryOptions: {
                    fields: {
                        id: true,
                        startDate: true,
                        endDate: true,
                        organisationUnits: { id: true },
                    },
                },
            })
            .getData();

        return categoryOptions;
    }
}

interface RawElementMetadata {
    categoryOptionCombos: CategoryOptionCombo[];
}

interface CategoryOptionCombo {
    categoryOptions: Ref[];
}

export interface DataSetCategoryOption {
    id: Id;
    startDate?: string;
    endDate?: String;
    organisationUnits: Ref[];
}

export function getCategoryOptionIdsToInclude(
    dataSetOrgUnits: Ref[],
    orgUnitIds: string[],
    categoryOptions: DataSetCategoryOption[],
    options: { startDate: Date | undefined; endDate: Date | undefined }
) {
    const dataSetOrgUnitIds = dataSetOrgUnits.map(ou => ou.id);

    const orgUnitIdsToInclude = new Set(
        _.isEmpty(orgUnitIds) ? dataSetOrgUnitIds : _.intersection(orgUnitIds, dataSetOrgUnitIds)
    );

    const startDate = options.startDate?.toISOString();
    const endDate = options.endDate?.toISOString();

    const categoryOptionIdsToInclude = new Set(
        categoryOptions
            .filter(categoryOption => {
                const noStartDateIntersect = startDate && categoryOption.endDate && startDate > categoryOption.endDate;
                const noEndDateIntersect = endDate && categoryOption.startDate && endDate < categoryOption.startDate;
                const dateCondition = !noStartDateIntersect && !noEndDateIntersect;

                const categoryOptionOrgUnitCondition =
                    _.isEmpty(categoryOption.organisationUnits) ||
                    _(categoryOption.organisationUnits).some(orgUnit => orgUnitIdsToInclude.has(orgUnit.id));

                return dateCondition && categoryOptionOrgUnitCondition;
            })
            .map(categoryOption => categoryOption.id)
    );
    return categoryOptionIdsToInclude;
}
