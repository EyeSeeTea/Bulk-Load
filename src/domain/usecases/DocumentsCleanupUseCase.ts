import { UseCase } from "../../CompositionRoot";
import { DocumentRepository } from "../repositories/DocumentRepository";
import { HistoryRepository } from "../repositories/HistoryRepository";

export class DocumentsCleanupUseCase implements UseCase {
    constructor(private documentRepository: DocumentRepository, private historyRepository: HistoryRepository) {}

    async execute(): Promise<void> {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const deletedDocumentIds = await this.documentRepository.delete({ until: oneYearAgo });
        await this.historyRepository.updateSummaries(
            summary => deletedDocumentIds.includes(summary.documentId),
            summary => ({ ...summary, documentDeleted: true })
        );
    }
}
