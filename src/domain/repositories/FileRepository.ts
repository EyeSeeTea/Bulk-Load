import { FileResource } from "../entities/FileResource";

export interface FileRepository {
    uploadAll(files: FileResource[]): Promise<FileResource[]>;
}
