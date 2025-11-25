import { UseCase } from "../../CompositionRoot";
import { HistoryEntryDetails } from "../entities/HistoryEntry";
import { Id } from "../entities/ReferenceObject";
import { HistoryRepository } from "../repositories/HistoryRepository";

export class GetHistoryEntryDetailsUseCase implements UseCase {
    constructor(private historyRepository: HistoryRepository) {}

    public async execute(id: Id): Promise<HistoryEntryDetails | null> {
        return this.historyRepository.getDetails(id);
    }
}
