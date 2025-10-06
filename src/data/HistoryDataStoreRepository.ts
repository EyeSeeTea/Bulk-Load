import { HistoryRepository } from "../domain/repositories/HistoryRepository";
import { HistoryEntry, HistoryEntrySummary, HistoryEntryDetails } from "../domain/entities/HistoryEntry";
import { Id } from "../domain/entities/ReferenceObject";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { D2Api, D2ApiDefault, DataStore } from "../types/d2-api";
import { dataStoreNamespace } from "./StorageDataStoreRepository";

export class HistoryDataStoreRepository implements HistoryRepository {
    private api: D2Api;
    private dataStore: DataStore;
    private readonly HISTORY_KEY = "history";

    constructor({ url }: DhisInstance, mockApi?: D2Api) {
        this.api = mockApi ?? new D2ApiDefault({ baseUrl: url });
        this.dataStore = this.api.dataStore(dataStoreNamespace);
    }

    public async save(history: HistoryEntry): Promise<void> {
        const summaries = await this.getSummaries();
        const existingIndex = summaries.findIndex(summary => summary.id === history.id);
        const newSummary = history.toSummary();

        if (existingIndex >= 0) {
            summaries[existingIndex] = newSummary;
        } else {
            summaries.push(newSummary);
        }

        await this.saveSummaries(summaries);

        const details = history.toDetails();
        await this.saveDetails(history.id, details);
    }

    public async get(): Promise<HistoryEntrySummary[]> {
        const summaries = await this.getSummaries();
        return summaries.filter(summary => !summary.deletedAt);
    }

    public async getDetails(id: Id): Promise<HistoryEntryDetails | null> {
        try {
            const details = await this.dataStore.get<HistoryEntryDetails>(`history-${id}`).getData();
            return details ?? null;
        } catch (error: any) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            throw error;
        }
    }

    public async updateSummaries(
        condition: (summary: HistoryEntrySummary) => boolean,
        update: (summary: HistoryEntrySummary) => HistoryEntrySummary
    ): Promise<Id[]> {
        const summaries = await this.getSummaries();
        const filtered = summaries.filter(condition);
        if (filtered.length === 0) {
            return [];
        }
        const updated = filtered.map(update);
        const updatedIds = updated.map(s => s.id);
        const newSummaries = summaries.map(s =>
            updatedIds.includes(s.id) ? updated.find(u => u.id === s.id) ?? s : s
        );
        await this.saveSummaries(newSummaries);
        return updatedIds;
    }

    private async getSummaries(): Promise<HistoryEntrySummary[]> {
        try {
            const summaries = await this.dataStore.get<HistoryEntrySummary[]>(this.HISTORY_KEY).getData();
            return summaries ?? [];
        } catch (error: any) {
            if (error.response && error.response.status === 404) {
                return [];
            }
            throw error;
        }
    }

    private async saveSummaries(summaries: HistoryEntrySummary[]): Promise<void> {
        await this.dataStore.save(this.HISTORY_KEY, summaries).getData();
    }

    private async saveDetails(id: Id, details: HistoryEntryDetails): Promise<void> {
        await this.dataStore.save(`history-${id}`, details).getData();
    }

    public async delete(params: { until: Date; deletedBy: string }): Promise<Id[]> {
        const summaries = await this.getSummaries();
        const toDeleteIds = summaries.filter(summary => new Date(summary.timestamp) < params.until).map(s => s.id);
        if (toDeleteIds.length === 0) {
            return [];
        }
        await Promise.all(toDeleteIds.map(id => this.deleteDetails(id)));
        const updatedSummaries = summaries.map(summary =>
            toDeleteIds.includes(summary.id)
                ? { ...summary, deletedAt: new Date().toISOString(), deletedBy: params.deletedBy }
                : summary
        );
        await this.saveSummaries(updatedSummaries);
        return toDeleteIds;
    }

    private async deleteDetails(entryId: Id): Promise<void> {
        try {
            await this.dataStore.delete(`history-${entryId}`).getData();
        } catch (error: any) {
            // Ignore 404 errors if the detail doesn't exist
            if (error.response?.status !== 404) {
                throw error;
            }
        }
    }
}
