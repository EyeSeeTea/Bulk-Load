import { generateUid } from "d2/uid";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { StorageRepository } from "../domain/repositories/StorageRepository";
import { D2Api, D2ApiDefault } from "../types/d2-api";

interface Constant {
    id: string;
    code: string;
    shortName: string;
    name: string;
    description: string;
    value: number;
}

const defaultName = "Bulk Load Storage";

export class StorageConstantRepository extends StorageRepository {
    private api: D2Api;

    constructor({ url }: DhisInstance, mockApi?: D2Api) {
        super();
        this.api = mockApi ?? new D2ApiDefault({ baseUrl: url });
    }

    private buildDefault<T extends object>(key: string, value: T): Constant {
        const name = `${defaultName} - ${key}`;

        return {
            id: generateUid(),
            code: key,
            name: name,
            shortName: name.slice(0, 50),
            description: JSON.stringify(value, null, 2),
            value: 1,
        };
    }

    private async getConstant(key: string): Promise<Partial<Constant>> {
        const { objects: constants } = await this.api.models.constants
            .get({
                paging: false,
                fields: { id: true, code: true, name: true, description: true },
                filter: { code: { eq: key } },
            })
            .getData();

        return constants[0] ?? {};
    }

    public async getObject<T extends object>(key: string, defaultValue: T): Promise<T> {
        const { description } = await this.getConstant(key);
        if (!description) {
            await this.api.models.constants.post(this.buildDefault(key, defaultValue)).getData();
        }
        return description ? JSON.parse(description) : defaultValue;
    }

    public async getObjectIfExists<T extends object>(key: string): Promise<T | undefined> {
        const { description } = await this.getConstant(key);
        return description ? JSON.parse(description) : undefined;
    }

    public async listKeys(): Promise<string[]> {
        const { objects: constants } = await this.api.models.constants
            .get({
                paging: false,
                fields: { id: true, code: true, name: true },
                filter: { name: { $like: defaultName } },
            })
            .getData();

        return constants.map(({ code }) => code);
    }

    public async saveObject<T extends object>(key: string, value: T): Promise<void> {
        const { id = generateUid(), name = `${defaultName} - ${key}` } = await this.getConstant(key);

        const payload = {
            id: id,
            shortName: name.slice(0, 50),
            name: name,
            code: key,
            description: JSON.stringify(value, null, 4),
            value: 1,
        };

        const response = await this.api.models.constants.put(payload).getData();

        if (response.status !== "OK") {
            throw new Error(JSON.stringify(response.message, null, 2));
        }
    }

    public async removeObject(key: string): Promise<void> {
        const { id } = await this.getConstant(key);
        if (id) await this.api.models.constants.delete({ id }).getData();
    }
}
