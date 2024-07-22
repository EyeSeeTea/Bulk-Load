import { Attribute as AttributeApi } from "@eyeseetea/d2-api/api/trackedEntityInstances";
import { Id } from "./ReferenceObject";
import { Enrollment } from "./TrackedEntityInstance";
import { DataElementType } from "./DataForm";
import { D2Geometry } from "@eyeseetea/d2-api/schemas";

export type RelationshipItem = {
    trackedEntity?: { trackedEntity: Id };
    event?: { event: Id };
};

export type TrackerRelationship = {
    relationship: string;
    relationshipName: string;
    relationshipType: string;
    from: RelationshipItem;
    to: RelationshipItem;
};

export type TrackedEntity = {
    attributes: AttributeApi[];
    enrollments: Enrollment[];
    orgUnit: Id;
    trackedEntity: Id;
    trackedEntityType: Id;
    relationships: TrackerRelationship[];
};

export type TrackedEntitiesApiRequest = {
    attributes: {
        attribute: string;
        valueType: DataElementType | undefined;
        value: string;
    }[];
    enrollments: Enrollment[];
    geometry?: D2Geometry;
    inactive: boolean;
    orgUnit: string;
    relationships: TrackerRelationship[];
    trackedEntity: Id;
};

export type TrackedEntitiesResponse = {
    instances: TrackedEntitiesApiRequest[];
    pageCount: number;
};
