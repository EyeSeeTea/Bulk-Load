import { D2Api, D2ApiDefault } from "d2-api";
import DataStore from "d2-api/api/dataStore";
import _ from "lodash";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { ReferenceObject } from "../domain/entities/ReferenceObject";
import { StorageRepository } from "../domain/repositories/StorageRepository";

const dataStoreNamespace = "bulk-load";

export class StorageDataStoreRepository implements StorageRepository {
    private api: D2Api;
    private dataStore: DataStore;

    constructor({ url }: DhisInstance) {
        this.api = new D2ApiDefault({ baseUrl: url });
        this.dataStore = this.api.dataStore(dataStoreNamespace);
    }

    public async loadObject<T extends object>(key: string, defaultValue: T): Promise<T> {
        const value = await this.dataStore.get<T>(key).getData();
        if (!value) await this.saveObject(key, defaultValue);
        return value ?? defaultValue;
    }

    public async saveObject<T extends object>(key: string, value: T): Promise<void> {
        await this.dataStore.save(key, value).getData();
    }

    public async removeObject(key: string): Promise<void> {
        try {
            await this.dataStore.delete(key).getData();
        } catch (error) {
            if (!error.response || error.response.status !== 404) {
                throw error;
            }
        }
    }

    public async loadCollection<T extends ReferenceObject>(
        key: string,
        id: string
    ): Promise<T | undefined> {
        const rawData = await this.loadObject<T[]>(key, []);
        return _.find(rawData, element => element.id === id);
    }

    public async removeCollection(key: string, id: string): Promise<void> {
        const oldData = await this.loadObject(key, [] as ReferenceObject[]);
        const newData = _.reject(oldData, { id });
        await this.saveObject(key, newData);
    }

    public async saveCollection<T extends ReferenceObject>(key: string, element: T): Promise<void> {
        const oldData = await this.loadObject(key, [] as ReferenceObject[]);
        const newData = _.uniqBy([...oldData, element], "id");
        await this.saveObject(key, newData);
    }
}
