import _ from "lodash";
import { DataElementType } from "./DataForm";
import { Id, Ref } from "./ReferenceObject";
import { Relationship } from "./Relationship";
import { Geometry } from "./Geometry";

export interface TrackedEntity {
    program: Ref;
    id: Id;
    orgUnit: Ref;
    disabled: boolean;
    attributeValues: AttributeValue[];
    enrollment: Enrollment | undefined;
    relationships: Relationship[];
    geometry: Geometry | undefined;
}

export interface Enrollment {
    id?: Id;
    enrolledAt: string;
    occurredAt?: string;
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

export function getRelationships(trackedEntities: TrackedEntity[]): Relationship[] {
    return _(trackedEntities)
        .flatMap(trackedEntity => trackedEntity.relationships)
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
