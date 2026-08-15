import { OrgUnit } from "../entities/OrgUnit";
import { Id } from "../entities/ReferenceObject";

export interface OrgUnitRepository {
    getByIds(ids: Id[]): Promise<OrgUnit[]>;
}
