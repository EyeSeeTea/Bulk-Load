import { D2Api } from "@eyeseetea/d2-api/2.33";
import { Ref } from "../domain/entities/ReferenceObject";
import { Status } from "./Dhis2Import";
import { SynchronizationResult, SynchronizationStats } from "../domain/entities/SynchronizationResult";
import i18n from "../locales";

type ImportStats = {
    created: number;
    deleted: number;
    ignored: number;
    updated: number;
    total: number;
};

export type TrackerImportPostResponse = {
    status: Status;
    response: Ref;
};

export type TrackerImportReportResponse = {
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
        typeReportMap: {
            [type: string]: {
                trackerType: string;
                stats: ImportStats;
                objectReports: {
                    uid: string;
                };
            };
        };
    };
};

function processTrackerImportResponse(options: {
    title: string;
    model: string;
    splitStatsList: boolean;
    importResult: TrackerImportReportResponse;
}): SynchronizationResult {
    const { title, model, splitStatsList, importResult } = options;

    const { bundleReport, status, validationReport } = importResult;
    const message = status === "OK" ? "Import was successful" : "Import failed";

    if (!bundleReport) {
        return {
            title: title,
            status: status === "OK" ? "SUCCESS" : "ERROR",
            message: message,
            rawResponse: importResult,
        };
    }

    const errors = validationReport.errorReports.map(errorReport => ({
        id: errorReport.uid,
        message: errorReport.message,
        details: "",
    }));

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

export async function postTrackerImport(
    api: D2Api,
    postFn: () => Promise<TrackerImportPostResponse>,
    options: { title: string; model: string; splitStatsList: boolean }
): Promise<SynchronizationResult> {
    const { title, model, splitStatsList } = options;

    try {
        const response = await postFn();
        const { response: trackerImportResponse } = response;
        const trackerJobReport = await api
            .get<TrackerImportReportResponse>(`/tracker/jobs/${trackerImportResponse.id}/report`)
            .getData();

        return processTrackerImportResponse({
            title,
            model: model,
            importResult: trackerJobReport,
            splitStatsList,
        });
    } catch (error: any) {
        if (error?.response?.data) {
            return processTrackerImportResponse({
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
