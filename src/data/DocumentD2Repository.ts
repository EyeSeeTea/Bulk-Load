import { D2Api } from "@eyeseetea/d2-api/2.33";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { D2ApiDefault, DataStore } from "../types/d2-api";
import { dataStoreNamespace } from "./StorageDataStoreRepository";
import { Id } from "../domain/entities/ReferenceObject";
import { DocumentRepository } from "../domain/repositories/DocumentRepository";
import { Document } from "../domain/entities/Document";

export class DocumentD2Repository implements DocumentRepository {
    private api: D2Api;
    private dataStore: DataStore;
    private readonly dataStoreHistoryKey = "documents";

    constructor(localInstance: DhisInstance) {
        this.api = new D2ApiDefault({ baseUrl: localInstance.url });
        this.dataStore = this.api.dataStore(dataStoreNamespace);
    }

    async upload(file: { name: string; data: File }): Promise<Document> {
        const newDocument = await this.api.files
            .upload({
                name: file.name,
                data: file.data,
            })
            .getData();
        const document: Document = {
            id: newDocument.id,
            name: file.name,
            createdAt: new Date().toISOString(),
            fileResourceId: newDocument.fileResourceId,
        };
        await this.addToHistory(document);
        return document;
    }

    async delete(params: { until: Date }): Promise<void> {
        const list = await this.dataStore.get<Document[]>(this.dataStoreHistoryKey).getData();
        if (!list) return;
        const toDelete = list.filter(item => {
            if (!item.createdAt || item.deletedAt) return false;
            return new Date(item.createdAt) < params.until;
        });
        const result = await this.api.metadata
            .post(
                {
                    documents: toDelete.map(item => ({ id: item.id })),
                },
                { importStrategy: "DELETE" }
            )
            .getData();
        if (result.status !== "OK") {
            throw new Error("Failed to delete documents");
        }
        const updatedList = list.map(item =>
            toDelete.find(d => d.id === item.id) ? { ...item, deletedAt: new Date().toISOString() } : item
        );
        await this.dataStore.save(this.dataStoreHistoryKey, updatedList).getData();
    }

    async download(fileResourceId: Id): Promise<Blob> {
        return this.api.files.get(fileResourceId).getData();
    }

    private async addToHistory(doc: Document): Promise<void> {
        const list = await this.dataStore.get<Document[]>(this.dataStoreHistoryKey).getData();
        await this.dataStore.save(this.dataStoreHistoryKey, [...(list ?? []), doc]).getData();
    }
}
