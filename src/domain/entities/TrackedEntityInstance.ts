import _ from "lodash";
import { DataElementType } from "./DataForm";
import { Geometry } from "./Geometry";
import { Id, Ref } from "./ReferenceObject";
import { Relationship } from "./Relationship";
import { D2TrackerAttribute } from "./TrackedEntity";
import { ContentType } from "./Template";

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
    attributes?: D2TrackerAttribute[];
}

export interface AttributeValue {
    attribute: Attribute;
    value: string;
    optionId?: Id;
    contentType?: ContentType;
}

export interface Program {
    id: Id;
    trackedEntityType: Ref;
    attributes: Attribute[];
}

export interface Attribute {
    id: Id;
    valueType: DataElementType | undefined;
    optionSet?: { id: Id; options: Array<{ id: string; code: string; name: string }> };
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
