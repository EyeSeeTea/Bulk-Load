import { TeiGetRequest } from "@eyeseetea/d2-api/api/trackedEntityInstances";
import { generateUid } from "d2/uid";
import _ from "lodash";
import { Moment } from "moment";
import { DataElementType } from "../domain/entities/DataForm";
import { DataPackageData } from "../domain/entities/DataPackage";
import { Event, EventDataValue } from "../domain/entities/DhisDataPackage";
import { emptyImportSummary } from "../domain/entities/ImportSummary";
import { Relationship } from "../domain/entities/Relationship";
import { SynchronizationResult } from "../domain/entities/SynchronizationResult";
import { AttributeValue, Program, TrackedEntity } from "../domain/entities/TrackedEntityInstance";
import { parseDate } from "../domain/helpers/ExcelReader";
import i18n from "../locales";
import { D2Api, D2RelationshipType, Id, Ref } from "../types/d2-api";
import { promiseMap } from "../utils/promises";
import { getUid } from "./dhis2-uid";
import { postEvents } from "./Dhis2Events";
import { postImport } from "./Dhis2Import";
import {
    fromApiRelationships,
    getApiRelationships,
    getRelationshipMetadata,
    RelationshipMetadata,
    RelationshipOrgUnitFilter,
} from "./Dhis2RelationshipTypes";
import { D2TrackerTrackedEntity, TrackedEntitiesGetResponse } from "@eyeseetea/d2-api/api/trackerTrackedEntities";
import { D2TrackerEnrollment } from "@eyeseetea/d2-api/api/trackerEnrollments";
import { Geometry } from "../domain/entities/Geometry";

export interface GetOptions {
    api: D2Api;
    program: Ref;
    orgUnits: Ref[];
    pageSize?: number;
    enrollmentStartDate?: Moment;
    enrollmentEndDate?: Moment;
    relationshipsOuFilter?: RelationshipOrgUnitFilter;
}

