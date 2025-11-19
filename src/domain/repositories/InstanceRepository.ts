import { Moment } from "moment";
import { RelationshipOrgUnitFilter } from "../../data/Dhis2RelationshipTypes";
import { DataStore } from "../../types/d2-api";
import { Maybe } from "../../types/utils";
import { DataForm, DataFormPermissions, DataFormType } from "../entities/DataForm";
import { DataPackage } from "../entities/DataPackage";
import { AggregatedPackage, EventsPackage } from "../entities/DhisDataPackage";
import { Locale } from "../entities/Locale";
import { OrgUnit } from "../entities/OrgUnit";
import { Id, NamedRef } from "../entities/ReferenceObject";
import { SynchronizationResult } from "../entities/SynchronizationResult";
import { Program, TrackedEntityInstance } from "../entities/TrackedEntityInstance";

export interface GetDataPackageParams {
    type: DataFormType;
    id: Id;
    orgUnits: Id[];
    periods?: Id[];
    startDate?: Moment;
    endDate?: Moment;
    translateCodes?: boolean;
    relationshipsOuFilter?: RelationshipOrgUnitFilter;
    filterTEIEnrollmentDate?: boolean;
}

export interface GetDataFormsParams {
    ids?: string[];
    type?: Array<"dataSets" | "programs">;
    fields?: object;
}

export interface InstanceRepository {
    getDataStore(namespace: string): DataStore;
    getUserOrgUnits(): Promise<OrgUnit[]>;
    getDataForms(options?: GetDataFormsParams): Promise<DataForm[]>;
    getDataFormOrgUnits(type: DataFormType, id: string): Promise<OrgUnit[]>;
    getDataPackage(params: GetDataPackageParams): Promise<DataPackage>;
    getLocales(): Promise<Locale[]>;
    getDefaultIds(filter?: string): Promise<string[]>;
    deleteAggregatedData(dataPackage: DataPackage): Promise<SynchronizationResult>;
    importDataPackage(dataPackage: DataPackage, options: ImportDataPackageOptions): Promise<SynchronizationResult[]>;
    getProgram(programId: Id): Promise<Program | undefined>;
    convertDataPackage(dataPackage: DataPackage): EventsPackage | AggregatedPackage;
    getBuilderMetadata(teis: TrackedEntityInstance[]): Promise<BuilderMetadata>;
    getDataFormPermissions(dataFormIds: Id[]): Promise<DataFormPermissions[]>;
}

export type ImportDataPackageOptions = { createAndUpdate: boolean; multiTextTeiDelimiter: Maybe<string> };

export interface BuilderMetadata {
    orgUnits: Record<Id, NamedRef>;
    options: Record<Id, NamedRef & { code: string }>;
    categoryOptionCombos: Record<Id, NamedRef>;
}

export const emptyBuilderMetadata: BuilderMetadata = {
    orgUnits: {},
    options: {},
    categoryOptionCombos: {},
};
