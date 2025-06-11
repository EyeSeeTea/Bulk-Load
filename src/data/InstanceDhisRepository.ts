import _ from "lodash";
import "lodash.product";
import moment from "moment";
import { DataElement, DataForm, DataFormPeriod, DataFormType } from "../domain/entities/DataForm";
import { DataPackage, TrackerProgramPackage } from "../domain/entities/DataPackage";
import {
    AggregatedDataValue,
    AggregatedPackage,
    Event,
    EventsAPIResponse,
    EventsPackage,
    EventsResponse,
} from "../domain/entities/DhisDataPackage";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { Locale } from "../domain/entities/Locale";
import { OrgUnit } from "../domain/entities/OrgUnit";
import { NamedRef, Ref } from "../domain/entities/ReferenceObject";
import { SynchronizationResult } from "../domain/entities/SynchronizationResult";
import { Program, TrackedEntityInstance } from "../domain/entities/TrackedEntityInstance";
import {
    BuilderMetadata,
    GetDataFormsParams,
    GetDataPackageParams,
    ImportDataPackageOptions,
    InstanceRepository,
} from "../domain/repositories/InstanceRepository";
import i18n from "../utils/i18n";
import {
    D2Api,
    D2ApiDefault,
    D2DataElementSchema,
    D2TrackedEntityType,
    DataStore,
    DataValueSetsGetResponse,
    Id,
    SelectedPick,
} from "../types/d2-api";
import { cache } from "../utils/cache";
import { promiseMap } from "../utils/promises";
import { postEvents } from "./Dhis2Events";
import { getProgram, getTrackedEntityInstances, updateTrackedEntityInstances } from "./Dhis2TrackedEntityInstances";

export class InstanceDhisRepository implements InstanceRepository {
    private api: D2Api;

    constructor({ url }: DhisInstance, mockApi?: D2Api) {
        this.api = mockApi ?? new D2ApiDefault({ baseUrl: url });
    }

    public getDataStore(namespace: string): DataStore {
        return this.api.dataStore(namespace);
    }

    public async getDataForms({ type = ["dataSets", "programs"], ids }: GetDataFormsParams = {}): Promise<DataForm[]> {
        const dataSets = type.includes("dataSets") ? await this.getDataSets(ids) : [];
        const programs = type.includes("programs") ? await this.getPrograms(ids) : [];

        return [...dataSets, ...programs];
    }

    @cache()
    private async getDataSets(ids?: string[]): Promise<DataForm[]> {
        const { objects } = await this.api.models.dataSets
            .get({
                paging: false,
                fields: dataSetFields,
                filter: { id: ids ? { in: ids } : undefined },
            })
            .getData();

        return objects.map(
            ({ id, displayName, name, access, periodType, dataSetElements, sections, attributeValues }) => ({
                type: "dataSets",
                id,
                attributeValues,
                name: displayName ?? name,
                periodType: periodType as DataFormPeriod,
                //@ts-ignore https://github.com/EyeSeeTea/d2-api/issues/43
                readAccess: access.data?.read,
                //@ts-ignore https://github.com/EyeSeeTea/d2-api/issues/43
                writeAccess: access.data?.write,
                dataElements: dataSetElements.map(({ dataElement }) => formatDataElement(dataElement)),
                sections: sections.map(({ id, name, dataElements }) => ({
                    id,
                    name,
                    dataElements: dataElements.map(dataElement => formatDataElement(dataElement)),
                    repeatable: false,
                })),
            })
        );
    }

    @cache()
    private async getPrograms(ids?: string[]): Promise<DataForm[]> {
        const { objects } = await this.api.models.programs
            .get({
                paging: false,
                fields: programFields,
                filter: {
                    id: ids ? { in: ids } : undefined,
                },
            })
            .getData();

        return objects.map(
            ({
                id,
                displayName,
                name,
                access,
                programStages,
                programType,
                attributeValues,
                programTrackedEntityAttributes,
                trackedEntityType,
            }) => ({
                type: programType === "WITH_REGISTRATION" ? "trackerPrograms" : "programs",
                id,
                attributeValues,
                name: displayName ?? name,
                periodType: "Daily",
                //@ts-ignore https://github.com/EyeSeeTea/d2-api/issues/43
                readAccess: access.data?.read,
                //@ts-ignore https://github.com/EyeSeeTea/d2-api/issues/43
                writeAccess: access.data?.write,
                dataElements: programStages.flatMap(({ programStageDataElements }) =>
                    programStageDataElements.map(({ dataElement }) => formatDataElement(dataElement))
                ),
                sections: programStages.map(({ id, name, programStageDataElements, repeatable }) => ({
                    id,
                    name,
                    dataElements: programStageDataElements.map(({ dataElement }) => formatDataElement(dataElement)),
                    repeatable,
                })),
                teiAttributes: programTrackedEntityAttributes.map(({ trackedEntityAttribute }) => ({
                    id: trackedEntityAttribute.id,
                    name: trackedEntityAttribute.name,
                    valueType: trackedEntityAttribute.valueType,
                })),
                trackedEntityType: getTrackedEntityTypeFromApi(trackedEntityType),
            })
        );
    }

