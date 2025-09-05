import { UseCase } from "../../CompositionRoot";
import { HistoryEntryStatus, HistoryEntrySummary } from "../entities/HistoryEntry";
import { HistoryRepository } from "../repositories/HistoryRepository";

type GetHistoryEntriesFilters = {
    searchText?: string;
    status?: HistoryEntryStatus;
};

export class GetHistoryEntriesUseCase implements UseCase {
    constructor(private historyRepository: HistoryRepository) {}

    public async execute(filters: GetHistoryEntriesFilters = {}): Promise<HistoryEntrySummary[]> {
        const entries = await this.historyRepository.get();
        return this.sortEntries(this.filterByStatus(this.filterByText(entries, filters.searchText), filters.status));
    }

    private filterByText(entries: HistoryEntrySummary[], searchText?: string): HistoryEntrySummary[] {
        if (!searchText) {
            return entries;
        }
        const lowerSearchText = searchText.toLowerCase();
        return entries.filter(
            entry =>
                entry.fileName.toLowerCase().includes(lowerSearchText) ||
                entry.name.toLowerCase().includes(lowerSearchText) ||
                entry.username.toLowerCase().includes(lowerSearchText)
        );
    }

    private filterByStatus(entries: HistoryEntrySummary[], status?: HistoryEntryStatus): HistoryEntrySummary[] {
        if (!status) {
            return entries;
        }
        return entries.filter(entry => entry.status === status);
    }

    private sortEntries(entries: HistoryEntrySummary[]): HistoryEntrySummary[] {
        // Sort by timestamp descending (most recent first)
        return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
}
