import { saveAs } from "file-saver";
import { Moment } from "moment";
import { DataFormType } from "../entities/DataForm";
import { Id } from "../entities/ReferenceObject";
import { ExcelRepository } from "../repositories/ExcelRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";
import { TemplateRepository } from "../repositories/TemplateRepository";

interface DownloadTemplateProps {
    type: DataFormType;
    id: string;
    name: string;
    orgUnits: string[];
    populate: boolean;
    startDate?: Moment;
    endDate?: Moment;
    file: File;
    theme?: Id;
}

export class DownloadTemplateUseCase {
    constructor(
        private instance: InstanceRepository,
        private templateRepository: TemplateRepository,
        private excelRepository: ExcelRepository
    ) {}

    public async execute({
        type,
        id,
        name,
        file,
        theme: themeId,
        orgUnits,
        populate,
        startDate,
        endDate,
    }: DownloadTemplateProps): Promise<void> {
        try {
            const templateId = type === "dataSet" ? "DATASET_GENERATED_v1" : "PROGRAM_GENERATED_v2";
            const template = this.templateRepository.getTemplate(templateId);
            await this.excelRepository.loadTemplate(template, { type: "file", file });

            if (themeId) {
                const theme = await this.templateRepository.getTheme(themeId);
                await this.excelRepository.applyTheme(template, theme);
            }

            if (populate) {
                const dataPackage = await this.instance.getDataPackage({
                    type,
                    id,
                    orgUnits,
                    startDate,
                    endDate,
                });
                await this.excelRepository.populateTemplate(template, dataPackage);
            }

            const data = await this.excelRepository.toBlob(template);
            saveAs(data, `${name}.xlsx`);
        } catch (error) {
            console.log("Failed building/downloading template");
            throw error;
        }
    }
}
