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

    it("should call deleteDocuments with a date from 1 year ago", async () => {
        const mockDate = new Date("2024-08-26T10:00:00.000Z");
        const expectedDate = new Date("2023-08-26T10:00:00.000Z");

        jest.spyOn(global, "Date").mockImplementation((...args) => {
            if (args.length === 0) {
                return mockDate as any;
            }
            return new (Date as any)(...args);
        });

        await useCase.execute();

        expect(fileRepository.delete).toHaveBeenCalledWith({
            until: expectedDate,
        });
        expect(fileRepository.delete).toHaveBeenCalledTimes(1);

        (global.Date as any).mockRestore();
    });

    it("should handle repository errors gracefully", async () => {
        const error = new Error("Repository error");
        fileRepository.delete.mockRejectedValue(error);

        await expect(useCase.execute()).rejects.toThrow("Repository error");
    });
});
