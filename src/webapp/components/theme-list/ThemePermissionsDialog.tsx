import { ConfirmationDialog, ShareUpdate, Sharing, useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";
import { useCallback } from "react";
import i18n from "../../../utils/i18n";
import { useAppContext } from "../../contexts/app-context";
import { Id } from "../../../domain/entities/ReferenceObject";
import { Theme } from "../../../domain/entities/Theme";

export interface ThemePermissionsDialogProps {
    themeId: Id;
    onClose: () => void;
    rows: Theme[];
    onChange: (rows: Theme[]) => void;
}

export function ThemePermissionsDialog(props: ThemePermissionsDialogProps) {
    const { themeId, onClose, rows: themes, onChange } = props;
    const { compositionRoot } = useAppContext();
    const snackbar = useSnackbar();
    const loading = useLoading();

    const search = useCallback((query: string) => compositionRoot.users.search(query), [compositionRoot]);

    const buildMetaObject = useCallback(
        (id: Id) => {
            const buildSharing = () => {
                const theme = themes.find(theme => theme.id === id);
                return {
                    users: theme?.sharing?.users,
                    userGroups: theme?.sharing?.userGroups,
                    external: theme?.sharing?.external,
                    public: theme?.sharing?.public,
                };
            };

            const sharing = buildSharing();

            return {
                meta: {
                    allowPublicAccess: true,
                    allowExternalAccess: false,
                },
                object: {
                    id: "",
                    displayName: i18n.t("Access to Themes"),
                    externalAccess: sharing.external,
                    publicAccess: sharing.public,
                    userAccesses: sharing.users,
                    userGroupAccesses: sharing.userGroups,
                },
            };
        },
        [themes]
    );

    const onUpdateSharingOptions = useCallback(() => {
        return async ({
            userAccesses: users,
            userGroupAccesses: userGroups,
            publicAccess: publicSharing,
            externalAccess: external,
        }: ShareUpdate) => {
            loading.show();
            const themesWithUpdated = themes.map((theme): Theme => {
                return theme.id === themeId
                    ? theme.updateSharing({
                          external: external ?? false,
                          public: publicSharing ?? "r-------",
                          users: users ?? [],
                          userGroups: userGroups ?? [],
                      })
                    : theme;
            });

            const updatedTheme = themesWithUpdated.find(theme => theme.id === themeId);
            if (updatedTheme) {
                const errors = await compositionRoot.themes.save(updatedTheme);
                if (errors.length === 0) {
                    onChange(themesWithUpdated);
                } else {
                    snackbar.error(errors.join("\n"));
                }
            } else {
                snackbar.error(i18n.t("Error while updating sharing settings"));
            }
            loading.hide();
        };
    }, [compositionRoot.themes, loading, onChange, snackbar, themeId, themes]);

    return (
        <ConfirmationDialog isOpen={true} fullWidth={true} onCancel={onClose} cancelText={i18n.t("Close")}>
            <Sharing
                meta={buildMetaObject(themeId)}
                showOptions={{
                    dataSharing: true,
                    publicSharing: true,
                    externalSharing: true,
                    permissionPicker: true,
                }}
                onSearch={search}
                onChange={onUpdateSharingOptions()}
            />
        </ConfirmationDialog>
    );
}
