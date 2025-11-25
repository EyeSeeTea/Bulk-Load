import { Document } from "../entities/Document";
import { Id } from "../entities/ReferenceObject";
import { Sharing } from "../entities/Sharing";

export type DocumentDeleteOptions = {
    until: Date;
    deletedBy?: string;
};
export interface DocumentRepository {
    upload(file: { name: string; data: File; permissions?: Sharing }): Promise<Document>;
    delete(params: DocumentDeleteOptions): Promise<Id[]>;
    download(fileResourceId: Id): Promise<Blob>;
}
