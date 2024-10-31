import { LoadingProvider, SnackbarProvider } from "@eyeseetea/d2-ui-components";
import "@testing-library/jest-dom/extend-expect";
import { act, render, screen } from "@testing-library/react";
import _ from "lodash";
import { getCompositionRoot } from "../CompositionRoot";
import { CustomTemplate } from "../domain/entities/Template";
import { AppContext } from "../webapp/contexts/app-context";
import Settings from "../webapp/logic/settings";
import ImportTemplatePage from "../webapp/pages/import-template/ImportTemplatePage";
import { initializeMockServer } from "./mocks/server";

let settings: Settings;

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: {
        appKey: "bulk-load",
        storage: "dataStore",
    },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

const renderComponent = async () => {
    await act(async () => {
        render(
            <AppContext.Provider value={{ api, d2: {}, compositionRoot }}>
                <LoadingProvider>
                    <SnackbarProvider>
                        <ImportTemplatePage
                            settings={settings}
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
});

export {};
