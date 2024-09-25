import { TeiOuRequest as TrackedEntityOURequestApi } from "@eyeseetea/d2-api/api/trackedEntityInstances";
import _ from "lodash";
import moment from "moment";
import { NamedRef } from "../domain/entities/ReferenceObject";
import { Relationship } from "../domain/entities/Relationship";
import { RelationshipConstraint, RelationshipType } from "../domain/entities/RelationshipType";
import { isRelationshipValid, TrackedEntityInstance } from "../domain/entities/TrackedEntityInstance";
import { D2Api, D2RelationshipConstraint, D2RelationshipType, Id, Ref } from "../types/d2-api";
import { memoizeAsync } from "../utils/cache";
import { promiseMap } from "../utils/promises";
import { getUid } from "./dhis2-uid";
import { getTrackedEntities, TrackedEntityGetRequest } from "./Dhis2TrackedEntityInstances";
import { TrackerRelationship, RelationshipItem, TrackedEntitiesApiRequest } from "../domain/entities/TrackedEntity";

type RelationshipTypesById = Record<Id, Pick<D2RelationshipType, "id" | "toConstraint" | "fromConstraint">>;

export type RelationshipOrgUnitFilter = TrackedEntityOURequestApi["ouMode"];

export function getApiRelationships(
    existingTei: TrackedEntityInstance | undefined,
    relationships: Relationship[],
    relationshipTypesById: RelationshipTypesById
): TrackerRelationship[] {
    const existingRelationships = existingTei?.relationships || [];

    const apiRelationships = _(relationships)
        .concat(existingRelationships)
        .filter(isRelationshipValid)
        .uniqBy(rel => [rel.typeId, rel.fromId, rel.toId].join("-"))
        .map(rel => {
            const relationshipId =
                rel.id ||
                existingRelationships.find(
                    eRel => eRel.typeId === rel.typeId && eRel.fromId === rel.fromId && eRel.toId === rel.toId
                )?.id ||
                getUid([rel.typeId, rel.fromId, rel.toId].join("-"));

            const fromConstraint = getRelationshipConstraint(rel, relationshipTypesById, "from");
            const toConstraint = getRelationshipConstraint(rel, relationshipTypesById, "to");

            if (!fromConstraint || !toConstraint) return undefined;

            const relApi: TrackerRelationship = {
                relationship: relationshipId,
                relationshipType: rel.typeId,
                relationshipName: rel.typeName,
                from: fromConstraint,
                to: toConstraint,
            };
            return relApi;
        })
        .compact()
        .value();
    return apiRelationships;
}

function getRelationshipConstraint(
    relationship: Relationship,
    relationshipTypesById: RelationshipTypesById,
    key: "from" | "to"
) {
    const relationshipType = relationshipTypesById[relationship.typeId];
    if (!relationshipType) return;

    const [constraint, id] =
        key === "from"
            ? [relationshipType.fromConstraint, relationship.fromId]
            : [relationshipType.toConstraint, relationship.toId];

    return constraint.relationshipEntity === "TRACKED_ENTITY_INSTANCE"
        ? { trackedEntity: { trackedEntity: id } }
        : { event: { event: id } };
}

export function fromApiRelationships(
    metadata: RelationshipMetadata,
    teiApi: TrackedEntitiesApiRequest
): Relationship[] {
    return _(teiApi.relationships)
        .map((relApi): Relationship | null => {
            const relationshipType = metadata.relationshipTypes.find(relType => relType.id === relApi.relationshipType);

            if (!relationshipType) {
                console.error(`No relationship found for relationship ${relApi.relationship}`);
                return null;
            }

            // DB may have invalid or even swapped from/to TEIs, check the validity of A/B or B/A
            const fromToRelationship =
                getFromToRelationship(relationshipType, relApi.from, relApi.to) ||
                getFromToRelationship(relationshipType, relApi.to, relApi.from);

            if (!fromToRelationship) {
                const from = relApi.from.trackedEntity?.trackedEntity || "undefined";
                const to = relApi.to.trackedEntity?.trackedEntity || "undefined";
                console.error(`No valid TEIs for relationship ${relApi.relationship}: ${from} -> ${to}`);
                return null;
            }

            return {
                id: relApi.relationship,
                typeId: relApi.relationshipType,
                typeName: relApi.relationshipName,
                ...fromToRelationship,
            };
        })
        .compact()
        .value();
}

