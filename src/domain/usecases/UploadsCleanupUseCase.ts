import { UseCase } from "../../CompositionRoot";
import { FileRepository } from "../repositories/FileRepository";

export class UploadsCleanupUseCase implements UseCase {
    constructor(private fileRepository: FileRepository) {}

    execute(): Promise<void> {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        return this.fileRepository.deleteDocuments({ until: oneYearAgo });
    }
}
