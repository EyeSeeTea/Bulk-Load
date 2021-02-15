import {
    ShareUpdate, Sharing, 
    SharingRule, 
    ConfirmationDialog,
    ConfirmationDialogProps, } from "@eyeseetea/d2-ui-components";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import React, { useCallback, useState } from "react";
import i18n from "../../../locales";
import { D2Api } from "../../../types/d2-api";
import { useAppContext } from "../../contexts/app-context";
import { PermissionSetting, PermissionType } from "../../logic/settings";
import { SettingsFieldsProps } from "./SettingsFields";

interface PermissionsDialogProps extends SettingsFieldsProps {
    onClose: () => void;
    permissionsType: PermissionSetting;
}

export default function PermissionsDialog({ onClose, permissionsType, settings, onChange }: PermissionsDialogProps) {
    const { api } = useAppContext();
    const search = useCallback((query: string) => searchUsers(api, query), [api]);
    const [dialogProps, updateDialog] = useState<ConfirmationDialogProps | null>(null);

    const buildMetaObject = useCallback(
        (setting: PermissionSetting) => {
            const displayName =
                setting === "generation"
                    ? i18n.t("Access to Template Generation")
                    : setting === "import"
                    ? i18n.t("Access to Import Data")
                    : i18n.t("Access to Settings and Themes");

            const buildSharings = (type: PermissionType) =>
                settings.getPermissions(setting, type).map(sharing => ({ ...sharing, access: "" }));

            return {
                meta: {
                    allowPublicAccess: false,
                    allowExternalAccess: false,
                },
                object: {
                    id: "",
                    displayName,
                    externalAccess: false,
                    publicAccess: "",
                    userAccesses: buildSharings("user"),
                    userGroupAccesses: buildSharings("userGroup"),
                },
            };
        },
        [settings]
    );

    const onUpdateSharingOptions = useCallback(
        (setting: PermissionSetting) => {
            return async ({ userAccesses: users, userGroupAccesses: userGroups }: ShareUpdate) => {
                const buildPermission = (type: PermissionType, rule?: SharingRule[]) =>
                    rule?.map(({ id, displayName }) => ({ id, displayName })) ?? settings.getPermissions(setting, type);

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
            let allUser: SharingRule[] = [];
            if (checked) {
                allUser = [{ id: "ALL", displayName: "", access: "" }];
                // TODO:
                // Rise pop up
                updateDialog({
                    title: i18n.t("Access Permissions confirmation"),
                    description: i18n.t("This option provides access permissions to all users and therefore, will not be possible to get back to the previous state of this section. Are you sure you want sustain this action?"),
                    saveText :"Accept",
                    cancelText :"Cancel" ,
                    onCancel: () => {updateDialog(null); },
                    onSave: async () => {updateDialog(null); },
                });
                // Remove previous users
                // Remove previous user groups

            }
            const newSettings = settings.setPermissions(setting, "allUsers", allUser);
            return onChange(newSettings);
        },
        [onChange, settings]
    );

    const allUserChecked = useCallback(
        (setting: PermissionSetting) => {
            const userPermissions = settings.getPermissions(setting, "allUsers");
            if (userPermissions.length > 0) {
                const isAllUserAllowed = userPermissions.some(item => item.id === "ALL");
                return isAllUserAllowed;
            }
            return false;
        },
        [settings]
    );

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
            {dialogProps && <ConfirmationDialog 
            isOpen={true} 
            maxWidth={"xl"}
            {...dialogProps}

            />}

            <FormControlLabel
                control={
                    <Checkbox
                        checked={allUserChecked(permissionsType)}
                        onChange={(ev: any) => {
                            const checked = ev.target.checked;
                            onChangeAllUsers(permissionsType, checked);
                        }}
                    />
                }
                label={"All users allowed"}
            />
        </ConfirmationDialog>
    );
}

function searchUsers(api: D2Api, query: string) {
    const options = {
        fields: { id: true, displayName: true },
        filter: { displayName: { ilike: query } },
    };
    return api.metadata.get({ users: options, userGroups: options }).getData();
}
