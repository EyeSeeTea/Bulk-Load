import { ImportRowLookup } from "../ImportRowLookup";
import { TemplateDataPackage, TemplateDataPackageData } from "../Template";
import { TrackedEntityInstance } from "../TrackedEntityInstance";

function dataEntry(partial: Partial<TemplateDataPackageData>): TemplateDataPackageData {
    return {
        group: 5,
        sheet: "Data Entry",
        dataForm: "form1",
        id: undefined,
        orgUnit: "orgUnitA",
        period: "202401",
        attribute: undefined,
        coordinate: undefined,
        trackedEntityInstance: undefined,
        programStage: undefined,
        geometry: undefined,
        dataValues: [],
        ...partial,
    };
}

describe("ImportRowLookup", () => {
    describe("fromTemplateDataPackage + getLocations", () => {
        it("maps org unit and data element ids to their row and sheet", () => {
            const pkg: TemplateDataPackage = {
                type: "dataSets",
                dataEntries: [
                    dataEntry({
                        group: 7,
                        sheet: "Data Entry",
                        orgUnit: "orgUnitA",
                        dataValues: [{ dataElement: "deX", category: undefined, value: 1, optionId: undefined, contentType: undefined }],
                    }),
                ],
            };

            const lookup = ImportRowLookup.fromTemplateDataPackage(pkg);

            expect(lookup.getLocations(["orgUnitA"])).toEqual([{ sheet: "Data Entry", row: 7 }]);
            expect(lookup.getLocations(["deX"])).toEqual([{ sheet: "Data Entry", row: 7 }]);
            expect(lookup.getLocations(["unknown"])).toEqual([]);
        });

        it("carries column letter from data element values but not from row-level ids", () => {
            const pkg: TemplateDataPackage = {
                type: "dataSets",
                dataEntries: [
                    dataEntry({
                        group: 6,
                        sheet: "Data Entry",
                        orgUnit: "ouB",
                        dataValues: [{ dataElement: "deZ", category: undefined, value: 42, optionId: undefined, contentType: undefined, column: "C" }],
                    }),
                ],
            };

            const lookup = ImportRowLookup.fromTemplateDataPackage(pkg);

            expect(lookup.getLocations(["ouB"])).toEqual([{ sheet: "Data Entry", row: 6 }]);
            expect(lookup.getLocations(["deZ"])).toEqual([{ sheet: "Data Entry", row: 6, column: "C" }]);
        });

        it("indexes the event id, attribute, programStage and option id", () => {
            const pkg: TemplateDataPackage = {
                type: "programs",
                dataEntries: [
                    dataEntry({
                        group: 4,
                        id: "eventA",
                        attribute: "attrA",
                        programStage: "stageA",
                        dataValues: [{ dataElement: "deY", category: "cocA", value: "v", optionId: "optA", contentType: undefined }],
                    }),
                ],
            };

            const lookup = ImportRowLookup.fromTemplateDataPackage(pkg);

            expect(lookup.getLocations(["eventA"])).toEqual([{ sheet: "Data Entry", row: 4 }]);
            expect(lookup.getLocations(["attrA"])).toEqual([{ sheet: "Data Entry", row: 4 }]);
            expect(lookup.getLocations(["stageA"])).toEqual([{ sheet: "Data Entry", row: 4 }]);
            expect(lookup.getLocations(["cocA"])).toEqual([{ sheet: "Data Entry", row: 4 }]);
            expect(lookup.getLocations(["optA"])).toEqual([{ sheet: "Data Entry", row: 4 }]);
        });

        it("collects every row a shared id appears in (deduped)", () => {
            const pkg: TemplateDataPackage = {
                type: "dataSets",
                dataEntries: [
                    dataEntry({ group: 5, orgUnit: "ou" }),
                    dataEntry({ group: 9, orgUnit: "ou" }),
                    dataEntry({ group: 5, orgUnit: "ou" }),
                ],
            };

            const lookup = ImportRowLookup.fromTemplateDataPackage(pkg);

            expect(lookup.getLocations(["ou"])).toEqual([
                { sheet: "Data Entry", row: 5 },
                { sheet: "Data Entry", row: 9 },
            ]);
        });

        it("skips entries without a numeric row (group)", () => {
            const pkg: TemplateDataPackage = {
                type: "programs",
                dataEntries: [dataEntry({ group: undefined, orgUnit: "ou" }), dataEntry({ group: "custom", orgUnit: "ou" })],
            };

            const lookup = ImportRowLookup.fromTemplateDataPackage(pkg);

            expect(lookup.getLocations(["ou"])).toEqual([]);
        });

        it("indexes tracked entity instances using their own row/sheet", () => {
            const tei: TrackedEntityInstance = {
                program: { id: "p" },
                id: "teiA",
                orgUnit: { id: "ouTei" },
                disabled: false,
                row: 12,
                sheet: "TEI Instances",
                attributeValues: [
                    { attribute: { id: "attrTei", valueType: "TEXT" }, value: "x", optionId: "optTei" },
                ],
                enrollment: undefined,
                relationships: [],
                geometry: { type: "none" },
            };

            const pkg: TemplateDataPackage = {
                type: "trackerPrograms",
                dataEntries: [],
                trackedEntityInstances: [tei],
            };

            const lookup = ImportRowLookup.fromTemplateDataPackage(pkg);

            expect(lookup.getLocations(["teiA"])).toEqual([{ sheet: "TEI Instances", row: 12 }]);
            expect(lookup.getLocations(["ouTei"])).toEqual([{ sheet: "TEI Instances", row: 12 }]);
            expect(lookup.getLocations(["attrTei"])).toEqual([{ sheet: "TEI Instances", row: 12 }]);
            expect(lookup.getLocations(["optTei"])).toEqual([{ sheet: "TEI Instances", row: 12 }]);
        });
    });

    describe("formatLocations", () => {
        const lookup = new ImportRowLookup(new Map());

        it("returns an empty string when there are no locations", () => {
            expect(lookup.formatLocations([])).toBe("");
        });

        it("formats a single line with its sheet", () => {
            expect(lookup.formatLocations([{ sheet: "Data Entry", row: 12 }])).toBe(
                "Found in sheet Data Entry, row 12 of the Excel file"
            );
        });

        it("formats multiple lines on the same sheet", () => {
            const result = lookup.formatLocations([
                { sheet: "Data Entry", row: 9 },
                { sheet: "Data Entry", row: 5 },
            ]);
            expect(result).toBe("Found in sheet Data Entry, rows 5, 9 of the Excel file");
        });

        it("caps the list and reports the remainder", () => {
            const locations = [1, 2, 3, 4, 5, 6, 7].map(row => ({ sheet: "Data Entry", row }));
            expect(lookup.formatLocations(locations)).toBe(
                "Found in sheet Data Entry, rows 1, 2, 3, 4, 5 and 2 more of the Excel file"
            );
        });

        it("omits the sheet label when no sheet is known", () => {
            expect(lookup.formatLocations([{ row: 3 }])).toBe("Found in row 3 of the Excel file");
        });

        it("formats a single cell ref when column is known", () => {
            expect(lookup.formatLocations([{ sheet: "Data Entry", row: 6, column: "C" }])).toBe(
                "Found in sheet Data Entry, cell C6 of the Excel file"
            );
        });

        it("formats multiple cell refs when all have columns", () => {
            const result = lookup.formatLocations([
                { sheet: "Data Entry", row: 9, column: "C" },
                { sheet: "Data Entry", row: 5, column: "B" },
            ]);
            expect(result).toBe("Found in sheet Data Entry, cells B5, C9 of the Excel file");
        });

        it("prefers cell ref over row-only location for the same row", () => {
            const result = lookup.formatLocations([
                { sheet: "Data Entry", row: 6, column: "B" },
                { sheet: "Data Entry", row: 6 },
            ]);
            expect(result).toBe("Found in sheet Data Entry, cell B6 of the Excel file");
        });
    });
});
