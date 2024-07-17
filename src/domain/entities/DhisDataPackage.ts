import { D2Coordinates } from "@eyeseetea/d2-api/schemas";

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
    eventDate: string;
    coordinate?: {
        latitude: string;
        longitude: string;
    };
    geometry?: {
        type: "Point" | "Polygon";
        coordinates: D2Coordinates | Array<D2Coordinates[]>;
    };
    attributeOptionCombo?: string;
    trackedEntityInstance?: string;
    programStage?: string;
    dataValues: EventDataValue[];
}

export interface EventDataValue {
    dataElement: string;
    value: string | number | boolean;
}
