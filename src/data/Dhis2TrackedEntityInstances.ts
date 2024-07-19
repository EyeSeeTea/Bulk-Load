import {
    TeiGetRequest,
    TrackedEntityInstanceGeometryAttributes,
    TrackedEntityInstanceToPost,
} from "@eyeseetea/d2-api/api/trackedEntityInstances";
import { generateUid } from "d2/uid";
import _ from "lodash";
import { Moment } from "moment";
import { DataElementType } from "../domain/entities/DataForm";
import { DataPackageData } from "../domain/entities/DataPackage";
import { Event, EventDataValue } from "../domain/entities/DhisDataPackage";
import { Geometry } from "../domain/entities/Geometry";
import { emptyImportSummary } from "../domain/entities/ImportSummary";
import { Relationship } from "../domain/entities/Relationship";
import { SynchronizationResult } from "../domain/entities/SynchronizationResult";
import {
    AttributeValue,
    Enrollment,
    Program,
    TrackedEntitiesApiRequest,
    TrackedEntitiesResponse,
    TrackedEntityInstance,
} from "../domain/entities/TrackedEntityInstance";
import { parseDate } from "../domain/helpers/ExcelReader";
import i18n from "../locales";
import { D2Api, D2RelationshipType, Id, Ref } from "../types/d2-api";
import { KeysOfUnion } from "../types/utils";
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

export interface GetOptions {
    api: D2Api;
    program: Ref;
    orgUnits: Ref[];
    pageSize?: number;
    enrollmentStartDate?: Moment;
    enrollmentEndDate?: Moment;
    relationshipsOuFilter?: RelationshipOrgUnitFilter;
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

export async function updateTrackedEntityInstances(
    api: D2Api,
    trackedEntityInstances: TrackedEntityInstance[],
    dataEntries: DataPackageData[]
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

    console.log({ apiEvents, teis, dataEntries, metadata, teiSeed, existingTeis, program, programId });
    debugger;

    return runSequentialPromisesOnSuccess([
        () => uploadTeis({ ...options, teis: preTeis, title: i18n.t("Create/update") }),
        () => uploadTeis({ ...options, teis: postTeis, title: i18n.t("Relationships") }),
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
}): Promise<SynchronizationResult[]> {
    const { api, program, metadata, teis, existingTeis, title } = options;

    if (_.isEmpty(teis)) return [];

    const apiTeis = teis.map(tei => getApiTeiToUpload(program, metadata, tei, existingTeis));
    const model = i18n.t("Tracked Entity Instance");

    const teisResult = await promiseMap(_.chunk(apiTeis, 200), teisToSave => {
        return postImport(
            async () => {
                const { response } = await api.trackedEntityInstances
                    .postAsync({ strategy: "CREATE_AND_UPDATE", async: true }, { trackedEntityInstances: teisToSave })
                    .getData();

                const result = await api.system.waitFor(response.jobType, response.id).getData();

                return {
                    status: result?.status === "SUCCESS" ? "OK" : "ERROR",
                    response: result ?? undefined,
                };
            },
            {
                title: `${model} - ${title}`,
                model: model,
                splitStatsList: false,
            }
        );
    });
    return teisResult;
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
    teis: TrackedEntityInstance[],
    dataEntries: DataPackageData[],
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
                trackedEntityInstance: teiId,
                program: program,
                orgUnit: data.orgUnit,
                eventDate: data.period,
                attributeOptionCombo: data.attribute,
                status: "COMPLETED" as const,
                programStage: data.programStage,
                dataValues,
            };
        })
        .compact()
        .value();
}

function getApiTeiToUpload(
    program: Program,
    metadata: Metadata,
    tei: TrackedEntityInstance,
    existingTeis: TrackedEntityInstance[]
): TrackedEntityInstanceToPost {
    const { orgUnit, enrollment, relationships } = tei;
    const optionById = _.keyBy(metadata.options, option => option.id);

    const existingTei = existingTeis.find(tei_ => tei_.id === tei.id);
    const apiRelationships = getApiRelationships(existingTei, relationships, metadata.relationshipTypesById);

    const enrollmentId = existingTei?.enrollment?.id || getUid([tei.id, orgUnit.id, program.id].join("-"));

    return {
        trackedEntityInstance: tei.id,
        trackedEntityType: program.trackedEntityType.id,
        orgUnit: orgUnit.id,
        attributes: tei.attributeValues.map(av => ({
            attribute: av.attribute.id,
            value: getValue(av, optionById),
        })),
        enrollments:
            enrollment && enrollment.enrollmentDate
                ? [
                      {
                          enrollment: enrollmentId,
                          orgUnit: orgUnit.id,
                          program: program.id,
                          enrollmentDate: enrollment.enrollmentDate,
                          incidentDate: enrollment.incidentDate || enrollment.enrollmentDate,
                      },
                  ]
                : [],
        relationships: apiRelationships,
        ...getD2TeiGeometryAttributes(tei),
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

    const ouModeQuery =
        ouMode === "SELECTED" || ouMode === "CHILDREN" || ouMode === "DESCENDANTS"
            ? { ouMode, ou: orgUnits?.map(({ id }) => id) }
            : { ouMode };

    const { instances, pageCount } = await api
        .get<TrackedEntitiesResponse>("/tracker/trackedEntities", {
            ouMode: ouModeQuery.ouMode,
            orgUnit: ouModeQuery.ou,
            program: program.id,
            pageSize: pageSize,
            page: page,
            totalPages: true,
            fields: fields.join(","),
            enrollmentEnrolledAfter: enrollmentStartDate?.format("YYYY-MM-DD[T]HH:mm"),
            enrollmentEnrolledBefore: enrollmentEndDate?.format("YYYY-MM-DD[T]HH:mm"),
        })
        .getData();

    return { instances, pageCount };
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
                valueType: attrApi.valueType as DataElementType,
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
        enrollment,
        attributeValues,
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
