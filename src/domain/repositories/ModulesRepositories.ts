import { MSFModuleMetadataRepository } from "./templates/MSFModuleMetadataRepository";
import { NRCModuleMetadataRepository } from "./templates/NRCModuleMetadataRepository";

export interface ModulesRepositories {
    nrc: NRCModuleMetadataRepository;
    msf: MSFModuleMetadataRepository;
}