    @cache()
    public async getDataFormOrgUnits(type: DataFormType, id: string): Promise<OrgUnit[]> {
        const params = {
            paging: false,
            fields: {
                organisationUnits: { id: true, name: true, level: true, path: true },
            },
            filter: {
                id: { eq: id },
            },
        } as const;

        const { objects } = await (type === "dataSets"
            ? this.api.models.dataSets.get(params).getData()
            : this.api.models.programs.get(params).getData());

        return _(objects)
            .map(({ organisationUnits }) => organisationUnits)
            .flatten()
            .value();
    }

    @cache()
    public async getUserOrgUnits(): Promise<OrgUnit[]> {
        const { objects } = await this.api.models.organisationUnits
            .get({
                userOnly: true,
                fields: { id: true, displayName: true, level: true, path: true },
            })
            .getData();
        return objects.map(({ displayName, ...rest }) => ({ ...rest, name: displayName }));
    }

    @cache()
    public async getLocales(): Promise<Locale[]> {
        const locales = await this.api.get<Locale[]>("/locales/dbLocales").getData();
        return locales;
    }

    @cache()
    public async getDefaultIds(filter?: string): Promise<string[]> {
        const response = await this.api
            .get<Record<string, { id: string }[]>>("/metadata", {
                filter: "identifiable:eq:default",
                fields: "id",
            })
            .getData();

        const metadata = _.pickBy(response, (_value, type) => !filter || type === filter);

        return _(metadata)
            .omit(["system"])
            .values()
            .flatten()
            .map(({ id }) => id)
            .value();
    }

    public async deleteAggregatedData(dataPackage: DataPackage): Promise<SynchronizationResult> {
        return this.importAggregatedData("DELETE", dataPackage);
    }

    public async importDataPackage(
        dataPackage: DataPackage,
        options: ImportDataPackageOptions
    ): Promise<SynchronizationResult[]> {
        const { createAndUpdate } = options;
        switch (dataPackage.type) {
            case "dataSets": {
                const result = await this.importAggregatedData(
                    createAndUpdate ? "CREATE_AND_UPDATE" : "CREATE",
                    dataPackage
                );
                return [result];
            }
            case "programs": {
                const result = await this.importEventsData(dataPackage);
                return result;
            }
            case "trackerPrograms": {
                return this.importTrackerProgramData(dataPackage, options);
            }
            default:
                throw new Error(`Unsupported type for data package`);
        }
    }

    public async getDataPackage(params: GetDataPackageParams): Promise<DataPackage> {
        switch (params.type) {
            case "dataSets":
                return this.getDataSetPackage(params);
            case "programs":
                return this.getProgramPackage(params);
            case "trackerPrograms":
                return this.getTrackerProgramPackage(params);
            default:
                throw new Error(`Unsupported type ${params.type} for data package`);
        }
    }

    public async getProgram(programId: Id): Promise<Program | undefined> {
        return getProgram(this.api, programId);
    }

    /* Private */

    private async getTrackerProgramPackage(params: GetDataPackageParams): Promise<DataPackage> {
        const { api } = this;

        const dataPackage = await this.getProgramPackage(params);
        const orgUnits = params.orgUnits.map(id => ({ id }));
        const program = { id: params.id };
        const trackedEntityInstances = await getTrackedEntityInstances({
            api,
            program,
            orgUnits,
            enrollmentStartDate: params.filterTEIEnrollmentDate ? params.startDate : undefined,
            enrollmentEndDate: params.filterTEIEnrollmentDate ? params.endDate : undefined,
            relationshipsOuFilter: params.relationshipsOuFilter,
            // @ts-ignore FIXME: Add property in d2-api
            fields: "*",
        });

        return {
            type: "trackerPrograms",
            trackedEntityInstances,
            dataEntries: dataPackage.dataEntries,
        };
    }

