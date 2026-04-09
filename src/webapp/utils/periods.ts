import moment, { Moment } from "moment";
import { DataFormPeriod } from "../../domain/entities/DataForm";

interface Options {
    startDate: Moment;
    endDate: Moment;
    format: string;
    unit: moment.unitOfTime.DurationConstructor;
}

export function buildAllPossiblePeriods(
    periodType: DataFormPeriod | undefined,
    startDate: Moment | undefined,
    endDate: Moment | undefined
): string[] {
    if (!startDate || !endDate) {
        return [];
    }

    if (periodType === undefined) throw new Error("Missing period type");

    switch (periodType) {
        case "Daily":
            return generateDatesByPeriod({ startDate, endDate, format: "YYYYMMDD", unit: "days" });
        case "Monthly":
            return generateDatesByPeriod({ startDate, endDate, format: "YYYYMM", unit: "months" });
        case "Yearly":
            return generateDatesByPeriod({ startDate, endDate, format: "YYYY", unit: "years" });
        case "Weekly":
        case "WeeklyWednesday":
        case "WeeklyThursday":
        case "WeeklySaturday":
        case "WeeklySunday":
            return generateWeeklyPeriods(periodType, startDate, endDate);
        case "BiWeekly":
            return generateBiWeeklyPeriods(startDate, endDate);
        case "BiMonthly":
            return generateBiMonthlyPeriods(startDate, endDate);
        case "Quarterly":
            return generateDatesByPeriod({ startDate, endDate, format: "YYYY[Q]Q", unit: "quarters" });
        case "QuarterlyNov":
            return generateQuarterlyNovPeriods(startDate, endDate);
        case "SixMonthly":
            return generateSixMonthlyPeriods(startDate, endDate);
        case "SixMonthlyApril":
            return generateSixMonthlyAprilPeriods(startDate, endDate);
        case "SixMonthlyNov":
            return generateSixMonthlyNovPeriods(startDate, endDate);
        case "FinancialApril":
        case "FinancialJuly":
        case "FinancialOct":
        case "FinancialNov":
            return generateFinancialPeriods(startDate, endDate, periodType);
        default:
            return assertNever(periodType);
    }
}

function assertNever(value: never): never {
    throw new Error("Unsupported period type: " + value);
}

function generateDatesByPeriod(options: Options): string[] {
    const { startDate, endDate, unit, format } = options;
    const dates: string[] = [];

    for (
        let current: Moment = startDate.clone();
        current.isSameOrBefore(endDate);
        current = current.clone().add(1, unit)
    ) {
        dates.push(current.format(format));
    }
    return dates;
}

type WeeklyPeriodType = "Weekly" | "WeeklyWednesday" | "WeeklyThursday" | "WeeklySaturday" | "WeeklySunday";
function getWeekStartDay(periodType: WeeklyPeriodType): number {
    const dayMap = {
        Weekly: 1,
        WeeklyWednesday: 3,
        WeeklyThursday: 4,
        WeeklySaturday: 6,
        WeeklySunday: 0,
    };
    return dayMap[periodType] ?? 1;
}

function generateWeeklyPeriods(periodType: WeeklyPeriodType, startDate: Moment, endDate: Moment): string[] {
    const dates: string[] = [];
    const startDay: number = getWeekStartDay(periodType);
    const formatSuffix: string = periodType === "Weekly" ? "W" : `${periodType.replace("Weekly", "").substring(0, 3)}W`;

    const alignedStartDate: Moment = startDate.clone().isoWeekday(startDay);
    const weeklyStart: Moment = alignedStartDate.isAfter(startDate)
        ? alignedStartDate.clone().subtract(1, "week")
        : alignedStartDate;

    for (let current: Moment = weeklyStart; current.isSameOrBefore(endDate); current = current.clone().add(1, "week")) {
        dates.push(`${current.isoWeekYear()}${formatSuffix}${current.isoWeek()}`);
    }

    return dates;
}

function getBiWeekStartFromIsoWeek(startDate: Moment): Moment {
    const isoWeekNumber: number = startDate.isoWeek();
    const startWeek: number = isoWeekNumber % 2 === 0 ? isoWeekNumber - 1 : isoWeekNumber;
    return startDate.clone().isoWeekYear(startDate.isoWeekYear()).isoWeek(startWeek).startOf("isoWeek");
}

function generateBiWeeklyPeriods(startDate: Moment, endDate: Moment): string[] {
    const dates: string[] = [];
    const start: Moment = getBiWeekStartFromIsoWeek(startDate);

    for (let current: Moment = start; current.isSameOrBefore(endDate); current = current.clone().add(2, "weeks")) {
        const isoWeek: number = current.isoWeek();
        const biWeekNum: number = Math.ceil(isoWeek / 2);

        dates.push(`${current.isoWeekYear()}BiW${biWeekNum}`);
    }

    return dates;
}

