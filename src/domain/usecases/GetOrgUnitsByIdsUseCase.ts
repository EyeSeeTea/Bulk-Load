import { UseCase } from "../../CompositionRoot";
import { OrgUnit } from "../entities/OrgUnit";
import { Id } from "../entities/ReferenceObject";
import { OrgUnitRepository } from "../repositories/OrgUnitRepository";

export class GetOrgUnitsByIdsUseCase implements UseCase {
    constructor(private orgUnitRepository: OrgUnitRepository) {}

    public async execute(ids: Id[]): Promise<OrgUnit[]> {
        return this.orgUnitRepository.getByIds(ids);
    }
}