    public convertDataPackage(dataPackage: DataPackage): EventsPackage | AggregatedPackage {
        switch (dataPackage.type) {
            case "dataSets":
                return { dataValues: this.buildAggregatedPayload(dataPackage) };
            case "programs":
                return { events: this.buildEventsPayload(dataPackage) };
            default:
                throw new Error(`Unsupported type ${dataPackage.type} to convert data package`);
        }
    }

    public async getBuilderMetadata(teis: TrackedEntityInstance[]): Promise<BuilderMetadata> {
        const orgUnitIds = _.uniq(teis.map(tei => tei.orgUnit.id));
        const orgUnitIdsList = _.chunk(orgUnitIds, 250);

        const orgUnits: NamedRef[] = _.flatten(
            await promiseMap(orgUnitIdsList, async orgUnitIdsGroup => {
                const { objects } = await this.api.models.organisationUnits
                    .get({
                        fields: { id: true, name: true },
                        filter: { id: { in: orgUnitIdsGroup } },
                        paging: false,
                    })
                    .getData();
                return objects;
            })
        );

        const { objects: apiOptions } = await this.api.models.options
            .get({ fields: { id: true, name: true, code: true }, paging: false })
            .getData();

        const customOptions = [
            { id: "true", name: "Yes", code: "true" },
            { id: "false", name: "No", code: "false" },
        ];

        const options = [...apiOptions, ...customOptions];

        const programIds = _.uniq(teis.map(tei => tei.program.id));

        const { objects: programs } = await this.api.models.programs
            .get({
                fields: {
                    id: true,
                    categoryCombo: { categoryOptionCombos: { id: true, name: true } },
                },
                paging: false,
                filter: { id: { in: programIds } },
            })
            .getData();

        const cocs = _.flatMap(programs, program => program.categoryCombo.categoryOptionCombos);

        return {
            orgUnits: _.keyBy(orgUnits, ou => ou.id),
            options: _.keyBy(options, opt => opt.id),
            categoryOptionCombos: _.keyBy(cocs, coc => coc.id),
        };
    }

    /* Private */

    private buildAggregatedPayload(dataPackage: DataPackage): AggregatedDataValue[] {
        return _.flatMap(dataPackage.dataEntries, ({ orgUnit, period, attribute, dataValues }) =>
            dataValues.map(({ dataElement, category, value, comment }) => ({
                orgUnit,
                period,
                attributeOptionCombo: attribute,
                dataElement,
                categoryOptionCombo: category,
                value: String(value),
                comment,
            }))
        );
    }

    private buildEventsPayload(dataPackage: DataPackage): Event[] {
        return dataPackage.dataEntries.map(({ id, orgUnit, period, attribute, dataValues, dataForm, coordinate }) => ({
            event: id,
            program: dataForm,
            status: "COMPLETED",
            orgUnit,
            occurredAt: period,
            attributeOptionCombo: attribute,
            dataValues: dataValues,
            coordinate: coordinate,
            geometry: coordinate && {
                type: "Point",
                coordinates: [Number(coordinate.longitude), Number(coordinate.latitude)],
            },
        }));
    }

    private async importAggregatedData(
        importStrategy: "CREATE" | "UPDATE" | "CREATE_AND_UPDATE" | "DELETE",
        dataPackage: DataPackage
    ): Promise<SynchronizationResult> {
        const dataValues = await this.validateAggregateImportPackage(this.buildAggregatedPayload(dataPackage));

        const dataSetIds = _(dataPackage.dataEntries)
            .map(entry => entry.dataForm)
            .uniq()
            .value();
        const dataSetIdFirst = dataSetIds[0];
        const dataSetId = dataSetIdFirst && dataSetIds.length === 1 ? dataSetIdFirst : undefined;

        const title =
            importStrategy === "DELETE" ? i18n.t("Data values - Delete") : i18n.t("Data values - Create/update");

        const { response } = await this.api.dataValues
            .postSetAsync({ importStrategy }, { dataSet: dataSetId, dataValues })
            .getData();

        const importSummary = await this.api.system.waitFor(response.jobType, response.id).getData();

        if (!importSummary) {
            return {
                title,
                status: "ERROR",
                message: i18n.t("Failed to import data values"),
                stats: [{ imported: 0, deleted: 0, updated: 0, ignored: 0 }],
                errors: [],
                rawResponse: {},
            };
        }

        const { status, description, conflicts, importCount } = importSummary;
        const { imported, deleted, updated, ignored } = importCount;
        const errors = conflicts?.map(({ object, value }) => ({ id: object, message: value, details: "" })) ?? [];

        return {
            title,
            status,
            message: description,
            stats: [{ imported, deleted, updated, ignored }],
            errors,
            rawResponse: importSummary,
        };
    }

