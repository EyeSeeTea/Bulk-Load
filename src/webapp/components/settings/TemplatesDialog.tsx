import { ConfirmationDialog } from "@eyeseetea/d2-ui-components";
import i18n from "../../../utils/i18n";
import { SettingsFieldsProps } from "./SettingsFields";
import TemplateListTable from "./TemplateListTable";
import { RouteComponentProps } from "../../pages/Router";

type CustomTemplatesProps = Pick<RouteComponentProps, "customTemplates" | "setCustomTemplates">;

export interface TemplateDialogProps extends SettingsFieldsProps, CustomTemplatesProps {
    title: string;
    onClose: () => void;
}

export function TemplatesDialog(props: TemplateDialogProps): React.ReactElement {
    const { title, onClose, settings, onChange, customTemplates, setCustomTemplates } = props;

    return (
        <ConfirmationDialog
            isOpen={true}
            title={title}
            maxWidth="lg"
            fullWidth={true}
            onCancel={onClose}
            cancelText={i18n.t("Close")}
        >
            <TemplateListTable
                customTemplates={customTemplates}
                setCustomTemplates={setCustomTemplates}
                settings={settings}
                setSettings={onChange}
            />
        </ConfirmationDialog>
    );
}
