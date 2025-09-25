import { DocumentRepository } from "../../domain/repositories/DocumentRepository";
import { HistoryRepository } from "../../domain/repositories/HistoryRepository";
import { DocumentsCleanupUseCase } from "../../domain/usecases/DocumentsCleanupUseCase";

describe("DocumentsCleanupUseCase", () => {
    let fileRepository: jest.Mocked<DocumentRepository>;
    let historyRepository: jest.Mocked<HistoryRepository>;
    let useCase: DocumentsCleanupUseCase;

    beforeEach(() => {
        fileRepository = {
            upload: jest.fn(),
            delete: jest.fn(),
            download: jest.fn(),
        };
        historyRepository = {
            get: jest.fn(),
            getDetails: jest.fn(),
            save: jest.fn(),
            updateSummaries: jest.fn(),
        };
        useCase = new DocumentsCleanupUseCase(fileRepository, historyRepository);
    });

    it("should call deleteDocuments with the provided cutoff date", async () => {
        const customCutoffDate = new Date("2023-01-01T00:00:00.000Z");

        await useCase.execute(customCutoffDate);

        expect(fileRepository.delete).toHaveBeenCalledWith({
            until: customCutoffDate,
        });
        expect(fileRepository.delete).toHaveBeenCalledTimes(1);
    });

    it("should handle repository errors gracefully", async () => {
        const error = new Error("Repository error");
        fileRepository.delete.mockRejectedValue(error);

        await expect(useCase.execute(new Date())).rejects.toThrow("Repository error");
    });
});
