import { buildOrgUnitMode } from "../Dhis2RelationshipTypes";

const orgUnits = [{ id: "ou1" }, { id: "ou2" }];

describe("buildOrgUnitMode", () => {
    describe("on versions before v42", () => {
        it("uses ouMode for non org-unit-requiring modes", () => {
            expect(buildOrgUnitMode("2.41.6", "CAPTURE")).toEqual({ ouMode: "CAPTURE" });
        });

        it("uses ouMode + orgUnit (singular, semicolon-separated) for selected org units", () => {
            expect(buildOrgUnitMode("2.41.6", "SELECTED", orgUnits)).toEqual({
                ouMode: "SELECTED",
                orgUnit: "ou1;ou2",
            });
        });
    });

    describe("on v42 and later", () => {
        it("uses orgUnitMode for non org-unit-requiring modes", () => {
            expect(buildOrgUnitMode("2.42.0", "CAPTURE")).toEqual({ orgUnitMode: "CAPTURE" });
        });

        it("uses orgUnitMode + orgUnits (plural, comma-separated) for selected org units", () => {
            expect(buildOrgUnitMode("2.42.0", "SELECTED", orgUnits)).toEqual({
                orgUnitMode: "SELECTED",
                orgUnits: "ou1,ou2",
            });
        });

        it("treats pre-release builds as their major version (regression for NaN parsing)", () => {
            expect(buildOrgUnitMode("2.44-SNAPSHOT", "SELECTED", orgUnits)).toEqual({
                orgUnitMode: "SELECTED",
                orgUnits: "ou1,ou2",
            });
        });
    });

    it("throws when an org-unit-requiring mode has no org units", () => {
        expect(() => buildOrgUnitMode("2.42.0", "SELECTED", [])).toThrow();
    });
});
