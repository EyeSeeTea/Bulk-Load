import { D2Geometry } from "@eyeseetea/d2-api/schemas";

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
    status: string;
    occurredAt: string;
    coordinate?: {
        latitude: string;
        longitude: string;
    };
    geometry?: D2Geometry;
    attributeOptionCombo?: string;
    trackedEntity?: string;
    programStage?: string;
    dataValues: EventDataValue[];
}

export interface EventDataValue {
    dataElement: string;
    value: string | number | boolean;
}
