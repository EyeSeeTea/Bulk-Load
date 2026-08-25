import { RelationshipOrgUnitFilter } from "../../data/Dhis2RelationshipTypes";
import { DataFormPeriod, DataFormType } from "../entities/DataForm";
import { OrgUnit } from "../entities/OrgUnit";
import { Id, Ref } from "../entities/ReferenceObject";

export interface TemplateMetadata {
    element: MetadataItem;
    // Relationship metadata (relationshipTypes and related TEIs), populated only for tracker
    // programs with downloadRelationships enabled; {} otherwise. Not to be confused with
    // rawMetadata (the dataSet/program's own metadata: categoryOptionCombos, optionSets, etc.).
    relationshipsMetadata: unknown;
    elementMetadata: Map<Id, unknown>;
    organisationUnits: MetadataOrgUnit[];
    rawMetadata: unknown;
}

// This intentionally mirrors the raw DHIS2 dataSet/program response, not the domain DataForm
// entity: SheetBuilder (webapp/logic/sheetBuilder.ts, legacy) reads fields off `element` that
// DataForm doesn't model (categoryCombo, formType, raw programStages with per-stage `access`,
// raw programTrackedEntityAttributes). See TemplateMetadataD2Repository for the full rationale.
export interface MetadataItem {
    id: Id;
    type: DataFormType;
    displayName?: string;
    name?: string;
    // Carried on the raw dataSet/program response fetched internally by
    // TemplateMetadataRepository.get(); used for hierarchy checks (path), unlike the domain
    // OrgUnit entity which also carries `level`.
    organisationUnits: Pick<OrgUnit, "id" | "path" | "name">[];
    periodType?: DataFormPeriod;
    // Present when type === "trackerPrograms" (requested via the internal
    // `trackedEntityType[id,featureType]` field), used by getRelationshipMetadata().
    trackedEntityType?: Ref;
    [key: string]: unknown;
}

// The org unit shape returned by TemplateMetadataRepository.get: fed into SheetBuilderParams.organisationUnits.
export interface MetadataOrgUnit {
    id: Id;
    displayName: string;
    translations: unknown;
    code?: string;
}

export interface GetTemplateMetadataOptions {
    type: DataFormType;
    id: Id;
    orgUnitIds: string[];
    startDate: Date | undefined;
    endDate: Date | undefined;
    populateStartDate?: Date;
    populateEndDate?: Date;
    downloadRelationships: boolean;
    relationshipsOuFilter?: RelationshipOrgUnitFilter;
    orgUnitShortName: boolean;
}

export interface TemplateMetadataRepository {
    get(options: GetTemplateMetadataOptions): Promise<TemplateMetadata>;
}

// SheetBuilderParams (webapp/logic/sheetBuilder.ts, legacy, typed `any`) expects its relationship
// metadata under the field name `metadata`, not `relationshipsMetadata`. Spread this alongside
// `...result` when constructing SheetBuilder so both use cases stay in sync on a rename.
export function toSheetBuilderMetadata(result: TemplateMetadata): { metadata: unknown } {
    return { metadata: result.relationshipsMetadata };
}
