import _ from "lodash";
import {
    SynchronizationResult,
    SynchronizationStats,
    SynchronizationStatus,
} from "../domain/entities/SynchronizationResult";
import i18n from "../locales";
import { TrackerPostResponse } from "@eyeseetea/d2-api/api/tracker";

type Status = "OK" | "ERROR";

export interface ImportPostResponse {
    status: Status;
    message?: string;
    response?: {
        status: SynchronizationStatus;
        imported: number;
        updated: number;
        deleted: number;
        ignored: number;
        total: number;
        importSummaries?: Array<{
            responseType: "ImportSummary";
            description?: string;
            status: SynchronizationStatus;
            href?: string;
            importCount: {
                imported: number;
                updated: number;
                deleted: number;
                ignored: number;
            };
            reference?: string;
            conflicts?: {
                object: string;
                value: string;
            }[];
            // Only for TEI import
            enrollments?: ImportPostResponse["response"];
        }>;
    };
}

export function processImportResponse(options: {
    title: string;
    model: string;
    importResult: TrackerPostResponse;
    splitStatsList: boolean;
}): SynchronizationResult {
    const { title, model, importResult, splitStatsList } = options;
    const { message, bundleReport, status, stats } = importResult;

    if (!bundleReport) return { title, status, message, rawResponse: importResult };

    const objectReports = _.flatMap(bundleReport.typeReportMap, type => type.objectReports);

    const errors = _.flatMap(objectReports, objectReport =>
        objectReport.errorReports.map(errorReport => {
            return {
                id: objectReport.uid,
                message: errorReport.message,
                details: errorReport.errorCode,
            };
        })
    );

    const fields = ["created", "updated", "ignored", "deleted", "total"] as const;
    const totalStats: SynchronizationStats = { type: "TOTAL", ..._.pick(stats, fields) };

    const statsList = _(bundleReport.typeReportMap)
        .values()
        .filter(({ stats }) => stats.total > 0)
        .map(typeReportMap => {
            const typeIds = typeReportMap.objectReports.map(({ uid }) => uid);
            return {
                type: i18n.t(`${model}`),
                ids: typeIds,
                ...bundleReport.typeReportMap[typeReportMap.trackerType].stats,
            };
        })
        .value();

    const splitedStats: SynchronizationStats[] = splitStatsList
        ? _.compact([statsList.length === 1 ? null : totalStats, ...statsList])
        : [totalStats];

    return { title, status, message, errors, stats: splitedStats, rawResponse: importResult };
}

export async function postImport(
    postFn: () => Promise<TrackerPostResponse>,
    options: { title: string; model: string; splitStatsList: boolean }
): Promise<SynchronizationResult> {
    const { title, model, splitStatsList } = options;
    try {
        const response = await postFn();
        return processImportResponse({
            title,
            model: model,
            importResult: response,
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
