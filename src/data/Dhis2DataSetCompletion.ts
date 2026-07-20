import _ from "lodash";
import { AggregatedDataValue } from "../domain/entities/DhisDataPackage";
import { DataSetPackageData } from "../domain/entities/DataPackage";
import { Id } from "../domain/entities/ReferenceObject";
import { Maybe } from "../types/utils";
import { DataValueSetsPostResponse } from "../types/d2-api";
import { resolveAnyYesWins } from "../utils/booleans";

export interface Registration {
    dataSet: Id;
    period: string;
    organisationUnit: Id;
    attributeOptionCombo: Maybe<Id>;
}

export type CompletableDataValue = AggregatedDataValue & { dataSet: Id };

export function registrationKey(registrationInfo: {
    dataSet: Id;
    period: string;
    orgUnit: Id;
    attributeOptionCombo?: Id;
}): string {
    const { dataSet, period, orgUnit, attributeOptionCombo } = registrationInfo;
    return [dataSet, period, orgUnit, attributeOptionCombo].join("-");
}

export function nonDefaultId(id: Maybe<Id>, defaultIds: string[]): Maybe<Id> {
    return id && defaultIds.includes(id) ? undefined : id;
}

function entryRegistrationKey(
    entry: Pick<DataSetPackageData, "dataForm" | "period" | "orgUnit" | "attribute">
): string {
    return registrationKey({
        dataSet: entry.dataForm,
        period: entry.period,
        orgUnit: entry.orgUnit,
        attributeOptionCombo: entry.attribute,
    });
}

export function resolveCompletableRegistrationKeys(
    dataEntries: DataSetPackageData[],
    chunks: CompletableDataValue[][],
    chunkResults: Array<Maybe<DataValueSetsPostResponse>>
): string[] {
    const chunkIndexesByKey = _.mapValues(
        _.groupBy(
            chunks.flatMap((chunk, chunkIndex) => chunk.map(value => ({ key: registrationKey(value), chunkIndex }))),
            entry => entry.key
        ),
        entries => _.uniq(entries.map(entry => entry.chunkIndex))
    );

    return _.uniq(dataEntries.map(entryRegistrationKey)).filter(key => {
        const chunkIndexes = chunkIndexesByKey[key];
        // No values were sent for this registration (e.g. all filtered out) — nothing failed, so it's completable.
        if (!chunkIndexes) return true;

        return chunkIndexes.every(index => {
            const result = chunkResults[index];
            return result !== undefined && result.status !== "ERROR";
        });
    });
}

export type CompleteDataSetRegistrationsGetResponse = {
    completeDataSetRegistrations: Array<{
        dataSet: Id;
        period: string;
        organisationUnit: Id;
        attributeOptionCombo?: Id;
        completed?: boolean;
    }>;
};

export function buildCompletionLookup(
    registrations: CompleteDataSetRegistrationsGetResponse["completeDataSetRegistrations"],
    defaultIds: string[]
): Set<string> {
    return new Set(
        registrations
            .filter(registration => registration.completed !== false)
            .map(registration =>
                registrationKey({
                    dataSet: registration.dataSet,
                    period: registration.period,
                    orgUnit: registration.organisationUnit,
                    attributeOptionCombo: nonDefaultId(registration.attributeOptionCombo, defaultIds),
                })
            )
    );
}

export function resolveRequestedRegistrationKeys(
    dataEntries: DataSetPackageData[],
    defaultMarkCompleted: boolean
): string[] {
    const requestedEntriesByKey = _.pickBy(
        _.groupBy(dataEntries, entryRegistrationKey),
        entries => resolveAnyYesWins(entries.map(entry => entry.completed)) ?? defaultMarkCompleted
    );
    return Object.keys(requestedEntriesByKey);
}

export function resolveRegistrations(
    dataEntries: DataSetPackageData[],
    keys: Iterable<string> = dataEntries.map(entryRegistrationKey)
): Registration[] {
    const registrationsByKey = new Map<string, Registration>(
        dataEntries.map(entry => [
            entryRegistrationKey(entry),
            {
                dataSet: entry.dataForm,
                period: entry.period,
                organisationUnit: entry.orgUnit,
                attributeOptionCombo: entry.attribute,
            },
        ])
    );

    return _.uniq(Array.from(keys))
        .map(key => registrationsByKey.get(key))
        .filter((registration): registration is Registration => registration !== undefined);
}
