//@ts-ignore
import { HeaderBar } from "@dhis2/ui-widgets";
import { useSnackbar } from "@eyeseetea/d2-ui-components";
import { makeStyles, Paper } from "@material-ui/core";
import React, { useEffect, useMemo, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Theme } from "../../domain/entities/Theme";
import i18n from "../../utils/i18n";
import { AppDrawer, AppDrawerToggle } from "../components/drawer/Drawer";
import { useAppContext } from "../contexts/app-context";
import Settings from "../logic/settings";
import DownloadTemplatePage from "./download-template/DownloadTemplatePage";
import ImportTemplatePage from "./import-template/ImportTemplatePage";
import SettingsPage from "./settings/SettingsPage";
import ThemesPage from "./themes/ThemesPage";
import BlankTemplatePage from "./blank-template/BlankTemplatePage";
import { AboutPage } from "./about/AboutPage";
import { CustomTemplate } from "../../domain/entities/Template";
import HistoryPage from "./history/HistoryPage";

export interface RouteComponentProps {
    settings: Settings;
    setSettings: (settings: Settings) => void;
    themes: Theme[];
    setThemes: (themes: Theme[]) => void;
    customTemplates: CustomTemplate[];
    setCustomTemplates: (customTemplates: CustomTemplate[]) => void;
}

export interface AppRoute {
    key: string;
    path: string;
    name: string;
    icon: string;
    section: string;
    defaultRoute?: boolean;
    component: (props: RouteComponentProps) => React.ReactElement | null;
    auth?: (settings: Settings) => boolean;
}

export const Router: React.FC = React.memo(() => {
    const { api, compositionRoot } = useAppContext();
    const snackbar = useSnackbar();
    const classes = useStyles();

    const [isOpen, setOpen] = useState(true);
    const [settings, setSettings] = useState<Settings>();
    const [themes, setThemes] = useState<Theme[]>([]);
    const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);

    useEffect(() => {
        Settings.build(api, compositionRoot)
            .then(setSettings)
            .catch(err => snackbar.error(`Cannot load settings: ${err.message || err.toString()}`));
    }, [api, snackbar, compositionRoot]);

    useEffect(() => {
        compositionRoot.themes.list().then(setThemes);
    }, [compositionRoot]);

    useEffect(() => {
        compositionRoot.templates.getCustom().then(setCustomTemplates);
    }, [compositionRoot]);

    const routes: AppRoute[] = useMemo(
        () => [
            {
                key: "home",
                name: i18n.t("Home"),
                icon: "home",
                path: "/home",
                section: "main",
                auth: (settings: Settings) => settings.isBlankPageVisibleForCurrentUser(),
                component: () => <BlankTemplatePage />,
            },
            {
                key: "download",
                name: i18n.t("Download template"),
                icon: "cloud_download",
                path: "/download",
                section: "main",
                auth: (settings: Settings) => settings.isTemplateGenerationVisible(),
                component: (props: RouteComponentProps) => <DownloadTemplatePage {...props} />,
            },
            {
                key: "import",
                name: i18n.t("Import data"),
                icon: "cloud_upload",
                path: "/import",
                section: "main",
                auth: (settings: Settings) => settings.isImportDataVisibleForCurrentUser(),
                component: (props: RouteComponentProps) => <ImportTemplatePage {...props} />,
            },
            {
                key: "history",
                name: i18n.t("History"),
                icon: "history",
                path: "/history",
                section: "main",
                auth: (settings: Settings) => settings.isHistoryVisibleForCurrentUser(),
                component: (props: RouteComponentProps) => <HistoryPage {...props} />,
            },
            {
                key: "themes",
                name: i18n.t("Themes"),
                icon: "format_paint",
                path: "/themes",
                section: "settings",
                auth: (settings: Settings) => settings.areSettingsVisibleForCurrentUser(),
                component: (props: RouteComponentProps) => <ThemesPage {...props} />,
            },
            {
                key: "settings",
                name: i18n.t("Settings"),
                icon: "settings",
                path: "/settings",
                section: "settings",
                auth: (settings: Settings) => settings.areSettingsVisibleForCurrentUser(),
                component: (props: RouteComponentProps) => <SettingsPage {...props} />,
            },
            {
                key: "about",
                name: i18n.t("About"),
                icon: "info",
                path: "/about",
                section: "about",
                auth: (_settings: Settings) => true,
                component: (_props: RouteComponentProps) => <AboutPage />,
            },
        ],
        []
    );

    if (!settings) return null;

    const userRoutes = routes.filter(({ auth }) => !auth || auth(settings));
    const defaultRoute = userRoutes.find(({ defaultRoute }) => defaultRoute) ?? userRoutes[0];

    return (
        <HashRouter>
            <div className={classes.flex}>
                <div className={classes.header}>
                    <HeaderBar appName={"Bulk Load"} />
                </div>

                <AppDrawer isOpen={isOpen} routes={userRoutes} />
                <AppDrawerToggle isOpen={isOpen} setOpen={setOpen} />

                <div className={`${classes.content} ${isOpen ? classes.contentOpen : classes.contentCollapsed}`}>
                    <Paper className={classes.paper}>
                        <Routes>
                            {defaultRoute && <Route path={"/"} element={<Navigate to={defaultRoute.path} />} />}

                            {userRoutes.map(({ key, path, component }) => (
                                <Route
                                    key={key}
                                    path={path}
                                    element={component({
                                        settings,
                                        themes,
                                        setSettings,
                                        setThemes,
                                        customTemplates,
                                        setCustomTemplates,
                                    })}
                                />
                            ))}
                        </Routes>
                    </Paper>
                </div>
            </div>
        </HashRouter>
    );
});

const useStyles = makeStyles({
    flex: { display: "flex" },
    header: { position: "fixed", top: 0, width: "100%", zIndex: 1 },
    paper: { margin: "2em", marginTop: "2em", padding: "2em", height: "95%" },
    content: { flexGrow: 1, marginTop: 50, height: "100%" },
    contentOpen: { marginLeft: 325 },
    contentCollapsed: { marginLeft: 25 },
});
