import { TeiGetRequest, TrackedEntityInstanceGeometryAttributes } from "@eyeseetea/d2-api/api/trackedEntityInstances";
import { generateUid } from "d2/uid";
import _ from "lodash";
import { Moment } from "moment";
import { ProgramPackageData } from "../domain/entities/DataPackage";
import { Event, EventDataValue } from "../domain/entities/DhisDataPackage";
import { Geometry } from "../domain/entities/Geometry";
import { emptyImportSummary } from "../domain/entities/ImportSummary";
import { Relationship } from "../domain/entities/Relationship";
import { SynchronizationResult } from "../domain/entities/SynchronizationResult";
import { AttributeValue, Enrollment, Program, TrackedEntityInstance } from "../domain/entities/TrackedEntityInstance";
import { parseDate } from "../domain/helpers/ExcelReader";
import i18n from "../utils/i18n";
import { D2Api, D2RelationshipType, Id, Ref } from "../types/d2-api";
import { KeysOfUnion } from "../types/utils";
import { promiseMap } from "../utils/promises";
import { getUid } from "./dhis2-uid";
import { postEvents } from "./Dhis2Events";
import {
    buildOrgUnitMode,
    fromApiRelationships,
    getApiRelationships,
    getRelationshipMetadata,
    RelationshipMetadata,
    RelationshipOrgUnitFilter,
} from "./Dhis2RelationshipTypes";
import { ImportPostResponse, postImport } from "./Dhis2Import";
import {
    TrackedEntitiesApiRequest,
    TrackedEntitiesResponse,
    TrackedEntity,
    TrackedEntitiesAPIResponse,
} from "../domain/entities/TrackedEntity";
import { Params } from "@eyeseetea/d2-api/api/common";
import { ImportDataPackageOptions } from "../domain/repositories/InstanceRepository";
import { MULTI_TEXT_OPTION_DELIMITER } from "../domain/helpers/ExcelBuilder";

export interface GetOptions {
    api: D2Api;
    program: Ref;
    orgUnits: Ref[];
    pageSize?: number;
    enrollmentStartDate?: Moment;
    enrollmentEndDate?: Moment;
    relationshipsOuFilter?: RelationshipOrgUnitFilter;
}

type TrackerParams = Params & Omit<TeiGetRequest, "ou" | "ouMode">;

export interface TrackedEntityGetRequest extends TrackerParams {
    orgUnit?: string;
    orgUnitMode?: TeiGetRequest["ouMode"];
    trackedEntity?: string;
    enrollmentEnrolledAfter?: string;
    enrollmentEnrolledBefore?: string;
}

export async function getTrackedEntityInstances(options: GetOptions): Promise<TrackedEntityInstance[]> {
    const {
        api,
        orgUnits,
        pageSize = 500,
        enrollmentStartDate,
        enrollmentEndDate,
        relationshipsOuFilter = "CAPTURE",
    } = options;
    if (_.isEmpty(orgUnits)) return [];

    const program = await getProgram(api, options.program.id);
    if (!program) return [];

    const metadata = await getRelationshipMetadata(program, api, {
        organisationUnits: orgUnits,
        ouMode: relationshipsOuFilter,
    });

    // Avoid 414-uri-too-large by spliting orgUnit in chunks
    const orgUnitsList = _.chunk(orgUnits, 250);

    // Get TEIs for the first page:
    const apiTeis: TrackedEntitiesApiRequest[] = [];

    for (const orgUnits of orgUnitsList) {
        // Limit response size by requesting paginated TEIs
        for (let page = 1; ; page++) {
            const { pageCount, instances } = await getTeisFromApi({
                api,
                program,
                orgUnits,
                page,
                pageSize,
                enrollmentStartDate,
                enrollmentEndDate,
                ouMode: relationshipsOuFilter,
            });
            apiTeis.push(...instances);
            if (pageCount <= page) break;
        }
    }

    return apiTeis.map(tei => buildTei(metadata, program, tei));
}

export async function getProgram(api: D2Api, id: Id): Promise<Program | undefined> {
    const {
        objects: [apiProgram],
    } = await api.models.programs
        .get({
            fields: {
                id: true,
                trackedEntityType: { id: true },
                programTrackedEntityAttributes: {
                    trackedEntityAttribute: {
                        id: true,
                        name: true,
                        valueType: true,
                        optionSet: { id: true, options: { id: true, name: true, code: true } },
                    },
                },
            },
            filter: { id: { eq: id } },
        })
        .getData();

    if (!apiProgram) return;

    const program: Program = {
        id: apiProgram.id,
        trackedEntityType: { id: apiProgram.trackedEntityType.id },
        attributes: apiProgram.programTrackedEntityAttributes.map(
            ({ trackedEntityAttribute }) => trackedEntityAttribute
        ),
    };

    return program;
}