    // TODO: Review when data validation comes in
    private async validateAggregateImportPackage(dataValues: AggregatedDataValue[]) {
        const dataElements = _.uniq(dataValues.map(({ dataElement }) => dataElement));
        const result = await promiseMap(_.chunk(dataElements, 300), dataElements =>
            this.api.metadata
                .get({
                    dataElements: {
                        fields: { id: true, valueType: true },
                        filter: { id: { in: dataElements } },
                    },
                })
                .getData()
        );

        const metadata = _.flatMap(result, ({ dataElements }) => dataElements);

        return _.compact(
            dataValues.map(dataValue => {
                const { dataElement, value } = dataValue;
                const item = metadata.find(({ id }) => id === dataElement);
                if (item && item.valueType === "TRUE_ONLY" && value === "false") return undefined;
                return dataValue;
            })
        );
    }

    private async importEventsData(dataPackage: DataPackage): Promise<SynchronizationResult[]> {
        const events = this.buildEventsPayload(dataPackage);

        const programs = _(events)
            .groupBy(event => event.program)
            .keys()
            .value();
        const eventProgramStages = await promiseMap(programs, async program => {
            const programStage = await this.getEventProgramStage(program);

            return {
                program: program,
                programStage: programStage?.id,
            };
        });

        const eventsToSave = events.map(event => {
            const eventProgramStage = eventProgramStages.find(
                programStage => programStage.program === event.program
            )?.programStage;

            return {
                ...event,
                programStage: event.programStage ?? eventProgramStage,
            };
        });

        // third value only required for program trackers
        return postEvents(this.api, eventsToSave, undefined);
    }

    private async getEventProgramStage(programId: Id): Promise<Ref | undefined> {
        const { api } = this;

        const { objects } = await api.models.programs
            .get({
                fields: { programStages: true },
                filter: { id: { eq: programId } },
            })
            .getData();

        return _.first(objects)?.programStages[0];
    }

    private async importTrackerProgramData(
        dataPackage: TrackerProgramPackage,
        options: ImportDataPackageOptions
    ): Promise<SynchronizationResult[]> {
        const { trackedEntityInstances, dataEntries } = dataPackage;
        return updateTrackedEntityInstances(this.api, trackedEntityInstances, dataEntries, options);
    }

    private async getDataSetMetadata(formOptions: { id: Id }) {
        /* Make specific calls to /api/metadata instead of /api/dataSets/ID/metadata to
           minimize the size/response times. That's specially important for NRC instances,
           which returned a huge amount of categoryOptionCombos (later unused). */
        const { dataSets } = await this.api.metadata
            .get({
                dataSets: {
                    fields: {
                        id: true,
                        categoryCombo: { id: true },
                        dataSetElements: {
                            dataElement: { id: true, optionSet: { id: true } },
                            categoryCombo: { id: true },
                        },
                    },
                    filter: { id: { eq: formOptions.id } },
                },
            })
            .getData();

        const dataSet = dataSets[0];
        if (!dataSet) throw new Error(`Data set not found: ${formOptions.id}`);

        const categoryComboIds = _(dataSet.categoryCombo)
            .concat(dataSet.dataSetElements.map(dse => dse.categoryCombo))
            .compact()
            .map(categoryCombo => categoryCombo.id)
            .uniq()
            .value();

        const optionSetIds = _(dataSet.dataSetElements)
            .map(dse => dse.dataElement.optionSet)
            .compact()
            .map(optionSet => optionSet.id)
            .uniq()
            .value();

        const { categoryCombos, options } = await this.api.metadata
            .get({
                categoryCombos: {
                    fields: { id: true, categories: { id: true, categoryOptions: { id: true } } },
                    filter: { id: { in: categoryComboIds } },
                },
                options: {
                    fields: { id: true, code: true, optionSet: { id: true } },
                    filter: { "optionSet.id": { in: optionSetIds } },
                },
            })
            .getData();

        return {
            form: dataSet,
            dataElements: dataSet.dataSetElements.map(dse => dse.dataElement),
            categoryCombos: categoryCombos,
            categories: _(categoryCombos)
                .flatMap(categoryCombo => categoryCombo.categories)
                .uniqBy(category => category.id)
                .value(),
            options: options,
        };
    }

