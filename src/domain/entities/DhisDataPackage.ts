import { Geometry } from "./Geometry";

export interface EventsPackage {
    events: Event[];
}

export interface AggregatedPackage {
    dataValues: AggregatedDataValue[];
}

export interface AggregatedDataValue {
    dataElement: string;
    period: string;
    orgUnit: string;
    categoryOptionCombo?: string;
    attributeOptionCombo?: string;
    value: string;
    comment?: string;
}

export interface Event {
    event?: string;
    orgUnit: string;
    program: string;
    status: EventStatus;
    occurredAt: string;
    geometry?: Geometry;
    attributeOptionCombo?: string;
    trackedEntity?: string;
    programStage?: string;
    dataValues: EventDataValue[];
    enrollment?: string;
}

export interface EventDataValue {
    dataElement: string;
    value: string | number | boolean;
}

type EventStatus = "ACTIVE" | "COMPLETED" | "VISITED" | "SCHEDULE" | "OVERDUE" | "SKIPPED";
