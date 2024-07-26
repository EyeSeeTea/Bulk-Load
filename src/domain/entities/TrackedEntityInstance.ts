import _ from "lodash";
import { DataElementType } from "./DataForm";
import { Geometry } from "./Geometry";
import { Id, Ref } from "./ReferenceObject";
import { Relationship } from "./Relationship";

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
