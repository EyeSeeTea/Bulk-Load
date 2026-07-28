import { getCompositionRoot } from "../CompositionRoot";
import { GeneratedTemplate } from "../domain/entities/Template";
import Settings from "../webapp/logic/settings";
import { SheetBuilder, SheetBuilderParams } from "../webapp/logic/sheetBuilder";
import { Workbook } from "../webapp/logic/Workbook";
import { initializeMockServer } from "./mocks/server";

const metadataSheetName = "Metadata";
const codeColumn = "H";
const dataElement1 = { id: "DE_1", code: "CODE_DE1" };
const dataElement2 = { id: "DE_2", code: "CODE_DE2" };

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: { appKey: "bulk-load", storage: "dataStore" },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

const dataElement1Metadata = {
    id: dataElement1.id,
    type: "dataElements",
    code: dataElement1.code,
    name: "Data element 1",
    valueType: "TEXT",
    categoryCombo: { id: "CC_DEFAULT" },
};

const dataElement2Metadata = {
    id: dataElement2.id,
    type: "dataElements",
    code: dataElement2.code,
    name: "Data element 2",
    valueType: "TEXT",
    categoryCombo: { id: "CC_DEFAULT" },
};

function buildElementMetadata(): Map<string, unknown> {
    return new Map<string, unknown>([
        ["CC_DEFAULT", { id: "CC_DEFAULT", type: "categoryCombos", code: "default", categories: [] }],
        [dataElement1.id, dataElement1Metadata],
        [dataElement2.id, dataElement2Metadata],
    ]);
}

function buildTemplate(): GeneratedTemplate {
    return {
        type: "generated",
        id: "TEMPLATE_ID",
        name: "Test template",
        rowOffset: 1,
        styleSources: [],
        dataFormId: { type: "value", id: "ds1" },
        dataFormType: { type: "value", id: "dataSets" },
    };
}

function buildParams(settings: Settings, includeMetadataCodes: boolean): SheetBuilderParams {
    const elementMetadata = buildElementMetadata();

    return {
        element: {
            id: "ds1",
            type: "dataSets",
            displayName: "Test DataSet",
            formType: "DEFAULT",
            periodType: "Monthly",
            categoryCombo: { id: "CC_DEFAULT" },
            dataSetElements: [],
            sections: [],
            attributeValues: [],
        },
        metadata: {},
        elementMetadata,
        organisationUnits: [],
        rawMetadata: {
            dataElements: [dataElement1Metadata, dataElement2Metadata],
            categoryOptionCombos: [],
            optionSets: [],
            programStageDataElements: [],
            programTrackedEntityAttributes: [],
        },
        language: "en",
        template: buildTemplate(),
        settings,
        downloadRelationships: false,
        splitDataEntryTabsBySection: false,
        useCodesForMetadata: false,
        orgUnitShortName: false,
        includeMetadataCodes,
    };
}

function getMetadataSheetCellValue(workbook: Workbook, cellRef: string): unknown {
    return workbook.xworkbook.sheet(metadataSheetName).cell(cellRef).value();
}

describe("SheetBuilder", () => {
    let settings: Settings;

    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    describe("Metadata sheet Code column", () => {
        it("adds a Code header and writes item codes when includeMetadataCodes is true", async () => {
            const workbook = await new SheetBuilder(buildParams(settings, true)).generate();

            expect(getMetadataSheetCellValue(workbook, `${codeColumn}1`)).toEqual("Code");
            expect(getMetadataSheetCellValue(workbook, `${codeColumn}4`)).toEqual(dataElement1.code);
            expect(getMetadataSheetCellValue(workbook, `${codeColumn}5`)).toEqual(dataElement2.code);
        });

        it("does not write a Code header or values when includeMetadataCodes is false", async () => {
            const workbook = await new SheetBuilder(buildParams(settings, false)).generate();

            expect(getMetadataSheetCellValue(workbook, `${codeColumn}1`)).toBeUndefined();
            expect(getMetadataSheetCellValue(workbook, `${codeColumn}4`)).toBeUndefined();
            expect(getMetadataSheetCellValue(workbook, `${codeColumn}5`)).toBeUndefined();
        });
    });
});
