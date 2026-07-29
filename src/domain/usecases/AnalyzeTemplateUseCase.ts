import { UseCase } from "../../CompositionRoot";
import { getExcelOrThrow } from "../../utils/files";
import { ExcelReader } from "../helpers/ExcelReader";
import { ExcelRepository } from "../repositories/ExcelRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";
import { TemplateRepository } from "../repositories/TemplateRepository";
import { DataElementDisaggregationsMappingRepository } from "../repositories/DataElementDisaggregationsMappingRepository";
import { getDataFormFromTemplate, loadTemplateFromExcel } from "./utils/templates";

export class AnalyzeTemplateUseCase implements UseCase {
    constructor(
        private instanceRepository: InstanceRepository,
        private templateRepository: TemplateRepository,
        private excelRepository: ExcelRepository,
        private dataElementDisaggregationsMappingRepository: DataElementDisaggregationsMappingRepository
    ) {}

    public async execute(file: File) {
        const excelFile = await getExcelOrThrow(file);

        const { templateId, template } = await loadTemplateFromExcel(
            this.templateRepository,
            this.excelRepository,
            excelFile
        );

        const dataForm = await getDataFormFromTemplate(
            this.instanceRepository,
            this.excelRepository,
            templateId,
            template
        );

        const orgUnits = await this.instanceRepository.getDataFormOrgUnits(dataForm.type, dataForm.id);

        const reader = new ExcelReader(
            this.excelRepository,
            this.instanceRepository,
            this.dataElementDisaggregationsMappingRepository
        );
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
