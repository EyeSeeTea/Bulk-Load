import { Icon, ListItem, ListItemIcon, ListItemText } from "@material-ui/core";
import React from "react";
import i18n from "../../../utils/i18n";
import { ConfirmationDialogWithPeriodSelection } from "./ConfirmationDialogWithPeriodSelection";
import { OperationConfirmationDialog } from "./OperationConfirmationDialog";
import { MaintenanceCleanupState } from "../../hooks/useMaintenanceCleanup";

export interface MaintenanceItemConfig {
    icon: string;
    primaryText: string;
    secondaryText: string;
    loadingText: string;
    confirmationTitle: string;
    confirmationDescription: string;
    periodInputLabel: string;
    finalConfirmationTitle: string;
    operationName: string;
    saveText: string;
}

export interface MaintenanceItemProps {
    config: MaintenanceItemConfig;
    maintenance: MaintenanceCleanupState;
}

export const MaintenanceItem: React.FC<MaintenanceItemProps> = ({ config, maintenance }) => {
    const finalConfirmationParameters: [string, string][] = React.useMemo(
        () => [[i18n.t("Period"), i18n.t("Items older than {{period}}", { period: maintenance.selectedPeriod })]],
        [maintenance.selectedPeriod]
    );
    return (
        <>
            <ListItem button onClick={maintenance.showConfirmation} disabled={maintenance.isLoading}>
                <ListItemIcon>
                    <Icon>{config.icon}</Icon>
                </ListItemIcon>
                <ListItemText
                    primary={maintenance.isLoading ? config.loadingText : config.primaryText}
                    secondary={config.secondaryText}
                />
            </ListItem>

            {maintenance.isConfirmationVisible && (
                <ConfirmationDialogWithPeriodSelection
                    isOpen={true}
                    title={config.confirmationTitle}
                    description={config.confirmationDescription}
                    onSave={maintenance.showFinalConfirmation}
                    onCancel={maintenance.hideConfirmation}
                    saveText={config.saveText}
                    cancelText={i18n.t("Cancel")}
                    disableSave={maintenance.isLoading}
                    periodInputLabel={config.periodInputLabel}
                />
            )}

            {maintenance.isFinalConfirmationVisible && (
                <OperationConfirmationDialog
                    isOpen={true}
                    title={config.finalConfirmationTitle}
                    operation={config.operationName}
                    parameters={finalConfirmationParameters}
                    onConfirm={maintenance.confirmFinalCleanup}
                    onCancel={maintenance.hideFinalConfirmation}
                    isLoading={maintenance.isLoading}
                />
            )}
        </>
    );
};
