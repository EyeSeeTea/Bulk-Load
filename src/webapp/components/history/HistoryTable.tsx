import React, { useCallback, useEffect, useState } from "react";
import {
    ObjectsTable,
    SearchBox,
    TableAction,
    TableColumn,
    TableSelection,
    TableState,
} from "@eyeseetea/d2-ui-components";
import { Icon, makeStyles } from "@material-ui/core";
import moment from "moment";

import { HistoryEntryStatus, HistoryEntrySummary } from "../../../domain/entities/HistoryEntry";
import i18n from "../../../utils/i18n";
import { Select } from "../select/Select";
import { HistoryDetailsDialog } from "./HistoryDetailsDialog";
import { HistoryStatusIndicator } from "./HistoryStatusIndicator";
import { firstOrFail } from "../../../types/utils";
import useHistory from "../../hooks/useHistory";
import { useDownloadDocument } from "../../hooks/useDownloadDocument";

export function HistoryTable() {
    const classes = useStyles();

    const [selection, setSelection] = useState<TableSelection[]>([]);
    const [detailsDialog, setDetailsDialog] = useState<HistoryEntrySummary | null>(null);
    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState<HistoryEntryStatus | undefined>();

    const { entries, loading, load } = useHistory();
    const { downloadDocument } = useDownloadDocument();

    useEffect(() => {
        load({ searchText, status: statusFilter });
    }, [load, searchText, statusFilter]);

    const onClickDownload = useCallback(
        async selectedIds => {
            const entryId = firstOrFail(selectedIds) as string;
            const entry = entries.find((e: HistoryEntrySummary) => e.id === entryId);
            downloadDocument({ documentId: entry?.documentId, fileName: entry?.fileName || "import_file" });
        },
        [downloadDocument, entries]
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
            getValue: entry => <HistoryStatusIndicator status={entry.status} />,
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
                    setDetailsDialog(entry);
                }
            },
            icon: <Icon>info</Icon>,
        },
        {
            name: "download_file",
            text: i18n.t("Download File"),
            primary: false,
            onClick: onClickDownload,
            icon: <Icon>get_app</Icon>,
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
                <HistoryDetailsDialog isOpen={true} entry={detailsDialog} onClose={() => setDetailsDialog(null)} />
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
