import { getAllPages, getMajorVersion, joinIdsParameter } from "../d2-api";

describe("getMajorVersion", () => {
    it("parses a stable release version", () => {
        expect(getMajorVersion("2.42.0")).toEqual(42);
    });

    it("parses a fork build (suffix on a later component)", () => {
        expect(getMajorVersion("2.41.6.1-eyeseetea-fork-1")).toEqual(41);
    });

    it("parses a pre-release build (suffix on the minor component)", () => {
        expect(getMajorVersion("2.44-SNAPSHOT")).toEqual(44);
    });

    it("parses a version with only major.minor", () => {
        expect(getMajorVersion("2.40")).toEqual(40);
    });

    it("throws on a version without a minor component", () => {
        expect(() => getMajorVersion("2")).toThrow();
    });

    it("throws on a non-numeric minor component", () => {
        expect(() => getMajorVersion("2.x")).toThrow();
    });
});

describe("joinIdsParameter", () => {
    const ids = ["id1", "id2", "id3"];

    it("separates IDs with semicolons before v42", () => {
        expect(joinIdsParameter(41, ids)).toEqual("id1;id2;id3");
    });

    it("separates IDs with commas from v42", () => {
        expect(joinIdsParameter(42, ids)).toEqual("id1,id2,id3");
    });
});

describe("getAllPages", () => {
    function pagedSource(total: number, pageSize: number) {
        const requestedPages: number[] = [];
        const getPage = async (page: number) => {
            requestedPages.push(page);
            const start = (page - 1) * pageSize;
            const end = Math.min(start + pageSize, total);
            return Array.from({ length: Math.max(end - start, 0) }, (_item, index) => start + index);
        };
        return { getPage, requestedPages };
    }

    it("fetches pages until one comes back shorter than the page size", async () => {
        const { getPage, requestedPages } = pagedSource(7, 3);

        expect(await getAllPages(3, getPage)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(requestedPages).toEqual([1, 2, 3]);
    });

    it("needs one extra, empty page when the total is a multiple of the page size", async () => {
        const { getPage, requestedPages } = pagedSource(6, 3);

        expect(await getAllPages(3, getPage)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(requestedPages).toEqual([1, 2, 3]);
    });

    it("stops after the first page when there are no items", async () => {
        const { getPage, requestedPages } = pagedSource(0, 3);

        expect(await getAllPages(3, getPage)).toEqual([]);
        expect(requestedPages).toEqual([1]);
    });
});