export async function getTrackedEntities(options: GetOptions): Promise<TrackedEntity[]> {
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
    const apiTrackedEntities: D2TrackerTrackedEntity[] = [];

    for (const orgUnits of orgUnitsList) {
        // Limit response size by requesting paginated TEIs
        for (let page = 1; ; page++) {
            const { instances } = await getTrackedEntitiesFromApi({
                api,
                program,
                orgUnits,
                page,
                pageSize,
                enrollmentStartDate,
                enrollmentEndDate,
                ouMode: relationshipsOuFilter,
            });
            apiTrackedEntities.push(...instances);
            if (instances.length < pageSize) break;
        }
    }

    return apiTrackedEntities.map(trackedEntity => buildTrackedEntity(metadata, program, trackedEntity));
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
                        optionSet: { id: true, options: { id: true, code: true } },
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

export async function updateTrackedEntities(
    api: D2Api,
    trackedEntities: TrackedEntity[],
    dataEntries: DataPackageData[]
): Promise<SynchronizationResult[]> {
    if (_.isEmpty(trackedEntities)) return [emptyImportSummary];

    // Non-UID tei IDS should be deterministic within a current call, use a random seed.
    const trackedEntitySeed = generateUid();
    const metadata = await getMetadata(api);
    const updatedTrackedEntities = updateTrackedEntityIds(trackedEntities, trackedEntitySeed);
    const programId = _(trackedEntities)
        .map(tei => tei.program.id)
        .uniq()
        .compact()
        .first();
    if (!programId) throw new Error("Cannot get program from TEIs");

    const orgUnitIds = _.uniq(updatedTrackedEntities.map(tei => tei.orgUnit.id));

    const existingTrackedEntities = await getTrackedEntities({
        api,
        program: { id: programId },
        orgUnits: orgUnitIds.map(id => ({ id })),
        relationshipsOuFilter: "SELECTED",
    });

    const program = await getProgram(api, programId);
    if (!program) throw new Error(`Program not found: ${programId}`);

    const apiEvents = await getApiEvents(api, updatedTrackedEntities, dataEntries, metadata, trackedEntitySeed);

    const { preTrackedEntities, postTrackedEntities } = await splitTrackedEntities(
        api,
        updatedTrackedEntities,
        metadata
    );
    const options = { api, program, metadata, existingTrackedEntities };

    return runSequentialPromisesOnSuccess([
        () =>
            uploadTrackedEntities({ ...options, trackedEntities: preTrackedEntities, title: i18n.t("Create/update") }),
        () =>
            uploadTrackedEntities({ ...options, trackedEntities: postTrackedEntities, title: i18n.t("Relationships") }),
        () => postEvents(api, apiEvents),
    ]);
}

async function runSequentialPromisesOnSuccess(
    fns: Array<() => Promise<SynchronizationResult[] | undefined>>
): Promise<SynchronizationResult[]> {
    const output: SynchronizationResult[] = [];
    for (const fn of fns) {
        const res = await fn();
        if (res) output.push(...res);

        const notSuccessStatus = res?.find(r => !["SUCCESS", "OK"].includes(r.status))?.status;
        if (notSuccessStatus) break;
    }
    return output;
}

// Private

/* A TEI cannot be posted if it includes relationships to other TEIs which are not created
    yet (creation of TEIS is sequential). So let's split pre/post TEI's so they can be
    posted separatedly.
*/
async function splitTrackedEntities(
    api: D2Api,
    trackedEntities: TrackedEntity[],
    metadata: Metadata
): Promise<{ preTrackedEntities: TrackedEntity[]; postTrackedEntities: TrackedEntity[] }> {
    const existingTrackedEntities = await getExistingTeis(api);
    const existingTrackedEntitiesIds = new Set(existingTrackedEntities.map(tei => tei.id));

    function canPostRelationship(relationship: Relationship, constraintKey: "from" | "to"): boolean {
        const relType = metadata.relationshipTypesById[relationship.typeId];
        if (!relType) return false;

        const [constraint, id] =
            constraintKey === "from"
                ? [relType.fromConstraint, relationship.fromId]
                : [relType.toConstraint, relationship.toId];

        // TEIs constraints can be posted if they exist. All others (events) can be always posted.
        return constraint.relationshipEntity === "TRACKED_ENTITY_INSTANCE" ? existingTrackedEntitiesIds.has(id) : true;
    }

    const [validTrackedEntities, invalidTrackedEntities] = _(trackedEntities)
        .partition(tei =>
            _(tei.relationships).every(rel => canPostRelationship(rel, "from") && canPostRelationship(rel, "to"))
        )
        .value();

    const preTrackedEntities = _.concat(
        invalidTrackedEntities.map(tei => ({ ...tei, relationships: [] })),
        validTrackedEntities
    );
    const postTrackedEntities = invalidTrackedEntities;

    return { preTrackedEntities, postTrackedEntities };
}

async function uploadTrackedEntities(options: {
    api: D2Api;
    program: Program;
    metadata: Metadata;
    trackedEntities: TrackedEntity[];
    existingTrackedEntities: TrackedEntity[];
    title: string;
}): Promise<SynchronizationResult[]> {
    const { api, program, metadata, trackedEntities, existingTrackedEntities, title } = options;

    if (_.isEmpty(trackedEntities)) return [];

    const apiTrackedEntities = trackedEntities.map(trackedEntity =>
        getApiTrackedEntityToUpload(program, metadata, trackedEntity, existingTrackedEntities)
    );
    const model = i18n.t("Tracked Entity");

    const trackedEntitiesResult = await promiseMap(_.chunk(apiTrackedEntities, 200), trackedEntitiesToSave => {
        return postImport(
            async () => {
                const { response } = await api.tracker
                    .postAsync(
                        { importStrategy: "CREATE_AND_UPDATE", async: true },
                        { trackedEntities: trackedEntitiesToSave }
                    )
                    .getData();

                const result = await api.system.waitFor("TRACKER_IMPORT_JOB", response.id).getData();

                if (result) {
                    return result;
                } else {
                    throw new Error("Error while waiting for response");
                }
            },
            {
                title: `${model} - ${title}`,
                model: model,
                splitStatsList: false,
            }
        );
    });
    return trackedEntitiesResult;
}

interface Metadata {
    options: Array<{ id: Id; code: string }>;
    relationshipTypesById: Record<Id, Pick<D2RelationshipType, "id" | "toConstraint" | "fromConstraint">>;
}

/* Get metadata required to map attribute values for option sets */
async function getMetadata(api: D2Api): Promise<Metadata> {
    const { options, relationshipTypes } = await api.metadata
        .get({
            options: { fields: { id: true, code: true } },
            relationshipTypes: { fields: { id: true, toConstraint: true, fromConstraint: true } },
        })
        .getData();

    const relationshipTypesById = _.keyBy(relationshipTypes, rt => rt.id);

    return { options, relationshipTypesById };
}

async function getApiEvents(
    api: D2Api,
    trackedEntities: TrackedEntity[],
    dataEntries: DataPackageData[],
    metadata: Metadata,
    trackedEntitySeed: string
): Promise<Event[]> {
    const programByTrackedEntity: Record<Id, Id> = _(trackedEntities)
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

            const trackedEntityId = getUid(data.trackedEntityInstance, trackedEntitySeed);
            const program = programByTrackedEntity[trackedEntityId];

            const enrollment =
                trackedEntities.find(tei => tei.id === trackedEntityId)?.enrollment?.id ||
                getUid([trackedEntityId, data.orgUnit, program].join("-"));

            if (!program) {
                console.error(`Program not found for Tracked Entity ${trackedEntityId}`);
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
                trackedEntity: trackedEntityId,
                program: program,
                orgUnit: data.orgUnit,
                occurredAt: data.period,
                attributeOptionCombo: data.attribute,
                status: "COMPLETED" as const,
                programStage: data.programStage,
                enrollment: enrollment,
                dataValues,
            };
        })
        .compact()
        .value();
}

