import { DocumentRepository } from "../../domain/repositories/DocumentRepository";
import { HistoryRepository } from "../../domain/repositories/HistoryRepository";
import { HistoryCleanupUseCase } from "../../domain/usecases/HistoryCleanupUseCase";

describe("HistoryCleanupUseCase", () => {
    let historyRepository: jest.Mocked<HistoryRepository>;
    let documentRepository: jest.Mocked<DocumentRepository>;
    let useCase: HistoryCleanupUseCase;

    beforeEach(() => {
        historyRepository = {
            get: jest.fn(),
            getDetails: jest.fn(),
            save: jest.fn(),
            updateSummaries: jest.fn(),
            delete: jest.fn(),
        };
        documentRepository = {
            upload: jest.fn(),
            delete: jest.fn(),
            download: jest.fn(),
        };
        useCase = new HistoryCleanupUseCase(historyRepository, documentRepository);
    });

    it("should delete history entries and their associated documents", async () => {
        const cutoffDate = new Date("2023-01-01T00:00:00.000Z");

        await useCase.execute(cutoffDate);

        expect(historyRepository.delete).toHaveBeenCalledWith({ until: cutoffDate });
        expect(documentRepository.delete).toHaveBeenCalledWith({ until: cutoffDate, keepReference: false });
    });
});
