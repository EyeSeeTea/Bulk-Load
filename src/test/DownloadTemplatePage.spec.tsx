import { LoadingProvider, SnackbarProvider } from "@eyeseetea/d2-ui-components";
import { act, render } from "@testing-library/react";
import _ from "lodash";
import { getCompositionRoot } from "../CompositionRoot";
import { AppContext } from "../webapp/contexts/app-context";
import Settings from "../webapp/logic/settings";
import DownloadTemplatePage from "../webapp/pages/download-template/DownloadTemplatePage";
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
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
        view = render(
            <AppContext.Provider value={{ api, d2: {}, compositionRoot }}>
                <LoadingProvider>
                    <SnackbarProvider>
                        <DownloadTemplatePage
                            settings={settings}
                            themes={[]}
                            setSettings={_.noop}
                            setThemes={_.noop}
                            customTemplates={[]}
                            setCustomTemplates={_.noop}
                        />
                    </SnackbarProvider>
                </LoadingProvider>
            </AppContext.Provider>
        );
    });
    return view as ReturnType<typeof render>;
};

describe("ImportTemplatePage", () => {
    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    test("Renders correctly", async () => {
        const view = await renderComponent();

        expect(view.getByRole("heading", { name: "Template" })).toBeInTheDocument();
        expect(view.getByRole("heading", { name: "Advanced template properties" })).toBeInTheDocument();
        expect(view.getByRole("button", { name: "Download template" })).toBeInTheDocument();
    });
});

export {};
