import { vi } from "vitest";
import { MockWebServer, Request as MockRequest } from "../../utils/tests/MockWebServer";
// These are type-only imports: the values are loaded dynamically inside `beforeAll`, after
// `mockWebServer.start()`, because a static import of any of these modules (or of d2-api,
// which they load transitively) would let d2-api capture the unpatched `globalThis.fetch`
// before MSW replaces it. See the comment there for details.
import type { CompositionRoot } from "../../CompositionRoot";
import type SettingsClass from "../../webapp/logic/settings";
import type { D2Api } from "../../types/d2-api";
import type { getGeneratedTemplateId as GetGeneratedTemplateId } from "../../webapp/logic/sheetBuilder";

let savedBlob: Blob | undefined;

vi.mock("file-saver", () => ({
    saveAs: (blob: Blob) => {
        savedBlob = blob;
    },
}));

const dataSetId = "DATASET_ID";
const dataElementId = "DE_1";
const orgUnitId = "OU_1";
const baseUrl = "http://localhost";

const mockWebServer = new MockWebServer();

let downloadTemplate: CompositionRoot["templates"]["download"];
let settings: SettingsClass;
let api: D2Api;
let getGeneratedTemplateId: typeof GetGeneratedTemplateId;

// xlsx-populate only builds a Blob output (what `Workbook.writeToBuffer()` requests) when
// `process.browser` is truthy, matching the app's real webpack/Vite build. Under vitest that
// flag isn't set, so it's forced here to reproduce production's output path.
const originalProcessBrowser = (process as unknown as { browser?: boolean }).browser;

// This is a characterization test, not a spec derived from an intended design: it pins down
// today's metadata -> XLSX output so the upcoming `api` removal doesn't silently change it.
// It should not be read as confirmation that `DownloadTemplateUseCase` is modeled correctly.
// Per EyeSeeTea's Clean Architecture know-how ("Export to file" / "Import from File"), a
// disk-bound download like this one is arguably a UI Utility, not a domain use case — the
// current code already leaks that: it imports `file-saver`/`fs` directly and branches on
// Node vs. browser (see DownloadTemplateUseCase.ts:1-2, :249/:252), and
// RegenerateTemplateMetadataUseCase imports its internals (getElement/getElementMetadata),
// a sign that a real `getTemplateMetadata` use case is buried in here alongside UI-only
// save-to-disk logic. That reshaping is out of scope for this refactor (tracked as a
// follow-up in the PR description); if/when it happens, this test will need to move or be
// rewritten around whatever replaces `execute()`.
describe("DownloadTemplateUseCase", () => {
    beforeAll(async () => {
        (process as unknown as { browser?: boolean }).browser = true;

        // MSW must patch `fetch` before d2-api (and anything importing it, transitively:
        // CompositionRoot, Settings, sheetBuilder) is loaded. FetchHttpClientRepository.js
        // captures `globalThis.fetch` into a module-scoped variable at import time, so an
        // earlier static import would freeze a reference to the unpatched fetch and every
        // request through D2Api would bypass MSW. Hence the dynamic imports below, run only
        // after `mockWebServer.start()`.
        mockWebServer.start({ onUnhandledRequest: "error" });

        const { D2Api } = await import("../../types/d2-api");
        api = new D2Api({ baseUrl });

        const { getCompositionRoot } = await import("../../CompositionRoot");
        const compositionRoot = getCompositionRoot({
            appConfig: { appKey: "bulk-load", storage: "dataStore" },
            dhisInstance: { type: "local", url: baseUrl },
            mockApi: api,
        });
        downloadTemplate = compositionRoot.templates.download;

        givenDefaultInstanceSetup();
        const SettingsModule = await import("../../webapp/logic/settings");
        settings = await SettingsModule.default.build(api, compositionRoot);

        ({ getGeneratedTemplateId } = await import("../../webapp/logic/sheetBuilder"));
    });

    afterEach(() => {
        mockWebServer.resetHandlers();
        givenDefaultInstanceSetup();
    });

    afterAll(() => {
        mockWebServer.close();
        (process as unknown as { browser?: boolean }).browser = originalProcessBrowser;
    });

    it("generates an xlsx template with the metadata sheet populated from the dataSet", async () => {
        givenADataSet({
            id: dataSetId,
            dataElement: { id: dataElementId, name: "Data element 1" },
            categoryCombo: { id: "CC_DEFAULT", name: "default" },
        });
        givenOrgUnit({ id: orgUnitId, name: "Org unit 1" });

        const workbook = await whenDownloadingGeneratedTemplate({ id: dataSetId, orgUnits: [orgUnitId] });

        expect(metadataCell(workbook, "A1")).toEqual("Identifier");
        expect(metadataCell(workbook, "A3")).toEqual("CC_DEFAULT");
        expect(metadataCell(workbook, "C3")).toEqual("default");
        expect(metadataCell(workbook, "A5")).toEqual(dataElementId);
        expect(metadataCell(workbook, "C5")).toEqual("Data element 1");
        expect(metadataCell(workbook, "A6")).toEqual(orgUnitId);
        expect(metadataCell(workbook, "B6")).toEqual("organisationUnit");
        expect(metadataCell(workbook, "C6")).toEqual("Org unit 1");
        expect(workbook.sheet("Data Entry")).toBeTruthy();
    });
});

