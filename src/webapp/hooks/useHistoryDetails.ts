import { useEffect, useState } from "react";
import { useSnackbar } from "@eyeseetea/d2-ui-components";

import { HistoryEntryDetails } from "../../domain/entities/HistoryEntry";
import { Id } from "../../domain/entities/ReferenceObject";
import i18n from "../../utils/i18n";
import { useAppContext } from "../contexts/app-context";

interface UseHistoryDetailsOptions {
    isOpen: boolean;
    entryId: Id;
}

interface UseHistoryDetailsReturn {
    details: HistoryEntryDetails | null;
    loading: boolean;
}

export function useHistoryDetails({ isOpen, entryId }: UseHistoryDetailsOptions): UseHistoryDetailsReturn {
    const { compositionRoot } = useAppContext();
    const snackbar = useSnackbar();

    const [details, setDetails] = useState<HistoryEntryDetails | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        const loadDetails = async () => {
            try {
                setLoading(true);
                const entryDetails = await compositionRoot.history.getDetails(entryId);
                setDetails(entryDetails);
            } catch (error) {
                console.error("Error loading history details:", error);
                snackbar.error(i18n.t("Error loading import details"));
            } finally {
                setLoading(false);
            }
        };

        loadDetails();
    }, [isOpen, entryId, compositionRoot.history, snackbar]);

    return {
        details,
        loading,
    };
}
