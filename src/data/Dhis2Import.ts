import _ from "lodash";
import {
    SynchronizationResult,
    SynchronizationStats,
    SynchronizationStatus,
} from "../domain/entities/SynchronizationResult";
import i18n from "../locales";

export type Status = "OK" | "ERROR";

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
    importResult: ImportPostResponse;
    splitStatsList: boolean;
}): SynchronizationResult {
    const { title, model, importResult, splitStatsList } = options;
    const { message, response } = importResult;
    const status = response ? response.status : "ERROR";

    if (!response) return { title, status, message, rawResponse: importResult };

    // Add inner import summaries
    const importSummaries = _(response.importSummaries)
        .flatMap(importSummary => [importSummary, ...(importSummary.enrollments?.importSummaries || [])])
        .value();

    const aggregatedStatus =
        _(importSummaries)
            .map(summary => summary.status)
            .find(status => status !== "SUCCESS") || status;

    const errors =
        _.flatMap(
            importSummaries,
            ({ reference = "", description, conflicts }) =>
                conflicts?.map(({ object, value }) => ({
                    id: reference,
                    message: _([description, object, value]).compact().join(" "),
                    details: "",
                })) ?? (description ? [{ id: reference, message: description, details: "" }] : [])
        ) ?? [];

    const fields = ["imported", "updated", "ignored", "deleted", "total"] as const;
    const totalStats: SynchronizationStats = { type: "TOTAL", ..._.pick(response, fields) };

    const eventStatsList = (response.importSummaries || []).map((importSummary): SynchronizationStats => {
        return {
            type: i18n.t(`${model} ${importSummary.reference || "-"}`),
            ...importSummary.importCount,
        };
    });

    const stats = splitStatsList
        ? _.compact([eventStatsList.length === 1 ? null : totalStats, ...eventStatsList])
        : [totalStats];

    return { title, status: aggregatedStatus, message, errors, stats, rawResponse: importResult };
}

export async function postImport(
    postFn: () => Promise<ImportPostResponse>,
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
