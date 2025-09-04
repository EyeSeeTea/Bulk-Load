import { UseCase } from "../../CompositionRoot";
import { HistoryEntrySummary } from "../entities/HistoryEntry";
import { HistoryRepository } from "../repositories/HistoryRepository";

export class GetHistoryEntriesUseCase implements UseCase {
    constructor(private historyRepository: HistoryRepository) {}

    public async execute(): Promise<HistoryEntrySummary[]> {
        const entries = await this.historyRepository.get();
        // Sort by timestamp descending (most recent first)
        return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
}
