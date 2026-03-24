import { DocumentRepository } from "../../domain/repositories/DocumentRepository";
import { HistoryRepository } from "../../domain/repositories/HistoryRepository";
import { DocumentsCleanupUseCase } from "../../domain/usecases/DocumentsCleanupUseCase";
import { User } from "../../domain/entities/User";
import { vi, type Mocked } from "vitest";

describe("DocumentsCleanupUseCase", () => {
    let fileRepository: Mocked<DocumentRepository>;
    let historyRepository: Mocked<HistoryRepository>;
    let useCase: DocumentsCleanupUseCase;
    let mockUser: User;

    beforeEach(() => {
        fileRepository = {
            upload: vi.fn(),
            delete: vi.fn(),
            download: vi.fn(),
        };
        historyRepository = {
            get: vi.fn(),
            getDetails: vi.fn(),
            save: vi.fn(),
            updateSummaries: vi.fn(),
            delete: vi.fn(),
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