function getApiTrackedEntityToUpload(
    program: Program,
    metadata: Metadata,
    trackedEntity: TrackedEntity,
    existingTrackedEntities: TrackedEntity[]
): D2TrackerTrackedEntity {
    const { orgUnit, enrollment, relationships } = trackedEntity;
    const optionById = _.keyBy(metadata.options, option => option.id);

    const existingTrackedEntity = existingTrackedEntities.find(
        existingTrackedEntity => existingTrackedEntity.id === trackedEntity.id
    );
    const apiRelationships = getApiRelationships(existingTrackedEntity, relationships, metadata.relationshipTypesById);

    const enrollmentId =
        existingTrackedEntity?.enrollment?.id || getUid([trackedEntity.id, orgUnit.id, program.id].join("-"));

    return {
        trackedEntity: trackedEntity.id,
        trackedEntityType: program.trackedEntityType.id,
        orgUnit: orgUnit.id,
        attributes: trackedEntity.attributeValues.map(av => ({
            attribute: av.attribute.id,
            value: getValue(av, optionById),
        })),
        enrollments:
            enrollment && enrollment.enrolledAt
                ? [
                      {
                          ...enrollment,
                          enrollment: enrollmentId,
                          trackedEntity: trackedEntity.id,
                          program: program.id,
                          orgUnit: orgUnit.id,
                      },
                  ]
                : [],
        relationships: apiRelationships,
        geometry: (trackedEntity.geometry as any) || null,
    };
}

async function getExistingTeis(api: D2Api): Promise<Ref[]> {
    const query = {
        ouMode: "CAPTURE",
        pageSize: 1000,
        totalPages: true,
        fields: "trackedEntityInstance",
    } as const;

    // DHIS 2.37 added a new requirement: "Either Program or Tracked entity type should be specified"
    // Requests to /api/trackedEntityInstances for these two params are singled-value, so we must
    // perform multiple requests. Use Tracked Entity Types as tipically there will be more programs.

    const metadata = await api.metadata.get({ trackedEntityTypes: { fields: { id: true } } }).getData();

    const teisGroups = await promiseMap(metadata.trackedEntityTypes, async entityType => {
        const queryWithEntityType: TeiGetRequest = { ...query, trackedEntityType: entityType.id };

        const { trackedEntityInstances: firstPage, pager } = await api.trackedEntityInstances
            .get(queryWithEntityType)
            .getData();
        const pages = _.range(2, pager.pageCount + 1);

        const otherPages = await promiseMap(pages, async page => {
            const { trackedEntityInstances } = await api.trackedEntityInstances
                .get({ ...queryWithEntityType, page })
                .getData();
            return trackedEntityInstances;
        });

        return [...firstPage, ..._.flatten(otherPages)].map(({ trackedEntityInstance, ...rest }) => ({
            ...rest,
            id: trackedEntityInstance,
        }));
    });

    return _.flatten(teisGroups);
}

