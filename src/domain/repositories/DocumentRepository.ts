import { Document } from "../entities/Document";
import { Id } from "../entities/ReferenceObject";

export type DocumentDeleteOptions = {
    until: Date;
    keepReference?: boolean;
};
export interface DocumentRepository {
    upload(file: { name: string; data: File }): Promise<Document>;
    delete(params: DocumentDeleteOptions): Promise<Id[]>;
    download(fileResourceId: Id): Promise<Blob>;
}
