import { chunkDataValuesByPeriod } from "../Dhis2DataValueChunks";

const PERIOD_2024 = "2024";
const PERIOD_2025 = "2025";
const PERIOD_2026 = "2026";

type TestDataValue = Readonly<{ period: string; orgUnit: string; value: string }>;

function buildValue(period: string, orgUnit = "ou1", value = "1"): TestDataValue {
    return { period, orgUnit, value };
}

describe("chunkDataValuesByPeriod", () => {
    describe("when the data values have several periods", () => {
        it("returns one chunk per period, in the order the periods first appear", () => {
            const value2025 = buildValue(PERIOD_2025);
            const value2024 = buildValue(PERIOD_2024);
            const value2026 = buildValue(PERIOD_2026);

            const chunks = chunkDataValuesByPeriod([value2025, value2024, value2026], 1000);

            expect(chunks).toEqual([[value2025], [value2024], [value2026]]);
        });

        it("keeps the values of several org units of the same period in the same chunk", () => {
            const ou1In2024 = buildValue(PERIOD_2024, "ou1");
            const ou2In2024 = buildValue(PERIOD_2024, "ou2");
            const ou1In2025 = buildValue(PERIOD_2025, "ou1");
            const ou2In2025 = buildValue(PERIOD_2025, "ou2");

            const chunks = chunkDataValuesByPeriod([ou1In2024, ou1In2025, ou2In2024, ou2In2025], 1000);

            expect(chunks).toEqual([
                [ou1In2024, ou2In2024],
                [ou1In2025, ou2In2025],
            ]);
        });
    });

    describe("when a period has more values than the chunk size", () => {
        it("splits that period into chunks of the given size", () => {
            const values2024 = ["1", "2", "3"].map(value => buildValue(PERIOD_2024, "ou1", value));
            const value2025 = buildValue(PERIOD_2025);

            const chunks = chunkDataValuesByPeriod([...values2024, value2025], 2);

            expect(chunks).toEqual([[values2024[0], values2024[1]], [values2024[2]], [value2025]]);
        });
    });

    describe("when there are no data values", () => {
        it("returns no chunks", () => {
            expect(chunkDataValuesByPeriod([], 1000)).toEqual([]);
        });
    });
});
