//@ts-ignore
import { useConfig } from "@dhis2/app-runtime";
import { LoadingProvider, SnackbarProvider } from "@eyeseetea/d2-ui-components";
import { MuiThemeProvider } from "@material-ui/core/styles";
import React, { useEffect, useState } from "react";
import { getCompositionRoot } from "../../../CompositionRoot";
import { D2Api } from "../../../types/d2-api";
import { addExtraTranslations } from "../../../utils/translations";
import { AppContext, AppContextI } from "../../contexts/app-context";
import Settings from "../../logic/settings";
import { Router } from "../../pages/Router";
import { useMigrations } from "../migrations/hooks";
import Migrations from "../migrations/Migrations";
import Share from "../share/Share";
import { Feedback } from "@eyeseetea/feedback-component";
import "./App.css";
import { muiTheme } from "./themes/dhis2.theme";
import { Maybe } from "../../../types/utils";
import { AppConfig } from "./AppConfig";

export interface AppProps {
    api: D2Api;
    d2: object;
}

export const App: React.FC<AppProps> = React.memo(({ api, d2 }) => {
    const { baseUrl } = useConfig();

    const [showShareButton, setShowShareButton] = useState(false);
    const [appContext, setAppContext] = useState<AppContextI | null>(null);
    const [appConfig, setAppConfig] = useState<Maybe<AppConfig>>();
    const [username, setUsername] = useState<string>("");

    const migrations = useMigrations(appContext);

    useEffect(() => {
        const run = async () => {
            const appConfig = (await fetch("app-config.json", {
                credentials: "same-origin",
            }).then(res => res.json())) as AppConfig;
            const compositionRoot = getCompositionRoot({
                appConfig,
                dhisInstance: { type: "local", url: baseUrl },
            });
            const settings = await Settings.build(api, compositionRoot);
            setUsername(settings.currentUser.username);
            setShowShareButton(appConfig.appearance.showShareButton || false);
            setAppConfig(appConfig);
            setAppContext({ d2: d2 as object, api, compositionRoot });
            addExtraTranslations();
        };

        run();
    }, [d2, api, baseUrl]);

    if (!appContext) {
        return null;
    }

    if (migrations.state.type === "pending") {
        return (
            <AppContext.Provider value={appContext}>
                <Migrations migrations={migrations} />
            </AppContext.Provider>
        );
    }

    if (migrations.state.type === "checked") {
        return (
            <AppContext.Provider value={appContext}>
                <MuiThemeProvider theme={muiTheme}>
                    <LoadingProvider>
                        <SnackbarProvider>
                            <div id="app">
                                <Router />
                            </div>
                            <Share visible={showShareButton} />
                            {appConfig && appConfig.feedback && (
                                <Feedback options={appConfig.feedback} username={username} />
                            )}
                        </SnackbarProvider>
                    </LoadingProvider>
                </MuiThemeProvider>
            </AppContext.Provider>
        );
    }

    return null;
});

export default App;
