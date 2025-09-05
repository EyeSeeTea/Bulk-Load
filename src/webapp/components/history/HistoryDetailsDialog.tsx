import { ConfirmationDialog } from "@eyeseetea/d2-ui-components";
import { DialogContent, Typography, makeStyles, CircularProgress, Box } from "@material-ui/core";

import { Id } from "../../../domain/entities/ReferenceObject";
import i18n from "../../../utils/i18n";
import SyncSummary from "../sync-summary/SyncSummary";
import { useHistoryDetails } from "../../hooks/useHistoryDetails";

interface HistoryDetailsDialogProps {
    isOpen: boolean;
    entryId: Id;
    entryName: string;
    onClose: () => void;
}

const useStyles = makeStyles({
    dialogContent: {
        minHeight: 400,
        padding: "16px 24px",
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        marginBottom: 16,
        fontWeight: 600,
    },
    sectionContent: {
        marginLeft: 0,
    },
    errorSection: {
        marginTop: 16,
    },
    errorTitle: {
        color: "#f44336",
        marginBottom: 8,
        fontWeight: 600,
    },
    errorMessage: {
        padding: 16,
        backgroundColor: "#ffebee",
        borderLeft: "4px solid #f44336",
        borderRadius: 4,
    },
    noDataMessage: {
        textAlign: "center",
        padding: "2rem",
        color: "#666",
    },
});

export function HistoryDetailsDialog({ isOpen, entryId, entryName, onClose }: HistoryDetailsDialogProps) {
    const classes = useStyles();
    const { details, loading } = useHistoryDetails({
        isOpen,
        entryId,
    });

    const renderContent = () => {
        if (loading) {
            return (
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
                    <CircularProgress />
                </Box>
            );
        }

        if (!details) {
            return (
                <div className={classes.noDataMessage}>
                    <Typography variant="h6">{i18n.t("No details available for this import")}</Typography>
                </div>
            );
        }

        const { results, errorDetails } = details;

        return (
            <>
                {results && results.length > 0 && (
                    <div className={classes.section}>
                        <Typography variant="h6" className={classes.sectionTitle}>
                            {i18n.t("Import Results")}
                        </Typography>
                        <div className={classes.sectionContent}>
                            <SyncSummary results={results} />
                        </div>
                    </div>
                )}

                {errorDetails && (
                    <div className={classes.section}>
                        <Typography variant="h6" className={classes.errorTitle}>
                            {i18n.t("Import Errors")}
                        </Typography>
                        <div className={classes.sectionContent}>
                            <div className={classes.errorMessage}>
                                {errorDetails.type === "UNHANDLED_EXCEPTION" ? (
                                    <div>
                                        <Typography variant="subtitle1" style={{ fontWeight: "bold", marginBottom: 8 }}>
                                            {i18n.t("Unhandled Exception")}
                                        </Typography>
                                        <Typography variant="body2">{errorDetails.message}</Typography>
                                    </div>
                                ) : (
                                    <div>
                                        <Typography variant="subtitle1" style={{ fontWeight: "bold", marginBottom: 8 }}>
                                            {getErrorTypeTitle(errorDetails.type)}
                                        </Typography>
                                        <Typography variant="body2">{getErrorDescription(errorDetails)}</Typography>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* No data available */}
                {!results && !errorDetails && (
                    <div className={classes.noDataMessage}>
                        <Typography variant="body1">
                            {i18n.t("No import results or error details available for this entry.")}
                        </Typography>
                    </div>
                )}
            </>
        );
    };

    return (
        <ConfirmationDialog
            isOpen={isOpen}
            title={i18n.t("Import Details: {{name}}", { name: entryName, nsSeparator: false })}
            onCancel={onClose}
            cancelText={i18n.t("Close")}
            maxWidth="lg"
            fullWidth
        >
            <DialogContent className={classes.dialogContent}>{renderContent()}</DialogContent>
        </ConfirmationDialog>
    );
}

function getErrorTypeTitle(type: string): string {
    switch (type) {
        case "INVALID_ORG_UNITS":
            return i18n.t("Invalid Organization Units");
        case "DUPLICATE_VALUES":
            return i18n.t("Duplicate Data Values");
        case "INVALID_DATA_VALUES":
            return i18n.t("Invalid Data Values");
        case "INVALID_TEMPLATE":
            return i18n.t("Invalid Template");
        case "UNHANDLED_EXCEPTION":
            return i18n.t("Unhandled Exception");
        default:
            return i18n.t("Import Error");
    }
}

function getErrorDescription(errorDetails: any): string {
    switch (errorDetails.type) {
        case "INVALID_ORG_UNITS":
            return i18n.t(
                "The import contains data for organization units that you don't have access to or that don't exist in the system."
            );
        case "DUPLICATE_VALUES":
            return i18n.t(
                "The import contains data values that already exist in the system. Please review the duplicate strategy settings."
            );
        case "INVALID_DATA_VALUES":
            return i18n.t("The import contains invalid data values that couldn't be processed.");
        case "INVALID_TEMPLATE":
            return i18n.t("The template file format is invalid or doesn't match the expected structure.");
        default:
            return i18n.t("An error occurred during the import process.");
    }
}
