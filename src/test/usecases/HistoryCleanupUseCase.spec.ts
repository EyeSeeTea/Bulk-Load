import { DocumentRepository } from "../../domain/repositories/DocumentRepository";
import { HistoryRepository } from "../../domain/repositories/HistoryRepository";
import { HistoryCleanupUseCase } from "../../domain/usecases/HistoryCleanupUseCase";
import { User } from "../../domain/entities/User";
import { vi, type Mocked } from "vitest";

describe("HistoryCleanupUseCase", () => {
    let historyRepository: Mocked<HistoryRepository>;
    let documentRepository: Mocked<DocumentRepository>;
    let useCase: HistoryCleanupUseCase;
    let mockUser: User;

    beforeEach(() => {
        historyRepository = {
            get: vi.fn(),
            getDetails: vi.fn(),
            save: vi.fn(),
            updateSummaries: vi.fn(),
            delete: vi.fn(),
        };
        documentRepository = {
            upload: vi.fn(),
            delete: vi.fn(),
            download: vi.fn(),
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
        useCase = new HistoryCleanupUseCase(historyRepository, documentRepository);
    });

    it("should delete history entries and their associated documents with user info", async () => {
        const cutoffDate = new Date("2023-01-01T00:00:00.000Z");

        await useCase.execute(cutoffDate, mockUser);

        expect(historyRepository.delete).toHaveBeenCalledWith({ until: cutoffDate, deletedBy: mockUser.username });
        expect(documentRepository.delete).toHaveBeenCalledWith({
            until: cutoffDate,
            deletedBy: mockUser.username,
        });
    });
});
