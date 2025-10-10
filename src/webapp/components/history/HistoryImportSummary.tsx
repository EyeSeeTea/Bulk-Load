import React from "react";
import { Typography, makeStyles, Button, Icon, Tooltip } from "@material-ui/core";
import moment from "moment";

import { HistoryEntrySummary } from "../../../domain/entities/HistoryEntry";
import i18n from "../../../utils/i18n";
import { HistoryStatusIndicator } from "./HistoryStatusIndicator";
import { useDownloadDocument } from "../../hooks/useDownloadDocument";

interface HistoryImportSummaryProps {
    entry: HistoryEntrySummary;
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

export function HistoryImportSummary({ entry }: HistoryImportSummaryProps) {
    const classes = useStyles();
    const { downloadDocument } = useDownloadDocument();

    return (
        <div className={classes.entryInfo}>
            <Typography variant="h6" className={classes.sectionTitle}>
                {i18n.t("Import Summary")}
            </Typography>
            <div className={classes.infoRow}>
                <Typography className={classes.infoLabel}>{i18n.t("Timestamp")}:</Typography>
                <Typography variant="body2">{moment(entry.timestamp).format("YYYY-MM-DD HH:mm:ss")}</Typography>
            </div>
            <div className={classes.infoRow}>
                <Typography className={classes.infoLabel}>{i18n.t("User")}:</Typography>
                <Typography variant="body2">{entry.username}</Typography>
            </div>
            <div className={classes.infoRow}>
                <Typography className={classes.infoLabel}>{i18n.t("Status")}:</Typography>
                <HistoryStatusIndicator status={entry.status} iconStyle={{ fontSize: 18, marginRight: 8 }} />
            </div>
            <div className={classes.infoRow}>
                <Typography className={classes.infoLabel}>{i18n.t("File")}:</Typography>
                {!entry.documentId || entry.documentDeleted ? (
                    <Tooltip
                        title={
                            entry.documentDeleted
                                ? i18n.t("The original file has been deleted and is no longer available for download")
                                : i18n.t("The original file is not available for download")
                        }
                        arrow
                        placement="top"
                    >
                        <div className={classes.deletedFile}>
                            <Icon className={classes.deletedFileIcon}>warning</Icon>
                            <Typography variant="body2" className={classes.deletedFileName}>
                                {entry.fileName}
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
                                documentId: entry.documentId,
                                fileName: entry.fileName,
                            })
                        }
                    >
                        {entry.fileName}
                    </Button>
                )}
            </div>
        </div>
    );
}
