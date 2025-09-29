import { useCallback, useState } from "react";
import { useSnackbar } from "@eyeseetea/d2-ui-components";
import { useAppContext } from "../contexts/app-context";
import i18n from "../../utils/i18n";

export function useHistoryMaintenance() {
    const { compositionRoot } = useAppContext();
    const snackbar = useSnackbar();
    const [isConfirmationVisible, setConfirmationVisible] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const showConfirmation = useCallback(() => {
        setConfirmationVisible(true);
    }, []);

    const hideConfirmation = useCallback(() => {
        setConfirmationVisible(false);
    }, []);

    const executeCleanup = useCallback(
        async (cutoffDate: Date) => {
            setIsLoading(true);
            try {
                await compositionRoot.history.cleanup(cutoffDate);
                snackbar.success(i18n.t("History cleanup completed successfully"));
                setConfirmationVisible(false);
            } catch (error: any) {
                snackbar.error(error.message || i18n.t("An error occurred during history cleanup"));
            } finally {
                setIsLoading(false);
            }
        },
        [compositionRoot, snackbar]
    );

    return {
        isConfirmationVisible,
        isLoading,
        showConfirmation,
        hideConfirmation,
        executeCleanup,
    };
}
