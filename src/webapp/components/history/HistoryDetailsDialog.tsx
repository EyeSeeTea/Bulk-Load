import React, { useCallback, useEffect, useState } from "react";
import { ConfirmationDialog, useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";
import {
    DialogContent,
    Typography,
    makeStyles,
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from "@material-ui/core";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";

import { HistoryEntryDetails } from "../../../domain/entities/HistoryEntry";
import { Id } from "../../../domain/entities/ReferenceObject";
import { SynchronizationResult } from "../../../domain/entities/SynchronizationResult";
import i18n from "../../../utils/i18n";
import { useAppContext } from "../../contexts/app-context";
import SyncSummary from "../sync-summary/SyncSummary";

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
    errorSection: {
        marginTop: 16,
    },
    errorTitle: {
        color: "#f44336",
        marginBottom: 8,
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
    const { compositionRoot } = useAppContext();
    const loading = useLoading();
    const snackbar = useSnackbar();

    const [details, setDetails] = useState<HistoryEntryDetails | null>(null);
    const [showSyncSummary, setShowSyncSummary] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        const loadDetails = async () => {
            try {
                loading.show();
                const entryDetails = await compositionRoot.history.getDetails(entryId);
                setDetails(entryDetails);
            } catch (error) {
                console.error("Error loading history details:", error);
                snackbar.error(i18n.t("Error loading import details"));
            } finally {
                loading.hide();
            }
        };

        loadDetails();
    }, [isOpen, entryId, compositionRoot.history, loading, snackbar]);

    const handleClose = useCallback(() => {
        setDetails(null);
        setShowSyncSummary(false);
        onClose();
    }, [onClose]);

    const showSyncResults = useCallback(() => {
        setShowSyncSummary(true);
    }, []);

    const hideSyncResults = useCallback(() => {
        setShowSyncSummary(false);
    }, []);

    const renderContent = () => {
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
                {/* Show SyncSummary dialog if requested */}
                {showSyncSummary && results && <SyncSummary results={results} onClose={hideSyncResults} />}

                {/* Import Results Section */}
                {results && results.length > 0 && (
                    <Accordion defaultExpanded>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="h6">{i18n.t("Import Results")}</Typography>
                        </AccordionSummary>
                        <AccordionDetails style={{ flexDirection: "column" }}>
                            <Typography variant="body2" style={{ marginBottom: 16 }}>
                                {i18n.t("This import completed with {{count}} result(s).", { count: results.length })}
                            </Typography>

                            {/* Summary of results */}
                            {results.map((result, index) => (
                                <div key={index} style={{ marginBottom: 8 }}>
                                    <Typography variant="body2">
                                        <strong>{result.title}:</strong> {getStatusText(result.status)}
                                        {result.message && ` - ${result.message}`}
                                    </Typography>
                                </div>
                            ))}

                            <div style={{ marginTop: 16 }}>
                                <button
                                    onClick={showSyncResults}
                                    style={{
                                        padding: "8px 16px",
                                        backgroundColor: "#1976d2",
                                        color: "white",
                                        border: "none",
                                        borderRadius: 4,
                                        cursor: "pointer",
                                    }}
                                >
                                    {i18n.t("View Detailed Results")}
                                </button>
                            </div>
                        </AccordionDetails>
                    </Accordion>
                )}

                {/* Error Details Section */}
                {errorDetails && (
                    <Accordion defaultExpanded>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="h6" className={classes.errorTitle}>
                                {i18n.t("Import Errors")}
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails style={{ flexDirection: "column" }}>
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
                        </AccordionDetails>
                    </Accordion>
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
            onCancel={handleClose}
            cancelText={i18n.t("Close")}
            maxWidth="lg"
            fullWidth
        >
            <DialogContent className={classes.dialogContent}>{renderContent()}</DialogContent>
        </ConfirmationDialog>
    );
}

function getStatusText(status: SynchronizationResult["status"]): string {
    switch (status) {
        case "SUCCESS":
            return i18n.t("Success");
        case "ERROR":
            return i18n.t("Error");
        case "WARNING":
            return i18n.t("Warning");
        case "NETWORK ERROR":
            return i18n.t("Network Error");
        case "PENDING":
            return i18n.t("Pending");
        default:
            return status;
    }
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
