import _ from "lodash";
import { Id } from "../domain/entities/ReferenceObject";
import { CustomTemplateWithUrl, Template } from "../domain/entities/Template";
import { Theme } from "../domain/entities/Theme";
import { StorageRepository } from "../domain/repositories/StorageRepository";
import { TemplateRepository } from "../domain/repositories/TemplateRepository";
import * as templates from "./templates";
import * as customTemplates from "./templates/custom-templates";

const templatesCollectionKey = "templates";
const themeCollectionKey = "themes";

export class TemplateWebRepository implements TemplateRepository {
    constructor(private storage: StorageRepository) {}

    public async getTemplates(): Promise<Template[]> {
        const customTemplatesFromDataStore = await this.storage.getObject<Template[]>(templatesCollectionKey, []);

        const customTemplatesById = _(customTemplates)
            .values()
            .map(TemplateClass => new TemplateClass() as CustomTemplateWithUrl)
            .keyBy(t => t.id)
            .value();

        const customTemplatesMerged = customTemplatesFromDataStore.map((template): typeof template => {
            const customTemplate = customTemplatesById[template.id];
            if (!customTemplate) return template;
            const { downloadCustomization, importCustomization } = customTemplate;

            return customTemplate && customTemplate.downloadCustomization
                ? {
                      ...template,
                      dataFormId: customTemplate.dataFormId,
                      ...(downloadCustomization ? { downloadCustomization } : {}),
                      ...(importCustomization ? { importCustomization } : {}),
                      generateMetadata: customTemplate.generateMetadata ?? false,
                  }
                : template;
        });

        const genericTemplates: Template[] = _.values(templates).map(TemplateClass => new TemplateClass());
        return _.concat(genericTemplates, customTemplatesMerged);
    }

    public getCustomTemplates(): CustomTemplateWithUrl[] {
        return _.values(customTemplates).map(TemplateClass => {
            const template = new TemplateClass();
            return template;
        });
    }

    public saveTemplate(template: Template): Promise<void> {
        return this.storage.saveObjectInCollection(templatesCollectionKey, template);
    }

    public saveTemplates(templates: Template[]): Promise<void> {
        return this.storage.saveObject(templatesCollectionKey, templates);
    }

    public async getTemplate(templateId: Id): Promise<Template> {
        const templates = await this.getTemplates();
        const template = templates.find(({ id }) => id === templateId);
        if (!template) throw new Error(`Attempt to read from invalid template ${templateId}`);
        return template;
    }

    async deleteTemplate(templateId: Id): Promise<void> {
        await this.storage.removeObjectInCollection(templatesCollectionKey, templateId);
    }

    /* Themes */

    public async listThemes(): Promise<Theme[]> {
        const objects = await this.storage.listObjectsInCollection(themeCollectionKey);
        return objects.map(data => new Theme(data));
    }

    public async getTheme(themeId: string): Promise<Theme> {
        const data = await this.storage.getObjectInCollection(themeCollectionKey, themeId);
        return new Theme(data);
    }

    public async saveTheme(theme: Theme): Promise<void> {
        await this.storage.saveObjectInCollection<Theme>(themeCollectionKey, theme);
    }

    public async deleteTheme(id: string): Promise<void> {
        await this.storage.removeObjectInCollection(themeCollectionKey, id);
    }
}
