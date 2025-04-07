import _ from "lodash";
import { D2Api } from "../types/d2-api";
import { Event } from "../domain/entities/DhisDataPackage";
import { SynchronizationResult } from "../domain/entities/SynchronizationResult";
import i18n from "../utils/i18n";
import { promiseMap } from "../utils/promises";
import { ImportPostResponse, postImport } from "./Dhis2Import";
import { Program, TrackedEntityInstance } from "../domain/entities/TrackedEntityInstance";
import { getApiTeiToUpload, Metadata } from "./Dhis2TrackedEntityInstances";
import { Maybe } from "../types/utils";

export async function postEvents(
    api: D2Api,
    events: Event[],
    options: Maybe<OptionEvents>
): Promise<SynchronizationResult[]> {
    const eventsWithEnrollment = options ? setEnrollmentToEvent(events, options) : events;

    const eventsResult = await promiseMap(_.chunk(eventsWithEnrollment, 200), eventsToSave => {
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

    return eventsResult;
}

function setEnrollmentToEvent(events: Event[], options: OptionEvents): Event[] {
    const { existingTeis, teis, program, metadata } = options;
    const apiTeis = teis.map(tei => getApiTeiToUpload(program, metadata, tei, existingTeis));
    const teisByIds = _.keyBy(apiTeis, tei => tei.trackedEntity);
    return events.map(event => {
        const eventTeiId = event.trackedEntity ?? "";
        const tei = teisByIds[eventTeiId];
        const enrollmentId = tei?.enrollments[0]?.enrollment;
        if (!enrollmentId) {
            throw new Error(`Enrollment not found for event-tei: ${eventTeiId}-${event.trackedEntity}`);
        }
        return { ...event, enrollment: enrollmentId };
    });
}

type OptionEvents = {
    existingTeis: TrackedEntityInstance[];
    teis: TrackedEntityInstance[];
    program: Program;
    metadata: Metadata;
};
