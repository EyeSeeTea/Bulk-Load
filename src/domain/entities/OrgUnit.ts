import { Maybe } from "../../types/utils";
import { Id } from "./ReferenceObject";

export interface OrgUnit {
    id: Id;
    path: string;
    name: string;
    level: number;
}

/* An org unit referenced by id, whose name may not be resolvable (deleted or not accessible) */
export interface OrgUnitReference {
    id: Id;
    name: Maybe<string>;
}

export function toOrgUnitReferences(ids: Id[], orgUnits: OrgUnit[]): OrgUnitReference[] {
    return ids.map(id => ({ id, name: orgUnits.find(orgUnit => orgUnit.id === id)?.name }));
}