export async function updateTrackedEntityInstances(
    api: D2Api,
    trackedEntityInstances: TrackedEntityInstance[],
    dataEntries: ProgramPackageData[],
    importOptions: ImportDataPackageOptions
): Promise<SynchronizationResult[]> {
    if (_.isEmpty(trackedEntityInstances)) return [emptyImportSummary];

    // Non-UID tei IDS should be deterministic within a current call, use a random seed.
    const teiSeed = generateUid();
    const metadata = await getMetadata(api);
    const teis = updateTeiIds(trackedEntityInstances, teiSeed);
    const programId = _(trackedEntityInstances)
        .map(tei => tei.program.id)
        .uniq()
        .compact()
        .first();
    if (!programId) throw new Error("Cannot get program from TEIs");

    const orgUnitIds = _.uniq(teis.map(tei => tei.orgUnit.id));

    const existingTeis = await getTrackedEntityInstances({
        api,
        program: { id: programId },
        orgUnits: orgUnitIds.map(id => ({ id })),
        relationshipsOuFilter: "SELECTED",
    });

    const program = await getProgram(api, programId);
    if (!program) throw new Error(`Program not found: ${programId}`);

    const apiEvents = await getApiEvents(api, teis, dataEntries, metadata, teiSeed);
    const { preTeis, postTeis } = await splitTeis(api, teis, metadata);
    const options = { api, program, metadata, existingTeis };

    return runSequentialPromisesOnSuccess([
        () => uploadTeis({ ...options, teis: preTeis, title: i18n.t("Create/update"), importOptions }),
        () => uploadTeis({ ...options, teis: postTeis, title: i18n.t("Relationships"), importOptions }),
        () => postEvents(api, apiEvents, { existingTeis, teis: teis, program, metadata, importOptions }),
    ]);
}

async function runSequentialPromisesOnSuccess(
    fns: Array<() => Promise<SynchronizationResult[] | undefined>>
): Promise<SynchronizationResult[]> {
    const output: SynchronizationResult[] = [];
    for (const fn of fns) {
        const res = await fn();
        if (res) output.push(...res);
        const status = res?.find(r => r.status !== "SUCCESS")?.status;
        if (status && status !== "SUCCESS") break;
    }
    return output;
}

// Private

/* A TEI cannot be posted if it includes relationships to other TEIs which are not created
    yet (creation of TEIS is sequential). So let's split pre/post TEI's so they can be
    posted separatedly.
*/
async function splitTeis(
    api: D2Api,
    teis: TrackedEntityInstance[],
    metadata: Metadata
): Promise<{ preTeis: TrackedEntityInstance[]; postTeis: TrackedEntityInstance[] }> {
    const existingTeis = await getExistingTeis(api);
    const existingTeiIds = new Set(existingTeis.map(tei => tei.id));

    function canPostRelationship(relationship: Relationship, constraintKey: "from" | "to"): boolean {
        const relType = metadata.relationshipTypesById[relationship.typeId];
        if (!relType) return false;

        const [constraint, id] =
            constraintKey === "from"
                ? [relType.fromConstraint, relationship.fromId]
                : [relType.toConstraint, relationship.toId];

        // TEIs constraints can be posted if they exist. All others (events) can be always posted.
        return constraint.relationshipEntity === "TRACKED_ENTITY_INSTANCE" ? existingTeiIds.has(id) : true;
    }

    const [validTeis, invalidTeis] = _(teis)
        .partition(tei =>
            _(tei.relationships).every(rel => canPostRelationship(rel, "from") && canPostRelationship(rel, "to"))
        )
        .value();

    const preTeis = _.concat(
        invalidTeis.map(tei => ({ ...tei, relationships: [] })),
        validTeis
    );
    const postTeis = invalidTeis;

    return { preTeis, postTeis };
}

