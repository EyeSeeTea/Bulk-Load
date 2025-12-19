import moment from "moment";
import { getFinancialFormat, isFinancialPeriodType } from "./period";

export function buildAllPossiblePeriods(periodType, startDate, endDate) {
    let unit, format;

    if (isFinancialPeriodType(periodType)) {
        const financialUnitFormat = getFinancialFormat(periodType);
        return generateDatesByPeriod({ startDate, endDate, ...financialUnitFormat });
    }

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
        case "Quarterly":
            unit = "quarters";
            format = "YYYY[Q]Q";
            break;
        case "SixMonthly":
            return generateSixMonthlyPeriods(startDate, endDate);
        case "SixMonthlyApril":
            return generateSixMonthlyAprilPeriods(startDate, endDate);
        case "SixMonthlyNov":
            return generateSixMonthlyNovPeriods(startDate, endDate);
        default:
            throw new Error("Unsupported period type");
    }

    return generateDatesByPeriod({ startDate, endDate, format, unit });
}

function generateDatesByPeriod(options) {
    const { startDate, endDate, unit, format } = options;
    const dates = [];
    for (const current = moment(startDate); current.isSameOrBefore(moment(endDate)); current.add(1, unit)) {
        dates.push(current.format(format));
    }
    return dates;
}

function getWeekStartDay(periodType) {
    const dayMap = {
        Weekly: 1,
        WeeklyWednesday: 3,
        WeeklyThursday: 4,
        WeeklySaturday: 6,
        WeeklySunday: 0,
    };
    return dayMap[periodType] ?? 1;
}

function generateWeeklyPeriods(periodType, startDate, endDate) {
    const dates = [];
    const start = moment(startDate);
    const end = moment(endDate);
    const startDay = getWeekStartDay(periodType);

    const current = moment(start).isoWeekday(startDay);
    if (current.isAfter(start)) {
        current.subtract(1, "week");
    }

    const formatSuffix = periodType === "Weekly" ? "W" : periodType.replace("Weekly", "").substr(0, 3) + "W";

    while (current.isSameOrBefore(end)) {
        const weekNum = current.isoWeek();
        dates.push(`${current.isoWeekYear()}${formatSuffix}${weekNum}`);
        current.add(1, "week");
    }

    return dates;
}

function getBiWeekStartFromIsoWeek(startDate) {
    const start = moment(startDate);
    const isoWeekNumber = start.isoWeek();
    const startWeek = isoWeekNumber % 2 === 0 ? isoWeekNumber - 1 : isoWeekNumber;
    return moment(start).isoWeekYear(start.isoWeekYear()).isoWeek(startWeek).startOf("isoWeek");
}

function generateBiWeeklyPeriods(startDate, endDate) {
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

function generateSixMonthlyPeriods(startDate, endDate) {
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

function generateSixMonthlyAprilPeriods(startDate, endDate) {
    const dates = [];
    const start = moment(startDate);
    const end = moment(endDate);

    const year = start.month() >= 3 ? start.year() : start.year() - 1;
    const current = moment({ year: year, month: 3, day: 1 });

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

function generateSixMonthlyNovPeriods(startDate, endDate) {
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
