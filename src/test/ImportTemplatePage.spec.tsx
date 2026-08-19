import { LoadingProvider, SnackbarProvider } from "@eyeseetea/d2-ui-components";
import { act, render, screen } from "@testing-library/react";
import _ from "lodash";
import { getCompositionRoot } from "../CompositionRoot";
import { CustomTemplate } from "../domain/entities/Template";
import { AppContext } from "../webapp/contexts/app-context";
import Settings from "../webapp/logic/settings";
import ImportTemplatePage from "../webapp/pages/import-template/ImportTemplatePage";
import { initializeMockServer } from "./mocks/server";

let settings: Settings;

const documentWarning =
    "The data will be imported as usual, but the file itself will not be saved because you do not have " +
    "any of the required authorities (ALL, F_DOCUMENT_PRIVATE_ADD). The import will still be recorded " +
    "in the history, without a file available for download.";

const settingsWithUploadPermission = (currentSettings: Settings): Settings =>
    new Settings({
        ...currentSettings,
        currentUser: { ...currentSettings.currentUser, canUploadDocuments: true },
    });

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: {
        appKey: "bulk-load",
        storage: "dataStore",
    },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

const renderComponent = async (pageSettings: Settings = settings) => {
    await act(async () => {
        render(
            <AppContext.Provider value={{ api, d2: {}, compositionRoot }}>
                <LoadingProvider>
                    <SnackbarProvider>
                        <ImportTemplatePage
                            settings={pageSettings}
                            themes={[]}
                            setSettings={_.noop}
                            setThemes={_.noop}
                            customTemplates={templates}
                            setCustomTemplates={setTemplates}
                        />
                    </SnackbarProvider>
                </LoadingProvider>
            </AppContext.Provider>
        );
    });
};

const templates = [] as CustomTemplate[];
const setTemplates = () => {};

describe("ImportTemplatePage", () => {
    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    test("Renders correctly", async () => {
        await renderComponent();

        expect(screen.getByRole("heading", { name: "Bulk data import" })).toBeInTheDocument();
        expect(screen.getByText(/drag and drop/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Import data" })).toBeInTheDocument();
    });

    describe("document upload warning", () => {
        it("warns that the file will not be saved when the user cannot upload documents", async () => {
            await renderComponent();

            expect(screen.getByRole("alert")).toHaveTextContent(documentWarning);
        });

        it("is not shown when the user can upload documents", async () => {
            await renderComponent(settingsWithUploadPermission(settings));

            expect(screen.queryByRole("alert")).toBeNull();
        });
    });
});

export {};