function generateBiMonthlyPeriods(startDate: Moment, endDate: Moment): string[] {
    const dates: string[] = [];

    const startMonth: number = Math.floor(startDate.month() / 2) * 2;
    const monthBeginningDate: Moment = startDate.clone().month(startMonth).startOf("month");

    for (
        let current: Moment = monthBeginningDate;
        current.isSameOrBefore(endDate);
        current = current.clone().add(2, "months")
    ) {
        const biMonthNum: number = Math.floor(current.month() / 2) + 1;
        dates.push(`${current.year()}${String(biMonthNum).padStart(2, "0")}B`);
    }

    return dates;
}

function generateQuarterlyNovPeriods(startDate: Moment, endDate: Moment): string[] {
    const dates: string[] = [];

    const quarterStartDate: Moment = startDate.clone().add(2, "months").startOf("quarter").subtract(2, "months");

    for (
        let current: Moment = quarterStartDate;
        current.isSameOrBefore(endDate);
        current = current.clone().add(3, "months")
    ) {
        const year: number = current.year();
        if (current.month() >= 10) {
            dates.push(`${year + 1}NovQ${1}`);
        } else {
            const quarter: number = Math.floor((current.month() + 2) / 3) + 1;
            dates.push(`${year}NovQ${quarter}`);
        }
    }

    return dates;
}

function generateSixMonthlyPeriods(startDate: Moment, endDate: Moment): string[] {
    const dates: string[] = [];

    const startMonth: number = startDate.month() < 6 ? 0 : 6;
    const sixMonthlyStart: Moment = startDate.clone().month(startMonth).startOf("month");

    for (
        let current: Moment = sixMonthlyStart;
        current.isSameOrBefore(endDate);
        current = current.clone().add(6, "months")
    ) {
        const half: number = current.month() < 6 ? 1 : 2;
        dates.push(`${current.year()}S${half}`);
    }

    return dates;
}

function generateSixMonthlyAprilPeriods(startDate: Moment, endDate: Moment): string[] {
    const dates: string[] = [];

    const year: number = startDate.month() >= 3 ? startDate.year() : startDate.year() - 1;
    const sixMonthlyStart: Moment = moment({ year: year, month: 3, date: 1 });

    for (
        let current: Moment = sixMonthlyStart;
        current.isSameOrBefore(endDate);
        current = current.clone().add(6, "months")
    ) {
        const periodEnd: Moment = current.clone().add(6, "months").subtract(1, "day");
        if (periodEnd.isSameOrAfter(startDate)) {
            const displayYear: number = current.year();
            const semester = current.month() === 3 ? 1 : 2;
            dates.push(`${displayYear}AprilS${semester}`);
        }
    }

    return dates;
}

function generateSixMonthlyNovPeriods(startDate: Moment, endDate: Moment): string[] {
    const dates: string[] = [];

    const sixMonthlyStart: Moment =
        startDate.month() >= 5
            ? moment({ year: startDate.year(), month: 4, date: 1 })
            : moment({ year: startDate.year() - 1, month: 10, date: 1 });

    for (
        let current: Moment = sixMonthlyStart;
        current.isSameOrBefore(endDate);
        current = current.clone().add(6, "months")
    ) {
        const periodEnd: Moment = current.clone().add(6, "months").subtract(1, "day");

        if (periodEnd.isSameOrAfter(startDate)) {
            const isNovStart: boolean = current.month() === 10;
            const semester: number = isNovStart ? 1 : 2;
            const displayYear: number = isNovStart ? current.year() + 1 : current.year();

            dates.push(`${displayYear}NovS${semester}`);
        }
    }

    return dates;
}

type FinancialType = "FinancialApril" | "FinancialJuly" | "FinancialOct" | "FinancialNov";
function generateFinancialPeriods(startDate: Moment, endDate: Moment, financialType: FinancialType): string[] {
    const dates: string[] = [];
    const monthName: string = financialType.replace("Financial", "");
    const startMonthIndex: number = moment().month(monthName).month();

    const firstYear: number = startDate.year();
    const lastYear: number = endDate.year();

    for (let year = firstYear; year <= lastYear; year++) {
        const periodStart: Moment = moment({ year, month: startMonthIndex, date: 1 });
        const periodEnd: Moment = periodStart.clone().add(1, "year").subtract(1, "day");

        if (periodStart.isSameOrAfter(startDate) && periodEnd.isSameOrBefore(endDate)) {
            dates.push(`${year}${monthName}`);
        }
    }

    return dates;
}
