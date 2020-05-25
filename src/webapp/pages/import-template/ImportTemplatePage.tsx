import { Button, Checkbox, FormControlLabel, Paper } from "@material-ui/core";
import CloudDoneIcon from "@material-ui/icons/CloudDone";
import CloudUploadIcon from "@material-ui/icons/CloudUpload";
import {
    ConfirmationDialog,
    ConfirmationDialogProps,
    OrgUnitsSelector,
    useLoading,
    useSnackbar,
} from "d2-ui-components";
import { saveAs } from "file-saver";
import _ from "lodash";
import moment from "moment";
import React, { useCallback, useEffect, useState } from "react";
import Dropzone from "react-dropzone";
import { CompositionRoot } from "../../../CompositionRoot";
import { DataForm, DataFormType } from "../../../domain/entities/DataForm";
import i18n from "../../../locales";
import { cleanOrgUnitPaths } from "../../../utils/dhis";
import { useAppContext } from "../../contexts/api-context";
import { deleteDataValues, getDataValuesFromData } from "../../logic/dataValues";
import * as dhisConnector from "../../logic/dhisConnector";
import Settings from "../../logic/settings";
import * as sheetImport from "../../logic/sheetImport";

interface ImportTemplatePageProps {
    settings: Settings;
}

interface ImportState {
    dataForm: DataForm;
    file: File;
    summary: {
        period: string;
        count: number;
        id: string;
    }[];
}

