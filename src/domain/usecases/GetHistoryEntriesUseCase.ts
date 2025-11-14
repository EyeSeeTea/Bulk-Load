import { UseCase } from "../../CompositionRoot";
import Settings from "../../webapp/logic/settings";
import { canViewHistoryEntry, HistoryEntryStatus, HistoryEntrySummary } from "../entities/HistoryEntry";
import { Id } from "../entities/ReferenceObject";
import { isAdmin } from "../entities/User";
import { HistoryRepository } from "../repositories/HistoryRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";

type GetHistoryEntriesFilters = {
    searchText?: string;
    status?: HistoryEntryStatus;
};

export class GetHistoryEntriesUseCase implements UseCase {
    constructor(private historyRepository: HistoryRepository, private instanceRepository: InstanceRepository) {}

    public async execute(settings: Settings, filters: GetHistoryEntriesFilters = {}): Promise<HistoryEntrySummary[]> {
        const entries = await this.historyRepository.get();
        const filteredByFilters = this.filterByStatus(this.filterByText(entries, filters.searchText), filters.status);
        const filteredByPermissions = await this.filterByPermissions(filteredByFilters, settings);
        return this.sortEntries(filteredByPermissions);
    }

    private async filterByPermissions(
        entries: HistoryEntrySummary[],
        settings: Settings
    ): Promise<HistoryEntrySummary[]> {
        if (isAdmin(settings.currentUser)) {
            return entries;
        }
        const entryIds = [...new Set(entries.map(e => e.dataFormId).filter(Boolean))] as Id[];
        const permissions = entryIds.length === 0 ? [] : await this.instanceRepository.getDataFormPermissions(entryIds);
        return entries.filter(entry =>
            canViewHistoryEntry(
                entry,
                settings,
                permissions.find(p => p.id === entry.dataFormId)
            )
        );
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
