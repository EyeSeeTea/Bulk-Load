import { UseCase } from "../../CompositionRoot";
import { DocumentRepository } from "../repositories/DocumentRepository";
import { HistoryRepository } from "../repositories/HistoryRepository";
import { User } from "../entities/User";

export class HistoryCleanupUseCase implements UseCase {
    constructor(private historyRepository: HistoryRepository, private documentRepository: DocumentRepository) {}

    async execute(cutoffDate: Date, currentUser: User): Promise<void> {
        await this.documentRepository.delete({
            until: cutoffDate,
            deletedBy: currentUser.username,
        });
        await this.historyRepository.delete({ until: cutoffDate, deletedBy: currentUser.username });
    }
}
