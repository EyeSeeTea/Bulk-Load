import { Maybe } from "../../../types/utils";
import { i18nShortCode, Id } from "../../entities/ReferenceObject";
import { MSFModuleMetadata } from "../../entities/templates/MSFModuleMetadata";

export interface MSFModuleMetadataRepository {
    get(options: {
        dataSetId: Id;
        catOptionCombinationIds: Id[];
        language: Maybe<i18nShortCode>;
    }): Promise<MSFModuleMetadata>;
}
