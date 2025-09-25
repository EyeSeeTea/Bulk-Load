import { UseCase } from "../../CompositionRoot";
import { DocumentRepository } from "../repositories/DocumentRepository";
import { HistoryRepository } from "../repositories/HistoryRepository";

export class HistoryCleanupUseCase implements UseCase {
    constructor(private historyRepository: HistoryRepository, private documentRepository: DocumentRepository) {}

    async execute(cutoffDate: Date): Promise<void> {
        await this.documentRepository.delete({ until: cutoffDate, keepReference: false });
        await this.historyRepository.delete({ until: cutoffDate });
    }
}
