import { Id } from "./ReferenceObject";
import { DataPackage, DataPackageData } from "./DataPackage";
import { TrackedEntityInstance } from "./TrackedEntityInstance";

export type FilterOperator =
    | "equals"
    | "notEquals"
    | "contains"
    | "startsWith"
    | "endsWith"
    | "greaterThan"
    | "lessThan"
    | "in"
    | "notIn";

export interface FilterCondition {
    field: string;
    operator: FilterOperator;
    value: string | number | boolean | Array<string | number>;
}

export interface Filter {
    id: Id;
    name: string;
    description?: string;
    conditions: FilterCondition[];
}

export interface TemplateFilter {
    teiFilters?: Filter[];
    dataEntryFilters?: Filter[];
}

export interface FilterResult {
    dataEntries: DataPackageData[];
    trackedEntityInstances?: TrackedEntityInstance[];
}

export function applyFilter(props: {
    dataPackage: DataPackage;
    dataEntryFilter?: Filter;
    teiFilter?: Filter;
}): FilterResult {
    const { dataPackage, teiFilter, dataEntryFilter } = props;
    const filteredDataEntries = dataEntryFilter
        ? dataPackage.dataEntries.filter(entry =>
              dataEntryFilter.conditions.every(condition => matchesCondition(entry, condition))
          )
        : dataPackage.dataEntries;

    if (dataPackage.type === "trackerPrograms") {
        return filterTeiAndEvents(dataPackage.trackedEntityInstances, filteredDataEntries, teiFilter);
    } else {
        return {
            dataEntries: filteredDataEntries,
        };
    }
}

function filterTeiAndEvents(
    teis: TrackedEntityInstance[],
    dataEntries: DataPackageData[],
    teiFilter?: Filter
): FilterResult {
    if (!teiFilter) {
        return {
            trackedEntityInstances: teis,
            dataEntries: dataEntries,
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

function matchesCondition(entry: DataPackageData, condition: FilterCondition): boolean {
    const value = getFieldValue(entry, condition.field);
    return evaluateCondition(value, condition);
}

function matchesTeiCondition(tei: TrackedEntityInstance, condition: FilterCondition): boolean {
    const value = getTeiFieldValue(tei, condition.field);
    return evaluateCondition(value, condition);
}

function getFieldValue(entry: DataPackageData, field: string): any {
    if (field.startsWith("dataValue.")) {
        const dataElementId = field.split(".")[1];
        return entry.dataValues.find(dv => dv.dataElement === dataElementId)?.value;
    }

    const parts = field.split(".");
    return parts.reduce((obj: any, part) => obj?.[part], entry);
}

function getTeiFieldValue(tei: TrackedEntityInstance, field: string): any {
    if (field.startsWith("attribute.")) {
        const attributeId = field.split(".")[1];
        return tei.attributeValues.find(av => av.attribute.id === attributeId)?.value;
    }
    const parts = field.split(".");
    return parts.reduce((obj: any, part) => obj?.[part], tei);
}

function evaluateCondition(value: any, condition: FilterCondition): boolean {
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
