import { parseBooleanCell, resolveAnyYesWins } from "../booleans";

describe("parseBooleanCell", () => {
    it.each(["y", "yes", "true", "1", "Y", "Yes", "TRUE"])("returns true for the true value %s", value => {
        expect(parseBooleanCell(value)).toBe(true);
    });

    it.each(["n", "no", "false", "0", "N", "No", "FALSE"])("returns false for the false value %s", value => {
        expect(parseBooleanCell(value)).toBe(false);
    });

    it.each([undefined, null, "", "maybe", "2", {}])("returns undefined for the unrecognised input %s", value => {
        expect(parseBooleanCell(value)).toBeUndefined();
    });

    it("accepts boolean and numeric cell values", () => {
        expect(parseBooleanCell(true)).toBe(true);
        expect(parseBooleanCell(false)).toBe(false);
        expect(parseBooleanCell(1)).toBe(true);
        expect(parseBooleanCell(0)).toBe(false);
    });

    it("gives precedence to the option id over the cell value", () => {
        expect(parseBooleanCell("no", "true")).toBe(true);
        expect(parseBooleanCell("yes", "false")).toBe(false);
    });

    it("falls back to the cell value if the option id is not a boolean option", () => {
        expect(parseBooleanCell("yes", "someOtherOptionId")).toBe(true);
        expect(parseBooleanCell("yes", undefined)).toBe(true);
    });
});

describe("resolveAnyYesWins", () => {
    it("returns true if one flag is true", () => {
        expect(resolveAnyYesWins([undefined, false, true])).toBe(true);
    });

    it("returns false if no flag is true and one flag is false", () => {
        expect(resolveAnyYesWins([undefined, false, undefined])).toBe(false);
    });

    it("returns undefined if all flags are undefined", () => {
        expect(resolveAnyYesWins([undefined, undefined])).toBeUndefined();
    });

    it("returns undefined for an empty list", () => {
        expect(resolveAnyYesWins([])).toBeUndefined();
    });
});
