import { Document } from "../entities/Document";
import { Id } from "../entities/ReferenceObject";

export interface DocumentRepository {
    upload(file: { name: string; data: File }): Promise<Document>;
    delete(params: { until: Date }): Promise<Id[]>;
    download(fileResourceId: Id): Promise<Blob>;
}
