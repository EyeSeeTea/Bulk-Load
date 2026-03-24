import _ from "lodash";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { D2Api } from "../types/d2-api";
import { memoizeAsync } from "./cache";

export function getMajorVersion(version: string): number {
    const apiVersion = _.get(version.split("."), 1);
    if (!apiVersion) throw new Error(`Invalid version: ${version}`);
    return Number(apiVersion);
}

export function getD2APiFromInstance(instance: DhisInstance) {
    return new D2Api({
        baseUrl: instance.url,
        auth: instance.type === "external" ? { username: instance.username, password: instance.password } : undefined,
        backend: "fetch",
    });
}

export const getVersion = memoizeAsync(async (api: D2Api): Promise<string> => {
    const { version } = await api.system.info.getData();
    return version;
});