export default function ImportTemplatePage({ settings }: ImportTemplatePageProps) {
    const loading = useLoading();
    const snackbar = useSnackbar();
    const { api } = useAppContext();

    const [orgUnitTreeRootIds, setOrgUnitTreeRootIds] = useState<string[]>([]);
    const [selectedOrgUnits, setSelectedOrgUnits] = useState<string[]>([]);
    const [overwriteOrgUnits, setOverwriteOrgUnits] = useState<boolean>(false);
    const [orgUnitTreeFilter, setOrgUnitTreeFilter] = useState<string[]>([]);
    const [importState, setImportState] = useState<ImportState>();
    const [messages, setMessages] = useState<string[]>([]);
    const [dialogProps, updateDialog] = useState<ConfirmationDialogProps | null>(null);

    useEffect(() => {
        CompositionRoot.attach().orgUnits.getUserRoots.execute().then(setOrgUnitTreeRootIds);
    }, []);

    const onOrgUnitChange = (orgUnitPaths: string[]) => {
        setSelectedOrgUnits(_.takeRight(orgUnitPaths, 1));
    };

    const onDrop = async (files: File[]) => {
        loading.show(true);

        const file = files[0];
        if (!file) {
            snackbar.error(i18n.t("Cannot read file"));
            loading.show(false);
            return;
        }

        try {
            const {
                object,
                dataValues,
                orgUnits,
            } = await CompositionRoot.attach().templates.analyze.execute(file);

            if (!object.writeAccess) {
                throw new Error(
                    i18n.t("You don't have write permissions for {{type}} {{name}}", object)
                );
            }

            setOrgUnitTreeFilter(orgUnits.map(({ id }) => id));
            setImportState({
                dataForm: object,
                file,
                summary: dataValues,
            });
        } catch (err) {
            console.error(err);
            const msg = err.message || err.toString();
            snackbar.error(msg);
            setImportState(undefined);
        }

        loading.show(false);
    };

    const handleDataImportClick = async () => {
        if (!importState) return;

        try {
            const { dataForm, file } = importState;

            loading.show(true);
            const result = await dhisConnector.getElementMetadata({
                api,
                element: dataForm,
                orgUnitIds: cleanOrgUnitPaths(selectedOrgUnits),
            });

            const useBuilderOrgUnits =
                settings.orgUnitSelection !== "generation" && overwriteOrgUnits;

            if (useBuilderOrgUnits && selectedOrgUnits.length === 0) {
                throw new Error(i18n.t("Select at least one organisation unit to import data"));
            }

            const {
                rowOffset,
                colOffset,
                orgUnits,
                object,
            } = await CompositionRoot.attach().templates.analyze.execute(file);

            const data = await sheetImport.readSheet({
                ...result,
                file,
                useBuilderOrgUnits,
                rowOffset,
                colOffset,
            });

            const removedDataValues = _.remove(
                //@ts-ignore FIXME Create typings for sheet import code
                data.dataValues ?? data.events,
                ({ orgUnit }) => !orgUnits.find(({ id }) => id === orgUnit)
            );

            if (removedDataValues.length === 0) {
                await checkExistingData(data);
            } else {
                updateDialog({
                    title: i18n.t("Invalid organisation units found"),
                    description: i18n.t(
                        "There are {{number}} data values with an invalid organisation unit that will be ignored during import.\nYou can still download them and send them to your administrator.",
                        { number: removedDataValues.length }
                    ),
                    onCancel: () => {
                        updateDialog(null);
                    },
                    onSave: () => {
                        checkExistingData(data);
                        updateDialog(null);
                    },
                    onInfoAction: () => {
                        downloadInvalidOrganisations(object.type, removedDataValues);
                    },
                    cancelText: i18n.t("Cancel"),
                    saveText: i18n.t("Proceed"),
                    infoActionText: i18n.t("Download data values with invalid organisation units"),
                });
            }
        } catch (reason) {
            console.error(reason);
            snackbar.error(reason.message || reason.toString());
        }

        loading.show(false);
    };

    const downloadInvalidOrganisations = (type: DataFormType, elements: unknown) => {
        const object = type === "dataSets" ? { dataValues: elements } : { events: elements };
        const json = JSON.stringify(object, null, 4);
        const blob = new Blob([json], { type: "application/json" });
        const date = moment().format("YYYYMMDDHHmm");
        saveAs(blob, `invalid-organisations-${date}.json`);
    };

    const checkExistingData = async (data: any) => {
        const dataValues = data.dataSet ? await getDataValuesFromData(api, data) : [];

        if (dataValues.length === 0) {
            await performImport({ data, dataValues });
        } else {
            updateDialog({
                title: i18n.t("Existing data values"),
                description: i18n.t(
                    "There are {{dataValuesSize}} data values in the database for this organisation unit and periods. If you proceed, all those data values will be deleted and only the ones in the spreadsheet will be saved. Are you sure?",
                    { dataValuesSize: dataValues.length }
                ),
                onSave: () => {
                    performImport({ data, dataValues });
                    updateDialog(null);
                },
                onInfoAction: () => {
                    performImport({ data, dataValues, overwrite: false });
                    updateDialog(null);
                },
                onCancel: () => {
                    updateDialog(null);
                },
                saveText: i18n.t("Proceed"),
                cancelText: i18n.t("Cancel"),
                infoActionText: i18n.t("Import only new data values"),
            });
        }
    };

    const performImport = async ({
        data,
        dataValues: existingDataValues,
        overwrite = true,
    }: any) => {
        if (!importState) return;

        loading.show(true);

        try {
            const dataValues = overwrite
                ? data.dataValues
                : _.differenceBy(
                      data.dataValues,
                      existingDataValues,
                      ({ dataElement, categoryOptionCombo, period, orgUnit }) =>
                          [dataElement, categoryOptionCombo, period, orgUnit].join("-")
                  );

            const deletedCount = overwrite ? await deleteDataValues(api, existingDataValues) : 0;
            const { response, importCount, description } = await dhisConnector.importData({
                api,
                element: importState.dataForm,
                data: { ...data, dataValues },
            });

            const { imported, updated, ignored } = response ?? importCount;
            const messages = _.compact([
                description,
                [
                    `${i18n.t("Imported")}: ${imported}`,
                    `${i18n.t("Updated")}: ${updated}`,
                    `${i18n.t("Ignored")}: ${ignored}`,
                    `${i18n.t("Deleted")}: ${deletedCount}`,
                ].join(", "),
            ]);

            snackbar.info(messages.join(" - "));
            setMessages(messages);
        } catch (reason) {
            console.error(reason);
            snackbar.error(reason.message || reason.toString());
        }

        loading.show(false);
    };

    const getNameForModel = (key: DataFormType) => {
        switch (key) {
            case "dataSets":
                return i18n.t("Data Set");
            case "programs":
                return i18n.t("Program");
        }
    };

    const onOverwriteOrgUnitsChange = useCallback((_event, overwriteOrgUnits) => {
        setOverwriteOrgUnits(overwriteOrgUnits);
    }, []);

    return (
        <React.Fragment>
            {dialogProps && <ConfirmationDialog isOpen={true} maxWidth={"xl"} {...dialogProps} />}

            <Paper
                style={{
                    margin: "2em",
                    marginTop: "2em",
                    padding: "2em",
                    width: "50%",
                }}
            >
                <h1>{i18n.t("Bulk Import")}</h1>

                <Dropzone
                    accept={
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
                    }
                    onDrop={onDrop}
                    multiple={false}
                >
                    {({ getRootProps, getInputProps, isDragActive, isDragAccept }) => (
                        <section>
                            <div
                                {...getRootProps({
                                    className: isDragActive
                                        ? isDragAccept
                                            ? "stripes"
                                            : "rejectStripes"
                                        : "dropZone",
                                })}
                            >
                                <input {...getInputProps()} />
                                <div
                                    className={"dropzoneTextStyle"}
                                    hidden={importState?.file !== undefined}
                                >
                                    <p className={"dropzoneParagraph"}>
                                        {i18n.t("Drag and drop file to import")}
                                    </p>
                                    <br />
                                    <CloudUploadIcon className={"uploadIconSize"} />
                                </div>
                                <div
                                    className={"dropzoneTextStyle"}
                                    hidden={importState?.file === undefined}
                                >
                                    {importState?.file !== undefined && (
                                        <p className={"dropzoneParagraph"}>
                                            {importState?.file.name}
                                        </p>
                                    )}
                                    <br />
                                    <CloudDoneIcon className={"uploadIconSize"} />
                                </div>
                            </div>
                        </section>
                    )}
                </Dropzone>

                {importState?.dataForm && (
                    <div
                        style={{
                            marginTop: 35,
                            marginBottom: 15,
                            marginLeft: 0,
                            fontSize: "1.2em",
                        }}
                    >
                        {getNameForModel(importState.dataForm.type)}: {importState.dataForm.name} (
                        {importState.dataForm.id})
                        {importState.summary.map((group, idx) => (
                            <li key={idx} style={{ marginLeft: 10, fontSize: "1em" }}>
                                {moment(String(group.period)).format("DD/MM/YYYY")}:{" "}
                                {group.id ? i18n.t("Update") : i18n.t("Create")} {group.count}{" "}
                                {i18n.t("data values")} {group.id && `(${group.id})`}
                            </li>
                        ))}
                    </div>
                )}

                {settings.orgUnitSelection !== "generation" && (
                    <div>
                        <FormControlLabel
                            style={{ marginTop: "1em" }}
                            control={
                                <Checkbox
                                    checked={overwriteOrgUnits}
                                    onChange={onOverwriteOrgUnitsChange}
                                />
                            }
                            label={i18n.t("Select import Organisation Unit")}
                        />
                    </div>
                )}

                {overwriteOrgUnits &&
                    (orgUnitTreeRootIds.length > 0 ? (
                        <OrgUnitsSelector
                            api={api}
                            onChange={onOrgUnitChange}
                            selected={selectedOrgUnits}
                            rootIds={orgUnitTreeRootIds}
                            selectableIds={orgUnitTreeFilter}
                            fullWidth={false}
                            height={220}
                            controls={{
                                filterByLevel: false,
                                filterByGroup: false,
                                selectAll: false,
                            }}
                        />
                    ) : (
                        i18n.t("No capture org unit match element org units")
                    ))}

                {messages.length > 0 && (
                    <div
                        style={{
                            marginTop: "1em",
                            marginRight: "2em",
                            fontSize: "1.2em",
                            border: "1px solid",
                            padding: "1em",
                        }}
                    >
                        {messages.map(msg => (
                            <div key={msg}>{msg}</div>
                        ))}
                    </div>
                )}

                <div
                    className="row"
                    style={{
                        marginTop: "1.5em",
                        marginLeft: "1em",
                        marginRight: "1em",
                    }}
                >
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleDataImportClick}
                        disabled={!importState?.dataForm}
                    >
                        {i18n.t("Import data")}
                    </Button>
                </div>
            </Paper>
        </React.Fragment>
    );
}