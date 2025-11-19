export type DuplicateImportStrategy = "ERROR" | "IMPORT" | "IGNORE" | "IMPORT_WITHOUT_DELETE";
export type OrganisationUnitImportStrategy = "ERROR" | "IGNORE";

export interface ImportTemplateConfiguration {
    useBuilderOrgUnits?: boolean;
    selectedOrgUnits?: string[];
    duplicateStrategy?: DuplicateImportStrategy;
    organisationUnitStrategy?: OrganisationUnitImportStrategy;
}