async function uploadTeis(options: {
    api: D2Api;
    program: Program;
    metadata: Metadata;
    teis: TrackedEntityInstance[];
    existingTeis: TrackedEntityInstance[];
    title: string;
    importOptions: ImportDataPackageOptions;
}): Promise<SynchronizationResult[]> {
    const { api, importOptions, program, metadata, teis, existingTeis, title } = options;

    if (_.isEmpty(teis)) return [];

    const apiTeis = teis.map(tei => getApiTeiToUpload(program, metadata, tei, existingTeis, importOptions));
    const model = i18n.t("Tracked Entity Instance");

    const teisResult = await promiseMap(_.chunk(apiTeis, 200), teisToSave => {
        return postImport(
            api,
            async () =>
                await api
                    .post<ImportPostResponse>("/tracker", { async: true }, { trackedEntities: teisToSave })
                    .getData(),
            {
                title: `${model} - ${title}`,
                model: model,
                splitStatsList: false,
            }
        );
    });
    return teisResult;
}

export interface Metadata {
    options: Array<{ id: Id; name: string; code: string }>;
    relationshipTypesById: Record<Id, Pick<D2RelationshipType, "id" | "toConstraint" | "fromConstraint">>;
}

/* Get metadata required to map attribute values for option sets */
async function getMetadata(api: D2Api): Promise<Metadata> {
    const { options, relationshipTypes } = await api.metadata
        .get({
            options: { fields: { id: true, name: true, code: true } },
            relationshipTypes: { fields: { id: true, toConstraint: true, fromConstraint: true } },
        })
        .getData();

    const relationshipTypesById = _.keyBy(relationshipTypes, rt => rt.id);

    return { options, relationshipTypesById };
}

async function getApiEvents(
    api: D2Api,
    teis: TrackedEntityInstance[],
    dataEntries: ProgramPackageData[],
    metadata: Metadata,
    teiSeed: string
): Promise<Event[]> {
    const programByTei: Record<Id, Id> = _(teis)
        .map(tei => [tei.id, tei.program.id] as const)
        .fromPairs()
        .value();

    const optionById = _.keyBy(metadata.options, option => option.id);

    const { dataElements } = await api.metadata
        .get({ dataElements: { fields: { id: true, valueType: true } } })
        .getData();

    const valueTypeByDataElementId = _(dataElements)
        .map(de => [de.id, de.valueType])
        .fromPairs()
        .value();

    return _(dataEntries)
        .map((data): Event | null => {
            if (!data.trackedEntityInstance) {
                console.error(`Data without trackedEntityInstance: ${data}`);
                return null;
            }

            const teiId = getUid(data.trackedEntityInstance, teiSeed);
            const program = programByTei[teiId];

            if (!program) {
                console.error(`Program not found for TEI ${teiId}`);
                return null;
            }

            if (!data.programStage) {
                console.error(`Data without programStage ${data}`);
                return null;
            }

            const dataValues = _(data.dataValues)
                .flatMap((dataValue): EventDataValue => {
                    // Leave dataValue.optionId as fallback so virtual IDS like true/false are used
                    const valueType = valueTypeByDataElementId[dataValue.dataElement];
                    let value: string;

                    if (valueType === "DATE" && typeof dataValue.value === "string" && dataValue.value.match(/^\d+$/)) {
                        value = parseDate(parseInt(dataValue.value)).toString();
                    } else {
                        value = getValue(dataValue, optionById);
                    }
                    return {
                        dataElement: dataValue.dataElement,
                        value,
                    };
                })
                .value();

            return {
                event: data.id,
                trackedEntity: teiId,
                program: program,
                orgUnit: data.orgUnit,
                occurredAt: data.period,
                attributeOptionCombo: data.attribute,
                status: "COMPLETED" as const,
                programStage: data.programStage,
                dataValues,
            };
        })
        .compact()
        .value();
}

