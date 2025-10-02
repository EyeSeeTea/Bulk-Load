import { useCallback, useState } from "react";
import { useSnackbar } from "@eyeseetea/d2-ui-components";

export interface MaintenanceCleanupConfig {
    cleanupAction: (cutoffDate: Date) => Promise<void>;
    successMessage: string;
    errorMessage: string;
}

export interface MaintenanceCleanupState {
    isConfirmationVisible: boolean;
    isFinalConfirmationVisible: boolean;
    isLoading: boolean;
    selectedPeriod: string;
    showConfirmation: () => void;
    hideConfirmation: () => void;
    confirmFinalCleanup: () => Promise<void>;
    showFinalConfirmation: (cutoffDate: Date, period: string) => void;
    hideFinalConfirmation: () => void;
}

export function useMaintenanceCleanup(config: MaintenanceCleanupConfig): MaintenanceCleanupState {
    const snackbar = useSnackbar();
    const [isConfirmationVisible, setConfirmationVisible] = useState<boolean>(false);
    const [isFinalConfirmationVisible, setFinalConfirmationVisible] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<string>("");

    const showConfirmation = useCallback(() => {
        setConfirmationVisible(true);
    }, []);

    const hideConfirmation = useCallback(() => {
        setConfirmationVisible(false);
    }, []);

    const showFinalConfirmation = useCallback((date: Date, period: string) => {
        setSelectedDate(date);
        setSelectedPeriod(period);
        setConfirmationVisible(false);
        setFinalConfirmationVisible(true);
    }, []);

    const hideFinalConfirmation = useCallback(() => {
        setFinalConfirmationVisible(false);
        setSelectedDate(null);
        setSelectedPeriod("");
    }, []);

    const confirmFinalCleanup = useCallback(async () => {
        if (!selectedDate) return;

        setIsLoading(true);
        try {
            await config.cleanupAction(selectedDate);
            snackbar.success(config.successMessage);
            setFinalConfirmationVisible(false);
            setSelectedDate(null);
            setSelectedPeriod("");
        } catch (error: any) {
            snackbar.error(error.message || config.errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [snackbar, selectedDate, config]);

    return {
        isConfirmationVisible,
        isFinalConfirmationVisible,
        isLoading,
        selectedPeriod,
        showConfirmation,
        hideConfirmation,
        showFinalConfirmation,
        hideFinalConfirmation,
        confirmFinalCleanup,
    };
}
