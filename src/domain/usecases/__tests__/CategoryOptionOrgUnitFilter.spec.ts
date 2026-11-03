import {
    CategoryOption,
    Element,
    getCategoryOptionIdsToInclude,
    getSelectedOrgUnitIds,
    OrgUnitPathRef,
} from "../DownloadTemplateUseCase";

/*
    Country
    ├── District 1
    │   └── Facility 1a
    └── District 2
    Country 2
*/
const country: OrgUnitPathRef = { id: "country", path: "/country" };
const district1: OrgUnitPathRef = { id: "district1", path: "/country/district1" };
const facility1a: OrgUnitPathRef = { id: "facility1a", path: "/country/district1/facility1a" };
const country2: OrgUnitPathRef = { id: "country2", path: "/country2" };

const partnerA: CategoryOption = { id: "partnerA", organisationUnits: [{ id: "country" }] };
const partnerB: CategoryOption = { id: "partnerB", organisationUnits: [{ id: "facility1a" }] };
const unrestricted: CategoryOption = { id: "unrestricted", organisationUnits: [] };
const categoryOptions = [partnerA, partnerB, unrestricted];

const noDates = { startDate: undefined, endDate: undefined };

function included(selected: OrgUnitPathRef[], options = categoryOptions): string[] {
    return Array.from(getCategoryOptionIdsToInclude(selected, options, noDates)).sort();
}

// In "assigned" mode the org units are resolved without path (see getSelectedOrgUnits)
function withoutPath(orgUnit: OrgUnitPathRef): OrgUnitPathRef {
    return { id: orgUnit.id };
}

describe("getCategoryOptionIdsToInclude", () => {
    describe("assignedAndDescendants (org units with path)", () => {
        it("includes an option assigned to an ancestor", () => {
            expect(included([country])).toEqual(["partnerA", "unrestricted"]);
            expect(included([district1])).toEqual(["partnerA", "unrestricted"]);
            expect(included([facility1a])).toEqual(["partnerA", "partnerB", "unrestricted"]);
        });

        it("does not include an option assigned to an unrelated org unit", () => {
            expect(included([country2])).toEqual(["unrestricted"]);
        });
    });

    describe("assigned (org units without path)", () => {
        it("includes an option only on its directly assigned org unit", () => {
            expect(included([country].map(withoutPath))).toEqual(["partnerA", "unrestricted"]);
            expect(included([district1].map(withoutPath))).toEqual(["unrestricted"]);
            expect(included([facility1a].map(withoutPath))).toEqual(["partnerB", "unrestricted"]);
            expect(included([country2].map(withoutPath))).toEqual(["unrestricted"]);
        });
    });

    it("filters by category option dates", () => {
        const dated: CategoryOption = { id: "dated", organisationUnits: [], endDate: "2020-01-01T00:00:00.000Z" };

        const ids = getCategoryOptionIdsToInclude([country], [dated], {
            startDate: new Date("2021-01-01T00:00:00.000Z"),
            endDate: undefined,
        });

        expect(ids.size).toBe(0);
    });
});

describe("getSelectedOrgUnitIds", () => {
    const dataSet: Element = { type: "dataSets", organisationUnits: [{ id: "country" }, { id: "district1" }] };

    it("returns the data set org units when none are selected", () => {
        expect(getSelectedOrgUnitIds(dataSet, [])).toEqual(["country", "district1"]);
    });

    it("ignores selected org units that do not belong to the data set", () => {
        expect(getSelectedOrgUnitIds(dataSet, ["district1", "country2"])).toEqual(["district1"]);
    });
});
