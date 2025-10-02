import { DhisInstance } from "../domain/entities/DhisInstance";
import { User } from "../domain/entities/User";
import { SearchResults, UsersRepository } from "../domain/repositories/UsersRepository";
import { D2ApiDefault, D2OrganisationUnit, D2Api } from "../types/d2-api";

export class D2UsersRepository implements UsersRepository {
    private api: D2Api;

    constructor(localInstance: DhisInstance, mockApi?: D2Api) {
        this.api = mockApi ?? new D2ApiDefault({ baseUrl: localInstance.url });
    }

    async getCurrentUser(): Promise<User> {
        const apiUser = await this.api.currentUser
            .get({
                fields: {
                    id: true,
                    name: true,
                    userCredentials: { username: true },
                    userGroups: { id: true, name: true },
                    authorities: true,
                    dataViewOrganisationUnits: {
                        id: true,
                        level: true,
                        name: true,
                        path: true,
                    },
                    organisationUnits: {
                        id: true,
                        level: true,
                        name: true,
                        path: true,
                    },
                },
            })
            .getData();

        return {
            id: apiUser.id,
            name: apiUser.name,
            username: apiUser.userCredentials.username,
            authorities: new Set(apiUser.authorities),
            userGroups: apiUser.userGroups,
            orgUnitsView: apiUser.dataViewOrganisationUnits.map(this.buildOrgUnit),
            orgUnits: apiUser.organisationUnits.map(this.buildOrgUnit),
        };
    }

    private buildOrgUnit(d2OrgUnit: Pick<D2OrganisationUnit, "id" | "name" | "path" | "level">) {
        return {
            id: d2OrgUnit.id,
            level: d2OrgUnit.level,
            name: d2OrgUnit.name,
            path: d2OrgUnit.path,
        };
    }

    search(query: string): Promise<SearchResults> {
        const options = {
            fields: { id: true, displayName: true },
            filter: { displayName: { ilike: query } },
        };

        return this.api.metadata.get({ users: options, userGroups: options }).getData();
    }
}
