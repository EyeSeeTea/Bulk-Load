import {
    DataSetCategoryOption,
    TemplateElement,
    getCategoryOptionIdsToInclude,
} from "../DownloadTemplateUseCase";

function givenADataSet(organisationUnitIds: string[]): TemplateElement {
    return { type: "dataSets", organisationUnits: organisationUnitIds.map(id => ({ id })) };
}

function givenACategoryOption(options: {
    id: string;
    organisationUnitIds?: string[];
    startDate?: string;
    endDate?: string;
}): DataSetCategoryOption {
    const { id, organisationUnitIds = [], startDate, endDate } = options;
    return { id, startDate, endDate, organisationUnits: organisationUnitIds.map(ouId => ({ id: ouId })) };
}

describe("getCategoryOptionIdsToInclude", () => {
    it("includes a category option with no org units regardless of the requested org units", () => {
        const dataSet = givenADataSet(["ou1"]);
        const categoryOptions = [givenACategoryOption({ id: "co1" })];

        const result = getCategoryOptionIdsToInclude(dataSet, ["ou1"], categoryOptions, {
            startDate: undefined,
            endDate: undefined,
        });

        expect(result).toEqual(new Set(["co1"]));
    });

    it("includes a category option whose org units overlap the dataSet org units when none are requested", () => {
        const dataSet = givenADataSet(["ou1", "ou2"]);
        const categoryOptions = [givenACategoryOption({ id: "co1", organisationUnitIds: ["ou2"] })];

        const result = getCategoryOptionIdsToInclude(dataSet, [], categoryOptions, {
            startDate: undefined,
            endDate: undefined,
        });

        expect(result).toEqual(new Set(["co1"]));
    });

    it("excludes a category option whose org units are outside the dataSet org units", () => {
        const dataSet = givenADataSet(["ou1", "ou2"]);
        const categoryOptions = [givenACategoryOption({ id: "co1", organisationUnitIds: ["ou3"] })];

        const result = getCategoryOptionIdsToInclude(dataSet, [], categoryOptions, {
            startDate: undefined,
            endDate: undefined,
        });

        expect(result).toEqual(new Set());
    });

    it("restricts to the intersection of requested org units and dataSet org units", () => {
        const dataSet = givenADataSet(["ou1", "ou2"]);
        const categoryOptions = [
            givenACategoryOption({ id: "co1", organisationUnitIds: ["ou1"] }),
            givenACategoryOption({ id: "co2", organisationUnitIds: ["ou2"] }),
        ];

        // ou2 is requested but not part of the dataSet, so it's dropped from the intersection.
        const result = getCategoryOptionIdsToInclude(dataSet, ["ou1", "ou3"], categoryOptions, {
            startDate: undefined,
            endDate: undefined,
        });

        expect(result).toEqual(new Set(["co1"]));
    });

    it("includes a category option with no start/end date regardless of the requested date range", () => {
        const dataSet = givenADataSet([]);
        const categoryOptions = [givenACategoryOption({ id: "co1" })];

        const result = getCategoryOptionIdsToInclude(dataSet, [], categoryOptions, {
            startDate: new Date("2024-06-01"),
            endDate: new Date("2024-06-30"),
        });

        expect(result).toEqual(new Set(["co1"]));
    });

    it("includes a category option whose date range overlaps the requested range", () => {
        const dataSet = givenADataSet([]);
        const categoryOptions = [
            givenACategoryOption({ id: "co1", startDate: "2024-01-01", endDate: "2024-12-31" }),
        ];

        const result = getCategoryOptionIdsToInclude(dataSet, [], categoryOptions, {
            startDate: new Date("2024-06-01"),
            endDate: new Date("2024-06-30"),
        });

        expect(result).toEqual(new Set(["co1"]));
    });

    it("excludes a category option that ends before the requested range starts", () => {
        const dataSet = givenADataSet([]);
        const categoryOptions = [
            givenACategoryOption({ id: "co1", startDate: "2023-01-01", endDate: "2023-12-31" }),
        ];

        const result = getCategoryOptionIdsToInclude(dataSet, [], categoryOptions, {
            startDate: new Date("2024-06-01"),
            endDate: new Date("2024-06-30"),
        });

        expect(result).toEqual(new Set());
    });

    it("excludes a category option that starts after the requested range ends", () => {
        const dataSet = givenADataSet([]);
        const categoryOptions = [
            givenACategoryOption({ id: "co1", startDate: "2025-01-01", endDate: "2025-12-31" }),
        ];

        const result = getCategoryOptionIdsToInclude(dataSet, [], categoryOptions, {
            startDate: new Date("2024-06-01"),
            endDate: new Date("2024-06-30"),
        });

        expect(result).toEqual(new Set());
    });
});
