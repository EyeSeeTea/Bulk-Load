import { UseCase } from "../../CompositionRoot";
import i18n from "../../utils/i18n";
import { getExcelOrThrow } from "../../utils/files";
import { cleanFormula } from "../../utils/string";
import { DataForm } from "../entities/DataForm";
import { Template } from "../entities/Template";
import { ExcelRepository } from "../repositories/ExcelRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";
import { TemplateRepository } from "../repositories/TemplateRepository";

export type ResolvedTemplate = Readonly<{
    template: Template;
    dataForm: DataForm;
}>;

export class ResolveTemplateFromFileUseCase implements UseCase {
    constructor(
        private instanceRepository: InstanceRepository,
        private templateRepository: TemplateRepository,
        private excelRepository: ExcelRepository
    ) {}

    public async execute(file: File): Promise<ResolvedTemplate> {
        const excelFile = await getExcelOrThrow(file);
        const { templateId, template } = await this.resolveTemplate(excelFile);

        const [dataFormIdFormula, dataFormIdValue] = await Promise.all([
            this.excelRepository.readCell(templateId, template.dataFormId, { formula: true }),
            this.excelRepository.readCell(templateId, template.dataFormId),
        ]);
        const dataFormId = dataFormIdFormula || dataFormIdValue;

        if (!dataFormId || typeof dataFormId !== "string") {
            throw new Error(i18n.t("Cannot read data form id"));
        }

        const [dataForm] = await this.instanceRepository.getDataForms({ ids: [cleanFormula(dataFormId)] });

        if (!dataForm) throw new Error(i18n.t("Program or DataSet not found in instance"));

        return { template, dataForm };
    }

    private async resolveTemplate(excelFile: Blob): Promise<{ templateId: string; template: Template }> {
        try {
            const templateId = await this.excelRepository.loadTemplate({ type: "file", file: excelFile });
            const template = await this.templateRepository.getTemplate(templateId);
            return { templateId, template };
        } catch (error) {
            console.error(error);
            throw new Error(
                i18n.t(
                    "Could not identify this template. Check the file is a Bulk Load template and that your session is still active."
                )
            );
        }
    }
}
