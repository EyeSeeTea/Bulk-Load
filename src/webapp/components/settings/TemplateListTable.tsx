import React, { useState } from "react";
import {
    ConfirmationDialog,
    ObjectsTable,
    PaginationOptions,
    TableAction,
    TableColumn,
    TableSelection,
    TableState,
    useLoading,
    useSnackbar,
} from "@eyeseetea/d2-ui-components";
import { Button, Icon } from "@material-ui/core";
import _ from "lodash";
import moment from "moment";

import i18n from "../../../locales";
import { RouteComponentProps } from "../../pages/Router";
import { promiseMap } from "../../../utils/promises";
import { CustomTemplate } from "../../../domain/entities/Template";
import { firstOrFail, isValueInUnionType } from "../../../types/utils";
import { TemplatePermissionsDialog } from "./TemplatePermissionsDialog";
import { useAppContext } from "../../contexts/app-context";
import { CustomTemplateAction, CustomTemplateEditDialog } from "./TemplateEditDialog";
import { downloadFile } from "../../utils/download";
import { DataFormType, dataFormTypes, getTranslations } from "../../../domain/entities/DataForm";

interface WarningDialog {
    title?: string;
    description?: string;
    action?: () => void;
}

export interface TemplateRow {
    id: string;
    name: string;
    type: "custom" | "autogenerated";
    description: string;
    created: string;
    lastUpdated: string;
    dataFormId: string;
    dataFormType: DataFormType;
}

type TemplateListTableProps = Pick<
    RouteComponentProps,
    "settings" | "setSettings" | "customTemplates" | "setCustomTemplates"
>;

