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
        return this.getSummaries();
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
}