export function getApiTeiToUpload(
    program: Program,
    metadata: Metadata,
    tei: TrackedEntityInstance,
    existingTeis: TrackedEntityInstance[],
    importOptions: ImportDataPackageOptions
): TrackedEntity {
    const { orgUnit, enrollment, relationships } = tei;
    const optionById = _.keyBy(metadata.options, option => option.id);

    const existingTei = existingTeis.find(tei_ => tei_.id === tei.id);
    const apiRelationships = getApiRelationships(existingTei, relationships, metadata.relationshipTypesById);

    const enrollmentId = existingTei?.enrollment?.id || generateUidForTei(tei.id, orgUnit.id, program.id);

    const attributes = tei.attributeValues.map(attributeValue => {
        return {
            attribute: attributeValue.attribute.id,
            value:
                attributeValue.attribute.valueType === "MULTI_TEXT" &&
                !attributeValue.optionId &&
                importOptions.multiTextTeiDelimiter
                    ? getMultiTextValue({
                          metadata,
                          attributeValue,
                          multiTextTeiDelimiter: importOptions.multiTextTeiDelimiter,
                      })
                    : getValue(attributeValue, optionById),
        };
    });

    return {
        trackedEntity: tei.id,
        trackedEntityType: program.trackedEntityType.id,
        orgUnit: orgUnit.id,
        attributes: attributes,
        enrollments:
            enrollment && enrollment.enrolledAt
                ? [
                      {
                          enrollment: enrollmentId,
                          orgUnit: orgUnit.id,
                          program: program.id,
                          enrolledAt: enrollment.enrolledAt,
                          occurredAt: enrollment.occurredAt || enrollment.enrolledAt,
                          attributes: attributes,
                      },
                  ]
                : [],
        relationships: apiRelationships,
        ...getD2TeiGeometryAttributes(tei),
    };
}

function getMultiTextValue(options: {
    metadata: Metadata;
    attributeValue: AttributeValue;
    multiTextTeiDelimiter: string;
}): string {
    const { multiTextTeiDelimiter, metadata, attributeValue } = options;
    const optionNames = attributeValue.value.split(multiTextTeiDelimiter).map(name => name.trim());

    if (!optionNames) return "";

    const optionsByName = _.keyBy(metadata.options, option => option.name);
    const values = _(optionNames)
        .map(name => {
            const optionCode = optionsByName[name]?.code;
            if (!optionCode) {
                console.warn(`Option with name "${name}" not found in metadata options.`);
                return undefined;
            }

            return optionCode;
        })
        .compact()
        .join(MULTI_TEXT_OPTION_DELIMITER);

    return values;
}

async function getExistingTeis(api: D2Api): Promise<Ref[]> {
    const query = {
        ouMode: "CAPTURE",
        pageSize: 1000,
        totalPages: true,
        fields: "trackedEntity",
    } as const;

    // DHIS 2.37 added a new requirement: "Either Program or Tracked entity type should be specified"
    // Requests to /api/trackedEntityInstances for these two params are singled-value, so we must
    // perform multiple requests. Use Tracked Entity Types as tipically there will be more programs.

    const metadata = await api.metadata.get({ trackedEntityTypes: { fields: { id: true } } }).getData();

    const teisGroups = await promiseMap(metadata.trackedEntityTypes, async entityType => {
        const queryWithEntityType: TrackedEntityGetRequest = { ...query, trackedEntityType: entityType.id };

        const { instances: firstPage, pageCount } = await getTrackedEntities(api, queryWithEntityType);

        const pages = _.range(2, pageCount + 1);

        const otherPages = await promiseMap(pages, async page => {
            const { instances: trackedEntityInstances } = await getTrackedEntities(api, {
                ...queryWithEntityType,
                page,
            });

            return trackedEntityInstances;
        });

        return [...firstPage, ..._.flatten(otherPages)].map(({ trackedEntity, ...rest }) => ({
            ...rest,
            id: trackedEntity,
        }));
    });

    return _.flatten(teisGroups);
}

type TeiKey = KeysOfUnion<TrackedEntitiesApiRequest>;

async function getTeisFromApi(options: {
    api: D2Api;
    program: Program;
    orgUnits: Ref[];
    page: number;
    pageSize: number;
    enrollmentStartDate?: Moment;
    enrollmentEndDate?: Moment;
    ouMode: RelationshipOrgUnitFilter;
}): Promise<TrackedEntitiesResponse> {
    const { api, program, orgUnits, page, pageSize, enrollmentStartDate, enrollmentEndDate, ouMode } = options;

    const fields: TeiKey[] = [
        "trackedEntity",
        "inactive",
        "orgUnit",
        "attributes",
        "enrollments",
        "relationships",
        "geometry",
    ];

    const ouModeQuery = buildOrgUnitMode(ouMode, orgUnits);

    const filters: TrackedEntityGetRequest = {
        ...ouModeQuery,
        order: "createdAt:asc",
        program: program.id,
        pageSize: pageSize,
        page: page,
        totalPages: true as const,
        fields: fields.join(","),
        enrollmentEnrolledAfter: enrollmentStartDate?.format("YYYY-MM-DD[T]HH:mm"),
        enrollmentEnrolledBefore: enrollmentEndDate?.format("YYYY-MM-DD[T]HH:mm"),
    };
    const { instances, pageCount } = await getTrackedEntities(api, filters);

    return { instances, pageCount };
}

