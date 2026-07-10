import { UseCase } from "../../CompositionRoot";
import { D2Api } from "../../types/d2-api";
import Settings from "../../webapp/logic/settings";
import { SheetBuilder } from "../../webapp/logic/sheetBuilder";
import { DataFormType } from "../entities/DataForm";
import { GeneratedTemplate } from "../entities/Template";
import { getElement, getElementMetadata } from "./DownloadTemplateUseCase";

export type RegenerateTemplateMetadataOptions = {
    type: DataFormType;
    id: string;
    /** base64 contents of the input template whose Metadata sheet will be regenerated */
    fileContents: string;
    settings: Settings;
    language: string;
};

/**
 * Regenerates ONLY the Metadata sheet of an existing custom template from fresh DHIS2
 * metadata (with the Code column), leaving every other sheet (custom form, dropdowns, VBA)
 * untouched. Reusable from both the CLI script and the web app.
 */
export class RegenerateTemplateMetadataUseCase implements UseCase {
    /** Returns the regenerated template as a base64 string (works in both Node and the browser). */
    public async execute(api: D2Api, options: RegenerateTemplateMetadataOptions): Promise<string> {
        const { type, id, fileContents, settings, language } = options;

        const element = await getElement(api, type, id);
        const orgUnitIds = element.organisationUnits.map((orgUnit: { id: string }) => orgUnit.id);

        const result = await getElementMetadata({
            api,
            element,
            downloadRelationships: false,
            orgUnitIds,
            startDate: undefined,
            endDate: undefined,
            orgUnitShortName: false,
        });

        // Minimal template: SheetBuilder only reads template.type for rowOffset, and
        // generateMetadataOnly never touches the form sheets.
        const template: GeneratedTemplate = {
            type: "generated",
            id: "regenerate-metadata",
            name: "Regenerate metadata",
            rowOffset: 0,
            styleSources: [],
            dataFormId: { type: "value", id },
            dataFormType: { type: "value", id: type },
        };

        const sheetBuilder = new SheetBuilder({
            ...result,
            language,
            template,
            settings,
            downloadRelationships: false,
            splitDataEntryTabsBySection: false,
            useCodesForMetadata: false,
            orgUnitShortName: false,
            includeMetadataCodes: true,
        });

        const workbook = await sheetBuilder.generateMetadataOnly(fileContents);
        return workbook.writeToBase64();
    }
}
