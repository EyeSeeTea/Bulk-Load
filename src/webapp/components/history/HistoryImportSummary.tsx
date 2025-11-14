import React from "react";
import { Typography, makeStyles, Button, Icon, Tooltip } from "@material-ui/core";
import moment from "moment";

import { HistoryEntryDetails, HistoryEntrySummary } from "../../../domain/entities/HistoryEntry";
import i18n from "../../../utils/i18n";
import { HistoryStatusIndicator } from "./HistoryStatusIndicator";
import { useDownloadDocument } from "../../hooks/useDownloadDocument";
import { DataFormType } from "../../../domain/entities/DataForm";
import { Maybe } from "../../../types/utils";

interface HistoryImportSummaryProps {
    summary: HistoryEntrySummary;
    details?: HistoryEntryDetails;
}

export function HistoryImportSummary({ summary, details }: HistoryImportSummaryProps) {
    const classes = useStyles();
    const { downloadDocument } = useDownloadDocument();

    return (
        <div className={classes.entryInfo}>
            <Typography variant="h6" className={classes.sectionTitle}>
                {i18n.t("Import Summary")}
            </Typography>
            <div className={classes.infoRow}>
                <Typography className={classes.infoLabel}>{i18n.t("Timestamp")}:</Typography>
                <Typography variant="body2">{moment(summary.timestamp).format("YYYY-MM-DD HH:mm:ss")}</Typography>
            </div>
            <div className={classes.infoRow}>
                <Typography className={classes.infoLabel}>{i18n.t("User")}:</Typography>
                <Typography variant="body2">{summary.username}</Typography>
            </div>
            <div className={classes.infoRow}>
                <Typography className={classes.infoLabel}>{i18n.t("Status")}:</Typography>
                <HistoryStatusIndicator status={summary.status} iconStyle={{ fontSize: 18, marginRight: 8 }} />
            </div>
            {details && (
                <>
                    <div className={classes.infoRow}>
                        <Typography className={classes.infoLabel}>{i18n.t("Import strategy")}:</Typography>
                        <Typography variant="body2">{getImportStrategyLabel(details, summary.dataFormType)}</Typography>
                    </div>
                    {details.configuration?.comment && (
                        <div className={classes.infoRow}>
                            <Typography className={classes.infoLabel}>{i18n.t("Comment")}:</Typography>
                            <Typography variant="body2">{details.configuration?.comment}</Typography>
                        </div>
                    )}
                </>
            )}
            <div className={classes.infoRow}>
                <Typography className={classes.infoLabel}>{i18n.t("File")}:</Typography>
                {!summary.documentId || summary.documentDeleted ? (
                    <Tooltip
                        title={
                            summary.documentDeleted
                                ? i18n.t("The original file has been deleted and is no longer available for download")
                                : i18n.t("The original file is not available for download")
                        }
                        arrow
                        placement="top"
                    >
                        <div className={classes.deletedFile}>
                            <Icon className={classes.deletedFileIcon}>warning</Icon>
                            <Typography variant="body2" className={classes.deletedFileName}>
                                {summary.fileName}
                            </Typography>
                        </div>
                    </Tooltip>
                ) : (
                    <Button
                        size="small"
                        variant="outlined"
                        className={classes.downloadButton}
                        startIcon={<Icon>get_app</Icon>}
                        onClick={() =>
                            downloadDocument({
                                documentId: summary.documentId,
                                fileName: summary.fileName,
                            })
                        }
                    >
                        {summary.fileName}
                    </Button>
                )}
            </div>
        </div>
    );
}

function getImportStrategyLabel(entry: HistoryEntryDetails, dataFormType: Maybe<DataFormType>): string {
    const strategy = entry.configuration?.duplicateStrategy;
    if (!strategy || strategy === "ERROR") {
        return i18n.t("Default");
    }
    switch (strategy) {
        case "IMPORT":
            return dataFormType === "dataSets" ? i18n.t("Delete and import") : i18n.t("Import despite duplicates");
        case "IGNORE":
            return dataFormType === "dataSets"
                ? i18n.t("Import only new data values")
                : i18n.t("Import only new records");
        case "IMPORT_WITHOUT_DELETE":
            return i18n.t("Import and Update");
    }
}

const useStyles = makeStyles({
    entryInfo: {
        marginBottom: 24,
        padding: 16,
        backgroundColor: "#f5f5f5",
        borderRadius: 4,
    },
    sectionTitle: {
        marginBottom: 16,
        fontWeight: 600,
    },
    infoRow: {
        display: "flex",
        alignItems: "center",
        marginBottom: 8,
        "&:last-child": {
            marginBottom: 0,
        },
    },
    infoLabel: {
        fontWeight: 600,
        minWidth: 120,
        marginRight: 16,
    },
    downloadButton: {
        minWidth: "auto",
        padding: "4px 8px",
        fontSize: "0.75rem",
    },
    deletedFile: {
        display: "flex",
        alignItems: "center",
        padding: "4px 8px",
        backgroundColor: "#fff3cd",
        border: "1px solid #ffeaa7",
        borderRadius: 4,
        color: "#856404",
    },
    deletedFileIcon: {
        fontSize: 16,
        marginRight: 6,
        color: "#f39c12",
    },
    deletedFileName: {
        textDecoration: "line-through",
        marginRight: 8,
        fontWeight: 500,
    },
});
