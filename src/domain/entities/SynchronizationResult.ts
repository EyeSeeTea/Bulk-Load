export type SynchronizationStatus = "PENDING" | "SUCCESS" | "WARNING" | "ERROR" | "NETWORK ERROR";

export interface SynchronizationStats {
    type?: string;
    imported: number;
    updated: number;
    ignored: number;
    deleted: number;
    total?: number;
}

export interface ErrorMessage {
    id: string;
    message: string;
    details: string | undefined;
}

export interface SynchronizationResult {
    title: string;
    status: SynchronizationStatus;
    message?: string;
    stats?: SynchronizationStats[];
    errors?: ErrorMessage[];
    rawResponse: object;
}

export function computeOverallSyncStatus(results: Pick<SynchronizationResult, "status">[]): SynchronizationStatus {
    const priority: SynchronizationStatus[] = ["NETWORK ERROR", "ERROR", "WARNING", "SUCCESS"];
    for (const status of priority) {
        if (results.some(r => r.status === status)) return status;
    }
    return "PENDING";
}