export async function getTrackedEntities(
    api: D2Api,
    filterQuery: TrackedEntityGetRequest
): Promise<TrackedEntitiesResponse> {
    const { instances, trackedEntities, pageCount } = await api
        .get<TrackedEntitiesAPIResponse>("/tracker/trackedEntities", filterQuery)
        .getData();

    return { instances: instances || trackedEntities || [], pageCount: pageCount };
}

function buildTei(
    metadata: RelationshipMetadata,
    program: Program,
    teiApi: TrackedEntitiesApiRequest
): TrackedEntityInstance {
    const orgUnit = { id: teiApi.orgUnit };
    const attributesById = _.keyBy(program.attributes, attribute => attribute.id);

    const enrollment: Enrollment | undefined = _(teiApi.enrollments)
        .filter(e => e.program === program.id && orgUnit.id === e.orgUnit)
        .map(enrollmentApi => ({
            id: enrollmentApi.enrollment,
            enrolledAt: enrollmentApi.enrolledAt,
            occurredAt: enrollmentApi.occurredAt,
        }))
        .first();

    const attributeValues: AttributeValue[] = teiApi.attributes.map((attrApi): AttributeValue => {
        const optionSet = attributesById[attrApi.attribute]?.optionSet;
        const option = optionSet && optionSet.options.find(option => option.code === attrApi.value);

        return {
            attribute: {
                id: attrApi.attribute,
                valueType: attrApi.valueType,
                ...(optionSet ? { optionSet } : {}),
            },
            value: attrApi.value,
            ...(option ? { optionId: option.id } : {}),
        };
    });

    return {
        program: { id: program.id },
        id: teiApi.trackedEntity,
        orgUnit: { id: teiApi.orgUnit },
        disabled: teiApi.inactive || false,
        enrollment: enrollment,
        attributeValues: attributeValues,
        relationships: fromApiRelationships(metadata, teiApi),
        geometry: getGeometry(teiApi),
    };
}

function getD2TeiGeometryAttributes(tei: TrackedEntityInstance): TrackedEntityInstanceGeometryAttributes {
    const { geometry } = tei;

    switch (geometry.type) {
        case "none":
            return { featureType: "NONE" };
        case "point": {
            const { coordinates } = geometry;
            const coordinatesPair = [coordinates.longitude, coordinates.latitude] as [number, number];
            return { featureType: "POINT", geometry: { type: "Point", coordinates: coordinatesPair } };
        }
        case "polygon": {
            const coordinatesPairs = geometry.coordinatesList.map(
                coordinates => [coordinates.longitude, coordinates.latitude] as [number, number]
            );
            return { featureType: "POLYGON", geometry: { type: "Polygon", coordinates: [coordinatesPairs] } };
        }
    }
}

function getGeometry(teiApi: TrackedEntitiesApiRequest): Geometry {
    switch (teiApi.geometry?.type) {
        case "Point": {
            const [longitude, latitude] = teiApi.geometry.coordinates;
            return { type: "point", coordinates: { latitude, longitude } };
        }
        case "Polygon": {
            const coordinatesPairs = teiApi.geometry.coordinates[0] || [];
            const coordinatesList = coordinatesPairs.map(([longitude, latitude]) => ({ latitude, longitude }));
            return { type: "polygon", coordinatesList };
        }
        default:
            return { type: "none" };
    }
}

export function updateTeiIds(
    trackedEntityInstances: TrackedEntityInstance[],
    teiSeed: string
): TrackedEntityInstance[] {
    return trackedEntityInstances.map(tei => ({
        ...tei,
        id: getUid(tei.id, teiSeed),
        relationships: tei.relationships.map(rel => ({
            ...rel,
            fromId: getUid(rel.fromId, teiSeed),
            toId: getUid(rel.toId, teiSeed),
        })),
    }));
}

function getValue(
    dataValue: { optionId?: string; value: EventDataValue["value"] },
    optionById: Record<Id, { id: Id; code: string } | undefined>
): string {
    if (dataValue.optionId) {
        return optionById[dataValue.optionId]?.code || dataValue.optionId;
    } else {
        return dataValue.value.toString();
    }
}

export function generateUidForTei(teiId: Id, orgUnitId: Id, programId: Id): string {
    return getUid([teiId, orgUnitId, programId].join("-"));
}
