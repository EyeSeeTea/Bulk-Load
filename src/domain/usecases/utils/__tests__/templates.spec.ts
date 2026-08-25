import { vi } from "vitest";
import { DataForm } from "../../../entities/DataForm";
import { Template } from "../../../entities/Template";
import { ExcelRepository } from "../../../repositories/ExcelRepository";
import { InstanceRepository } from "../../../repositories/InstanceRepository";
import { TemplateRepository } from "../../../repositories/TemplateRepository";
import { getDataFormFromTemplate, loadTemplateFromExcel } from "../templates";

const TEMPLATE_ID = "PHSM_CUSTOM_TEMPLATE";
const DATA_FORM_ID = "U6z7eJniNfL";
const CANNOT_READ_DATA_FORM_ID_MESSAGE = "Cannot read data form id";
const DATA_FORM_NOT_FOUND_MESSAGE = "Program or DataSet not found in instance";

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

const excelFile = new Blob([""]);

function buildExcelRepository(overrides: {
    readCellFormula?: unknown;
    readCellValue?: unknown;
    loadTemplate?: () => Promise<string>;
}): ExcelRepository {
    return {
        loadTemplate: vi.fn(overrides.loadTemplate ?? (async () => TEMPLATE_ID)),
        readCell: vi.fn(async (_id: string, _ref: unknown, options?: { formula?: boolean }) =>
            options?.formula ? overrides.readCellFormula : overrides.readCellValue
        ),
    } as unknown as ExcelRepository;
}

function buildTemplateRepository(getTemplate?: () => Promise<Template>): TemplateRepository {
    return { getTemplate: vi.fn(getTemplate ?? (async () => template)) } as unknown as TemplateRepository;
}

function buildInstanceRepository(dataForms: DataForm[] = [dataForm]): InstanceRepository {
    return { getDataForms: vi.fn(async () => dataForms) } as unknown as InstanceRepository;
}

describe("loadTemplateFromExcel", () => {
    it("loads the workbook and resolves its template", async () => {
        const excelRepository = buildExcelRepository({});
        const templateRepository = buildTemplateRepository();

        const result = await loadTemplateFromExcel(templateRepository, excelRepository, excelFile);

        expect(result).toEqual({ templateId: TEMPLATE_ID, template });
        expect(excelRepository.loadTemplate).toHaveBeenCalledWith({ type: "file", file: excelFile });
        expect(templateRepository.getTemplate).toHaveBeenCalledWith(TEMPLATE_ID);
    });
});

describe("getDataFormFromTemplate", () => {
    it("resolves the data form referenced by the template", async () => {
        const excelRepository = buildExcelRepository({ readCellValue: DATA_FORM_ID });
        const instanceRepository = buildInstanceRepository([dataForm]);

        const result = await getDataFormFromTemplate(instanceRepository, excelRepository, TEMPLATE_ID, template);

        expect(result).toEqual(dataForm);
        expect(instanceRepository.getDataForms).toHaveBeenCalledWith({ ids: [DATA_FORM_ID] });
    });

    it("strips the leading underscore of a formula data form reference", async () => {
        const excelRepository = buildExcelRepository({ readCellFormula: `_${DATA_FORM_ID}` });
        const instanceRepository = buildInstanceRepository([dataForm]);

        await getDataFormFromTemplate(instanceRepository, excelRepository, TEMPLATE_ID, template);

        expect(instanceRepository.getDataForms).toHaveBeenCalledWith({ ids: [DATA_FORM_ID] });
    });

    it("throws when the data form id cannot be read", async () => {
        const excelRepository = buildExcelRepository({ readCellValue: undefined });
        const instanceRepository = buildInstanceRepository([dataForm]);

        await expect(
            getDataFormFromTemplate(instanceRepository, excelRepository, TEMPLATE_ID, template)
        ).rejects.toThrow(CANNOT_READ_DATA_FORM_ID_MESSAGE);
    });

    it("throws when the data form is missing from the instance", async () => {
        const excelRepository = buildExcelRepository({ readCellValue: DATA_FORM_ID });
        const instanceRepository = buildInstanceRepository([]);

        await expect(
            getDataFormFromTemplate(instanceRepository, excelRepository, TEMPLATE_ID, template)
        ).rejects.toThrow(DATA_FORM_NOT_FOUND_MESSAGE);
    });
});
