import { vi } from "vitest";
import { DataForm } from "../../domain/entities/DataForm";
import { Template } from "../../domain/entities/Template";
import { ExcelRepository } from "../../domain/repositories/ExcelRepository";
import { InstanceRepository } from "../../domain/repositories/InstanceRepository";
import { TemplateRepository } from "../../domain/repositories/TemplateRepository";
import { ResolvedTemplate, ResolveTemplateFromFileUseCase } from "../../domain/usecases/ResolveTemplateFromFileUseCase";

const TEMPLATE_ID = "PHSM_CUSTOM_TEMPLATE";
const DATA_FORM_ID = "U6z7eJniNfL";
const COULD_NOT_IDENTIFY_MESSAGE =
    "Could not identify this template. Check the file is a Bulk Load template and that your session is still active.";
const MISSING_ID_ERROR_MESSAGE = "Invalid id";
const DATASTORE_ERROR_MESSAGE = "Request failed with status code 401";
const PARSE_ERROR_MESSAGE = "Corrupted zip: expected 4 bytes";
const UNKNOWN_TEMPLATE_MESSAGE = `Attempt to read from invalid template ${TEMPLATE_ID}`;

const template = {
    id: TEMPLATE_ID,
    type: "custom",
    name: "PHSM v7",
    dataFormId: { type: "cell", sheet: "Data Entry", ref: "A2" },
} as unknown as Template;

const dataForm = {
    id: DATA_FORM_ID,
    type: "programs",
    name: "PHSM Program",
} as unknown as DataForm;

const file = new File([""], "template.xlsm");

type Overrides = Readonly<{
    loadTemplate?: () => Promise<string>;
    getTemplate?: () => Promise<Template>;
    readCellFormula?: unknown;
    readCellValue?: unknown;
    dataForms?: DataForm[];
}>;

function buildUseCase(overrides: Overrides = {}) {
    const excelRepository = {
        loadTemplate: vi.fn(overrides.loadTemplate ?? (async () => TEMPLATE_ID)),
        readCell: vi.fn(async (_id: string, _ref: unknown, options?: { formula?: boolean }) =>
            options?.formula ? overrides.readCellFormula : overrides.readCellValue
        ),
    } as unknown as ExcelRepository;

    const templateRepository = {
        getTemplate: vi.fn(overrides.getTemplate ?? (async () => template)),
    } as unknown as TemplateRepository;

    const instanceRepository = {
        getDataForms: vi.fn(async () => overrides.dataForms ?? [dataForm]),
    } as unknown as InstanceRepository;

    const useCase = new ResolveTemplateFromFileUseCase(instanceRepository, templateRepository, excelRepository);

    return { useCase, instanceRepository };
}

describe("ResolveTemplateFromFileUseCase", () => {
    describe("when the file is a recognised template", () => {
        it("returns the resolved template and data form", async () => {
            const { useCase } = buildUseCase({ readCellValue: DATA_FORM_ID });

            const result: ResolvedTemplate = await useCase.execute(file);

            expect(result).toEqual({ template, dataForm });
        });

        it("strips the leading underscore of a formula data form reference", async () => {
            const { useCase, instanceRepository } = buildUseCase({ readCellFormula: `_${DATA_FORM_ID}` });

            await useCase.execute(file);

            expect(instanceRepository.getDataForms).toHaveBeenCalledWith({ ids: [DATA_FORM_ID] });
        });
    });

    describe("when the template cannot be resolved", () => {
        async function expectSameFailureMessage(overrides: Overrides, originalError: Error) {
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
            const { useCase } = buildUseCase(overrides);

            await expect(useCase.execute(file)).rejects.toThrow(COULD_NOT_IDENTIFY_MESSAGE);
            expect(consoleErrorSpy).toHaveBeenCalledWith(originalError);

            consoleErrorSpy.mockRestore();
        }

        it("shows the same message when the file carries no template id", async () => {
            const missingIdError = new Error(MISSING_ID_ERROR_MESSAGE);

            await expectSameFailureMessage(
                {
                    loadTemplate: async () => {
                        throw missingIdError;
                    },
                },
                missingIdError
            );
        });

        it("shows the same message when the template id is unknown to the datastore", async () => {
            const unknownTemplateError = new Error(UNKNOWN_TEMPLATE_MESSAGE);

            await expectSameFailureMessage(
                {
                    getTemplate: async () => {
                        throw unknownTemplateError;
                    },
                },
                unknownTemplateError
            );
        });

        it("shows the same message when the datastore is unreachable", async () => {
            const datastoreError = new Error(DATASTORE_ERROR_MESSAGE);

            await expectSameFailureMessage(
                {
                    getTemplate: async () => {
                        throw datastoreError;
                    },
                },
                datastoreError
            );
        });

        it("shows the same message when the workbook cannot be parsed", async () => {
            const parseError = new Error(PARSE_ERROR_MESSAGE);

            await expectSameFailureMessage(
                {
                    loadTemplate: async () => {
                        throw parseError;
                    },
                },
                parseError
            );
        });
    });

    describe("when the data form cannot be resolved", () => {
        it("reports an unreadable data form id distinctly", async () => {
            const { useCase } = buildUseCase({ readCellValue: undefined });

            await expect(useCase.execute(file)).rejects.toThrow("Cannot read data form id");
        });

        it("reports a data form missing from the instance distinctly", async () => {
            const { useCase } = buildUseCase({ readCellValue: DATA_FORM_ID, dataForms: [] });

            await expect(useCase.execute(file)).rejects.toThrow("Program or DataSet not found in instance");
        });
    });
});
