import { UseCase } from "../../CompositionRoot";
import i18n from "../../locales";
import { getExcelOrThrow } from "../../utils/files";
import { ExcelReader } from "../helpers/ExcelReader";
import { ExcelRepository } from "../repositories/ExcelRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";
import { TemplateRepository } from "../repositories/TemplateRepository";

export class AnalyzeTemplateUseCase implements UseCase {
    constructor(
        private instanceRepository: InstanceRepository,
        private templateRepository: TemplateRepository,
        private excelRepository: ExcelRepository
    ) {}

    public async execute(file: File) {
        const excelFile = await getExcelOrThrow(file);

        const templateId = await this.excelRepository.loadTemplate({ type: "file", file: excelFile });
        const template = await this.templateRepository.getTemplate(templateId);

        const dataFormId1 = await this.excelRepository.readCell(templateId, template.dataFormId, {
            formula: true,
        });
        const dataFormId2 = await this.excelRepository.readCell(templateId, template.dataFormId);
        const dataFormId = dataFormId1 || dataFormId2;

        if (!dataFormId || typeof dataFormId !== "string") {
            throw new Error(i18n.t("Cannot read data form id"));
        }

        const [dataForm] = await this.instanceRepository.getDataForms({
            ids: [cleanFormula(dataFormId)],
        });

        if (!dataForm) throw new Error(i18n.t("Program or DataSet not found in instance"));

        const orgUnits = await this.instanceRepository.getDataFormOrgUnits(dataForm.type, dataForm.id);

        const reader = new ExcelReader(this.excelRepository, this.instanceRepository);
        const excelDataValues = await reader.readTemplate(template, dataForm);
        if (!excelDataValues) return { custom: true, dataForm, dataValues: [], orgUnits };

        const customDataValues = await reader.templateCustomization(template, excelDataValues);
        const dataEntries = customDataValues?.dataEntries ?? excelDataValues.dataEntries;

        const dataValues = dataEntries.map(({ id, dataValues, period }) => ({
            count: dataValues.length,
            id,
            period,
        }));

        return { custom: true, dataForm, dataValues, orgUnits, file };
    }
}

const cleanFormula = (string: string) => (string.startsWith("_") ? string.substr(1) : string);