// ----------------------------------------------------------------------------------------------
// given...
// ----------------------------------------------------------------------------------------------

function givenDefaultInstanceSetup() {
    mockWebServer.addRequestHandlers([
        {
            method: "get",
            endpoint: `${baseUrl}/api/me`,
            httpStatusCode: 200,
            response: {
                id: "user1",
                name: "Name",
                userCredentials: { username: "user" },
                userGroups: [{ id: "BwyMfDBLih9" }],
                authorities: [],
                dataViewOrganisationUnits: [],
                organisationUnits: [],
            },
        },
        { method: "get", endpoint: `${baseUrl}/api/me/authorization`, httpStatusCode: 200, response: [] },
        {
            method: "get",
            endpoint: `${baseUrl}/api/dataStore/bulk-load/BULK_LOAD_SETTINGS`,
            httpStatusCode: 200,
            response: {
                models: { dataSet: true, program: true },
                permissionsForGeneration: ["BwyMfDBLih9"],
                permissionsForSettings: ["BwyMfDBLih9"],
                permissionsForImport: ["BwyMfDBLih9"],
                orgUnitSelection: "both",
            },
        },
        { method: "get", endpoint: `${baseUrl}/api/dataStore/bulk-load/templates`, httpStatusCode: 200, response: [] },
    ]);

    // Permissions lookup (userGroups/users:fields, from GetDefaultSettingsUseCase), getCategoryOptions()
    // in DownloadTemplateUseCase (no category options to filter by default), and any other /metadata
    // caller not covered by a more specific given*() below.
    mockWebServer.addRequestHandlers([
        {
            method: "get",
            endpoint: `${baseUrl}/api/metadata`,
            httpStatusCode: 200,
            response: (req: MockRequest) => (req.params.has("categoryOptions:fields") ? { categoryOptions: [] } : {}),
        },
    ]);
}

