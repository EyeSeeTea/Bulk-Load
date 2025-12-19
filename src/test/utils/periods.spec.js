import { describe, it, expect } from "@jest/globals";
import { buildAllPossiblePeriods } from "../../webapp/utils/periods";

// Daily
describe("buildAllPossiblePeriods - Daily", () => {
    it("generates daily periods", () => {
        const result = buildAllPossiblePeriods("Daily", "2024-01-27", "2024-02-02");
        expect(result).toEqual(["20240127", "20240128", "20240129", "20240130", "20240131", "20240201", "20240202"]);
    });
});

// Weekly variants
describe("buildAllPossiblePeriods - Weekly variants", () => {
    it("Weekly generates period for sub-week range", () => {
        const result = buildAllPossiblePeriods("Weekly", "2024-12-30", "2025-01-04");
        expect(result).toEqual(["2025W1"]);
    });
    it("Weekly generates weeks", () => {
        const result = buildAllPossiblePeriods("Weekly", "2024-12-01", "2025-01-15");
        expect(result).toEqual(["2024W48", "2024W49", "2024W50", "2024W51", "2024W52", "2025W1", "2025W2", "2025W3"]);
    });

    it("WeeklyWednesday generates Wed-based weeks", () => {
        const result = buildAllPossiblePeriods("WeeklyWednesday", "2024-01-01", "2024-01-31");
        expect(result).toEqual(["2023WedW52", "2024WedW1", "2024WedW2", "2024WedW3", "2024WedW4", "2024WedW5"]);
    });

    it("WeeklyThursday generates Thu-based weeks", () => {
        const result = buildAllPossiblePeriods("WeeklyThursday", "2024-01-01", "2024-01-31");
        expect(result).toEqual(["2023ThuW52", "2024ThuW1", "2024ThuW2", "2024ThuW3", "2024ThuW4"]);
    });

    it("WeeklySaturday generates Sat-based weeks", () => {
        const result = buildAllPossiblePeriods("WeeklySaturday", "2024-01-01", "2024-01-31");
        expect(result).toEqual(["2023SatW52", "2024SatW1", "2024SatW2", "2024SatW3", "2024SatW4"]);
    });

    it("WeeklySunday generates Sun-based weeks", () => {
        const result = buildAllPossiblePeriods("WeeklySunday", "2024-01-01", "2024-01-31");
        expect(result).toEqual(["2023SunW52", "2024SunW1", "2024SunW2", "2024SunW3", "2024SunW4"]);
    });
});

// Monthly
describe("buildAllPossiblePeriods - Monthly", () => {
    it("generates monthly periods", () => {
        const result = buildAllPossiblePeriods("Monthly", "2023-11-01", "2024-03-31");
        expect(result).toEqual(["202311", "202312", "202401", "202402", "202403"]);
    });
});

// Yearly variants
describe("buildAllPossiblePeriods - Yearly", () => {
    it("generates yearly periods", () => {
        const result = buildAllPossiblePeriods("Yearly", "2020-01-01", "2024-12-31");
        expect(result).toEqual(["2020", "2021", "2022", "2023", "2024"]);
    });

    // Current financial variants dont behave like DHIS2 does, they are yearly periods
    // it("generates FinancialApril periods", () => {
    //     const result = buildAllPossiblePeriods("FinancialApril", "2023-04-01", "2025-06-30");
    //     expect(result).toEqual(["2024April", "2025April"]);
    // });

    // it("generates FinancialJuly periods", () => {
    //     const result = buildAllPossiblePeriods("FinancialJuly", "2023-07-01", "2025-09-30");
    //     expect(result).toEqual(["2024July", "2025July"]);
    // });

    // it("generates FinancialOct periods", () => {
    //     const result = buildAllPossiblePeriods("FinancialOct", "2023-10-01", "2025-12-31");
    //     expect(result).toEqual(["2024Oct", "2025Oct"]);
    // });

    // it("generates FinancialNov periods", () => {
    //     const result = buildAllPossiblePeriods("FinancialNov", "2023-11-01", "2025-03-31");
    //     expect(result).toEqual(["2024Nov", "2025Nov"]);
    // });
});

// Quarterly
describe("buildAllPossiblePeriods - Quarterly", () => {
    it("generates Quarterly periods", () => {
        const result = buildAllPossiblePeriods("Quarterly", "2023-12-01", "2024-12-31");
        expect(result).toEqual(["2023Q4", "2024Q1", "2024Q2", "2024Q3", "2024Q4"]);
    });
});

// SixMonthly
describe("buildAllPossiblePeriods - SixMonthly", () => {
    it("generates periods within same year", () => {
        const result = buildAllPossiblePeriods("SixMonthly", "2024-01-01", "2024-12-31");
        expect(result).toEqual(["2024S1", "2024S2"]);
    });

    it("generates periods across multiple years", () => {
        const result = buildAllPossiblePeriods("SixMonthly", "2023-06-01", "2024-12-31");
        expect(result).toEqual(["2023S1", "2023S2", "2024S1", "2024S2"]);
    });
});

describe("buildAllPossiblePeriods - SixMonthlyApril", () => {
    it("generates periods within same year", () => {
        const result = buildAllPossiblePeriods("SixMonthlyApril", "2024-04-01", "2024-09-30");
        expect(result).toEqual(["2024AprilS1"]);
    });

    it("generates periods across multiple years", () => {
        const result = buildAllPossiblePeriods("SixMonthlyApril", "2022-10-01", "2024-09-30");
        expect(result).toEqual(["2022AprilS2", "2023AprilS1", "2023AprilS2", "2024AprilS1"]);
    });
});

describe("buildAllPossiblePeriods - SixMonthlyNov", () => {
    it("generates periods within same year", () => {
        const result = buildAllPossiblePeriods("SixMonthlyNov", "2025-01-01", "2025-04-30");
        expect(result).toEqual(["2025NovS1"]);
    });

    it("generates periods across multiple years", () => {
        const result = buildAllPossiblePeriods("SixMonthlyNov", "2023-10-01", "2024-12-31");
        expect(result).toEqual(["2023NovS2", "2024NovS1", "2024NovS2", "2025NovS1"]);
    });
});

// BiWeekly
describe("buildAllPossiblePeriods - BiWeekly", () => {
    it("generates biweekly periods across multiple years", () => {
        const result = buildAllPossiblePeriods("BiWeekly", "2024-12-01", "2025-01-31");
        expect(result).toEqual(["2024BiW24", "2024BiW25", "2024BiW26", "2025BiW1", "2025BiW2", "2025BiW3"]);
    });
});

// BiMonthly
describe("buildAllPossiblePeriods - BiMonthly", () => {
    it("generates bimontly periods across multiple years", () => {
        const result = buildAllPossiblePeriods("BiMonthly", "2023-01-01", "2024-03-31");
        expect(result).toEqual([
            "202301B",
            "202302B",
            "202303B",
            "202304B",
            "202305B",
            "202306B",
            "202401B",
            "202402B",
        ]);
    });
});
