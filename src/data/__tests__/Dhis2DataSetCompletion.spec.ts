import { DataSetPackageData } from "../../domain/entities/DataPackage";
import { DataValueSetsPostResponse } from "../../types/d2-api";
import {
    CompletableDataValue,
    registrationKey,
    resolveCompletableRegistrationKeys,
    resolveRegistrations,
    resolveRequestedRegistrationKeys,
} from "../Dhis2DataSetCompletion";

function buildValue(overrides: Partial<CompletableDataValue> = {}): CompletableDataValue {
    return {
        dataSet: "dataSet1",
        dataElement: "de1",
        period: "202401",
        orgUnit: "ou1",
        attributeOptionCombo: "aoc1",
        categoryOptionCombo: "coc1",
        value: "10",
        ...overrides,
    };
}

function buildEntry(overrides: Partial<DataSetPackageData> = {}): DataSetPackageData {
    return {
        type: "aggregated",
        dataForm: "dataSet1",
        period: "202401",
        orgUnit: "ou1",
        attribute: "aoc1",
        completed: undefined,
        dataValues: [],
        ...overrides,
    };
}

function response(overrides: Partial<DataValueSetsPostResponse> = {}): DataValueSetsPostResponse {
    return {
        responseType: "ImportSummary",
        status: "SUCCESS",
        description: "",
        importOptions: {} as DataValueSetsPostResponse["importOptions"],
        importCount: { imported: 1, updated: 0, ignored: 0, deleted: 0 },
        dataSetComplete: false,
        conflicts: [],
        ...overrides,
    };
}

function warningResponse(conflicts: Array<{ object: string; value: string }>): DataValueSetsPostResponse {
    return response({
        status: "WARNING",
        importCount: { imported: 0, updated: 0, ignored: conflicts.length, deleted: 0 },
        conflicts,
    });
}

describe("resolveCompletableRegistrationKeys", () => {
    it("includes every registration when all chunks return a clean result", () => {
        const entry1 = buildEntry({ orgUnit: "ou1" });
        const entry2 = buildEntry({ orgUnit: "ou2" });
        const value1 = buildValue({ orgUnit: "ou1" });
        const value2 = buildValue({ orgUnit: "ou2" });
        const chunkResults = [response(), response()];

        const keys = resolveCompletableRegistrationKeys([entry1, entry2], [[value1], [value2]], chunkResults);

        expect(keys.sort()).toEqual([registrationKey(value1), registrationKey(value2)].sort());
    });

    it("still includes a registration whose chunk has conflicts - a bad data element shouldn't block completion of the rest", () => {
        const entry = buildEntry({ orgUnit: "ou1" });
        const value1 = buildValue({ orgUnit: "ou1", dataElement: "de1" });
        const value2 = buildValue({ orgUnit: "ou1", dataElement: "de2" });
        // both values share a single chunk and registration, which has one conflict
        const chunkResults = [warningResponse([{ object: "de2", value: "invalid value" }])];

        const keys = resolveCompletableRegistrationKeys([entry], [[value1, value2]], chunkResults);

        expect(keys).toEqual([registrationKey(value1)]);
    });

    it("excludes a registration whose chunk has an unknown (undefined) outcome", () => {
        const entry = buildEntry({ orgUnit: "ou1" });
        const value = buildValue({ orgUnit: "ou1" });
        const chunkResults = [undefined];

        const keys = resolveCompletableRegistrationKeys([entry], [[value]], chunkResults);

        expect(keys).toEqual([]);
    });

    it("excludes a registration if any of the chunks its values touch is unknown, even if others are clean", () => {
        const entry = buildEntry({ orgUnit: "ou1" });
        const value1 = buildValue({ orgUnit: "ou1", dataElement: "de1" });
        const value2 = buildValue({ orgUnit: "ou1", dataElement: "de2" });
        const chunkResults = [response(), undefined];

        const keys = resolveCompletableRegistrationKeys([entry], [[value1], [value2]], chunkResults);

        expect(keys).toEqual([]);
    });

    it("excludes a registration whose chunk was rejected outright (status ERROR), even though the response is non-null", () => {
        const entry = buildEntry({ orgUnit: "ou1" });
        const value = buildValue({ orgUnit: "ou1" });
        const chunkResults = [response({ status: "ERROR" })];

        const keys = resolveCompletableRegistrationKeys([entry], [[value]], chunkResults);

        expect(keys).toEqual([]);
    });

    it("includes a registration that contributed no data values at all - nothing failed for it", () => {
        const entryWithData = buildEntry({ orgUnit: "ou1" });
        const entryWithoutData = buildEntry({ orgUnit: "ou2", dataValues: [] });
        const value = buildValue({ orgUnit: "ou1" });
        const chunkResults = [response()];

        const keys = resolveCompletableRegistrationKeys([entryWithData, entryWithoutData], [[value]], chunkResults);

        expect(keys.sort()).toEqual(
            [
                registrationKey(value),
                registrationKey({
                    dataSet: "dataSet1",
                    period: "202401",
                    orgUnit: "ou2",
                    attributeOptionCombo: "aoc1",
                }),
            ].sort()
        );
    });

    it("keeps two data sets sharing the same period/orgUnit/attributeOptionCombo as distinct registrations", () => {
        const entryA = buildEntry({ dataForm: "dataSetA", orgUnit: "ou1" });
        const entryB = buildEntry({ dataForm: "dataSetB", orgUnit: "ou1" });
        const valueA = buildValue({ dataSet: "dataSetA", orgUnit: "ou1" });
        const valueB = buildValue({ dataSet: "dataSetB", orgUnit: "ou1" });
        // dataSetA's chunk failed outright, dataSetB's succeeded
        const chunkResults = [response({ status: "ERROR" }), response()];

        const keys = resolveCompletableRegistrationKeys([entryA, entryB], [[valueA], [valueB]], chunkResults);

        expect(keys).toEqual([registrationKey(valueB)]);
    });
});

