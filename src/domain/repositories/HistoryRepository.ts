import { HistoryEntry, HistoryEntrySummary, HistoryEntryDetails } from "../entities/HistoryEntry";
import { Id } from "../entities/ReferenceObject";

export interface HistoryRepository {
    save(history: HistoryEntry): Promise<void>;
    get(): Promise<HistoryEntrySummary[]>;
    getDetails(id: Id): Promise<HistoryEntryDetails | null>;
    updateSummaries(
        condition: (summary: HistoryEntrySummary) => boolean,
        update: (summary: HistoryEntrySummary) => HistoryEntrySummary
    ): Promise<Id[]>;
    delete(params: { until: Date; deletedBy: string }): Promise<Id[]>;
}
