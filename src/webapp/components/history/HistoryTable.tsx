import React, { useCallback, useEffect, useState } from "react";
import {
    ObjectsTable,
    SearchBox,
    TableAction,
    TableColumn,
    TableSelection,
    TableState,
    useSnackbar,
} from "@eyeseetea/d2-ui-components";
import { Icon, makeStyles } from "@material-ui/core";
import moment from "moment";

import { HistoryEntryStatus, HistoryEntrySummary } from "../../../domain/entities/HistoryEntry";
import i18n from "../../../utils/i18n";
import { useAppContext } from "../../contexts/app-context";
import { Select } from "../select/Select";
import { HistoryDetailsDialog } from "./HistoryDetailsDialog";
import { firstOrFail } from "../../../types/utils";
import { downloadFile } from "../../utils/download";
import useHistory from "../../hooks/useHistory";

export function HistoryTable() {
    const classes = useStyles();
    const { compositionRoot } = useAppContext();
    const snackbar = useSnackbar();

    const [selection, setSelection] = useState<TableSelection[]>([]);
    const [detailsDialog, setDetailsDialog] = useState<{ entryId: string; entryName: string } | null>(null);
    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState<HistoryEntryStatus | undefined>();

    const { entries, loading, load } = useHistory();

    useEffect(() => {
        load({ searchText, status: statusFilter });
    }, [load, searchText, statusFilter]);

    const onClickDownload = useCallback(
        async selectedIds => {
            const entryId = firstOrFail(selectedIds) as string;
            const entry = entries.find((e: HistoryEntrySummary) => e.id === entryId);
            if (entry && entry.documentId) {
                try {
                    const blob = await compositionRoot.history.downloadDocument(entry.documentId);
                    downloadFile({
                        filename: entry.fileName,
                        data: blob,
                    });
                } catch (error: any) {
                    console.error("Download error:", error);
                    snackbar.error(error.message || i18n.t("Failed to download file"));
                }
            } else {
                snackbar.warning(i18n.t("No file available for download"));
            }
        },
        [compositionRoot.history, entries, snackbar]
    );

    const columns: TableColumn<HistoryEntrySummary>[] = [
        { name: "name", text: i18n.t("Data Form") },
        {
            name: "timestamp",
            text: i18n.t("Timestamp"),
            getValue: entry => moment(entry.timestamp).format("YYYY-MM-DD HH:mm:ss"),
        },
        { name: "fileName", text: i18n.t("File Name") },
        { name: "username", text: i18n.t("User") },
        {
            name: "status",
            text: i18n.t("Status"),
            getValue: entry => {
                const statusConfig = getStatusConfig(entry.status);
                return (
                    <span style={{ color: statusConfig.color, display: "flex", alignItems: "center" }}>
                        <Icon style={{ marginRight: 4, fontSize: 16 }}>{statusConfig.icon}</Icon>
                        {statusConfig.label}
                    </span>
                );
            },
        },
    ];

    const actions: TableAction<HistoryEntrySummary>[] = [
        {
            name: "view_details",
            text: i18n.t("View Details"),
            primary: true,
            onClick: selectedIds => {
                const entryId = firstOrFail(selectedIds);
                const entry = entries.find((e: HistoryEntrySummary) => e.id === entryId);
                if (entry) {
                    setDetailsDialog({
                        entryId: entry.id,
                        entryName: entry.name || entry.fileName,
                    });
                }
            },
            icon: <Icon>info</Icon>,
        },
        {
            name: "download_file",
            text: i18n.t("Download File"),
            primary: false,
            onClick: onClickDownload,
            icon: <Icon>download</Icon>,
        },
    ];

    const onTableChange = ({ selection }: TableState<HistoryEntrySummary>) => {
        setSelection(selection);
    };

    const statusOptions: { value: HistoryEntryStatus; label: string }[] = [
        { value: "SUCCESS", label: i18n.t("Success") },
        { value: "ERROR", label: i18n.t("Error") },
        { value: "WARNING", label: i18n.t("Warning") },
    ];

    const customFilters = (
        <React.Fragment key="filters">
            <SearchBox
                key="history-search-box"
                className={classes.searchBox}
                value={searchText}
                hintText={i18n.t("Search by file name, data form, or user")}
                onChange={setSearchText}
            />
            <div className={classes.statusSelect}>
                <Select
                    placeholder={i18n.t("Status")}
                    options={statusOptions}
                    onChange={option => setStatusFilter(option.value as typeof statusFilter)}
                    value={statusFilter}
                    allowEmpty
                    emptyLabel={i18n.t("All")}
                />
            </div>
        </React.Fragment>
    );

    return (
        <>
            {detailsDialog && (
                <HistoryDetailsDialog
                    isOpen={true}
                    entryId={detailsDialog.entryId}
                    entryName={detailsDialog.entryName}
                    onClose={() => setDetailsDialog(null)}
                />
            )}

            <ObjectsTable<HistoryEntrySummary>
                rows={entries}
                columns={columns}
                actions={actions}
                selection={selection}
                initialState={{ sorting: { field: "timestamp", order: "desc" } }}
                onChange={onTableChange}
                loading={loading}
                filterComponents={customFilters}
            />
        </>
    );
}

const useStyles = makeStyles({
    searchBox: {
        maxWidth: "400px",
        width: "30%",
        marginLeft: 20,
    },
    statusSelect: {
        width: 120,
        marginLeft: 20,
        marginTop: -9,
    },
});

function getStatusConfig(status: "SUCCESS" | "ERROR" | "WARNING") {
    switch (status) {
        case "SUCCESS":
            return {
                icon: "check_circle",
                label: i18n.t("Success"),
                color: "#4caf50",
            };
        case "ERROR":
            return {
                icon: "error",
                label: i18n.t("Error"),
                color: "#f44336",
            };
        case "WARNING":
            return {
                icon: "warning",
                label: i18n.t("Warning"),
                color: "#ff9800",
            };
        default:
            return {
                icon: "help",
                label: status,
                color: "#666",
            };
    }
}
