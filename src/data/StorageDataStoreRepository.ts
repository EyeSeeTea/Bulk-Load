import { DhisInstance } from "../domain/entities/DhisInstance";
import { StorageRepository } from "../domain/repositories/StorageRepository";
import { D2Api, D2ApiDefault, DataStore } from "../types/d2-api";

export const dataStoreNamespace = "bulk-load";

export class StorageDataStoreRepository extends StorageRepository {
    private api: D2Api;
    private dataStore: DataStore;

    constructor({ url }: DhisInstance, mockApi?: D2Api) {
        super();
        this.api = mockApi ?? new D2ApiDefault({ baseUrl: url });
        this.dataStore = this.api.dataStore(dataStoreNamespace);
    }

    public async getObject<T extends object>(key: string, defaultValue: T): Promise<T> {
        const value = await this.dataStore.get<T>(key).getData();
        if (!value) await this.saveObject(key, defaultValue);
        return value ?? defaultValue;
    }

    public async getObjectIfExists<T extends object>(key: string): Promise<T | undefined> {
        return this.dataStore.get<T>(key).getData();
    }

    public async listKeys(): Promise<string[]> {
        return this.dataStore.getKeys().getData();
    }

    public async saveObject<T extends object>(key: string, value: T): Promise<void> {
        await this.dataStore.save(key, value).getData();
    }

    public async removeObject(key: string): Promise<void> {
        try {
            await this.dataStore.delete(key).getData();
        } catch (error: any) {
            if (!error.response || error.response.status !== 404) {
                throw error;
            }
        }
    }
}
