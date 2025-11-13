import { DhisInstance } from "../domain/entities/DhisInstance";
import { FileResource } from "../domain/entities/FileResource";
import { FileRepository } from "../domain/repositories/FileRepository";
import { D2Api, D2ApiDefault } from "../types/d2-api";
import { promiseMap } from "../utils/promises";

type FileResponse = {
    response?: {
        fileResource?: {
            id?: string;
        };
    };
};

export class FileD2Repository implements FileRepository {
    private api: D2Api;

    constructor(localInstance: DhisInstance) {
        this.api = new D2ApiDefault({ baseUrl: localInstance.url });
    }

    async uploadAll(files: FileResource[]): Promise<FileResource[]> {
        if (files.length === 0) return files;

        const filesWithIds = await promiseMap(files, async file => {
            const formData = new FormData();
            formData.append("file", file.data, file.name);
            formData.append("domain", "DATA_VALUE");

            const response = await this.api
                .request<FileResponse>({
                    url: "/fileResources",
                    method: "post",
                    requestBodyType: "raw",
                    data: formData,
                })
                .response();

            const fileResourceId = response.data.response?.fileResource;

            if (!fileResourceId?.id) {
                throw Error("Unable to save file");
            }

            return { ...file, id: fileResourceId.id };
        });

        return filesWithIds;
    }
}
