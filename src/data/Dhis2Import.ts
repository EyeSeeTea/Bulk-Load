import _ from "lodash";
import { SynchronizationResult, SynchronizationStats } from "../domain/entities/SynchronizationResult";
import i18n from "../locales";
import { TrackerPostResponse } from "@eyeseetea/d2-api/api/tracker";

export function processImportResponse(options: {
    title: string;
    model: string;
    importResult: TrackerPostResponse;
    splitStatsList: boolean;
}): SynchronizationResult {
    const { title, model, importResult, splitStatsList } = options;
    const {
        message,
        bundleReport,
        validationReport: { errorReports, warningReports },
        status,
        stats,
    } = importResult;

    const fields = ["created", "updated", "ignored", "deleted", "total"] as const;
    const totalStats: SynchronizationStats = { type: "TOTAL", ..._.pick(stats, fields) };

    const statsList = _(bundleReport?.typeReportMap)
        .values()
        .filter(typeReportMap => typeReportMap.stats.total > 0)
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

    const errors = errorReports.map(warningReport => {
        return {
            id: warningReport.uid,
            message: warningReport.message,
            details: warningReport.errorCode,
        };
    });

    const warnings = warningReports.map(warningReport => {
        return {
            id: warningReport.uid,
            message: warningReport.message,
            details: warningReport.errorCode,
        };
    });

    if (!bundleReport) return { title, status, stats: splitedStats, errors, message, rawResponse: importResult };

    const objectReports = _.flatMap(bundleReport.typeReportMap, type => type.objectReports);

    const objectReportErrors = _.flatMap(objectReports, objectReport =>
        objectReport.errorReports.map(errorReport => {
            return {
                id: objectReport.uid,
                message: errorReport.message,
                details: errorReport.errorCode,
            };
        })
    );

    return {
        title,
        status,
        message,
        errors,
        warnings,
        objectReportErrors,
        stats: splitedStats,
        rawResponse: importResult,
    };
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
