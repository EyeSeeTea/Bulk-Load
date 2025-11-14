import { D2Api } from "@eyeseetea/d2-api/2.33";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { D2ApiDefault, DataStore } from "../types/d2-api";
import { dataStoreNamespace } from "./StorageDataStoreRepository";
import { Id } from "../domain/entities/ReferenceObject";
import { DocumentDeleteOptions, DocumentRepository } from "../domain/repositories/DocumentRepository";
import { Document } from "../domain/entities/Document";
import { Permissions, Sharing } from "../domain/entities/Sharing";

export class DocumentD2Repository implements DocumentRepository {
    private api: D2Api;
    private dataStore: DataStore;
    private readonly dataStoreKey = "documents";

    constructor(localInstance: DhisInstance) {
        this.api = new D2ApiDefault({ baseUrl: localInstance.url });
        this.dataStore = this.api.dataStore(dataStoreNamespace);
    }

    async upload(file: { name: string; data: File; permissions?: Sharing }): Promise<Document> {
        const newDocument = await this.api.files
            .upload({
                name: file.name,
                data: file.data,
            })
            .getData();

        if (file.permissions) {
            try {
                await this.updateDocumentSharing(newDocument.id, file.permissions);
            } catch (error) {
                console.error("Failed to update document sharing settings", error);
                // in case of error continue, permissions will be default
            }
        }

        const document: Document = {
            id: newDocument.id,
            name: file.name,
            createdAt: new Date().toISOString(),
            fileResourceId: newDocument.fileResourceId,
        };
        await this.addToDataStore(document);
        return document;
    }

    async delete({ until, deletedBy }: DocumentDeleteOptions): Promise<Id[]> {
        const list = await this.dataStore.get<Document[]>(this.dataStoreKey).getData();
        if (!list) return [];
        const toDeleteIds = list
            .filter(item => {
                if (!item.createdAt || item.deletedAt) return false;
                return new Date(item.createdAt) < until;
            })
            .map(item => item.id);
        const result = await this.api.metadata
            .post(
                {
                    documents: toDeleteIds.map(id => ({ id })),
                },
                { importStrategy: "DELETE" }
            )
            .getData();
        if (result.status !== "OK") {
            throw new Error("Failed to delete documents");
        }
        const updatedList = list.map(item =>
            toDeleteIds.includes(item.id)
                ? { ...item, deletedAt: new Date().toISOString(), deletedBy: deletedBy }
                : item
        );
        await this.dataStore.save(this.dataStoreKey, updatedList).getData();
        return toDeleteIds;
    }

    async download(fileResourceId: Id): Promise<Blob> {
        return this.api.files.get(fileResourceId).getData();
    }

    private async updateDocumentSharing(documentId: Id, permissions: Sharing): Promise<void> {
        const sharingSettings = this.buildSharingSettings(permissions);
        await this.api.sharing
            .post(
                {
                    id: documentId,
                    type: "document",
                },
                {
                    externalAccess: false,
                    publicAccess: sharingSettings.publicAccess,
                    userGroupAccesses: sharingSettings.userGroupAccesses,
                    userAccesses: sharingSettings.userAccesses,
                }
            )
            .getData();
    }

    private async addToDataStore(doc: Document): Promise<void> {
        const list = await this.dataStore.get<Document[]>(this.dataStoreKey).getData();
        await this.dataStore.save(this.dataStoreKey, [...(list ?? []), doc]).getData();
    }

    private buildSharingSettings(permissions: Sharing): {
        publicAccess: string;
        userGroupAccesses: Array<{ id: Id; access: string }>;
        userAccesses: Array<{ id: Id; access: string }>;
    } {
        return {
            publicAccess: Permissions.NO_ACCESS, // documents must be private
            userGroupAccesses: permissions.userGroups,
            userAccesses: permissions.users,
        };
    }
}
