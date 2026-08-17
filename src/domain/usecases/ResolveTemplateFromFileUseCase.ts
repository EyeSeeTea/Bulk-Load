import { UseCase } from "../../CompositionRoot";
import i18n from "../../utils/i18n";
import { getExcelOrThrow } from "../../utils/files";
import { DataForm } from "../entities/DataForm";
import { Template } from "../entities/Template";
import { ExcelRepository } from "../repositories/ExcelRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";
import { TemplateRepository } from "../repositories/TemplateRepository";
import { getDataFormFromTemplate, LoadedTemplate, loadTemplateFromExcel } from "./utils/templates";

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

        const dataForm = await getDataFormFromTemplate(
            this.instanceRepository,
            this.excelRepository,
            templateId,
            template
        );

        return { template, dataForm };
    }

    private async resolveTemplate(excelFile: Blob): Promise<LoadedTemplate> {
        try {
            return await loadTemplateFromExcel(this.templateRepository, this.excelRepository, excelFile);
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
