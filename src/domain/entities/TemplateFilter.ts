import { Id } from "./ReferenceObject";
import { BasePackageData, DataPackage, DataPackageValue, ProgramPackageData } from "./DataPackage";
import { TrackedEntityInstance } from "./TrackedEntityInstance";
import { Maybe } from "../../types/utils";

//only operator used for now is "equals"
type FilterOperator =
    | "equals"
    | "notEquals"
    | "contains"
    | "startsWith"
    | "endsWith"
    | "greaterThan"
    | "lessThan"
    | "in"
    | "notIn";

type FilterCondition = {
    field: string;
    operator: FilterOperator;
    value: FieldValue | Array<FieldValue>;
};

type Filter = {
    id: Id;
    name: string;
    description?: string;
    conditions: FilterCondition[];
};

export type TemplateFilter = {
    teiFilters?: Filter[];
    dataEntryFilters?: Filter[];
};

export function applyFilter(
    props: ApplyFilterProps & {
        dataPackage: DataPackage;
    }
): DataPackage {
    const { dataPackage, teiFilter, dataEntryFilter } = props;
    switch (dataPackage.type) {
        case "dataSets":
            return {
                ...dataPackage,
                dataEntries: filterDataEntries(dataPackage.dataEntries, dataEntryFilter),
            };
        case "programs":
            return {
                ...dataPackage,
                dataEntries: filterDataEntries(dataPackage.dataEntries, dataEntryFilter),
            };
        case "trackerPrograms": {
            const filteredResult = filterTeiAndEvents({
                teis: dataPackage.trackedEntityInstances,
                dataEntries: dataPackage.dataEntries,
                teiFilter,
                dataEntryFilter,
            });
            return {
                ...dataPackage,
                trackedEntityInstances: filteredResult.trackedEntityInstances || [],
                dataEntries: filteredResult.dataEntries,
            };
        }
    }
}

function filterDataEntries<T extends BasePackageData>(dataEntries: T[], filter?: Filter): T[] {
    if (!filter) {
        return dataEntries;
    } else {
        return dataEntries.filter(entry => filter.conditions.every(condition => matchesCondition(entry, condition)));
    }
}

function filterTeiAndEvents(
    props: ApplyFilterProps & {
        teis: TrackedEntityInstance[];
        dataEntries: ProgramPackageData[];
    }
): {
    dataEntries: ProgramPackageData[];
    trackedEntityInstances?: TrackedEntityInstance[];
} {
    const { teis, dataEntries, teiFilter, dataEntryFilter } = props;
    const filteredDataEntries = filterDataEntries(dataEntries, dataEntryFilter);
    if (!teiFilter) {
        return {
            trackedEntityInstances: teis,
            dataEntries: filteredDataEntries,
        };
    } else {
        const filteredTeis = teis.filter(tei =>
            teiFilter.conditions.every(condition => matchesTeiCondition(tei, condition))
        );
        const filteredDataEntries = dataEntries.filter(entry =>
            filteredTeis.some(tei => tei.id === entry.trackedEntityInstance)
        );
        return {
            trackedEntityInstances: filteredTeis,
            dataEntries: filteredDataEntries,
        };
    }
}

function matchesCondition<T extends BasePackageData>(entry: T, condition: FilterCondition): boolean {
    const value = getFieldValue(entry, condition.field);
    return evaluateCondition(value, condition);
}

function matchesTeiCondition(tei: TrackedEntityInstance, condition: FilterCondition): boolean {
    const value = getTeiFieldValue(tei, condition.field);
    return evaluateCondition(value, condition);
}

function getFieldValue<T extends BasePackageData>(entry: T, field: string): Maybe<FieldValue> {
    if (field.startsWith("dataValue.")) {
        const dataElementId = field.split(".")[1];
        return entry.dataValues.find(dv => dv.dataElement === dataElementId)?.value;
    }

    const parts = field.split(".");
    return getNestedValue(entry, parts);
}

function getTeiFieldValue(tei: TrackedEntityInstance, field: string): Maybe<FieldValue> {
    if (field.startsWith("attribute.")) {
        const attributeId = field.split(".")[1];
        return tei.attributeValues.find(av => av.attribute.id === attributeId)?.value;
    }
    const parts = field.split(".");
    return getNestedValue(tei as unknown as Record<string, unknown>, parts);
}

function getNestedValue(obj: Record<string, unknown>, parts: string[]): Maybe<FieldValue> {
    let current: unknown = obj;

    for (const part of parts) {
        if (current == null || typeof current !== "object") {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    // Type guard to ensure we return only valid field values
    if (
        typeof current === "string" ||
        typeof current === "number" ||
        typeof current === "boolean" ||
        current instanceof Date
    ) {
        return current as FieldValue;
    }

    return undefined;
}

function evaluateCondition(value: Maybe<FieldValue>, condition: FilterCondition): boolean {
    if (value === undefined || value === null) {
        return false;
    }

    switch (condition.operator) {
        case "equals":
            return value === condition.value;
        case "notEquals":
            return value !== condition.value;
        case "contains":
            return String(value).includes(String(condition.value));
        case "startsWith":
            return String(value).startsWith(String(condition.value));
        case "endsWith":
            return String(value).endsWith(String(condition.value));
        case "greaterThan":
            return Number(value) > Number(condition.value);
        case "lessThan":
            return Number(value) < Number(condition.value);
        case "in":
            return Array.isArray(condition.value) && condition.value.includes(value);
        case "notIn":
            return Array.isArray(condition.value) && !condition.value.includes(value);
        default:
            return false;
    }
}

type ApplyFilterProps = {
    dataEntryFilter?: Filter;
    teiFilter?: Filter;
};

type FieldValue = DataPackageValue | Date;
