import { UploadsCleanupUseCase } from "../../../src/domain/usecases/UploadsCleanupUseCase";
import { FileRepository } from "../../../src/domain/repositories/FileRepository";

describe("UploadsCleanupUseCase", () => {
    let fileRepository: jest.Mocked<FileRepository>;
    let useCase: UploadsCleanupUseCase;

    beforeEach(() => {
        fileRepository = {
            uploadDocument: jest.fn(),
            deleteDocuments: jest.fn(),
            uploadAll: jest.fn(),
        };
        useCase = new UploadsCleanupUseCase(fileRepository);
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

        expect(fileRepository.deleteDocuments).toHaveBeenCalledWith({
            until: expectedDate,
        });
        expect(fileRepository.deleteDocuments).toHaveBeenCalledTimes(1);

        (global.Date as any).mockRestore();
    });

    it("should handle repository errors gracefully", async () => {
        const error = new Error("Repository error");
        fileRepository.deleteDocuments.mockRejectedValue(error);

        await expect(useCase.execute()).rejects.toThrow("Repository error");
    });
});
