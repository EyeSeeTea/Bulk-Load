import { OrgUnit } from "../../entities/OrgUnit";
import { Id, Ref } from "../../entities/ReferenceObject";

/* Return the org units of the data form (dataSet/program) the current user can capture data for,
   either directly or through a parent org unit (matched by path). */
export function getCaptureOrgUnitIdsForDataForm(
    dataFormOrgUnits: Array<Ref & { path: string }>,
    userOrgUnits: OrgUnit[]
): Id[] {
    return dataFormOrgUnits
        .filter(dataFormOrgUnit =>
            userOrgUnits.some(
                userOrgUnit =>
                    dataFormOrgUnit.path === userOrgUnit.path ||
                    dataFormOrgUnit.path.startsWith(`${userOrgUnit.path}/`)
            )
        )
        .map(orgUnit => orgUnit.id);
}