function getFromToRelationship(
    relationshipType: RelationshipType,
    relItem1: RelationshipItem,
    relItem2: RelationshipItem
): { fromId: Id; toId: Id } | null {
    const fromId = getRelationshipId(relationshipType.constraints.from, relItem1);
    const toId = getRelationshipId(relationshipType.constraints.to, relItem2);

    return fromId && toId ? { fromId, toId } : null;
}

function getRelationshipId(constraint: RelationshipConstraint, relItem: RelationshipItem): Id | undefined {
    switch (constraint.type) {
        case "tei": {
            const teiId = relItem.trackedEntity?.trackedEntity;
            const teiIsValid = _.some(constraint.teis, tei => tei.id === teiId);
            return teiIsValid ? teiId : undefined;
        }
        case "eventInProgram":
            return relItem.event?.event;
        default:
            return undefined;
    }
}

interface Program {
    id: Id;
    trackedEntityType: Ref;
}

interface ProgramFilters {
    organisationUnits?: Ref[];
    startDate?: Date;
    endDate?: Date;
    ouMode?: RelationshipOrgUnitFilter;
}

export interface RelationshipMetadata {
    relationshipTypes: RelationshipType[];
}

export async function getRelationshipMetadata(
    program: Program,
    api: D2Api,
    filters?: ProgramFilters
): Promise<RelationshipMetadata> {
    const {
        trackedEntityTypes,
        relationshipTypes: allRelationshipTypes,
        programs,
    } = await api.metadata
        .get({
            trackedEntityTypes: { fields: { id: true, name: true } },
            relationshipTypes: {
                fields: {
                    id: true,
                    name: true,
                    fromConstraint: true,
                    toConstraint: true,
                },
            },
            programs: { fields: { id: true, name: true, programStages: { id: true, name: true } } },
        })
        .getData();

    const relationshipTypesWithTeis = await promiseMap(allRelationshipTypes, async relType => {
        const isProgramAssociatedWithSomeConstraint =
            isProgramAssociatedWithTeiConstraint(program, relType.fromConstraint) ||
            isProgramAssociatedWithTeiConstraint(program, relType.toConstraint);

        if (!isProgramAssociatedWithSomeConstraint) return;

        const fromConstraint = await getConstraint(api, trackedEntityTypes, programs, relType.fromConstraint, filters);
        const toConstraint = await getConstraint(api, trackedEntityTypes, programs, relType.toConstraint, filters);

        return fromConstraint && toConstraint
            ? { id: relType.id, name: relType.name, constraints: { from: fromConstraint, to: toConstraint } }
            : undefined;
    });

    return { relationshipTypes: _.compact(relationshipTypesWithTeis) };
}

type ProgramInfo = NamedRef & { programStages: NamedRef[] };

const getConstraint = memoizeAsync(
    async (
        api: D2Api,
        trackedEntityTypes: NamedRef[],
        programs: ProgramInfo[],
        constraint: D2RelationshipConstraint,
        filters?: ProgramFilters
    ): Promise<RelationshipConstraint | undefined> => {
        const programsById = _.keyBy(programs, program => program.id);
        const programsDataByProgramStageId = _(programs)
            .flatMap(program =>
                program.programStages.map(programStage => {
                    const programsData = { program, programStage };
                    return [programStage.id, programsData] as [Id, typeof programsData];
                })
            )
            .fromPairs()
            .value();

        switch (constraint.relationshipEntity) {
            case "TRACKED_ENTITY_INSTANCE":
                return getConstraintForTypeTei(api, filters, trackedEntityTypes, constraint);
            case "PROGRAM_STAGE_INSTANCE": {
                if ("program" in constraint) {
                    const program = programsById[constraint.program.id];
                    return getConstraintForTypeProgram(api, filters, program);
                } else if ("programStage" in constraint) {
                    const data = programsDataByProgramStageId[constraint.programStage.id];
                    return getConstraintForTypeProgram(api, filters, data?.program, data?.programStage);
                }
            }
        }
    }
);

