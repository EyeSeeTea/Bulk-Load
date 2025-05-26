import i18n from "../../utils/i18n";
import { ofType } from "../../types/utils";
import { Id, NamedRef } from "./ReferenceObject";

export const dataFormTypesMap = {
    dataSets: "dataSet",
    programs: "programs",
    trackerPrograms: "trackerProgram",
} as const;

export const dataFormTypes = Object.keys(dataFormTypesMap) as (keyof typeof dataFormTypesMap)[];
export type DataFormType = typeof dataFormTypes[number];
export type DataFormPeriod = "Daily" | "Monthly" | "Yearly" | "Weekly" | "Quarterly";

export function getTranslations() {
    return {
        dataFormTypes: ofType<Record<DataFormType, string>>({
            dataSets: i18n.t("Data Set"),
            programs: i18n.t("Event Program"),
            trackerPrograms: i18n.t("Tracker Program"),
        }),
    };
}

export interface DataForm {
    type: DataFormType;
    id: Id;
    name: string;
    periodType?: DataFormPeriod;
    dataElements: DataElement[];
    sections: {
        id: Id;
        name: string;
        dataElements: DataElement[];
        repeatable: boolean;
    }[];
    attributeValues: {
        attribute: { code: string };
        value: string;
    }[]; // Only used for versioning, is really being used by any client?
    teiAttributes?: TrackedEntityAttributeType[];
    trackedEntityType?: TrackedEntityType;
    readAccess: boolean;
    writeAccess: boolean;
}

export interface TrackedEntityAttributeType extends NamedRef {
    valueType: DataElementType | undefined;
}

export interface TrackedEntityType {
    id: Id;
    featureType: TrackedEntityTypeFeatureType;
}

export type TrackedEntityTypeFeatureType = "none" | "point" | "polygon";

export interface DataElement {
    id: Id;
    name: string;
    valueType: DataElementType;
    categoryOptionCombos?: Array<{ id: Id; name: string }>;
    options: Array<{ id: Id; code: string }>;
}

export type DataElementType =
    | "TEXT"
    | "LONG_TEXT"
    | "LETTER"
    | "PHONE_NUMBER"
    | "EMAIL"
    | "BOOLEAN"
    | "TRUE_ONLY"
    | "DATE"
    | "DATETIME"
    | "TIME"
    | "NUMBER"
    | "UNIT_INTERVAL"
    | "PERCENTAGE"
    | "INTEGER"
    | "INTEGER_POSITIVE"
    | "INTEGER_NEGATIVE"
    | "INTEGER_ZERO_OR_POSITIVE"
    | "TRACKER_ASSOCIATE"
    | "USERNAME"
    | "COORDINATE"
    | "ORGANISATION_UNIT"
    | "AGE"
    | "URL"
    | "FILE_RESOURCE"
    | "IMAGE";

export interface OrganisationUnit {
    id: Id;
    name: string;
    path: string;
}
