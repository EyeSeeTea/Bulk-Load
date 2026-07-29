import i18n from "../../../utils/i18n";
import { cleanFormula } from "../../../utils/string";
import { DataForm } from "../../entities/DataForm";
import { Template } from "../../entities/Template";
import { ExcelRepository } from "../../repositories/ExcelRepository";
import { InstanceRepository } from "../../repositories/InstanceRepository";
import { TemplateRepository } from "../../repositories/TemplateRepository";

export type LoadedTemplate = Readonly<{ templateId: string; template: Template }>;

export async function loadTemplateFromExcel(
    templateRepository: TemplateRepository,
    excelRepository: ExcelRepository,
    excelFile: Blob
): Promise<LoadedTemplate> {
    const templateId = await excelRepository.loadTemplate({ type: "file", file: excelFile });
    const template = await templateRepository.getTemplate(templateId);
    return { templateId, template };
}

export async function getDataFormFromTemplate(
    instanceRepository: InstanceRepository,
    excelRepository: ExcelRepository,
    templateId: string,
    template: Template
): Promise<DataForm> {
    const [dataFormIdFormula, dataFormIdValue] = await Promise.all([
        excelRepository.readCell(templateId, template.dataFormId, { formula: true }),
        excelRepository.readCell(templateId, template.dataFormId),
    ]);
    const dataFormId = dataFormIdFormula || dataFormIdValue;

    if (!dataFormId || typeof dataFormId !== "string") {
        throw new Error(i18n.t("Cannot read data form id"));
    }

    const [dataForm] = await instanceRepository.getDataForms({ ids: [cleanFormula(dataFormId)] });

    if (!dataForm) throw new Error(i18n.t("Program or DataSet not found in instance"));

    return dataForm;
}
