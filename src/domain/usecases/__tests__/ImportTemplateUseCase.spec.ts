import { templateDataEntry, templateDataValue as dataValue } from "../../../test/fixtures/template";
import { DataForm } from "../../entities/DataForm";
import { TemplateDataPackage, TemplateDataPackageData } from "../../entities/Template";
import { buildCompletionOnlyPackage, compareDataPackages } from "../ImportTemplateUseCase";

const eventProgram: Pick<DataForm, "type" | "id"> = { type: "programs", id: "program1" };
const dataSet: Pick<DataForm, "type" | "id"> = { type: "dataSets", id: "dataSet1" };

function dataEntry(partial: Partial<TemplateDataPackageData> = {}): TemplateDataPackageData {
    return templateDataEntry({
        dataForm: "program1",
        period: "2024-01-15",
        dataValues: [dataValue()],
        ...partial,
    });
}

function isDuplicate(
    dataForm: Pick<DataForm, "type" | "id">,
    base: Partial<TemplateDataPackageData>,
    compare: TemplateDataPackageData,
    options: { exclusions?: string[]; defaultCategory?: string } = {}
): boolean {
    const { exclusions = [], defaultCategory } = options;

    return compareDataPackages(dataForm, base, compare, { [dataForm.id]: exclusions }, 1, "day", defaultCategory);
}

describe("compareDataPackages", () => {
    describe("event programs", () => {
        it("detects a row without id that matches an existing event", () => {
            expect(isDuplicate(eventProgram, dataEntry(), dataEntry())).toBe(true);
        });

        it("still detects the duplicate if the row has a completion value", () => {
            expect(isDuplicate(eventProgram, dataEntry({ completed: true }), dataEntry())).toBe(true);
            expect(isDuplicate(eventProgram, dataEntry({ completed: false }), dataEntry())).toBe(true);
        });

        it("does not detect a duplicate if the row has the id of the existing event", () => {
            const base = dataEntry({ id: "event1" });
            const compare = dataEntry({ id: "event1" });

            expect(isDuplicate(eventProgram, base, compare)).toBe(false);
        });

        it("does not detect a duplicate if the org unit is different", () => {
            expect(isDuplicate(eventProgram, dataEntry({ orgUnit: "orgUnit2" }), dataEntry())).toBe(false);
        });

        it("does not detect a duplicate if the data values are different", () => {
            const base = dataEntry({ dataValues: [dataValue({ value: "20" })] });

            expect(isDuplicate(eventProgram, base, dataEntry())).toBe(false);
        });

        it("does not detect a duplicate if the period is outside the tolerance range", () => {
            const base = dataEntry({ period: "2024-01-20" });

            expect(isDuplicate(eventProgram, base, dataEntry())).toBe(false);
        });

        it("ignores excluded data elements when it compares data values", () => {
            const base = dataEntry({ dataValues: [dataValue(), dataValue({ dataElement: "de2", value: "20" })] });
            const compare = dataEntry({ dataValues: [dataValue(), dataValue({ dataElement: "de2", value: "99" })] });

            expect(isDuplicate(eventProgram, base, compare, { exclusions: ["de2"] })).toBe(true);
            expect(isDuplicate(eventProgram, base, compare)).toBe(false);
        });
    });

    describe("data sets", () => {
        const aggregatedEntry = (partial: Partial<TemplateDataPackageData> = {}) =>
            dataEntry({ dataForm: "dataSet1", period: "202401", ...partial });

        it("detects a row that has a data value for the same data element and category", () => {
            expect(isDuplicate(dataSet, aggregatedEntry(), aggregatedEntry())).toBe(true);
        });

        it("still detects the duplicate if the row has a completion value", () => {
            expect(isDuplicate(dataSet, aggregatedEntry({ completed: true }), aggregatedEntry())).toBe(true);
            expect(isDuplicate(dataSet, aggregatedEntry({ completed: false }), aggregatedEntry())).toBe(true);
        });

        it("does not detect a duplicate if the period is different", () => {
            const base = aggregatedEntry({ period: "202402" });

            expect(isDuplicate(dataSet, base, aggregatedEntry())).toBe(false);
        });

        it("does not detect a duplicate if no data element matches", () => {
            const base = aggregatedEntry({ dataValues: [dataValue({ dataElement: "de2" })] });

            expect(isDuplicate(dataSet, base, aggregatedEntry())).toBe(false);
        });

        it("uses the default category to compare data values", () => {
            const base = aggregatedEntry({ dataValues: [dataValue({ category: "default" })] });

            expect(isDuplicate(dataSet, base, aggregatedEntry(), { defaultCategory: "default" })).toBe(true);
        });
    });
});

describe("buildCompletionOnlyPackage", () => {
    const dataSetPackage = (dataEntries: TemplateDataPackageData[]): TemplateDataPackage => ({
        type: "dataSets",
        dataEntries,
    });

    it("keeps only the rows flagged as completed and strips their data values", () => {
        const completedRow = dataEntry({ orgUnit: "ou1", completed: true, dataValues: [dataValue()] });
        const notFlaggedRow = dataEntry({ orgUnit: "ou2", completed: undefined });
        const notCompletedRow = dataEntry({ orgUnit: "ou3", completed: false });

        const result = buildCompletionOnlyPackage(dataSetPackage([completedRow, notFlaggedRow, notCompletedRow]));

        expect(result).toEqual({
            type: "dataSets",
            dataEntries: [expect.objectContaining({ orgUnit: "ou1", completed: true, dataValues: [] })],
        });
    });

    it("returns undefined if no row is flagged as completed", () => {
        const rows = [dataEntry({ completed: undefined }), dataEntry({ completed: false })];

        expect(buildCompletionOnlyPackage(dataSetPackage(rows))).toBeUndefined();
    });

    it("returns undefined for a non-aggregated package", () => {
        const eventRows = [dataEntry({ dataForm: "program1", completed: true })];
        const eventPackage: TemplateDataPackage = { type: "programs", dataEntries: eventRows };

        expect(buildCompletionOnlyPackage(eventPackage)).toBeUndefined();
    });
});
