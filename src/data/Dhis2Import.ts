import _ from "lodash";
import { SynchronizationResult, SynchronizationStats } from "../domain/entities/SynchronizationResult";
import i18n from "../utils/i18n";
import { D2Api, Id } from "../types/d2-api";
import { Ref } from "../domain/entities/ReferenceObject";
import { ErrorMessage } from "../domain/entities/SynchronizationResult";
import { promiseMap } from "../utils/promises";
import { UidErrorMessage } from "./UidErrorMessage";

export type Status = "OK" | "ERROR";

type ImportStats = {
    created: number;
    deleted: number;
    ignored: number;
    updated: number;
    total: number;
};

export type ImportPostResponse = {
    status: Status;
    response: Ref;
};

export type TrackerType = "TRACKED_ENTITY" | "EVENT" | "ENROLLMENT" | "RELATIONSHIP";

export type TypeReportMap = Record<
    TrackerType,
    { trackerType: TrackerType; stats: ImportStats; objectReports: { uid: Id } }
>;

export type ImportReportResponse = {
    status: Status;
    validationReport: {
        errorReports: [
            {
                uid: string;
                message: string;
            }
        ];
    };
    stats?: ImportStats;
    bundleReport?: {
        status: Status;
        stats?: ImportStats;
        typeReportMap: TypeReportMap;
    };
};

const defaultStats = {
    created: 0,
    deleted: 0,
    ignored: 0,
    updated: 0,
    total: 0,
};

export async function processImportResponse(options: {
    api: D2Api;
    title: string;
    model: string;
    importResult: ImportReportResponse;
    splitStatsList: boolean;
}): Promise<SynchronizationResult> {
    const { api, title, model, importResult, splitStatsList } = options;

    const { bundleReport, status, validationReport } = importResult;
    const message = status === "OK" ? i18n.t("Import was successful") : i18n.t("Import failed");

    const errors = validationReport.errorReports.map(errorReport => ({
        id: errorReport.uid,
        message: errorReport.message,
        details: "",
    }));

    const detailedErrors = await getMetadataDetailsFromErrors(api, errors);

    if (!bundleReport) {
        return {
            title: title,
            status: status === "OK" ? "SUCCESS" : "ERROR",
            message: message,
            errors: detailedErrors,
            rawResponse: importResult,
        };
    }
    const resStats = bundleReport.stats || importResult.stats;

    if (!resStats) {
        console.error(`No 'stats' found in import response.`, importResult);
    }

    const trackerStats = resStats || defaultStats;

    const totalStats: SynchronizationStats = {
        type: "TOTAL",
        imported: trackerStats.created,
        ...trackerStats,
    };

    const eventStatsList = _(bundleReport.typeReportMap)
        .map(value => ({
            type: i18n.t(`${model}s`),
            imported: value.stats.created,
            ...value.stats,
        }))
        .reject(value => value.total === 0)
        .value();

    const stats = splitStatsList
        ? _.compact([eventStatsList.length === 1 ? null : totalStats, ...eventStatsList])
        : [totalStats];

    return {
        title: title,
        status: status === "OK" ? "SUCCESS" : "ERROR",
        message: message,
        errors: errors,
        stats: stats,
        rawResponse: importResult,
    };
}

export async function postImport(
    api: D2Api,
    postFn: () => Promise<ImportPostResponse>,
    options: { title: string; model: string; splitStatsList: boolean }
): Promise<SynchronizationResult> {
    const { title, model, splitStatsList } = options;

    try {
        const response = await postFn();
        const { response: trackerImportResponse } = response;
        let trackerJobReport: ImportReportResponse | null = null;

        while (!trackerJobReport) {
            const trackerJobs = await getTrackerJobs(api, trackerImportResponse.id);

            if (trackerJobs.some(job => job.completed)) {
                trackerJobReport = await api
                    .get<ImportReportResponse>(`/tracker/jobs/${trackerImportResponse.id}/report`)
                    .getData();
            }
        }

        return processImportResponse({
            api,
            title,
            model: model,
            importResult: trackerJobReport,
            splitStatsList,
        });
    } catch (error: any) {
        if (error?.response?.data) {
            if (error.response.data.validationReport) {
                return processImportResponse({
                    api,
                    title,
                    model: model,
                    importResult: error.response.data,
                    splitStatsList,
                });
            } else {
                return {
                    title: model,
                    status: "ERROR",
                    rawResponse: error.response,
                    message: error.response.data.message,
                };
            }
        } else {
            return { title: model, status: "NETWORK ERROR", rawResponse: {} };
        }
    }
}

async function getTrackerJobs(api: D2Api, trackerImportResponseId: Id): Promise<{ completed: boolean }[]> {
    return await api.get<{ completed: boolean }[]>(`/tracker/jobs/${trackerImportResponseId}`).getData();
}

export async function getMetadataDetailsFromErrors(api: D2Api, errors: ErrorMessage[]): Promise<ErrorMessage[]> {
    const metadataIds = errors.flatMap(error => {
        const uids = UidErrorMessage.extractUids(error.message);
        return { id: error.id, uids };
    });

    const allIds = _.uniq(metadataIds.flatMap(item => item.uids));

    const allItemsDetails = await promiseMap(_.chunk(allIds, 100), async (ids): Promise<Item[]> => {
        const data = await api
            .get<MetadataApiResponse>(
                `/metadata?filter=id:in:[${ids.join(",")}]&fields=id,displayName,displayFormName,code`
            )
            .getData();
        const items = getItemsFromMetadataResponse(data);
        return items;
    });

    const allItems = _.flatten(allItemsDetails);

    if (allItems.length === 0) return errors;

    const allItemsById = new Map<string, string>(allItems.map(item => [item.id, item.name]));

    const errorMessages = errors.map(error => {
        return { ...error, message: UidErrorMessage.replaceUidsInMessage(error.message, allItemsById) };
    });
    return errorMessages;
}

type MetadataSimple = { id: string; displayFormName?: string; displayName?: string; code?: string };
type MetadataApiResponse = { system: { id: string } } & Record<string, MetadataSimple[]>;

type Item = { id: string; name: string };

const getItemsFromMetadataResponse = (response: MetadataApiResponse): Item[] => {
    const entries = Object.entries(response);

    return entries.flatMap(([key, value]) => {
        if (key === "system") return [];
        if (!Array.isArray(value)) return [];

        return value.map(obj => ({ id: obj.id, name: obj.displayFormName ?? obj.displayName ?? obj.code ?? "" }));
    });
};
