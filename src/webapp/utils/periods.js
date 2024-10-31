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
            unit = "weeks";
            format = "YYYY[W]W";
            break;
        case "Quarterly":
            unit = "quarters";
            format = "YYYY[Q]Q";
            break;
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
