import _ from "lodash";
import { D2Api } from "../types/d2-api";
import { Event } from "../domain/entities/DhisDataPackage";
import { SynchronizationResult } from "../domain/entities/SynchronizationResult";
import { postImport } from "./Dhis2Import";
import i18n from "../locales";
import { promiseMap } from "../utils/promises";
import { TrackerPostResponse } from "@eyeseetea/d2-api/api/tracker";
import { D2TrackerEvent } from "@eyeseetea/d2-api/api/trackerEvents";
import { Geometry } from "../domain/entities/Geometry";
import { D2Coordinates } from "@eyeseetea/d2-api/schemas";
import { Id } from "../domain/entities/ReferenceObject";

type EventToPost = Omit<D2TrackerEvent, "event"> & { event?: Id };

const buildEventsPayload = (event: Event): EventToPost => {
    return {
        ...event,
        dataValues: event.dataValues.map(dataValue => ({
            dataElement: dataValue.dataElement,
            value: dataValue.value.toString(),
        })),
        geometry: event.geometry ? transformGeometry(event.geometry) : null,
    };
};

const transformGeometry = (geometry: Geometry): NonNullable<D2TrackerEvent["geometry"]> => {
    switch (geometry.type) {
        case "Point": {
            return {
                type: "Point",
                coordinates: [geometry.coordinates.longitude, geometry.coordinates.latitude],
            };
        }
        case "Polygon": {
            const coordinates = geometry.coordinates.map((coordinates): D2Coordinates => {
                return [coordinates.longitude, coordinates.latitude];
            });
            return {
                type: "Polygon",
                coordinates: [coordinates],
            };
        }
    }
};

export async function postEvents(api: D2Api, events: Event[]): Promise<SynchronizationResult[]> {
    const eventsPayload = events.map(buildEventsPayload);

    const eventsResult = await promiseMap(_.chunk(eventsPayload, 200), eventsToSave => {
        return postImport(
            () => api.post<TrackerPostResponse>("/tracker", { async: false }, { events: eventsToSave }).getData(),
            {
                title: i18n.t("Data values - Create/update"),
                model: i18n.t("Event"),
                splitStatsList: true,
            }
        );
    });
    return eventsResult;
}
