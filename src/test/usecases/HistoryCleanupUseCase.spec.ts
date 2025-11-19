import { DocumentRepository } from "../../domain/repositories/DocumentRepository";
import { HistoryRepository } from "../../domain/repositories/HistoryRepository";
import { HistoryCleanupUseCase } from "../../domain/usecases/HistoryCleanupUseCase";
import { User } from "../../domain/entities/User";

describe("HistoryCleanupUseCase", () => {
    let historyRepository: jest.Mocked<HistoryRepository>;
    let documentRepository: jest.Mocked<DocumentRepository>;
    let useCase: HistoryCleanupUseCase;
    let mockUser: User;

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
