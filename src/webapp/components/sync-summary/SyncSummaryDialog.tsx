import { DialogContent } from "@material-ui/core";
import { ConfirmationDialog } from "@eyeseetea/d2-ui-components";
import { SynchronizationResult } from "../../../domain/entities/SynchronizationResult";
import i18n from "../../../utils/i18n";
import SyncSummary from "./SyncSummary";

interface SyncSummaryDialogProps {
    results: SynchronizationResult[];
    onClose: () => void;
}

const SyncSummaryDialog = ({ results, onClose }: SyncSummaryDialogProps) => {
    return (
        <ConfirmationDialog
            isOpen={true}
            title={i18n.t("Synchronization Results")}
            onCancel={onClose}
            cancelText={i18n.t("Ok")}
            maxWidth={"lg"}
            fullWidth={true}
        >
            <DialogContent>
                <SyncSummary results={results} />
            </DialogContent>
        </ConfirmationDialog>
    );
};

export default SyncSummaryDialog;
