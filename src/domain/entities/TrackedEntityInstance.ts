import _ from "lodash";
import { DataElementType } from "./DataForm";
import { Geometry } from "./Geometry";
import { Id, Ref } from "./ReferenceObject";
import { Relationship } from "./Relationship";
import { D2Geometry } from "@eyeseetea/d2-api/schemas";

export type RelationshipItem = {
    trackedEntity: { trackedEntity: Id };
    event?: { event: Id };
};

export type D2Relationship = {
    relationship: string;
    relationshipName: string;
    relationshipType: string;
    from: RelationshipItem;
    to: RelationshipItem;
}[];

export type TrackedEntitiesApiRequest = {
    attributes: {
        attribute: string;
        valueType: DataElementType | undefined;
        value: string;
    }[];
    enrollments: Enrollment[];
    featureType: "NONE" | "POINT" | "POLYGON";
    geometry?: D2Geometry;
    inactive: boolean;
    orgUnit: string;
    relationships: D2Relationship;
    trackedEntity: Id;
};

export type TrackedEntitiesResponse = {
    instances: TrackedEntitiesApiRequest[];
    pageCount: number;
};

export interface TrackedEntityInstance {
    program: Ref;
    id: Id;
    orgUnit: Ref;
    disabled: boolean;
    attributeValues: AttributeValue[];
    enrollment: Enrollment | undefined;
    relationships: Relationship[];
    geometry: Geometry;
}

export interface Enrollment {
    id?: Id;
    program?: Id;
    orgUnit?: Id;
    enrollment?: string;
    enrollmentDate?: string;
    incidentDate?: string;
    enrolledAt: string;
    occurredAt: string;
}

export interface AttributeValue {
    attribute: Attribute;
    value: string;
    optionId?: Id;
}

export interface Program {
    id: Id;
    trackedEntityType: Ref;
    attributes: Attribute[];
}

export interface Attribute {
    id: Id;
    valueType: DataElementType | undefined;
    optionSet?: { id: Id; options: Array<{ id: string; code: string }> };
}

export function getRelationships(trackedEntityInstances: TrackedEntityInstance[]): Relationship[] {
    return _(trackedEntityInstances)
        .flatMap(tei => tei.relationships)
        .uniqWith(_.isEqual)
        .value();
}

export function isRelationshipValid(relationship: Relationship): boolean {
    return !!(
        relationship &&
        (relationship.typeId || relationship.typeName) &&
        relationship.fromId &&
        relationship.toId
    );
}
