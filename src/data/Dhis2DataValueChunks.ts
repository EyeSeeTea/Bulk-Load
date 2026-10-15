import _ from "lodash";

// DHIS2 only accepts the first period of a dataValueSets request when the data set has data input
// periods (https://dhis2.atlassian.net/browse/DHIS2-22277). Once it is fixed upstream, chunk by size only.
export function chunkDataValuesByPeriod<T extends { period: string }>(
    dataValues: ReadonlyArray<T>,
    chunkSize: number
): T[][] {
    const dataValuesByPeriod = _.groupBy(dataValues, dataValue => dataValue.period);
    const periods = _.uniq(dataValues.map(dataValue => dataValue.period));

    return periods.flatMap(period => _.chunk(dataValuesByPeriod[period] ?? [], chunkSize));
}