async function getTrackedEntitiesFromApi(options: {
    api: D2Api;
    program: Program;
    orgUnits: Ref[];
    page: number;
    pageSize: number;
    enrollmentStartDate?: Moment;
    enrollmentEndDate?: Moment;
    ouMode: RelationshipOrgUnitFilter;
}): Promise<TrackedEntitiesGetResponse> {
    const { api, program, orgUnits, page, pageSize, enrollmentStartDate, enrollmentEndDate, ouMode } = options;

    return api.tracker.trackedEntities
        .get({
            ouMode: ouMode,
            orgUnit: orgUnits?.map(({ id }) => id).join(","),
            program: program.id,
            pageSize,
            page,
            totalPages: true,
            fields: {
                trackedEntity: true,
                inactive: true,
                orgUnit: true,
                attributes: true,
                enrollments: true,
                relationships: true,
                geometry: true,
            },
            enrollmentEnrolledAfter: enrollmentStartDate?.format("YYYY-MM-DD[T]HH:mm"),
            enrollmentEnrolledBefore: enrollmentEndDate?.format("YYYY-MM-DD[T]HH:mm"),
        })
        .getData();
}

function buildTrackedEntity(
    metadata: RelationshipMetadata,
    program: Program,
    trackedEntity: D2TrackerTrackedEntity
): TrackedEntity {
    const orgUnit = { id: trackedEntity.orgUnit };
    const attributesById = _.keyBy(program.attributes, attribute => attribute.id);

    const enrollment: D2TrackerEnrollment | undefined = _(trackedEntity.enrollments)
        .filter(e => e.program === program.id && orgUnit.id === e.orgUnit)
        .first();

    const attributeValues: AttributeValue[] =
        trackedEntity.attributes?.map((attrApi): AttributeValue => {
            const optionSet = attributesById[attrApi.attribute]?.optionSet;
            const option = optionSet && optionSet.options.find(option => option.code === attrApi.value);

            return {
                attribute: {
                    id: attrApi.attribute,
                    valueType: attrApi.valueType as DataElementType,
                    ...(optionSet ? { optionSet } : {}),
                },
                value: attrApi.value,
                ...(option ? { optionId: option.id } : {}),
            };
        }) || [];

    return {
        program: { id: program.id },
        id: trackedEntity.trackedEntity || "",
        orgUnit: { id: trackedEntity.orgUnit || "" },
        disabled: trackedEntity.inactive || false,
        enrollment,
        attributeValues,
        relationships: fromApiRelationships(metadata, trackedEntity),
        geometry: getGeometry(trackedEntity),
    };
}

function getGeometry(trackedEntity: D2TrackerTrackedEntity): Geometry | undefined {
    const { geometry } = trackedEntity;
    if (!geometry) return undefined;
    switch (geometry.type) {
        case "Point": {
            const [longitude, latitude] = geometry.coordinates;
            return { type: "Point", coordinates: { latitude, longitude } };
        }
        case "Polygon": {
            const coordinatesPairs = geometry.coordinates[0] || [];
            const coordinatesList = coordinatesPairs.map(([longitude, latitude]) => ({ latitude, longitude }));
            return { type: "Polygon", coordinates: coordinatesList };
        }
    }
}

export function updateTrackedEntityIds(trackedEntities: TrackedEntity[], trackedEntitySeed: string): TrackedEntity[] {
    return trackedEntities.map(trackedEntity => ({
        ...trackedEntity,
        id: getUid(trackedEntity.id, trackedEntitySeed),
        relationships: trackedEntity.relationships.map(rel => ({
            ...rel,
            fromId: getUid(rel.fromId, trackedEntitySeed),
            toId: getUid(rel.toId, trackedEntitySeed),
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
