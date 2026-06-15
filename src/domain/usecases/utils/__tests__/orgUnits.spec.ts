import { OrgUnit } from "../../../entities/OrgUnit";
import { getCaptureOrgUnitIdsForDataForm } from "../orgUnits";

function buildOrgUnit(id: string, path: string): OrgUnit {
    return { id, path, name: id, level: path.split("/").length - 1 };
}

describe("getCaptureOrgUnitIdsForDataForm", () => {
    it("returns empty when the data form org unit is a parent of the user org units", () => {
        const dataFormOrgUnits = [{ id: "global", path: "/global" }];
        const userOrgUnits = [buildOrgUnit("spain", "/global/spain"), buildOrgUnit("albania", "/global/albania")];

        const result = getCaptureOrgUnitIdsForDataForm(dataFormOrgUnits, userOrgUnits);

        expect(result).toEqual([]);
    });

    it("returns the data form org units when the user has a parent org unit", () => {
        const dataFormOrgUnits = [
            { id: "spain", path: "/global/spain" },
            { id: "albania", path: "/global/albania" },
        ];
        const userOrgUnits = [buildOrgUnit("global", "/global")];

        const result = getCaptureOrgUnitIdsForDataForm(dataFormOrgUnits, userOrgUnits);

        expect(result).toEqual(["spain", "albania"]);
    });

    it("returns the data form org unit when the user has the exact same org unit", () => {
        const dataFormOrgUnits = [{ id: "spain", path: "/global/spain" }];
        const userOrgUnits = [buildOrgUnit("spain", "/global/spain")];

        const result = getCaptureOrgUnitIdsForDataForm(dataFormOrgUnits, userOrgUnits);

        expect(result).toEqual(["spain"]);
    });

    it("only returns the data form org units the user has access to", () => {
        const dataFormOrgUnits = [
            { id: "spain", path: "/global/spain" },
            { id: "france", path: "/global/france" },
        ];
        const userOrgUnits = [buildOrgUnit("spain", "/global/spain")];

        const result = getCaptureOrgUnitIdsForDataForm(dataFormOrgUnits, userOrgUnits);

        expect(result).toEqual(["spain"]);
    });

    it("does not match org units with similar path prefixes that are not ancestors", () => {
        const dataFormOrgUnits = [{ id: "spain2", path: "/global/spain2" }];
        const userOrgUnits = [buildOrgUnit("spain", "/global/spain")];

        const result = getCaptureOrgUnitIdsForDataForm(dataFormOrgUnits, userOrgUnits);

        expect(result).toEqual([]);
    });

    it("returns empty when the user has no org units", () => {
        const dataFormOrgUnits = [{ id: "spain", path: "/global/spain" }];

        const result = getCaptureOrgUnitIdsForDataForm(dataFormOrgUnits, []);

        expect(result).toEqual([]);
    });
});
