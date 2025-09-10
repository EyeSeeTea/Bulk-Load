import { Id, NamedRef } from "./ReferenceObject";

export type DataElementDisaggregationsMapping = Map<
    DataElementId,
    {
        categoryOptionCombos: CategoryOptionCombo[];
    }
>;

export type DataElementId = Id;

export type CategoryOptionCombo = NamedRef;
