import { Icon, ListItem, ListItemIcon, ListItemText, makeStyles } from "@material-ui/core";
import React, { useCallback, useState } from "react";
import i18n from "../../../utils/i18n";
import { useAppContext } from "../../contexts/app-context";
import { useMaintenanceCleanup } from "../../hooks/useMaintenanceCleanup";
import Settings from "../../logic/settings";
import { MaintenanceItem } from "./MaintenanceItem";
import { RegenerateMetadataDialog } from "./RegenerateMetadataDialog";

export type MaintenanceSectionProps = {
    settings: Settings;
};

export function MaintenanceSection(props: MaintenanceSectionProps): React.ReactElement {
    const { settings } = props;
    const classes = useStyles();
    const { compositionRoot } = useAppContext();

    const [isRegenerateDialogVisible, setRegenerateDialogVisible] = useState(false);

    const openRegenerateDialog = useCallback(() => setRegenerateDialogVisible(true), []);
    const closeRegenerateDialog = useCallback(() => setRegenerateDialogVisible(false), []);

    const uploadsMaintenance = useMaintenanceCleanup({
        cleanupAction: async (cutoffDate: Date) => {
            await compositionRoot.history.cleanupDocuments(cutoffDate, settings.currentUser);
        },
        successMessage: i18n.t("File cleanup completed successfully"),
        errorMessage: i18n.t("An error occurred during file cleanup"),
    });

    const historyMaintenance = useMaintenanceCleanup({
        cleanupAction: async (cutoffDate: Date) => {
            await compositionRoot.history.cleanup(cutoffDate, settings.currentUser);
        },
        successMessage: i18n.t("History cleanup completed successfully"),
        errorMessage: i18n.t("An error occurred during history cleanup"),
    });

    return (
        <React.Fragment>
            {isRegenerateDialogVisible && (
                <RegenerateMetadataDialog
                    title={i18n.t("Regenerate template metadata")}
                    settings={settings}
                    onClose={closeRegenerateDialog}
                />
            )}

            <h3 className={classes.title}>{i18n.t("Maintenance")}</h3>

            <MaintenanceItem
                config={{
                    icon: "description",
                    primaryText: i18n.t("File cleanup"),
                    secondaryText: i18n.t(
                        "Remove files older than the selected period. History entries will be kept but the files will be unaccessible"
                    ),
                    loadingText: i18n.t("Cleaning up files..."),
                    confirmationTitle: i18n.t("Confirm File Cleanup"),
                    confirmationDescription: i18n.t(
                        "Are you sure you want to remove all files older than the selected period? This action cannot be undone. History entries will be kept but the files will be inaccessible."
                    ),
                    periodInputLabel: i18n.t("Remove files older than"),
                    finalConfirmationTitle: i18n.t("Confirm File Cleanup"),
                    operationName: i18n.t("File cleanup"),
                    saveText: i18n.t("Clean up files"),
                }}
                maintenance={uploadsMaintenance}
            />

            <MaintenanceItem
                config={{
                    icon: "history",
                    primaryText: i18n.t("History cleanup"),
                    secondaryText: i18n.t(
                        "Remove history entries and their documents older than the selected period. This action cannot be undone"
                    ),
                    loadingText: i18n.t("Cleaning up history..."),
                    confirmationTitle: i18n.t("Confirm History Cleanup"),
                    confirmationDescription: i18n.t(
                        "Are you sure you want to remove all history entries and their documents older than the selected period? This action cannot be undone."
                    ),
                    periodInputLabel: i18n.t("Remove history entries older than"),
                    finalConfirmationTitle: i18n.t("Confirm History Cleanup"),
                    operationName: i18n.t("History cleanup"),
                    saveText: i18n.t("Clean up history"),
                }}
                maintenance={historyMaintenance}
            />

            <ListItem button onClick={openRegenerateDialog}>
                <ListItemIcon>
                    <Icon>autorenew</Icon>
                </ListItemIcon>
                <ListItemText
                    primary={i18n.t("Regenerate template metadata")}
                    secondary={i18n.t(
                        "Refresh the Metadata sheet of an existing template file with current DHIS2 metadata"
                    )}
                />
            </ListItem>
        </React.Fragment>
    );
}

const useStyles = makeStyles({
    title: { marginTop: 0 },
});
