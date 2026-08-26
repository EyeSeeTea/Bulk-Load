import { getHistoryEntryOrgUnitIds, HistoryEntryDetails } from "../../domain/entities/HistoryEntry";
import { ImportTemplateConfiguration } from "../../domain/entities/ImportTemplateConfiguration";
import { OrgUnit, toOrgUnitReferences } from "../../domain/entities/OrgUnit";

const ORG_UNIT_ID = "YuQRtpLP10I";
const ORG_UNIT_PATH = `/ImspTQPwCqd/O6uvpzGd5pu/${ORG_UNIT_ID}`;

function buildDetails(details: Partial<HistoryEntryDetails> & { configuration?: ImportTemplateConfiguration }) {
    return { results: [], errorDetails: undefined, configuration: undefined, ...details };
}

function buildOrgUnit(id: string, name: string): OrgUnit {
    return { id: id, name: name, path: `/ImspTQPwCqd/O6uvpzGd5pu/${id}`, level: 3 };
}

describe("getHistoryEntryOrgUnitIds", () => {
    describe("entries with the imported org units recorded", () => {
        it("returns every org unit the data was imported into", () => {
            const details = buildDetails({ orgUnitsImported: ["firstOrgUn", "secondOrgU", "thirdOrgUn"] });

            expect(getHistoryEntryOrgUnitIds(details)).toEqual(["firstOrgUn", "secondOrgU", "thirdOrgUn"]);
        });

        it("takes precedence over the overridden org unit, which holds the same value", () => {
            const details = buildDetails({
                orgUnitsImported: [ORG_UNIT_ID],
                configuration: { useBuilderOrgUnits: true, selectedOrgUnits: [ORG_UNIT_PATH] },
            });

            expect(getHistoryEntryOrgUnitIds(details)).toEqual([ORG_UNIT_ID]);
        });

        it("returns no org units for an import that never reached DHIS2", () => {
            const details = buildDetails({ orgUnitsImported: [] });

            expect(getHistoryEntryOrgUnitIds(details)).toEqual([]);
        });
    });

    describe("entries saved before the imported org units were recorded", () => {
        it("falls back to the id of the org unit that overrode the file", () => {
            const details = buildDetails({
                configuration: { useBuilderOrgUnits: true, selectedOrgUnits: [ORG_UNIT_PATH] },
            });

            expect(getHistoryEntryOrgUnitIds(details)).toEqual([ORG_UNIT_ID]);
        });

        it("returns no org units when they came from the imported file", () => {
            const details = buildDetails({ configuration: { useBuilderOrgUnits: false, selectedOrgUnits: [] } });

            expect(getHistoryEntryOrgUnitIds(details)).toEqual([]);
        });

        it("ignores a selection that was not applied to the import", () => {
            const details = buildDetails({
                configuration: { useBuilderOrgUnits: false, selectedOrgUnits: [ORG_UNIT_PATH] },
            });

            expect(getHistoryEntryOrgUnitIds(details)).toEqual([]);
        });

        it("returns no org units for entries saved without import configuration", () => {
            expect(getHistoryEntryOrgUnitIds(buildDetails({}))).toEqual([]);
        });
    });
});

describe("toOrgUnitReferences", () => {
    it("keeps the requested order and pairs each id with its name", () => {
        const orgUnits = [buildOrgUnit("secondOrgU", "Second"), buildOrgUnit("firstOrgUn", "First")];

        expect(toOrgUnitReferences(["firstOrgUn", "secondOrgU"], orgUnits)).toEqual([
            { id: "firstOrgUn", name: "First" },
            { id: "secondOrgU", name: "Second" },
        ]);
    });

    it("leaves the name undefined for org units that are deleted or not accessible", () => {
        const orgUnits = [buildOrgUnit("firstOrgUn", "First")];

        expect(toOrgUnitReferences(["firstOrgUn", "missingOrg"], orgUnits)).toEqual([
            { id: "firstOrgUn", name: "First" },
            { id: "missingOrg", name: undefined },
        ]);
    });
});
