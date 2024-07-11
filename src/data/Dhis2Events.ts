import _ from "lodash";
import { D2Api } from "../types/d2-api";
import { Event } from "../domain/entities/DhisDataPackage";
import { SynchronizationResult } from "../domain/entities/SynchronizationResult";
import { ImportPostResponse, postImport } from "./Dhis2Import";
import i18n from "../locales";
import { promiseMap } from "../utils/promises";

export async function postEvents(api: D2Api, events: Event[]): Promise<SynchronizationResult[]> {
    const eventsResult = await promiseMap(_.chunk(events, 200), eventsToSave => {
        return postImport(
            () =>
                api
                    .post<ImportPostResponse>(
                        "/events",
                        {},
                        {
                            events: eventsToSave.map(event => {
                                const { geometry: _, ...rest } = event;
                                return { ...rest };
                            }),
                        }
                    )
                    .getData(),
            {
                title: i18n.t("Data values - Create/update"),
                model: i18n.t("Event"),
                splitStatsList: true,
            }
        );
    });
    return eventsResult;
}
