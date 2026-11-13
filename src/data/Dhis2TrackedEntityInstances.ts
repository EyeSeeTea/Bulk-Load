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
import { getUid, isValidUid } from "./dhis2-uid";
import {
    buildOrgUnitMode,
    fromApiRelationships,
    fromApiRelationshipsByType,
    getApiRelationships,
    getRelationshipMetadata,
    RelationshipMetadata,
    RelationshipOrgUnitFilter,
} from "./Dhis2RelationshipTypes";
import { ImportPostResponse, postImport, resolveEventStatus } from "./Dhis2Import";
import { TrackedEntitiesApiRequest, TrackedEntity } from "../domain/entities/TrackedEntity";
import { Params } from "@eyeseetea/d2-api/api/common";
import { ImportDataPackageOptions } from "../domain/repositories/InstanceRepository";
import { MULTI_TEXT_OPTION_DELIMITER } from "../domain/helpers/ExcelBuilder";
import { getAllPages, getMajorVersion, getVersion, joinIdsParameter } from "../utils/d2-api";

type GetOptions = {
    api: D2Api;
    program: Ref;
    orgUnits: Ref[];
    pageSize?: number;
    enrollmentStartDate?: Moment;
    enrollmentEndDate?: Moment;
    relationshipsOuFilter?: RelationshipOrgUnitFilter;
};

type TrackerParams = Params & Omit<TeiGetRequest, "ou" | "ouMode" | "totalPages">;

export interface TrackedEntityGetRequest extends TrackerParams {
    orgUnit?: string;
    orgUnitMode?: TeiGetRequest["ouMode"];
    trackedEntity?: string;
    trackedEntities?: string;
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

    const apiVersion = await getVersion(api);

    const program = await getProgram(api, options.program.id);
    if (!program) return [];

    const metadata = await getRelationshipMetadata(program, api, {
        organisationUnits: orgUnits,
        ouMode: relationshipsOuFilter,
    });

    // Avoid 414-uri-too-large by spliting orgUnit in chunks
    const apiTeisGroups = await promiseMap(_.chunk(orgUnits, 250), orgUnitsChunk =>
        getAllPages(pageSize, page =>
            getTeisFromApi({
                api,
                apiVersion,
                program,
                orgUnits: orgUnitsChunk,
                page,
                pageSize,
                enrollmentStartDate,
                enrollmentEndDate,
                ouMode: relationshipsOuFilter,
            })
        )
    );

    return _.flatten(apiTeisGroups).map(tei => buildTei(metadata, program, tei));
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

    const program = await getProgram(api, programId);
    if (!program) throw new Error(`Program not found: ${programId}`);

    const sheetTeiIds = trackedEntityInstances.map(tei => tei.id).filter(isValidUid);
    const existingTeis = await getExistingTeis(api, program, sheetTeiIds, metadata);

    const apiEvents = await getApiEvents({
        api: api,
        teis: teis,
        dataEntries: dataEntries,
        metadata: metadata,
        teiSeed: teiSeed,
        markCompleted: importOptions.markCompleted,
    });
    const eventsMap = _.groupBy(apiEvents, event => event.trackedEntity);
    const { preTeis, postTeis } = await splitTeis(api, teis, metadata);
    const options = { api, program, metadata, existingTeis };

    return runSequentialPromisesOnSuccess([
        () =>
            uploadTeis({
                ...options,
                teis: preTeis,
                title: i18n.t("Create/update"),
                importOptions,
                eventsByTei: eventsMap,
            }),
        () =>
            uploadTeis({
                ...options,
                teis: postTeis,
                title: i18n.t("Relationships"),
                importOptions,
                eventsByTei: eventsMap,
            }),
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
    const existingTeiIds = await getExistingTeiIds(api, getRelatedTeiIdsByType(teis, metadata));

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
    existingTeis: Record<Id, ExistingTei>;
    title: string;
    importOptions: ImportDataPackageOptions;
    eventsByTei: EventMap;
}): Promise<SynchronizationResult[]> {
    const { api, importOptions, program, metadata, teis, existingTeis, title, eventsByTei } = options;

    if (_.isEmpty(teis)) return [];

    const apiTeis = teis.map(tei =>
        getApiTeiToUpload({ program, metadata, tei, existingTeis, importOptions, eventsByTei })
    );
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
                rowLookup: importOptions.rowLookup,
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
            relationshipTypes: {
                fields: { id: true, toConstraint: constraintfields, fromConstraint: constraintfields },
            },
        })
        .getData();

    const relationshipTypesById = _.keyBy(relationshipTypes, rt => rt.id);

    return { options, relationshipTypesById };
}

