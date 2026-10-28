import { vi } from "vitest";
import { OrgUnitD2Repository } from "../../data/OrgUnitD2Repository";
import { D2Api } from "../../types/d2-api";

const CHUNK_SIZE = 250;

type OrgUnitsQuery = { filter: { id: { in: string[] } } };

function buildOrgUnitId(index: number): string {
    return `orgUnit${index.toString().padStart(4, "0")}`;
}

function buildOrgUnitIds(count: number): string[] {
    return Array.from({ length: count }, (_value, index) => buildOrgUnitId(index));
}

function setupRepository() {
    const get = vi.fn((query: OrgUnitsQuery) => ({
        getData: async () => ({
            objects: query.filter.id.in.map(id => ({
                id,
                displayName: `Name of ${id}`,
                level: 3,
                path: `/root/${id}`,
            })),
        }),
    }));

    const api = { models: { organisationUnits: { get } } } as unknown as D2Api;
    const repository = new OrgUnitD2Repository({ type: "local", url: "http://localhost:8080" }, api);

    const requestedIdsPerCall = () => get.mock.calls.map(([query]) => query.filter.id.in);

    return { repository, get, requestedIdsPerCall };
}

describe("OrgUnitD2Repository", () => {
    describe("getByIds", () => {
        it("returns the org units with the name in the language of the current user", async () => {
            const { repository } = setupRepository();

            const orgUnits = await repository.getByIds(["orgUnitA", "orgUnitB"]);

            expect(orgUnits).toEqual([
                { id: "orgUnitA", name: "Name of orgUnitA", level: 3, path: "/root/orgUnitA" },
                { id: "orgUnitB", name: "Name of orgUnitB", level: 3, path: "/root/orgUnitB" },
            ]);
        });

        it("splits the request in chunks to avoid a 414 uri-too-large response", async () => {
            const { repository, get, requestedIdsPerCall } = setupRepository();
            const ids = buildOrgUnitIds(600);

            const orgUnits = await repository.getByIds(ids);

            expect(get).toHaveBeenCalledTimes(3);
            expect(requestedIdsPerCall()).toEqual([
                ids.slice(0, CHUNK_SIZE),
                ids.slice(CHUNK_SIZE, 2 * CHUNK_SIZE),
                ids.slice(2 * CHUNK_SIZE),
            ]);
            expect(orgUnits.map(orgUnit => orgUnit.id)).toEqual(ids);
        });

        it("performs a single request when the ids fit in one chunk", async () => {
            const { repository, get, requestedIdsPerCall } = setupRepository();
            const ids = buildOrgUnitIds(CHUNK_SIZE);

            await repository.getByIds(ids);

            expect(get).toHaveBeenCalledTimes(1);
            expect(requestedIdsPerCall()).toEqual([ids]);
        });

        it("returns an empty list without performing any request when there are no ids", async () => {
            const { repository, get } = setupRepository();

            const orgUnits = await repository.getByIds([]);

            expect(orgUnits).toEqual([]);
            expect(get).toHaveBeenCalledTimes(0);
        });
    });
});
