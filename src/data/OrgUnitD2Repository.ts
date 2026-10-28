import _ from "lodash";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { OrgUnit } from "../domain/entities/OrgUnit";
import { Id } from "../domain/entities/ReferenceObject";
import { OrgUnitRepository } from "../domain/repositories/OrgUnitRepository";
import { D2Api } from "../types/d2-api";
import { promiseMap } from "../utils/promises";

// Avoid 414-uri-too-large by splitting ids in chunks
const CHUNK_SIZE = 250;

export class OrgUnitD2Repository implements OrgUnitRepository {
    private api: D2Api;

    constructor({ url }: DhisInstance, mockApi?: D2Api) {
        this.api = mockApi ?? new D2Api({ baseUrl: url });
    }

    /* Org units that are deleted or not accessible to the current user are simply not returned */
    public async getByIds(ids: Id[]): Promise<OrgUnit[]> {
        if (_.isEmpty(ids)) return [];

        const orgUnitsByChunk = await promiseMap(_.chunk(ids, CHUNK_SIZE), async chunkIds => {
            const { objects } = await this.api.models.organisationUnits
                .get({
                    paging: false,
                    fields: { id: true, displayName: true, level: true, path: true },
                    filter: { id: { in: chunkIds } },
                })
                .getData();

            return objects.map(({ displayName, ...orgUnit }) => ({ ...orgUnit, name: displayName }));
        });

        return _.flatten(orgUnitsByChunk);
    }
}
