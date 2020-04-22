import { saveAs } from "file-saver";
import { DefaultTemplateProvider } from "../../data/DefaultTemplateProvider";
import { Id } from "../entities/ReferenceObject";
import { TemplateProvider } from "../repositories/TemplateProvider";

export class DownloadTemplateUseCase {
    private templateProvider: TemplateProvider;

    constructor(private templateId: Id) {
        this.templateProvider = new DefaultTemplateProvider();
    }

    public async execute(): Promise<void> {
        try {
            const template = await this.templateProvider.getTemplate(this.templateId);
            const data = await template.toBlob();
            saveAs(data, `${template.name}.xlsx`);
        } catch (error) {
            console.log("Failed building/downloading template");
            throw error;
        }
    }
}