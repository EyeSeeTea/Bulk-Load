import { useEffect, useState } from "react";
import { useSnackbar } from "@eyeseetea/d2-ui-components";

import { getHistoryEntryOrgUnitIds, HistoryEntryDetails } from "../../domain/entities/HistoryEntry";
import { OrgUnitReference, toOrgUnitReferences } from "../../domain/entities/OrgUnit";
import { Id } from "../../domain/entities/ReferenceObject";
import i18n from "../../utils/i18n";
import { useAppContext } from "../contexts/app-context";

interface UseHistoryDetailsOptions {
    isOpen: boolean;
    entryId: Id;
}

interface UseHistoryDetailsReturn {
    details: HistoryEntryDetails | null;
    orgUnits: OrgUnitReference[];
    loading: boolean;
}

export function useHistoryDetails({ isOpen, entryId }: UseHistoryDetailsOptions): UseHistoryDetailsReturn {
    const { compositionRoot } = useAppContext();
    const snackbar = useSnackbar();

    const [details, setDetails] = useState<HistoryEntryDetails | null>(null);
    const [orgUnits, setOrgUnits] = useState<OrgUnitReference[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        /* Names are resolved on render instead of persisted so that they are shown in the
           language of the current user and reflect any later rename of the org unit. */
        const resolveOrgUnits = async (entryDetails: HistoryEntryDetails): Promise<OrgUnitReference[]> => {
            const orgUnitIds = getHistoryEntryOrgUnitIds(entryDetails);
            if (orgUnitIds.length === 0) return [];

            try {
                const resolved = await compositionRoot.orgUnits.getByIds(orgUnitIds);
                return toOrgUnitReferences(orgUnitIds, resolved);
            } catch (error) {
                // Degrade to the ids: a failure here must not hide the import details
                console.error("Error loading organisation units for history entry:", error);
                return toOrgUnitReferences(orgUnitIds, []);
            }
        };

        const loadDetails = async () => {
            try {
                setLoading(true);
                const entryDetails = await compositionRoot.history.getDetails(entryId);
                setDetails(entryDetails);
                setOrgUnits(entryDetails ? await resolveOrgUnits(entryDetails) : []);
            } catch (error) {
                console.error("Error loading history details:", error);
                snackbar.error(i18n.t("Error loading import details"));
            } finally {
                setLoading(false);
            }
        };

        loadDetails();
    }, [isOpen, entryId, compositionRoot.history, compositionRoot.orgUnits, snackbar]);

    return {
        details,
        orgUnits,
        loading,
    };
}
