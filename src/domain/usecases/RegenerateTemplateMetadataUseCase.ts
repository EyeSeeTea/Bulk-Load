import { UseCase } from "../../CompositionRoot";
import { D2Api } from "../../types/d2-api";
// TODO: Settings and SheetBuilder live in webapp/logic, so this use case breaks the
// domain → presentation dependency rule. Moving them to domain requires a wider
// refactor (shared by other use cases) and is tracked as its own task.
import Settings from "../../webapp/logic/settings";
import { SheetBuilder } from "../../webapp/logic/sheetBuilder";
import { DataFormType } from "../entities/DataForm";
import { GeneratedTemplate } from "../entities/Template";
import { getElement, getElementMetadata } from "./DownloadTemplateUseCase";

export type RegenerateTemplateMetadataOptions = {
    type: DataFormType;
    id: string;
    /** base64-encoded input template */
    fileContents: string;
    settings: Settings;
    language: string;
    includeMetadataCodes: boolean;
    useCodesForMetadata: boolean;
    orgUnitShortName: boolean;
};

/** Regenerates only the Metadata sheet of a template, leaving all other sheets untouched. */
export class RegenerateTemplateMetadataUseCase implements UseCase {
    public async execute(api: D2Api, options: RegenerateTemplateMetadataOptions): Promise<string> {
        const {
            type,
            id,
            fileContents,
            settings,
            language,
            includeMetadataCodes,
            useCodesForMetadata,
            orgUnitShortName,
        } = options;

        const element = await getElement(api, type, id);
        const orgUnitIds = element.organisationUnits.map((orgUnit: { id: string }) => orgUnit.id);

        const result = await getElementMetadata({
            api,
            element,
            downloadRelationships: false,
            orgUnitIds,
            startDate: undefined,
            endDate: undefined,
            orgUnitShortName,
        });

        // Minimal template: generateMetadataOnly only needs type/id, not the form sheets.
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
            useCodesForMetadata,
            orgUnitShortName,
            includeMetadataCodes,
        });

        const workbook = await sheetBuilder.generateMetadataOnly(fileContents);
        return workbook.writeToBase64();
    }
}
