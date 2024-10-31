import { NamedRef, Ref } from "../ReferenceObject";

export interface MSFModuleMetadata {
    dataSet: DataSet;
    categoryOptionCombos: CategoryOptionCombo[];
}

export interface DataSet extends NamedRef {
    dataSetElements: { dataElement: DataElement; categoryCombo: CategoryCombo }[];
    sections: DataSetSection[];
}

export interface GreyedFields extends Ref {
    categoryOptionCombo: Ref;
    dataElement: Ref;
}

export interface DataElement extends NamedRef {
    valueType: string;
}

export interface CategoryCombo extends NamedRef {
    categories: Category[];
}

export interface Category extends NamedRef {
    categoryOptions: CategoryOption[];
}

export interface CategoryOption extends NamedRef {}

export interface DataSetSection extends NamedRef {
    dataElements: Pick<DataElement, "id" | "name">[];
    greyedFields: GreyedFields[];
}

export interface CategoryOptionCombo extends Ref {
    categoryCombo: Ref;
    categoryOptions: CategoryOption[];
}
