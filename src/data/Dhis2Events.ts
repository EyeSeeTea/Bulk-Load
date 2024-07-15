import _ from "lodash";
import { D2Api } from "../types/d2-api";
import { Event } from "../domain/entities/DhisDataPackage";
import { SynchronizationResult } from "../domain/entities/SynchronizationResult";
import i18n from "../locales";
import { promiseMap } from "../utils/promises";
import { postTrackerImport, TrackerImportPostResponse } from "./DhisTrackerImport";

export async function postEvents(api: D2Api, events: Event[]): Promise<SynchronizationResult[]> {
    const eventsResult = await promiseMap(_.chunk(events, 200), async eventsToSave => {
        const trackerPostImport = await postTrackerImport(
            api,
            () =>
                api
                    .post<TrackerImportPostResponse>(
                        "/tracker",
                        {},
                        { events: eventsToSave.map(event => ({ ...event, occurredAt: event.eventDate })) }
                    )
                    .getData(),
            {
                title: i18n.t("Tracker data - Create/update"),
                model: i18n.t("Event"),
                splitStatsList: true,
            }
        );

        return trackerPostImport;
    });

    return eventsResult;
}
