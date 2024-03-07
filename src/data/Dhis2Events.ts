import _ from "lodash";
import { D2Api } from "../types/d2-api";
import { Event } from "../domain/entities/DhisDataPackage";
import { SynchronizationResult } from "../domain/entities/SynchronizationResult";
import { postImport } from "./Dhis2Import";
import i18n from "../locales";
import { promiseMap } from "../utils/promises";
import { TrackerPostResponse } from "@eyeseetea/d2-api/api/tracker";

export async function postEvents(api: D2Api, events: Event[]): Promise<SynchronizationResult[]> {
    const eventsResult = await promiseMap(_.chunk(events, 200), eventsToSave => {
        return postImport(
            () => api.post<TrackerPostResponse>("/tracker?async=false", {}, { events: eventsToSave }).getData(),
            {
                title: i18n.t("Data values - Create/update"),
                model: i18n.t("Event"),
                splitStatsList: true,
            }
        );
    });
    return eventsResult;
}
