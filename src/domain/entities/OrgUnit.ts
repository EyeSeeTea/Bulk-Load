import { Id, Ref } from "./ReferenceObject";

export interface OrgUnit {
    id: Id;
    path: string;
    name: string;
    level: number;
}

export function buildOrgUnitsParameter(orgUnitsIds: Ref[]): string {
    return orgUnitsIds.map(({ id }) => id).join(";");
}
