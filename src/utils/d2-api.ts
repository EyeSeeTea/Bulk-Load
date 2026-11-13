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

/* ID lists in tracker query parameters: comma-separated from DHIS2 2.42, semicolon-separated before */
export function joinIdsParameter(majorVersion: number, ids: string[]): string {
    return ids.join(majorVersion >= 42 ? "," : ";");
}

/* All items of a paged request, fetching pages until one comes back shorter than the page size.
   Avoids totalPages, which makes DHIS2 requests run x1.5 to x2 slower. */
export async function getAllPages<T>(pageSize: number, getPage: (page: number) => Promise<T[]>): Promise<T[]> {
    const getPagesFrom = async (page: number, pages: T[][]): Promise<T[][]> => {
        const items = await getPage(page);
        const allPages = [...pages, items];
        return items.length < pageSize ? allPages : getPagesFrom(page + 1, allPages);
    };

    const pages = await getPagesFrom(1, []);
    return pages.flat();
}

/* Order for paged /tracker/events requests. Without one, DHIS2 2.40 sorts only by lastUpdated, so pages can
   overlap (some events repeated, others never returned), with any order it adds the event ID as a tie-breaker.
   Its more likely to happen with a high (10+) page count.
   Fixed in 2.41+, no notable performance impact was measured by keeping the createdAt:asc order. */
export const pagedEventsOrder = "createdAt:asc";

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
