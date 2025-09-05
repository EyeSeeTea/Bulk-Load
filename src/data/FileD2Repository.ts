import { D2Api } from "@eyeseetea/d2-api/2.33";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { FileResource } from "../domain/entities/FileResource";
import { FileRepository } from "../domain/repositories/FileRepository";
import { D2ApiDefault } from "../types/d2-api";
import { promiseMap } from "../utils/promises";
import { Maybe } from "../types/utils";

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

    constructor(localInstance: DhisInstance) {
        this.api = new D2ApiDefault({ baseUrl: localInstance.url });
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

    /**
     * date comes from DHIS in ISO format but without the Z at the end
     * add Z back to fix date format
     */
    private sanitizeDate(date: Maybe<string>): string {
        if (!date) return new Date().toISOString();
        return date.endsWith("Z") ? date : `${date}Z`;
    }
}
