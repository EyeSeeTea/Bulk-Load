import _ from "lodash";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { D2Api } from "../types/d2-api";
import { memoizeAsync } from "./cache";

export function getMajorVersion(version: string): number {
    const apiVersion = _.get(version.split("."), 1);
    if (!apiVersion) throw new Error(`Invalid version: ${version}`);
    // Use parseInt so pre-release suffixes on the minor component are tolerated
    // (e.g. "2.44-SNAPSHOT" -> 44 instead of NaN).
    const majorVersion = parseInt(apiVersion, 10);
    if (Number.isNaN(majorVersion)) throw new Error(`Invalid version: ${version}`);
    return majorVersion;
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