async function getConstraintForTypeTei(
    api: D2Api,
    filters: ProgramFilters | undefined,
    trackedEntityTypes: NamedRef[],
    constraint: Extract<D2RelationshipConstraint, { relationshipEntity: "TRACKED_ENTITY_INSTANCE" }>
): Promise<RelationshipConstraint> {
    const { ouMode = "CAPTURE", organisationUnits = [] } = filters || {};
    const trackedEntityTypesById = _.keyBy(trackedEntityTypes, obj => obj.id);

    const ouModeQuery =
        ouMode === "SELECTED" || ouMode === "CHILDREN" || ouMode === "DESCENDANTS"
            ? { orgUnitMode: ouMode, orgUnit: organisationUnits?.map(({ id }) => id).join(";") }
            : { orgUnitMode: ouMode };

    const query = {
        ...ouModeQuery,
        order: "createdAt:asc",
        program: constraint.program?.id,
        // Program and tracked entity cannot be specified simultaneously
        trackedEntityType: constraint.program ? undefined : constraint.trackedEntityType.id,
        pageSize: 1000,
        totalPages: true,
        fields: "trackedEntity",
    } as const;

    const results = await getAllTrackedEntities(api, query);
    const trackedEntityInstances = results.map(({ trackedEntity, ...rest }) => ({
        ...rest,
        id: trackedEntity,
    }));

    const teis = _.sortBy(trackedEntityInstances, tei => tei.id.toLowerCase());
    const name = trackedEntityTypesById[constraint.trackedEntityType.id]?.name ?? "Unknown";

    return { type: "tei", name, program: constraint.program, teis };
}

async function getAllTrackedEntities(api: D2Api, query: TrackedEntityGetRequest): Promise<TrackedEntitiesApiRequest[]> {
    const { instances: firstPage, pageCount } = await getTrackedEntities(api, query);
    const pages = _.range(2, pageCount + 1);
    const otherPages = await promiseMap(pages, async page => {
        const { instances } = await getTrackedEntities(api, { ...query, page });
        return instances;
    });

    return [...firstPage, ..._.flatten(otherPages)];
}

async function getConstraintForTypeProgram(
    api: D2Api,
    filters?: ProgramFilters,
    program?: ProgramInfo,
    programStage?: NamedRef
): Promise<RelationshipConstraint | undefined> {
    if (!program) return undefined;
    const { organisationUnits = [], startDate, endDate } = filters ?? {};
    const pageSize = 250;

    async function fetchEvents(options: {
        program: Id;
        programStage: Id;
        orgUnit: Id;
        page: number;
        pageSize: number;
    }) {
        const { program, programStage, orgUnit, page, pageSize } = options;

        return await api
            .get<{ instances: { event: Id }[]; pageCount: number }>("/tracker/events", {
                program: program,
                programStage: programStage,
                orgUnit: orgUnit,
                occuredAfter: startDate ? moment(startDate).format("YYYY-MM-DD") : undefined,
                occuredBefore: endDate ? moment(endDate).format("YYYY-MM-DD") : undefined,
                fields: "event",
                page: page,
                pageSize: pageSize,
                totalPages: true,
            })
            .getData();
    }

    const events = await promiseMap(organisationUnits, async orgUnit => {
        const { instances, pageCount } = await fetchEvents({
            program: program.id,
            programStage: programStage?.id ?? "",
            orgUnit: orgUnit.id,
            page: 1,
            pageSize: pageSize,
        });

        const paginatedEvents = await promiseMap(_.range(2, pageCount + 1), async page => {
            const { instances } = await fetchEvents({
                program: program.id,
                programStage: programStage?.id ?? "",
                orgUnit: orgUnit.id,
                page: page,
                pageSize: pageSize,
            });

            return instances;
        });

        return [...instances, ..._.flatten(paginatedEvents)];
    });

    return {
        type: "eventInProgram",
        program,
        programStage,
        events: _.flatten(events).map(({ event }) => ({ id: event })),
    };
}

function isProgramAssociatedWithTeiConstraint(program: Program, constraint: D2RelationshipConstraint): boolean {
    switch (constraint.relationshipEntity) {
        case "TRACKED_ENTITY_INSTANCE":
            return (
                constraint.trackedEntityType.id === program.trackedEntityType.id &&
                (!constraint.program || constraint.program.id === program.id)
            );
        case "PROGRAM_STAGE_INSTANCE":
            return true;
        default:
            return false;
    }
}
