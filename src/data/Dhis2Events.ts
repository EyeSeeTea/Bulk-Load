import _ from "lodash";
import { D2Api } from "../types/d2-api";
import { Event } from "../domain/entities/DhisDataPackage";
import { SynchronizationResult } from "../domain/entities/SynchronizationResult";
import i18n from "../utils/i18n";
import { promiseMap } from "../utils/promises";
import { ImportPostResponse, postImport } from "./Dhis2Import";

export async function postEvents(api: D2Api, events: Event[]): Promise<SynchronizationResult[]> {
    return promiseMap(_.chunk(events, 200), eventsToSave => {
        return postImport(
            api,
            async () => await api.post<ImportPostResponse>("/tracker", {}, { events: eventsToSave }).getData(),
            {
                title: i18n.t("Events - Create/update"),
                model: i18n.t("Event"),
                splitStatsList: true,
            }
        );
    });
}
