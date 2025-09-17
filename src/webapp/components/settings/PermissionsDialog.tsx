import React from "react";
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
import { ofType } from "../../../types/utils";
import { useAppContext } from "../../contexts/app-context";
import { PermissionSetting, PermissionType } from "../../logic/settings";
import { SettingsFieldsProps } from "./SettingsFields";

export interface PermissionsDialogProps extends SettingsFieldsProps {
    onClose: () => void;
    permissionsType: PermissionSetting;
}

function getTranslations() {
    return {
        permissionType: ofType<Record<PermissionSetting, string>>({
            generation: i18n.t("Access to Template Generation"),
            import: i18n.t("Access to Import Data"),
            settings: i18n.t("Access to Settings and Themes"),
        }),
    };
}

export function PermissionsDialog({ onClose, permissionsType, settings, onChange }: PermissionsDialogProps) {
    const { compositionRoot } = useAppContext();

    const search = useCallback((query: string) => compositionRoot.users.search(query), [compositionRoot]);
    const [dialogProps, updateDialog] = useState<ConfirmationDialogProps | null>(null);
    const t = React.useMemo(getTranslations, []);

    const buildMetaObject = useCallback(
        (setting: PermissionSetting) => {
            const buildSharings = (type: PermissionType) =>
                settings.getPermissions(setting, type).map(({ id, name }) => ({ id, displayName: name, access: "" }));

            return {
                meta: {
                    allowPublicAccess: false,
                    allowExternalAccess: false,
                },
                object: {
                    id: "",
                    displayName: t.permissionType[setting],
                    externalAccess: false,
                    publicAccess: "",
                    userAccesses: buildSharings("user"),
                    userGroupAccesses: buildSharings("userGroup"),
                },
            };
        },
        [settings, t]
    );

    const onUpdateSharingOptions = useCallback(
        (setting: PermissionSetting) => {
            return async ({ userAccesses: users, userGroupAccesses: userGroups }: ShareUpdate) => {
                const buildPermission = (type: PermissionType, rule?: SharingRule[]) =>
                    rule?.map(({ id, displayName }) => ({ id, name: displayName })) ??
                    settings.getPermissions(setting, type);

                const newSettings = settings
                    .setPermissions(setting, "user", buildPermission("user", users))
                    .setPermissions(setting, "userGroup", buildPermission("userGroup", userGroups));
                await onChange(newSettings);
            };
        },
        [onChange, settings]
    );

    const onChangeAllUsers = useCallback(
        (setting: PermissionSetting, checked: boolean) => {
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
                        onChange(settings.setAllPermission(setting, true));
                    },
                });
            } else {
                onChange(settings.setAllPermission(setting, false));
            }
        },
        [settings, onChange]
    );

    const allUserChecked = useCallback((setting: PermissionSetting) => settings.hasAllPermission(setting), [settings]);

    return (
        <ConfirmationDialog isOpen={true} fullWidth={true} onCancel={onClose} cancelText={i18n.t("Close")}>
            {!allUserChecked(permissionsType) && (
                <Sharing
                    meta={buildMetaObject(permissionsType)}
                    showOptions={{
                        dataSharing: false,
                        publicSharing: false,
                        externalSharing: false,
                        permissionPicker: false,
                    }}
                    onSearch={search}
                    onChange={onUpdateSharingOptions(permissionsType)}
                />
            )}
            {dialogProps && <ConfirmationDialog isOpen={true} maxWidth="xl" {...dialogProps} />}

            <FormControlLabel
                control={
                    <Checkbox
                        checked={allUserChecked(permissionsType)}
                        onChange={ev => onChangeAllUsers(permissionsType, ev.target.checked)}
                    />
                }
                label={i18n.t("All users allowed")}
            />
        </ConfirmationDialog>
    );
}
