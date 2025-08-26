import { D2Api } from "@eyeseetea/d2-api/2.33";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { FileResource } from "../domain/entities/FileResource";
import { FileRepository } from "../domain/repositories/FileRepository";
import { D2ApiDefault, DataStore } from "../types/d2-api";
import { promiseMap } from "../utils/promises";
import { Maybe } from "../types/utils";
import { dataStoreNamespace } from "./StorageDataStoreRepository";

type FileResponse = {
    response?: {
        fileResource?: {
            id?: string;
            created?: string;
        };
    };
};

export class FileD2Repository implements FileRepository {
    private api: D2Api;
    private dataStore: DataStore;
    private readonly dataStoreHistoryKey = "uploads";

    constructor(localInstance: DhisInstance) {
        this.api = new D2ApiDefault({ baseUrl: localInstance.url });
        this.dataStore = this.api.dataStore(dataStoreNamespace);
    }

    async uploadDocument(file: FileResource): Promise<FileResource> {
        const newDocument = await this.uploadSingleFile(file, "DOCUMENT");
        await this.addToHistory(newDocument);
        return newDocument;
    }

    async deleteDocuments(params: { until: Date }): Promise<void> {
        const list = await this.dataStore.get<FileResource[]>(this.dataStoreHistoryKey).getData();
        if (!list) return;
        const toDelete = list.filter(item => {
            if (!item.createdAt) return false;
            return new Date(item.createdAt) < params.until;
        });
        await Promise.all(
            toDelete.map(item =>
                this.api
                    .request<void>({
                        url: `/fileResources/${item.id}`,
                        method: "delete",
                    })
                    .response()
            )
        );
        const updatedList = list.map(item =>
            toDelete.find(d => d.id === item.id) ? { ...item, deletedAt: new Date().toISOString() } : item
        );
        await this.dataStore.save(this.dataStoreHistoryKey, updatedList).getData();
    }

    async uploadAll(files: FileResource[]): Promise<FileResource[]> {
        if (files.length === 0) return files;

        const filesWithIds = await promiseMap(files, async file => {
            return this.uploadSingleFile(file, "DATA_VALUE");
        });

        return filesWithIds;
    }

    private async uploadSingleFile(file: FileResource, domain: "DATA_VALUE" | "DOCUMENT"): Promise<FileResource> {
        const formData = new FormData();
        formData.append("file", file.data, file.name);
        formData.append("domain", domain);

        const response = await this.api
            .request<FileResponse>({
                url: "/fileResources",
                method: "post",
                requestBodyType: "raw",
                data: formData,
            })
            .response();

        const { id: fileResourceId, created } = response.data.response?.fileResource ?? {};

        if (!fileResourceId) {
            throw Error("Unable to save file");
        }

        return { ...file, id: fileResourceId, createdAt: this.sanitizeDate(created) };
    }

    private async addToHistory(file: FileResource): Promise<void> {
        const entryToAdd = {
            fileResourceId: file.id,
            name: file.name,
            createdAt: file.createdAt,
        };
        const list = await this.dataStore.get<FileResource[]>(this.dataStoreHistoryKey).getData();
        await this.dataStore.save(this.dataStoreHistoryKey, [...(list ?? []), entryToAdd]).getData();
    }

    /**
     * date comes from DHIS in ISO format but without the Z at the end
     * add Z back to fix date format
     */
    private sanitizeDate(date: Maybe<string>): string {
        if (!date) return new Date().toISOString();
        return date.endsWith("Z") ? date : `${date}Z`;
    }
}
