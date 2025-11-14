import { useCallback, useState } from "react";
import { useSnackbar } from "@eyeseetea/d2-ui-components";

import { HistoryEntryStatus, HistoryEntrySummary } from "../../domain/entities/HistoryEntry";
import i18n from "../../utils/i18n";
import { useAppContext } from "../contexts/app-context";
import Settings from "../logic/settings";

export default function useHistory() {
    const { compositionRoot } = useAppContext();
    const [loading, setLoading] = useState(false);
    const snackbar = useSnackbar();

    const [entries, setEntries] = useState<HistoryEntrySummary[]>([]);

    const load = useCallback(
        async (settings: Settings, { searchText, status }: { searchText?: string; status?: HistoryEntryStatus }) => {
            try {
                setLoading(true);
                const entries = await compositionRoot.history.getEntries(settings, { searchText, status });
                setEntries(entries);
            } catch (error) {
                console.error("Error loading history entries:", error);
                snackbar.error(i18n.t("Error loading history entries"));
            } finally {
                setLoading(false);
            }
        },
        [compositionRoot.history, snackbar]
    );

    return {
        entries,
        load,
        loading,
    };
}
