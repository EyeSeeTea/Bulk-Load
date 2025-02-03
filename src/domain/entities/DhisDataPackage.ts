import { Id } from "./ReferenceObject";

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
    geometry?: Geometry;
    attributeOptionCombo?: string;
    trackedEntity?: Id;
    programStage?: string;
    dataValues: EventDataValue[];
}

export type EventsResponse = {
    instances: Event[];
    pageCount: number;
};

export type EventsAPIResponse = Omit<EventsResponse, "instances"> & {
    instances?: Event[];
    events?: Event[];
};

type Coordinates = [number, number];

export type Geometry =
    | {
          type: "Point";
          coordinates: Coordinates;
      }
    | {
          type: "Polygon";
          coordinates: Array<Coordinates[]>;
      };

export interface EventDataValue {
    dataElement: string;
    value: string | number | boolean;
}