async function getApiEvents(options: {
    api: D2Api;
    teis: TrackedEntityInstance[];
    dataEntries: ProgramPackageData[];
    metadata: Metadata;
    teiSeed: string;
    markCompleted: boolean;
}): Promise<Event[]> {
    const { api, teis, dataEntries, metadata, teiSeed, markCompleted } = options;
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
                status: resolveEventStatus(data.completed ?? markCompleted),
                programStage: data.programStage,
                dataValues,
            };
        })
        .compact()
        .value();
}

function getApiTeiToUpload(options: {
    program: Program;
    metadata: Metadata;
    tei: TrackedEntityInstance;
    existingTeis: Record<Id, ExistingTei>;
    importOptions: ImportDataPackageOptions;
    eventsByTei: EventMap;
}): TrackedEntityToSave {
    const { program, metadata, tei, existingTeis, importOptions, eventsByTei } = options;
    const { orgUnit, enrollment, relationships } = tei;
    const optionById = _.keyBy(metadata.options, option => option.id);

    const existingTei = existingTeis[tei.id];
    const apiRelationships = getApiRelationships(
        existingTei?.relationships ?? [],
        relationships,
        metadata.relationshipTypesById
    );

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

    const enrollmentEvents = eventsByTei[tei.id] || [];
    const apiEvents = enrollmentEvents.map(event => ({ ...event, enrollment: enrollmentId }));

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
                          events: apiEvents,
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

/* TEI IDs referenced by TEI-type relationship constraints, grouped by the constraint's tracked entity type */
function getRelatedTeiIdsByType(teis: TrackedEntityInstance[], metadata: Metadata): Record<Id, Id[]> {
    return _(teis)
        .flatMap(tei => tei.relationships)
        .flatMap(relationship => {
            const relType = metadata.relationshipTypesById[relationship.typeId];
            if (!relType) return [];

            return _.compact([
                getTeiConstraintRef(relType.fromConstraint, relationship.fromId),
                getTeiConstraintRef(relType.toConstraint, relationship.toId),
            ]);
        })
        .uniqBy(ref => [ref.trackedEntityTypeId, ref.id].join("-"))
        .groupBy(ref => ref.trackedEntityTypeId)
        .mapValues(refs => refs.map(ref => ref.id))
        .value();
}

function getTeiConstraintRef(
    constraint: D2RelationshipType["fromConstraint"],
    id: Id
): { id: Id; trackedEntityTypeId: Id } | undefined {
    const trackedEntityTypeId = constraint.trackedEntityType?.id;

    return constraint.relationshipEntity === "TRACKED_ENTITY_INSTANCE" && trackedEntityTypeId
        ? { id, trackedEntityTypeId }
        : undefined;
}

/* Check which of the given TEIs exist in the instance, querying them by ID instead of fetching all TEIs.
   DHIS 2.37+ requires either program or trackedEntityType, so use the type from the relationship constraint. */
async function getExistingTeiIds(api: D2Api, teiIdsByType: Record<Id, Id[]>): Promise<Set<Id>> {
    const existingIdsGroups = await promiseMap(_.toPairs(teiIdsByType), async ([trackedEntityType, ids]) => {
        const instances = await getTrackedEntitiesByIds(api, { trackedEntityType, ids, fields: "trackedEntity" });
        return instances.map(tei => tei.trackedEntity);
    });

    return new Set(_.flatten(existingIdsGroups));
}

/* The part of an existing TEI the import needs: its enrollment and its relationships */
interface ExistingTei extends Pick<TrackedEntityInstance, "relationships"> {
    enrollment?: Pick<Enrollment, "id">;
}

async function getExistingTeis(
    api: D2Api,
    program: Program,
    teiIds: Id[],
    metadata: Metadata
): Promise<Record<Id, ExistingTei>> {
    const existingTeiFields = [
        "trackedEntity",
        "orgUnit",
        "enrollments[enrollment,program,orgUnit]",
        "relationships[relationship,relationshipType,relationshipName,from[trackedEntity[trackedEntity],event[event]],to[trackedEntity[trackedEntity],event[event]]]",
    ].join(",");

    const instances = await getTrackedEntitiesByIds(api, {
        trackedEntityType: program.trackedEntityType.id,
        ids: teiIds,
        fields: existingTeiFields,
    });

    return _(instances)
        .map(teiApi => {
            // The program's enrollment in the TEI's own org unit, wherever the sheet row places the TEI
            const enrollment = teiApi.enrollments.find(e => e.program === program.id && e.orgUnit === teiApi.orgUnit);

            const existingTei: ExistingTei = {
                enrollment: enrollment && { id: enrollment.enrollment },
                relationships: fromApiRelationshipsByType(teiApi.relationships, metadata.relationshipTypesById, {
                    id: teiApi.trackedEntity,
                    trackedEntityTypeId: program.trackedEntityType.id,
                }),
            };
            return [teiApi.trackedEntity, existingTei] as const;
        })
        .fromPairs()
        .value();
}

async function getTrackedEntitiesByIds(
    api: D2Api,
    options: { trackedEntityType: Id; ids: Id[]; fields: string }
): Promise<TrackedEntitiesApiRequest[]> {
    const { trackedEntityType, ids, fields } = options;
    if (_.isEmpty(ids)) return [];

    const apiVersion = await getVersion(api);
    const ouModeParam = buildOrgUnitMode(apiVersion, "CAPTURE");
    const maxTeiIdsPerRequest = 100;

    const instancesGroups = await promiseMap(_.chunk(_.uniq(ids), maxTeiIdsPerRequest), async idsChunk => {
        return getTrackedEntities(api, {
            ...ouModeParam,
            ...buildTrackedEntitiesParameter(apiVersion, idsChunk),
            trackedEntityType,
            pageSize: idsChunk.length,
            fields,
        });
    });

    return _.flatten(instancesGroups);
}

function buildTrackedEntitiesParameter(
    apiVersion: string,
    ids: Id[]
): Pick<TrackedEntityGetRequest, "trackedEntity" | "trackedEntities"> {
    const majorVersion = getMajorVersion(apiVersion);
    const idsParameter = joinIdsParameter(majorVersion, ids);
    return majorVersion >= 42 ? { trackedEntities: idsParameter } : { trackedEntity: idsParameter };
}

type TeiKey = KeysOfUnion<TrackedEntitiesApiRequest>;

async function getTeisFromApi(options: {
    api: D2Api;
    apiVersion: string;
    program: Program;
    orgUnits: Ref[];
    page: number;
    pageSize: number;
    enrollmentStartDate?: Moment;
    enrollmentEndDate?: Moment;
    ouMode: RelationshipOrgUnitFilter;
}): Promise<TrackedEntitiesApiRequest[]> {
    const { api, apiVersion, program, orgUnits, page, pageSize, enrollmentStartDate, enrollmentEndDate, ouMode } =
        options;

    const fields: TeiKey[] = [
        "trackedEntity",
        "inactive",
        "orgUnit",
        "attributes",
        "enrollments",
        "relationships",
        "geometry",
    ];

    const ouModeQuery = buildOrgUnitMode(apiVersion, ouMode, orgUnits);

    const filters: TrackedEntityGetRequest = {
        ...ouModeQuery,
        order: "createdAt:asc",
        program: program.id,
        pageSize: pageSize,
        page: page,
        fields: fields.join(","),
        enrollmentEnrolledAfter: enrollmentStartDate?.format("YYYY-MM-DD[T]HH:mm"),
        enrollmentEnrolledBefore: enrollmentEndDate?.format("YYYY-MM-DD[T]HH:mm"),
    };

    return getTrackedEntities(api, filters);
}

export async function getTrackedEntities(
    api: D2Api,
    filterQuery: TrackedEntityGetRequest
): Promise<TrackedEntitiesApiRequest[]> {
    const { instances, trackedEntities } = await api
        .get<TrackedEntitiesD2ApiResponse>("/tracker/trackedEntities", filterQuery)
        .getData();

    return instances || trackedEntities || [];
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

export type TrackedEntitiesD2ApiResponse = {
    instances?: TrackedEntitiesApiRequest[];
    trackedEntities?: TrackedEntitiesApiRequest[];
};

type TEIId = string;
type EventMap = Record<TEIId, Event[]>;

type EnrollmentWithEvents = Enrollment & { events: Event[] };
type TrackedEntityToSave = Omit<TrackedEntity, "enrollments"> & {
    enrollments: EnrollmentWithEvents[];
};

const constraintfields = {
    program: true,
    programStage: true,
    relationshipEntity: true,
    trackedEntityType: true,
    trackerDataView: true,
};
