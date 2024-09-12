import { Id, NamedRef, Ref } from "../ReferenceObject";

export interface NRCModuleMetadata {
    dataSet: NamedRef;
    dataElements: DataElement[];
    organisationUnits: OrganisationUnits[];
    periods: Period[];
    categoryCombo: {
        categories: {
            projects?: { categoryOptions: CategoryOption[] };
            phasesOfEmergency?: { categoryOptions: CategoryOption[] };
            targetActual?: { categoryOptions: CategoryOption[] };
        };

        categoryOptionCombos: Array<{ id: Id; name: string; categoryOptions: Ref[] }>;
    };
}

export type CategoryOption = NamedRef;

export interface DataElement extends NamedRef {
    categoryCombo: CategoryCombo;
}

export interface CategoryCombo extends NamedRef {
    categoryOptionCombos: NamedRef[];
}

interface OrganisationUnits extends NamedRef {}

interface Period extends NamedRef {}
