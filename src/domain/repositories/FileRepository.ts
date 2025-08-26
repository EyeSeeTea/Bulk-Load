import { FileResource } from "../entities/FileResource";

export interface FileRepository {
    uploadDocument(file: FileResource): Promise<FileResource>;
    deleteDocuments(params: { until: Date }): Promise<void>;
    uploadAll(files: FileResource[]): Promise<FileResource[]>;
}
