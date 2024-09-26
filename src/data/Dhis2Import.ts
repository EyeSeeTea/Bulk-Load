import _ from "lodash";
import { SynchronizationResult, SynchronizationStats } from "../domain/entities/SynchronizationResult";
import i18n from "../locales";
import { D2Api, Id } from "../types/d2-api";
import { Ref } from "../domain/entities/ReferenceObject";

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
    stats: ImportStats;
    bundleReport?: {
        status: Status;
        stats: ImportStats;
        typeReportMap: TypeReportMap;
    };
};

export function processImportResponse(options: {
    title: string;
    model: string;
    importResult: ImportReportResponse;
    splitStatsList: boolean;
}): SynchronizationResult {
    const { title, model, importResult, splitStatsList } = options;

    const { bundleReport, status, validationReport } = importResult;
    const message = status === "OK" ? i18n.t("Import was successful") : i18n.t("Import failed");

    const errors = validationReport.errorReports.map(errorReport => ({
        id: errorReport.uid,
        message: errorReport.message,
        details: "",
    }));

    if (!bundleReport) {
        return {
            title: title,
            status: status === "OK" ? "SUCCESS" : "ERROR",
            message: message,
            errors: errors,
            rawResponse: importResult,
        };
    }

    const totalStats: SynchronizationStats = {
        type: "TOTAL",
        imported: bundleReport.stats.created,
        ...bundleReport.stats,
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
            title,
            model: model,
            importResult: trackerJobReport,
            splitStatsList,
        });
    } catch (error: any) {
        if (error?.response?.data) {
            return processImportResponse({
                title,
                model: model,
                importResult: error.response.data,
                splitStatsList,
            });
        } else {
            return { title: model, status: "NETWORK ERROR", rawResponse: {} };
        }
    }
}

async function getTrackerJobs(api: D2Api, trackerImportResponseId: Id): Promise<{ completed: boolean }[]> {
    return await api.get<{ completed: boolean }[]>(`/tracker/jobs/${trackerImportResponseId}`).getData();
}
