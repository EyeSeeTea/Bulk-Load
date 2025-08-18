import { Id, NamedRef } from "./ReferenceObject";
import { BasePackageDataValue, DataPackage, DataPackageValue, ProgramPackageData } from "./DataPackage";
import { AttributeValue, TrackedEntityInstance } from "./TrackedEntityInstance";
import { Maybe, NestedKeyOf } from "../../types/utils";

//only operator used for now is "equals"
type BasicOperator = "equals" | "notEquals" | "greaterThan" | "lessThan";
type ArrayOperator = "in" | "notIn";

type DataValueField = NestedKeyOf<BasePackageDataValue, `dataValue.${Id}.`>;
type AttributeField = NestedKeyOf<AttributeValue, `attribute.${Id}.`>;
type ProgramPackageDataNestedField = NestedKeyOf<ProgramPackageData>;
type TeiNestedField = NestedKeyOf<TrackedEntityInstance>;

type FilterField = DataValueField | AttributeField | ProgramPackageDataNestedField | TeiNestedField;

type FilterCondition = { field: FilterField } & (
    | {
          operator: BasicOperator;
          value: FieldValue;
      }
    | {
          operator: ArrayOperator;
          value: Array<FieldValue>;
      }
);

export type TemplateDataFilter = NamedRef & {
    description?: string;
    conditions: FilterCondition[];
};

export type TemplateFilter = {
    label?: string;
    filters: TemplateDataFilter[];
};

//filters are only available for trackerPrograms for now
//but implementation supports event programs and user of other operators as well
export function applyFilter(
    props: ApplyFilterProps & {
        dataPackage: DataPackage;
    }
): DataPackage {
    const { dataPackage, teiFilter, dataEntryFilter } = props;
    switch (dataPackage.type) {
        case "dataSets":
            return dataPackage;
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
                trackedEntityInstances: filteredResult.trackedEntityInstances,
                dataEntries: filteredResult.dataEntries,
            };
        }
    }
}

function filterDataEntries<T extends ProgramPackageData>(dataEntries: T[], filter?: TemplateDataFilter): T[] {
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
    trackedEntityInstances: TrackedEntityInstance[];
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

function matchesCondition<T extends ProgramPackageData>(entry: T, condition: FilterCondition): boolean {
    const value = getFieldValue(entry, condition.field);
    return evaluateCondition(value, condition);
}

function matchesTeiCondition(tei: TrackedEntityInstance, condition: FilterCondition): boolean {
    const value = getTeiFieldValue(tei, condition.field);
    return evaluateCondition(value, condition);
}

function getFieldValue<T extends ProgramPackageData>(entry: T, field: FilterField): Maybe<FieldValue> {
    if (field.startsWith("dataValue.") && "dataValues" in entry) {
        const [, dataElementId, ...rest] = field.split(".");
        const dataElement = entry.dataValues.find(dv => dv.dataElement === dataElementId);
        return dataElement ? getNestedValue(dataElement, rest) : undefined;
    }

    const parts = field.split(".");
    return getNestedValue(entry, parts);
}

function getTeiFieldValue(tei: TrackedEntityInstance, field: FilterField): Maybe<FieldValue> {
    if (field.startsWith("attribute.")) {
        const [, attributeId, ...rest] = field.split(".");
        const attribute = tei.attributeValues.find(av => av.attribute.id === attributeId);
        return attribute ? getNestedValue(attribute as unknown as Record<string, unknown>, rest) : undefined;
    }
    const parts = field.split(".");
    return getNestedValue(tei as unknown as Record<string, unknown>, parts);
}

function getNestedValue(obj: Record<string, unknown>, parts: string[]): Maybe<FieldValue> {
    const value = parts.reduce<unknown>((acc, part) => {
        if (acc == null) return undefined;
        if (typeof acc !== "object") return acc;
        return (acc as Record<string, unknown>)[part];
    }, obj);

    return isFieldValue(value) ? value : undefined;
}

function isFieldValue(value: unknown): value is FieldValue {
    return (
        typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date
    );
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
        case "greaterThan":
            return Number(value) > Number(condition.value);
        case "lessThan":
            return Number(value) < Number(condition.value);
        case "in":
            return condition.value.includes(value);
        case "notIn":
            return !condition.value.includes(value);
        default:
            return false;
    }
}

type ApplyFilterProps = {
    dataEntryFilter?: TemplateDataFilter;
    teiFilter?: TemplateDataFilter;
};

type FieldValue = DataPackageValue | Date;