    private async getDataSetPackage({
        id,
        orgUnits,
        periods = [],
        startDate,
        endDate,
        translateCodes = true,
    }: GetDataPackageParams): Promise<DataPackage> {
        const defaultIds = await this.getDefaultIds();
        const metadata = await this.getDataSetMetadata({ id });
        const response = await promiseMap(_.chunk(orgUnits, 200), async orgUnit => {
            const query = (period?: string[]): Promise<DataValueSetsGetResponse> =>
                this.api.dataValues
                    .getSet({
                        dataSet: [id],
                        orgUnit,
                        period,
                        startDate: startDate?.format("YYYY-MM-DD"),
                        endDate: endDate?.format("YYYY-MM-DD"),
                    })
                    .getData();

            return periods.length > 0 ? await promiseMap(_.chunk(periods, 200), query) : [await query()];
        });

        return {
            type: "dataSets",
            dataEntries: _(response)
                .flatten()
                .flatMap(({ dataValues = [] }) => dataValues)
                .groupBy(({ period, orgUnit, attributeOptionCombo }) =>
                    [period, orgUnit, attributeOptionCombo].join("-")
                )
                .map((dataValues, key) => {
                    const [period, orgUnit, attribute] = key.split("-");
                    if (!period || !orgUnit) return undefined;

                    return {
                        type: "aggregated" as const,
                        dataForm: id,
                        orgUnit,
                        period,
                        attribute: attribute && defaultIds.includes(attribute) ? undefined : attribute,
                        dataValues: dataValues.map(({ dataElement, categoryOptionCombo, value, comment }) => ({
                            dataElement,
                            category: defaultIds.includes(categoryOptionCombo) ? undefined : categoryOptionCombo,
                            value: this.formatDataValue(dataElement, value, metadata, translateCodes),
                            comment,
                        })),
                    };
                })
                .compact()
                .value(),
        };
    }

    private async getProgramPackage({
        id,
        orgUnits,
        startDate,
        endDate,
        translateCodes = true,
    }: GetDataPackageParams): Promise<DataPackage> {
        const res = await this.api.get<MetadataProgramPackage>(`/programs/${id}/metadata`).getData();
        const program = res.programs?.[0];
        if (!program) throw new Error(`Program not found: ${id}`);

        const metadata = { ...res, form: program };
        const categoryComboId = program.categoryCombo.id;
        const categoryOptions = this.buildProgramAttributeOptions(metadata, categoryComboId);
        if (categoryOptions.length === 0) {
            throw new Error(`Could not find category options for the program ${id}`);
        }

        const getEvents = async (orgUnit: Id, categoryOptionId: Id, page: number): Promise<EventsResponse> => {
            const { instances, events, pageCount } = await this.api
                .get<EventsAPIResponse>("/tracker/events", {
                    program: id,
                    orgUnit,
                    paging: true,
                    totalPages: true,
                    page,
                    pageSize: 250,
                    attributeCategoryCombo: categoryComboId,
                    attributeCategoryOptions: categoryOptionId,
                    // TODO: Get typesafety for this object
                    occurredAfter: startDate?.format("YYYY-MM-DD"),
                    occurredBefore: endDate?.format("YYYY-MM-DD"),
                    cache: Math.random(),
                    fields: "*",
                })
                .getData();

            return { instances: instances || events || [], pageCount };
        };

        const programEvents: Event[] = [];

        for (const orgUnit of orgUnits) {
            for (const categoryOptionId of categoryOptions) {
                const { instances: events, pageCount } = await getEvents(orgUnit, categoryOptionId, 1);
                programEvents.push(...events);

                await promiseMap(_.range(2, pageCount + 1, 1), async page => {
                    const { instances } = await getEvents(orgUnit, categoryOptionId, page);
                    programEvents.push(...instances);
                });
            }
        }

        return {
            type: "programs",
            dataEntries: _(programEvents)
                .map(
                    ({
                        event,
                        orgUnit,
                        occurredAt,
                        attributeOptionCombo,
                        coordinate,
                        geometry,
                        dataValues,
                        trackedEntity,
                        programStage,
                    }) => ({
                        id: event,
                        dataForm: id,
                        orgUnit,
                        period: moment(occurredAt).format("YYYY-MM-DD"),
                        attribute: attributeOptionCombo,
                        coordinate: geometry
                            ? {
                                  longitude: geometry.coordinates[0]?.toString() ?? "",
                                  latitude: geometry.coordinates[1]?.toString() ?? "",
                              }
                            : coordinate,
                        geometry: geometry,
                        trackedEntityInstance: trackedEntity,
                        programStage,
                        dataValues:
                            dataValues?.map(({ dataElement, value }) => ({
                                dataElement,
                                value: this.formatDataValue(dataElement, value, metadata, translateCodes),
                            })) ?? [],
                    })
                )
                .value(),
        };
    }

