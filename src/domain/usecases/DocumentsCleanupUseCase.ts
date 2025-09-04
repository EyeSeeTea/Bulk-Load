import { UseCase } from "../../CompositionRoot";
import { DocumentRepository } from "../repositories/DocumentRepository";

export class DocumentsCleanupUseCase implements UseCase {
    constructor(private documentRepository: DocumentRepository) {}

    execute(): Promise<void> {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        return this.documentRepository.delete({ until: oneYearAgo });
    }
}
