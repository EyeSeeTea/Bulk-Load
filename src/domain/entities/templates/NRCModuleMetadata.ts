import { Id, NamedRef, Ref } from "../ReferenceObject";

export interface NRCModuleMetadata {
    dataSet: NamedRef;
    dataElements: DataElement[];
    organisationUnits: OrganisationUnits[];
    periods: Period[];
    categoryCombo: {
        categories: {
            project: { categoryOption: NamedRef };
            phasesOfEmergency: { categoryOptions: NamedRef[] };
            targetActual: { categoryOptions: NamedRef[] };
        };
        categoryOptionCombos: Array<{ id: Id; name: string; categoryOptions: Ref[] }>;
    };
}

export interface DataElement extends NamedRef {
    categoryCombo: CategoryCombo;
}

export interface CategoryCombo extends NamedRef {
    categoryOptionCombos: NamedRef[];
}

interface OrganisationUnits extends NamedRef {}

interface Period extends NamedRef {}
