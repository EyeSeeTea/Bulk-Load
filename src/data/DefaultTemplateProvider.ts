import { Id } from "../domain/entities/ReferenceObject";
import { Template } from "../domain/entities/Template";
import { TemplateProvider } from "../domain/repositories/TemplateProvider";

export function getTemplates(): Template[] {
    const tasks = require.context("./custom-templates", false, /.*\.ts$/);
    return tasks.keys().map(key => {
        const TemplateClass = tasks(key).default;
        return new TemplateClass();
    });
}

export class DefaultTemplateProvider implements TemplateProvider {
    public readonly templates: Template[];

    constructor() {
        this.templates = getTemplates();
    }

    public listTemplates(): Pick<Template, "id" | "name" | "type">[] {
        return this.templates.map(({ id, name, type }) => ({ id, name, type }));
    }

    public async getTemplate(templateId: Id): Promise<Template> {
        const template = this.templates.find(({ id }) => id === templateId);
        if (!template) throw new Error("Attempt to read from an invalid template");
        await template.initialize();

        return template;
    }
}