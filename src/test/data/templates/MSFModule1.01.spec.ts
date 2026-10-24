import { getCompositionRoot } from "../../../CompositionRoot";
import { DataSetGenerated03 } from "../../../data/templates/generated-data-set/DataSetGenerated.03";
import { MSFModule101 } from "../../../data/templates/msf/MSFModule1.01";
import { GeneratedTemplate, Template } from "../../../domain/entities/Template";
import Settings from "../../../webapp/logic/settings";
import { SheetBuilder, SheetBuilderParams } from "../../../webapp/logic/sheetBuilder";
import { Workbook } from "../../../webapp/logic/Workbook";
import { initializeMockServer } from "../../mocks/server";

const dataEntrySheetName = "Data Entry";
const completedCell = "D5";
const completedLabel = "Completed";
const dataElement1 = { id: "DE_1" };
const dataElement2 = { id: "DE_2" };
const categoryComboId = "CC_DEFAULT";
const categoryId = "CAT_1";
const categoryOptionCombo1 = { id: "COC_A" };
const categoryOptionCombo2 = { id: "COC_B" };

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: { appKey: "bulk-load", storage: "dataStore" },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

function buildElementMetadata(): Map<string, unknown> {
    const dataElementMetadata = (id: string, name: string) => ({
        id,
        type: "dataElements",
        name,
        valueType: "TEXT",
        categoryCombo: { id: categoryComboId },
    });

    const categoryOptionComboMetadata = (id: string, categoryOptionId: string, name: string) => ({
        id,
        type: "categoryOptionCombos",
        name,
        categoryCombo: { id: categoryComboId },
        categoryOptions: [{ id: categoryOptionId }],
    });

    return new Map<string, unknown>([
        [
            categoryComboId,
            { id: categoryComboId, type: "categoryCombos", code: "default", categories: [{ id: categoryId }] },
        ],
        [
            categoryId,
            {
                id: categoryId,
                type: "categories",
                name: "Category 1",
                categoryOptions: [
                    { id: "CO_A", name: "Option A" },
                    { id: "CO_B", name: "Option B" },
                ],
            },
        ],
        [categoryOptionCombo1.id, categoryOptionComboMetadata(categoryOptionCombo1.id, "CO_A", "Option A")],
        [categoryOptionCombo2.id, categoryOptionComboMetadata(categoryOptionCombo2.id, "CO_B", "Option B")],
        [dataElement1.id, dataElementMetadata(dataElement1.id, "Data element 1")],
        [dataElement2.id, dataElementMetadata(dataElement2.id, "Data element 2")],
    ]);
}

function buildParams(settings: Settings, template: Template): SheetBuilderParams {
    return {
        element: {
            id: "ds1",
            type: "dataSets",
            displayName: "Test DataSet",
            formType: "DEFAULT",
            periodType: "Monthly",
            categoryCombo: { id: categoryComboId },
            dataSetElements: [{ dataElement: { id: dataElement1.id } }, { dataElement: { id: dataElement2.id } }],
            sections: [],
            attributeValues: [],
        },
        metadata: {},
        elementMetadata: buildElementMetadata(),
        organisationUnits: [{ id: "OU_1", displayName: "Org unit 1", translations: [] }],
        rawMetadata: {
            dataElements: [],
            categoryOptionCombos: [],
            optionSets: [],
            programStageDataElements: [],
            programTrackedEntityAttributes: [],
        },
        language: "en",
        template,
        settings,
        downloadRelationships: false,
        splitDataEntryTabsBySection: false,
        useCodesForMetadata: false,
        orgUnitShortName: false,
        includeMetadataCodes: false,
    };
}

function msfLayoutTemplate(): GeneratedTemplate {
    return {
        type: "generated",
        id: "TEMPLATE_ID",
        name: "Test template",
        rowOffset: 3,
        styleSources: [],
        dataFormId: { type: "value", id: "ds1" },
        dataFormType: { type: "value", id: "dataSets" },
        dataSources: new MSFModule101().dataSources,
    };
}

function dataEntryCell(workbook: Workbook, cellRef: string): { value: unknown; formula: unknown } {
    const cell = workbook.xworkbook.sheet(dataEntrySheetName).cell(cellRef);
    return { value: cell.value(), formula: cell.formula() };
}

describe("MSFModule101", () => {
    let settings: Settings;

    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    describe("Data Entry layout", () => {
        it("declares a data range that leaves the Completed column free", async () => {
            const workbook = await new SheetBuilder(buildParams(settings, msfLayoutTemplate())).generate();

            expect(dataEntryCell(workbook, completedCell).value).toEqual(completedLabel);
            expect(dataEntryCell(workbook, "D4").value).toBeUndefined();
            expect(dataEntryCell(workbook, "E4").formula).toEqual(`_${dataElement1.id}`);
            expect(dataEntryCell(workbook, "E5").formula).toEqual(`_${categoryOptionCombo1.id}`);
            expect(dataEntryCell(workbook, "F5").formula).toEqual(`_${categoryOptionCombo2.id}`);
        });

        it("leaves the generated data set template layout untouched", async () => {
            const workbook = await new SheetBuilder(buildParams(settings, new DataSetGenerated03())).generate();

            expect(dataEntryCell(workbook, completedCell).value).toEqual(completedLabel);
            expect(dataEntryCell(workbook, "E4").formula).toEqual(`_${dataElement1.id}`);
            expect(dataEntryCell(workbook, "E5").formula).toEqual(`_${categoryOptionCombo1.id}`);
        });
    });
});