describe("resolveRegistrations", () => {
    const dataEntries: DataSetPackageData[] = [
        buildEntry({ dataForm: "dataSet1", orgUnit: "ou1" }),
        buildEntry({ dataForm: "dataSet1", orgUnit: "ou2" }),
    ];

    it("maps registration keys back to full registrations using dataEntries as source of truth", () => {
        const key = registrationKey({
            dataSet: "dataSet1",
            period: "202401",
            orgUnit: "ou1",
            attributeOptionCombo: "aoc1",
        });

        const registrations = resolveRegistrations(dataEntries, [key]);

        expect(registrations).toEqual([
            { dataSet: "dataSet1", period: "202401", organisationUnit: "ou1", attributeOptionCombo: "aoc1" },
        ]);
    });

    it("drops keys that don't match any known data entry", () => {
        const unknownKey = registrationKey({
            dataSet: "dataSet1",
            period: "202401",
            orgUnit: "unknown",
            attributeOptionCombo: "aoc1",
        });

        const registrations = resolveRegistrations(dataEntries, [unknownKey]);

        expect(registrations).toEqual([]);
    });

    it("keeps registrations for two different data sets that share period/orgUnit/attributeOptionCombo", () => {
        const entries: DataSetPackageData[] = [
            buildEntry({ dataForm: "dataSetA", orgUnit: "ou1" }),
            buildEntry({ dataForm: "dataSetB", orgUnit: "ou1" }),
        ];

        const registrations = resolveRegistrations(entries);

        expect(registrations.sort((a, b) => a.dataSet.localeCompare(b.dataSet))).toEqual([
            { dataSet: "dataSetA", period: "202401", organisationUnit: "ou1", attributeOptionCombo: "aoc1" },
            { dataSet: "dataSetB", period: "202401", organisationUnit: "ou1", attributeOptionCombo: "aoc1" },
        ]);
    });
});

describe("resolveRequestedRegistrationKeys", () => {
    const key = registrationKey({
        dataSet: "dataSet1",
        period: "202401",
        orgUnit: "ou1",
        attributeOptionCombo: "aoc1",
    });

    it("requests a registration whose only row explicitly says Yes, even with the default off", () => {
        const keys = resolveRequestedRegistrationKeys([buildEntry({ completed: true })], false);
        expect(keys).toEqual([key]);
    });

    it("does not request a registration whose only row explicitly says No, even with the default on", () => {
        const keys = resolveRequestedRegistrationKeys([buildEntry({ completed: false })], true);
        expect(keys).toEqual([]);
    });

    it("falls back to the default when the row is blank", () => {
        expect(resolveRequestedRegistrationKeys([buildEntry({ completed: undefined })], true)).toEqual([key]);
        expect(resolveRequestedRegistrationKeys([buildEntry({ completed: undefined })], false)).toEqual([]);
    });

    it("any Yes wins across split-section rows sharing one registration", () => {
        const rows = [
            buildEntry({ completed: false }),
            buildEntry({ completed: true }),
            buildEntry({ completed: undefined }),
        ];
        expect(resolveRequestedRegistrationKeys(rows, false)).toEqual([key]);
    });

    it("all-No/blank rows do not request completion even if one is explicitly No", () => {
        const rows = [buildEntry({ completed: false }), buildEntry({ completed: undefined })];
        expect(resolveRequestedRegistrationKeys(rows, true)).toEqual([]);
    });

    it("keeps distinct registrations independent", () => {
        const rows = [
            buildEntry({ orgUnit: "ou1", completed: true }),
            buildEntry({ orgUnit: "ou2", completed: false }),
        ];
        const keys = resolveRequestedRegistrationKeys(rows, false);
        expect(keys).toEqual([
            registrationKey({ dataSet: "dataSet1", period: "202401", orgUnit: "ou1", attributeOptionCombo: "aoc1" }),
        ]);
    });
});
