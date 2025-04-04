import { useSnackbar } from "@eyeseetea/d2-ui-components";
import { useCallback } from "react";
import i18n from "../../../utils/i18n";
import SettingsFields, { SettingsFieldsProps } from "../../components/settings/SettingsFields";
import { useAppContext } from "../../contexts/app-context";
import { RouteComponentProps } from "../Router";

type CustomTemplatesProps = Pick<RouteComponentProps, "customTemplates" | "setCustomTemplates">;

type SettingsPageProps = RouteComponentProps & CustomTemplatesProps;

export default function SettingsPage(props: SettingsPageProps) {
    const { settings, setSettings, customTemplates, setCustomTemplates } = props;
    const snackbar = useSnackbar();
    const { compositionRoot } = useAppContext();

    const save = useCallback<SettingsFieldsProps["onChange"]>(
        async newSettings => {
            const res = await newSettings.save(compositionRoot);

            if (!res.status) {
                snackbar.error(res.error);
            } else {
                setSettings(newSettings);
                snackbar.success(i18n.t("Settings saved"));
            }
        },
        [setSettings, snackbar, compositionRoot]
    );

    return (
        <SettingsFields
            settings={settings}
            onChange={save}
            customTemplates={customTemplates}
            setCustomTemplates={setCustomTemplates}
        />
    );
}
