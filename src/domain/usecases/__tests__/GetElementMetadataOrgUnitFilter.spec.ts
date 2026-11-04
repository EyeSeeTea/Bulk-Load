import { OrgUnit } from "../../entities/OrgUnit";
import { OrgUnitRepository } from "../../repositories/OrgUnitRepository";
import { D2Api } from "../../../types/d2-api";
import { getElementMetadata } from "../DownloadTemplateUseCase";

/*
    Country
    └── District 1
        └── Facility 1a
    Partner A is assigned to Country only. All org units belong to the data set.
*/
const orgUnits: OrgUnit[] = [
    { id: "country", path: "/country", name: "Country", level: 1 },
    { id: "district1", path: "/country/district1", name: "District 1", level: 2 },
    { id: "facility1a", path: "/country/district1/facility1a", name: "Facility 1a", level: 3 },
];

const element = {
    type: "dataSets",
    id: "ds1",
    organisationUnits: orgUnits.map(({ id }) => ({ id })),
};

function buildApi(): D2Api {
    const api = new D2Api({ baseUrl: "http://localhost" });

    api.get = vi.fn().mockImplementation((url: string) => ({
        getData: async () =>
            url === "/dataSets/ds1/metadata.json"
                ? { categoryOptionCombos: [{ id: "partnerA", categoryOptions: [{ id: "partnerA" }] }] }
                : { organisationUnits: [] },
    }));

    api.metadata.get = vi.fn().mockReturnValue({
        getData: async () => ({
            categoryOptions: [{ id: "partnerA", organisationUnits: [{ id: "country" }] }],
        }),
    });

    // Org unit names for the template (/organisationUnits since DHIS2 v43, /metadata before)
    api.models.organisationUnits.get = vi.fn().mockReturnValue({
        getData: async () => ({ objects: [] }),
    });

    return api;
}

function buildOrgUnitRepository() {
    const getByIds = vi.fn(async (ids: string[]) => orgUnits.filter(orgUnit => ids.includes(orgUnit.id)));
    const repository: OrgUnitRepository = { getByIds };
    return { repository, getByIds };
}

async function getCocIds(options: { filter: "assigned" | "assignedAndDescendants"; orgUnitIds: string[] }) {
    const { repository, getByIds } = buildOrgUnitRepository();

    const { rawMetadata } = await getElementMetadata({
        api: buildApi(),
        orgUnitRepository: repository,
        element,
        orgUnitIds: options.orgUnitIds,
        startDate: undefined,
        endDate: undefined,
        downloadRelationships: false,
        orgUnitShortName: false,
        categoryOptionOrgUnitFilter: options.filter,
    });

    return {
        cocIds: rawMetadata.categoryOptionCombos.flatMap(coc => coc.categoryOptions.map(option => option.id)),
        getByIds,
    };
}

describe("getElementMetadata - categoryOptionOrgUnitFilter", () => {
    describe("assigned", () => {
        it("includes the option only for the directly assigned org unit", async () => {
            expect((await getCocIds({ filter: "assigned", orgUnitIds: ["country"] })).cocIds).toEqual(["partnerA"]);
            expect((await getCocIds({ filter: "assigned", orgUnitIds: ["district1"] })).cocIds).toEqual([]);
            expect((await getCocIds({ filter: "assigned", orgUnitIds: ["facility1a"] })).cocIds).toEqual([]);
        });

        it("does not resolve org unit paths", async () => {
            const { getByIds } = await getCocIds({ filter: "assigned", orgUnitIds: ["facility1a"] });

            expect(getByIds).not.toHaveBeenCalled();
        });
    });

    describe("assignedAndDescendants", () => {
        it("includes the option for descendants of the assigned org unit", async () => {
            for (const orgUnitId of ["country", "district1", "facility1a"]) {
                const { cocIds } = await getCocIds({ filter: "assignedAndDescendants", orgUnitIds: [orgUnitId] });
                expect(cocIds).toEqual(["partnerA"]);
            }
        });

        it("resolves the org unit paths through the repository", async () => {
            const { getByIds } = await getCocIds({ filter: "assignedAndDescendants", orgUnitIds: ["facility1a"] });

            expect(getByIds).toHaveBeenCalledWith(["facility1a"]);
        });

        it("ignores selected org units that do not belong to the data set", async () => {
            const { cocIds } = await getCocIds({ filter: "assignedAndDescendants", orgUnitIds: ["country2"] });

            expect(cocIds).toEqual([]);
        });
    });
});