export default function TemplateListTable(props: TemplateListTableProps) {
    const { settings, setSettings, customTemplates, setCustomTemplates } = props;
    const { api, compositionRoot } = useAppContext();
    const snackbar = useSnackbar();
    const loading = useLoading();

    const [selection, setSelection] = useState<TableSelection[]>([]);
    const [customTemplateEdit, setCustomTemplateEdit] = useState<CustomTemplateAction | undefined>();
    const [warningDialog, setWarningDialog] = useState<WarningDialog | null>(null);

    const rows = buildCustomTemplateRow(customTemplates);

    const newTemplate = () => {
        setCustomTemplateEdit({ type: "new" });
    };

    const closeEdit = () => {
        setCustomTemplateEdit(undefined);
    };

    const save = async (customTemplate: CustomTemplate) => {
        try {
            loading.show();
            //const errors = await compositionRoot.templates.save(customTemplate);
            const errors: string[] = []; // TODO
            if (errors.length === 0) {
                closeEdit();
                setCustomTemplates(_.uniqBy([customTemplate, ...customTemplates], "id"));
            } else {
                snackbar.error(errors.join("\n"));
            }
        } catch (error) {
            console.error(error);
            snackbar.error(i18n.t("An error ocurred while saving custom template"));
        }
        loading.hide();
    };

    const edit = (ids: string[]) => {
        const template = customTemplates.find(row => row.id === ids[0]);
        if (template) setCustomTemplateEdit({ type: "edit", template });
    };

    const deleteTemplates = React.useCallback(
        (ids: string[]) => {
            setWarningDialog({
                title: i18n.t("Delete {{count}} templates", { count: ids.length }),
                description: i18n.t("Are you sure you want to remove the selected templates"),
                action: async () => {
                    loading.show();
                    await promiseMap(ids, id => compositionRoot.templates.delete(id));
                    setSelection([]);
                    setCustomTemplates(_.reject(customTemplates, ({ id }) => ids.includes(id)));
                    loading.hide();
                },
            });
        },
        [compositionRoot.templates, customTemplates, loading, setCustomTemplates]
    );

    const downloadSpreadsheet = React.useCallback(
        (templateId: string) => {
            const template = customTemplates.find(row => row.id === templateId);
            const row = rows.find(row => row.id === templateId);

            if (template) {
                downloadFile({
                    filename: template.id + ".xlsx",
                    data: Buffer.from(template.file.blob, "base64"),
                    mimeType: "application/vnd.ms-excel",
                });
            } else if (row) {
                compositionRoot.templates.download(api, {
                    type: row.dataFormType,
                    id: row.dataFormId,
                    useAutogeneratedTemplate: true,
                    language: "en",
                    settings,
                    populate: false,
                    downloadRelationships: false,
                });
            } else {
                snackbar.error(i18n.t("Cannot download spreadsheet for template"));
                return;
            }
        },
        [customTemplates, compositionRoot, rows, snackbar, api, settings]
    );

    const closeWarningDialog = React.useCallback(() => {
        setWarningDialog(null);
    }, []);

    const translations = React.useMemo(getTranslations, []);

    const columns: TableColumn<TemplateRow>[] = [
        { name: "name", text: i18n.t("Name") },
        {
            name: "dataFormType",
            text: i18n.t("Data Form Type"),
            getValue: row => translations.dataFormTypes[row.dataFormType],
        },
        {
            name: "type",
            text: i18n.t("Type"),
            getValue: row => (row.type === "custom" ? i18n.t("Custom") : i18n.t("Autogenerated")),
        },
        { name: "created", text: i18n.t("Created"), getValue: row => row.created || "-" },
        { name: "lastUpdated", text: i18n.t("Last Updated"), getValue: row => row.lastUpdated || "-" },
    ];

    const actions: TableAction<TemplateRow>[] = [
        {
            name: "sharing",
            text: i18n.t("Sharing Settings"),
            primary: false,
            onClick: selectedIds => setSettingsState({ type: "open", id: firstOrFail(selectedIds) }),
            icon: <Icon>share</Icon>,
        },
        {
            name: "download_spreadsheet",
            text: i18n.t("Download spreadsheet"),
            primary: false,
            onClick: selectedIds => downloadSpreadsheet(firstOrFail(selectedIds)),
            icon: <Icon>share</Icon>,
        },
        {
            name: "edit",
            text: i18n.t("Edit"),
            primary: true,
            onClick: edit,
            icon: <Icon>edit</Icon>,
            isActive: rows => rows.length === 1 && rows[0]?.type === "custom",
        },
        {
            name: "delete",
            text: i18n.t("Delete"),
            onClick: deleteTemplates,
            icon: <Icon>delete</Icon>,
            isActive: rows => rows.length === 1 && rows[0]?.type === "custom",
        },
    ];

    const onTableChange = ({ selection }: TableState<TemplateRow>) => {
        setSelection(selection);
    };

    type SettingsState = { type: "closed" } | { type: "open"; id: string };
    const [settingsState, setSettingsState] = useState<SettingsState>({ type: "closed" });

    const closeSettings = React.useCallback(() => {
        setSettingsState({ type: "closed" });
    }, []);

    return (
        <React.Fragment>
            {warningDialog && (
                <ConfirmationDialog
                    isOpen={true}
                    title={warningDialog.title}
                    description={warningDialog.description}
                    saveText={i18n.t("Ok")}
                    onSave={() => {
                        if (warningDialog.action) warningDialog.action();
                        setWarningDialog(null);
                    }}
                    onCancel={closeWarningDialog}
                />
            )}

            {settingsState.type === "open" && (
                <TemplatePermissionsDialog
                    onClose={closeSettings}
                    templateId={settingsState.id}
                    settings={settings}
                    onChange={setSettings}
                />
            )}

            {customTemplateEdit && (
                <CustomTemplateEditDialog action={customTemplateEdit} onSave={save} onCancel={closeEdit} />
            )}

            <ObjectsTable<TemplateRow>
                rows={rows}
                columns={columns}
                actions={actions}
                selection={selection}
                onChange={onTableChange}
                paginationOptions={paginationOptions}
                filterComponents={
                    <Button variant="contained" color="primary" onClick={newTemplate} disableElevation>
                        {i18n.t("Create template")}
                    </Button>
                }
            />
        </React.Fragment>
    );
}

function buildCustomTemplateRow(customTemplates: CustomTemplate[]): TemplateRow[] {
    return _(customTemplates)
        .flatMap(({ id, name, description, created, lastUpdated, dataFormId, dataFormType }) => {
            const dataFormId_ = dataFormId.type === "value" ? dataFormId.id : undefined;
            const dataFormType_ = dataFormType.type === "value" ? dataFormType.id : undefined;
            if (!dataFormId_) return [];
            if (!(dataFormType_ && isValueInUnionType(dataFormType_, dataFormTypes))) return [];

            const customRow: TemplateRow = {
                type: "custom",
                id,
                name,
                description,
                created: `${created.user.username} (${formatDate(created.timestamp)})`,
                lastUpdated: `${created.user.username} (${formatDate(lastUpdated.timestamp)})`,
                dataFormId: dataFormId_,
                dataFormType: dataFormType_,
            };

            const autogeneratedRow: TemplateRow = {
                ...customRow,
                id: "autogenerated-" + customRow.id,
                type: "autogenerated",
                description: "",
                created: "",
                lastUpdated: "",
                dataFormId: dataFormId_,
                dataFormType: dataFormType_,
            };

            return [customRow, autogeneratedRow];
        })
        .value();
}

function formatDate(timestamp: string): string {
    return moment(timestamp).format("YYYY-MM-DD HH:mm");
}

const paginationOptions: PaginationOptions = {
    pageSizeOptions: [10, 20],
    pageSizeInitialValue: 10,
};