    private formatDataValue(
        dataElement: string,
        value: string | number | boolean | undefined | null,
        metadata: MetadataPackage,
        translateCodes: boolean
    ): string | number | boolean {
        if (_.isNil(value)) return "";

        const optionSet = _.find(metadata.dataElements, { id: dataElement })?.optionSet?.id;
        if (!translateCodes || !optionSet) return value;

        // Format options from CODE to UID
        const options = _.filter(metadata.options, { optionSet: { id: optionSet } });
        const optionValue = options.find(({ code }) => code === value);
        return optionValue?.id ?? value;
    }

    private buildProgramAttributeOptions(metadata: MetadataPackage, categoryComboId?: string): string[] {
        if (!categoryComboId) return [];

        // Get all the categories assigned to the categoryCombo of the program
        const categoryCombo = _.find(metadata?.categoryCombos, { id: categoryComboId });
        const categoryIds = _.compact(categoryCombo?.categories?.map(({ id }) => id));

        // Get all the category options for each category on the categoryCombo
        const categories = _.compact(categoryIds.map(id => _.find(metadata?.categories, { id })));
        // Cartesian product to fix bug in DHIS2 with multiple categories in a combo
        const optionsByCategory = categories.map(({ categoryOptions }) => categoryOptions.map(({ id }) => id));

        //@ts-ignore Polyfilled lodash product
        const categoryOptions = _.product(...optionsByCategory).map(items => items.join(";"));

        return categoryOptions;
    }
}

interface MetadataProgramPackage extends Omit<MetadataPackage, "form"> {
    programs: Array<MetadataPackage["form"]>;
}

type MaybeA<T> = T[] | undefined;

interface MetadataPackage {
    form: Ref & { categoryCombo: Ref };
    dataElements: MaybeA<Ref & { optionSet?: Ref }>;
    options: MaybeA<Ref & { code: string; optionSet: Ref }>;
    categoryCombos: MaybeA<Ref & { categories: Ref[] }>;
    categories: MaybeA<Ref & { categoryOptions: Ref[] }>;
}

const dataElementFields = {
    id: true,
    formName: true,
    name: true,
    valueType: true,
    categoryCombo: { categoryOptionCombos: { id: true, name: true } },
    optionSet: { id: true, options: { id: true, code: true } },
} as const;

const dataSetFields = {
    id: true,
    displayName: true,
    name: true,
    attributeValues: { value: true, attribute: { code: true } },
    dataSetElements: { dataElement: dataElementFields },
    sections: { id: true, name: true, dataElements: dataElementFields },
    periodType: true,
    access: true,
} as const;

const programFields = {
    id: true,
    displayName: true,
    name: true,
    attributeValues: { value: true, attribute: { code: true } },
    programStages: {
        id: true,
        name: true,
        programStageDataElements: { dataElement: dataElementFields },
        repeatable: true,
    },
    programTrackedEntityAttributes: { trackedEntityAttribute: { id: true, name: true, valueType: true } },
    access: true,
    programType: true,
    trackedEntityType: { id: true, featureType: true },
} as const;

const formatDataElement = (de: SelectedPick<D2DataElementSchema, typeof dataElementFields>): DataElement => ({
    id: de.id,
    name: de.formName ?? de.name ?? "",
    valueType: de.valueType,
    categoryOptionCombos: de.categoryCombo?.categoryOptionCombos ?? [],
    options: de.optionSet?.options,
});

type TrackedEntityTypeApi = Pick<D2TrackedEntityType, "id" | "featureType">;

function getTrackedEntityTypeFromApi(
    trackedEntityType?: TrackedEntityTypeApi
): DataForm["trackedEntityType"] | undefined {
    // TODO: Review when adding other types
    if (!trackedEntityType) return undefined;

    const d2FeatureType = trackedEntityType.featureType;
    const featureType = d2FeatureType === "POINT" ? "point" : d2FeatureType === "POLYGON" ? "polygon" : "none";
    return { id: trackedEntityType.id, featureType };
}
