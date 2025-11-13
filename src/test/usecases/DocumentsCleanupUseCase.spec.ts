import { DocumentRepository } from "../../domain/repositories/DocumentRepository";
import { HistoryRepository } from "../../domain/repositories/HistoryRepository";
import { DocumentsCleanupUseCase } from "../../domain/usecases/DocumentsCleanupUseCase";
import { User } from "../../domain/entities/User";

describe("DocumentsCleanupUseCase", () => {
    let fileRepository: jest.Mocked<DocumentRepository>;
    let historyRepository: jest.Mocked<HistoryRepository>;
    let useCase: DocumentsCleanupUseCase;
    let mockUser: User;

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
            delete: jest.fn(),
        };
        mockUser = {
            id: "user123",
            username: "testuser",
            name: "Test User",
            authorities: new Set(),
            userGroups: [],
            orgUnits: [],
            orgUnitsView: [],
        };
        useCase = new DocumentsCleanupUseCase(fileRepository, historyRepository);
    });

    it("should call deleteDocuments with the provided cutoff date and user info", async () => {
        const customCutoffDate = new Date("2023-01-01T00:00:00.000Z");
        fileRepository.delete.mockResolvedValue([]);

        await useCase.execute(customCutoffDate, mockUser);

        expect(fileRepository.delete).toHaveBeenCalledWith({
            until: customCutoffDate,
            deletedBy: mockUser.username,
        });
        expect(fileRepository.delete).toHaveBeenCalledTimes(1);
    });

    it("should handle repository errors gracefully", async () => {
        const error = new Error("Repository error");
        fileRepository.delete.mockRejectedValue(error);

        await expect(useCase.execute(new Date(), mockUser)).rejects.toThrow("Repository error");
    });
});
