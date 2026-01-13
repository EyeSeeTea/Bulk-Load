import moment, { Moment } from "moment";
import { DataFormPeriod } from "../../domain/entities/DataForm";

interface Options {
    startDate: Moment;
    endDate: Moment;
    format: string;
    unit: moment.unitOfTime.DurationConstructor;
}

export function buildAllPossiblePeriods(
    periodType: DataFormPeriod,
    startDate: Moment | undefined,
    endDate: Moment | undefined
): string[] {
    if (!startDate || !endDate) {
        return [];
    }

    let unit: moment.unitOfTime.DurationConstructor;
    let format: string;

    switch (periodType) {
        case "Daily":
            unit = "days";
            format = "YYYYMMDD";
            break;
        case "Monthly":
            unit = "months";
            format = "YYYYMM";
            break;
        case "Yearly":
            unit = "years";
            format = "YYYY";
            break;
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
            unit = "quarters";
            format = "YYYY[Q]Q";
            break;
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
            throw new Error("Unsupported period type");
    }

    return generateDatesByPeriod({ startDate, endDate, format, unit });
}

function generateDatesByPeriod(options: Options) {
    const { startDate, endDate, unit, format } = options;
    const dates = [];
    for (const current = moment(startDate); current.isSameOrBefore(moment(endDate)); current.add(1, unit)) {
        dates.push(current.format(format));
    }
    return dates;
}

type WeeklyPeriodType = "Weekly" | "WeeklyWednesday" | "WeeklyThursday" | "WeeklySaturday" | "WeeklySunday";
function getWeekStartDay(periodType: WeeklyPeriodType) {
    const dayMap = {
        Weekly: 1,
        WeeklyWednesday: 3,
        WeeklyThursday: 4,
        WeeklySaturday: 6,
        WeeklySunday: 0,
    };
    return dayMap[periodType] ?? 1;
}

function generateWeeklyPeriods(periodType: WeeklyPeriodType, startDate: Moment, endDate: Moment) {
    const dates = [];
    const start = moment(startDate);
    const end = moment(endDate);
    const startDay = getWeekStartDay(periodType);

    const current = moment(start).isoWeekday(startDay);
    if (current.isAfter(start)) {
        current.subtract(1, "week");
    }

    const formatSuffix = periodType === "Weekly" ? "W" : periodType.replace("Weekly", "").substring(0, 3) + "W";

    while (current.isSameOrBefore(end)) {
        const weekNum = current.isoWeek();
        dates.push(`${current.isoWeekYear()}${formatSuffix}${weekNum}`);
        current.add(1, "week");
    }

    return dates;
}

function getBiWeekStartFromIsoWeek(startDate: Moment) {
    const start = moment(startDate);
    const isoWeekNumber = start.isoWeek();
    const startWeek = isoWeekNumber % 2 === 0 ? isoWeekNumber - 1 : isoWeekNumber;
    return moment(start).isoWeekYear(start.isoWeekYear()).isoWeek(startWeek).startOf("isoWeek");
}

function generateBiWeeklyPeriods(startDate: Moment, endDate: Moment) {
    const dates = [];
    const start = getBiWeekStartFromIsoWeek(startDate);
    const end = moment(endDate);

    const current = start.clone();

    while (current.isSameOrBefore(end)) {
        const isoWeek = current.isoWeek();
        const biWeekNum = Math.ceil(isoWeek / 2);

        dates.push(`${current.isoWeekYear()}BiW${biWeekNum}`);
        current.add(2, "weeks");
    }

    return dates;
}

function generateBiMonthlyPeriods(startDate: Moment, endDate: Moment) {
    const dates = [];
    const start = moment(startDate);
    const end = moment(endDate);

    const startMonth = Math.floor(start.month() / 2) * 2;
    const current = moment(start).month(startMonth).startOf("month");

    while (current.isSameOrBefore(end)) {
        const biMonthNum = Math.floor(current.month() / 2) + 1;
        dates.push(`${current.year()}${String(biMonthNum).padStart(2, "0")}B`);
        current.add(2, "months");
    }

    return dates;
}

function generateQuarterlyNovPeriods(startDate: Moment, endDate: Moment) {
    const dates = [];
    const start = moment(startDate);
    const end = moment(endDate);

    const current = start.add(2, "months").startOf("quarter").subtract(2, "months");

    while (current.isSameOrBefore(end)) {
        const year = current.year();
        if (current.month() >= 10) {
            dates.push(`${year + 1}NovQ${1}`);
        } else {
            const quarter = Math.floor((current.month() + 2) / 3) + 1;
            dates.push(`${year}NovQ${quarter}`);
        }
        current.add(3, "months");
    }

    return dates;
}

function generateSixMonthlyPeriods(startDate: Moment, endDate: Moment) {
    const dates = [];
    const start = moment(startDate);
    const end = moment(endDate);

    const startMonth = start.month() < 6 ? 0 : 6;
    const current = moment(start).month(startMonth).startOf("month");

    while (current.isSameOrBefore(end)) {
        const half = current.month() < 6 ? 1 : 2;
        dates.push(`${current.year()}S${half}`);
        current.add(6, "months");
    }

    return dates;
}

function generateSixMonthlyAprilPeriods(startDate: Moment, endDate: Moment) {
    const dates = [];
    const start = moment(startDate);
    const end = moment(endDate);

    const year = start.month() >= 3 ? start.year() : start.year() - 1;
    const current = moment({ year: year, month: 3, date: 1 });

    while (current.isSameOrBefore(end)) {
        const periodEnd = moment(current).add(6, "months").subtract(1, "day");
        if (periodEnd.isSameOrAfter(start)) {
            const displayYear = current.year();
            const semester = current.month() === 3 ? 1 : 2;
            dates.push(`${displayYear}AprilS${semester}`);
        }
        current.add(6, "months");
    }

    return dates;
}

function generateSixMonthlyNovPeriods(startDate: Moment, endDate: Moment) {
    const dates = [];
    const start = moment(startDate);
    const end = moment(endDate);

    let current;
    if (start.month() >= 5) {
        current = moment({ year: start.year(), month: 4, date: 1 });
    } else {
        current = moment({ year: start.year() - 1, month: 10, date: 1 });
    }

    while (current.isSameOrBefore(end)) {
        const periodEnd = moment(current).add(6, "months").subtract(1, "day");

        if (periodEnd.isSameOrAfter(start)) {
            const isNovStart = current.month() === 10;
            const semester = isNovStart ? 1 : 2;
            const displayYear = isNovStart ? current.year() + 1 : current.year();

            dates.push(`${displayYear}NovS${semester}`);
        }

        current.add(6, "months");
    }

    return dates;
}

type FinancialType = "FinancialApril" | "FinancialJuly" | "FinancialOct" | "FinancialNov";
function generateFinancialPeriods(startDate: Moment, endDate: Moment, financialType: FinancialType) {
    const dates = [];
    const monthName = financialType.replace("Financial", "");
    const startMonthIndex = moment().month(monthName).month();
    const start = moment(startDate);
    const end = moment(endDate);

    const firstYear = start.year();
    const lastYear = end.year();

    for (let year = firstYear; year <= lastYear; year++) {
        const periodStart = moment({ year, month: startMonthIndex, date: 1 });
        const periodEnd = moment(periodStart).add(1, "year").subtract(1, "day");

        if (periodStart.isSameOrAfter(start) && periodEnd.isSameOrBefore(end)) {
            dates.push(`${year}${monthName}`);
        }
    }

    return dates;
}
