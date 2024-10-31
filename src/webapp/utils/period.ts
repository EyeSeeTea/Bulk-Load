export function isFinancialPeriodType(periodType: FinancialPeriodType): boolean {
    return periodType.startsWith("Financial");
}

export function getFinancialFormat(periodType: FinancialPeriodType): MomentUnitFormat {
    return { unit: "years", format: `YYYY[${periodType.replace("Financial", "")}]` };
}

export type FinancialPeriodType = "FinancialApril" | "FinancialJuly" | "FinancialOct" | "FinancialNov";
export type MomentUnitFormat = {
    unit: string;
    format: string;
};
