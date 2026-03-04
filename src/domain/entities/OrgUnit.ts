import { Id, Ref } from "./ReferenceObject";

export interface OrgUnit {
    id: Id;
    path: string;
    name: string;
    level: number;
}

export function buildOrgUnitsParameter(apiVersion: number, orgUnitsIds: Ref[]): string {
    const separator = apiVersion >= 42 ? "," : ";";
    return orgUnitsIds.map(({ id }) => id).join(separator);
}
