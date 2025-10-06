import { UseCase } from "../../CompositionRoot";
import { DocumentRepository } from "../repositories/DocumentRepository";
import { HistoryRepository } from "../repositories/HistoryRepository";
import { User } from "../entities/User";

export class DocumentsCleanupUseCase implements UseCase {
    constructor(private documentRepository: DocumentRepository, private historyRepository: HistoryRepository) {}

    async execute(cutoffDate: Date, currentUser: User): Promise<void> {
        const deletedDocumentIds = await this.documentRepository.delete({
            until: cutoffDate,
            deletedBy: currentUser.username,
        });
        await this.historyRepository.updateSummaries(
            summary => deletedDocumentIds.includes(summary.documentId),
            summary => ({ ...summary, documentDeleted: true })
        );
    }
}
