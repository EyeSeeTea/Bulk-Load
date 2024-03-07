export type SynchronizationStatus = "PENDING" | "SUCCESS" | "OK" | "WARNING" | "ERROR" | "NETWORK ERROR";

export interface SynchronizationStats {
    type?: string;
    created: number;
    updated: number;
    ignored: number;
    deleted: number;
    total?: number;
    ids?: string[];
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