function givenADataSet(options: {
    id: string;
    dataElement: { id: string; name: string };
    categoryCombo: { id: string; name: string };
}) {
    const { id, dataElement, categoryCombo } = options;

    mockWebServer.addRequestHandlers([
        {
            method: "get",
            endpoint: `${baseUrl}/api/dataSets/${id}`,
            httpStatusCode: 200,
            response: {
                id,
                displayName: "Test DataSet",
                organisationUnits: [],
                attributeValues: [],
                categoryCombo: { id: categoryCombo.id },
                dataSetElements: [
                    {
                        dataElement: {
                            id: dataElement.id,
                            name: dataElement.name,
                            formName: dataElement.name,
                            valueType: "TEXT",
                            categoryCombo: { id: categoryCombo.id },
                        },
                    },
                ],
                formType: "DEFAULT",
                sections: [],
                periodType: "Monthly",
            },
        },
        {
            method: "get",
            endpoint: `${baseUrl}/api/dataSets/${id}/metadata.json`,
            httpStatusCode: 200,
            response: {
                dataElements: [
                    {
                        id: dataElement.id,
                        type: "dataElements",
                        name: dataElement.name,
                        valueType: "TEXT",
                        categoryCombo: { id: categoryCombo.id },
                    },
                ],
                categoryCombos: [
                    { id: categoryCombo.id, type: "categoryCombos", name: categoryCombo.name, categories: [] },
                ],
                categoryOptionCombos: [
                    {
                        id: "COC_DEFAULT",
                        type: "categoryOptionCombos",
                        name: categoryCombo.name,
                        categoryOptions: [],
                        categoryCombo: { id: categoryCombo.id },
                    },
                ],
                organisationUnits: [],
            },
        },
    ]);

    // DataElementDisaggregationsMappingD2Repository.getByDataSet()
    mockWebServer.addRequestHandlers([
        {
            method: "get",
            endpoint: `${baseUrl}/api/metadata`,
            httpStatusCode: 200,
            response: (req: MockRequest) =>
                req.params.has("dataSets:fields")
                    ? {
                          dataSets: [
                              {
                                  id,
                                  dataSetElements: [
                                      {
                                          dataElement: {
                                              id: dataElement.id,
                                              categoryCombo: {
                                                  id: categoryCombo.id,
                                                  categoryOptionCombos: [
                                                      { id: "COC_DEFAULT", name: categoryCombo.name },
                                                  ],
                                              },
                                          },
                                      },
                                  ],
                              },
                          ],
                      }
                    : {},
        },
    ]);
}

function givenOrgUnit(options: { id: string; name: string }) {
    mockWebServer.addRequestHandlers([
        {
            method: "get",
            endpoint: `${baseUrl}/api/organisationUnits`,
            httpStatusCode: 200,
            response: (req: MockRequest) => {
                const fields = req.params.get("fields") ?? "";
                if (fields.includes("displayShortName")) {
                    return {
                        organisationUnits: [
                            {
                                id: options.id,
                                displayName: options.name,
                                code: "CODE_OU1",
                                translations: [],
                                displayShortName: options.name,
                            },
                        ],
                    };
                }
                return { organisationUnits: [] };
            },
        },
    ]);
}

// ----------------------------------------------------------------------------------------------
// when...
// ----------------------------------------------------------------------------------------------

async function whenDownloadingGeneratedTemplate(options: { id: string; orgUnits: string[] }) {
    savedBlob = undefined;
    const type = "dataSets";

    await downloadTemplate(api, {
        type,
        id: options.id,
        language: "en",
        orgUnits: options.orgUnits,
        populate: false,
        templateId: getGeneratedTemplateId(type),
        templateType: "generated",
        splitDataEntryTabsBySection: false,
        useCodesForMetadata: false,
        showLanguage: false,
        showPeriod: false,
        dataFilter: {},
        downloadRelationships: false,
        settings,
    });

    if (!savedBlob) throw new Error("saveAs was not called");
    const buffer = await blobToArrayBuffer(savedBlob);
    const XlsxPopulate = (await import("@eyeseetea/xlsx-populate")).default;
    return XlsxPopulate.fromDataAsync(buffer);
}

// ----------------------------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------------------------

// jsdom's Blob has no `arrayBuffer()`, unlike a browser's — read it back the same way
// xlsx-populate itself does for Blob input (FileReader), see `_convertInputToBufferAsync`.
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}

function metadataCell(workbook: Awaited<ReturnType<typeof whenDownloadingGeneratedTemplate>>, ref: string) {
    return workbook.sheet("Metadata").cell(ref).value();
}

export {};
