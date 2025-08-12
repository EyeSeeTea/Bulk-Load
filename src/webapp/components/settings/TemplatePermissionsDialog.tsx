import {
    ConfirmationDialog,
    ConfirmationDialogProps,
    ShareUpdate,
    Sharing,
    SharingRule,
} from "@eyeseetea/d2-ui-components";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import { useCallback, useState } from "react";
import i18n from "../../../utils/i18n";
import { useAppContext } from "../../contexts/app-context";
import { PermissionType } from "../../logic/settings";
import { SettingsFieldsProps } from "./SettingsFields";
import { Id } from "../../../domain/entities/ReferenceObject";

export interface TemplatePermissionsDialogProps extends SettingsFieldsProps {
    templateId: Id;
    onClose: () => void;
}

export function TemplatePermissionsDialog(props: TemplatePermissionsDialogProps) {
    const { templateId, onClose, settings, onChange } = props;
    const { compositionRoot } = useAppContext();

    const search = useCallback((query: string) => compositionRoot.users.search(query), [compositionRoot]);
    const [dialogProps, updateDialog] = useState<ConfirmationDialogProps | null>(null);

    const buildMetaObject = useCallback(() => {
        const buildSharings = (type: PermissionType) =>
            settings
                .getTemplatePermissions(templateId, type)
                .map(({ id, name }) => ({ id, displayName: name, access: "" }));

        return {
            meta: {
                allowPublicAccess: false,
                allowExternalAccess: false,
            },
            object: {
                id: "",
                displayName: i18n.t("Access to Templates"),
                externalAccess: false,
                publicAccess: "",
                userAccesses: buildSharings("user"),
                userGroupAccesses: buildSharings("userGroup"),
            },
        };
    }, [settings, templateId]);

    const onUpdateSharingOptions = useCallback(() => {
        return async ({ userAccesses: users, userGroupAccesses: userGroups }: ShareUpdate) => {
            const buildPermission = (type: PermissionType, rule?: SharingRule[]) =>
                rule?.map(({ id, displayName }) => ({ id, name: displayName, type })) ??
                settings.getTemplatePermissions(templateId, type);

            const newSettings = settings
                .setTemplatePermissions(templateId, "user", buildPermission("user", users))
                .setTemplatePermissions(templateId, "userGroup", buildPermission("userGroup", userGroups));

            await onChange(newSettings);
        };
    }, [onChange, settings, templateId]);

    const onChangeAllUsers = useCallback(
        (checked: boolean) => {
            if (checked) {
                updateDialog({
                    title: i18n.t("Access Permissions confirmation"),
                    description: i18n.t(
                        "This option gives access to all users. The current list of allowed users and user groups will be deleted. Do you want to proceed?"
                    ),
                    saveText: i18n.t("Accept"),
                    cancelText: i18n.t("Cancel"),
                    onCancel: () => {
                        updateDialog(null);
                    },
                    onSave: () => {
                        updateDialog(null);
                        onChange(settings.setTemplateAllPermission(templateId, true));
                    },
                });
            } else {
                onChange(settings.setTemplateAllPermission(templateId, false));
            }
        },
        [settings, onChange, templateId]
    );

    const allUserChecked = useCallback(() => settings.hasAllPermissionForTemplate(templateId), [settings, templateId]);

    return (
        <ConfirmationDialog isOpen={true} fullWidth={true} onCancel={onClose} cancelText={i18n.t("Close")}>
            {!allUserChecked() && (
                <Sharing
                    meta={buildMetaObject()}
                    showOptions={{
                        dataSharing: false,
                        publicSharing: false,
                        externalSharing: false,
                        permissionPicker: false,
                    }}
                    onSearch={search}
                    onChange={onUpdateSharingOptions()}
                />
            )}
            {dialogProps && <ConfirmationDialog isOpen={true} maxWidth="xl" {...dialogProps} />}

            <FormControlLabel
                control={<Checkbox checked={allUserChecked()} onChange={ev => onChangeAllUsers(ev.target.checked)} />}
                label={i18n.t("All users allowed")}
            />
        </ConfirmationDialog>
    );
}
