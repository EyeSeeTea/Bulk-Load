import { Id } from "../../entities/ReferenceObject";
import { User } from "../../entities/User";
import { NRCModuleMetadata } from "../../entities/templates/NRCModuleMetadata";

export interface NRCModuleMetadataRepository {
    get(options: { currentUser: User; dataSetId: Id }): Promise<NRCModuleMetadata>;
}
