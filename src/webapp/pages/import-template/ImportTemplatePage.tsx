import { OrgUnitsSelector, useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";
import { Button, Checkbox, FormControlLabel, makeStyles } from "@material-ui/core";
import CloudDoneIcon from "@material-ui/icons/CloudDone";
import CloudUploadIcon from "@material-ui/icons/CloudUpload";
import { saveAs } from "file-saver";
import _ from "lodash";
import moment from "moment";
import React, { useCallback, useEffect, useState } from "react";
import Dropzone from "react-dropzone";
import { DataForm, DataFormType } from "../../../domain/entities/DataForm";
import { DataPackage } from "../../../domain/entities/DataPackage";
import { SynchronizationResult } from "../../../domain/entities/SynchronizationResult";
import { ImportTemplateUseCaseParams } from "../../../domain/usecases/ImportTemplateUseCase";
import i18n from "../../../locales";
import ModalDialog, { ModalDialogProps } from "../../components/modal-dialog/ModalDialog";
import SyncSummary from "../../components/sync-summary/SyncSummary";
import { useAppContext } from "../../contexts/app-context";
import { orgUnitListParams } from "../../utils/template";
import { RouteComponentProps } from "../Router";

interface ImportState {
    dataForm: DataForm;
    file: File;
    summary: {
        period: string;
        count: number;
        id?: string;
    }[];
}

export default function ImportTemplatePage({ settings }: RouteComponentProps) {
    const { api, compositionRoot } = useAppContext();
    const loading = useLoading();
    const snackbar = useSnackbar();
    const classes = useStyles();

    const [orgUnitTreeRootIds, setOrgUnitTreeRootIds] = useState<string[]>([]);
    const [selectedOrgUnits, setSelectedOrgUnits] = useState<string[]>([]);
    const [overwriteOrgUnits, setOverwriteOrgUnits] = useState<boolean>(false);
    const [orgUnitTreeFilter, setOrgUnitTreeFilter] = useState<string[]>([]);
    const [importState, setImportState] = useState<ImportState>();
    const [messages, setMessages] = useState<string[]>([]);
    const [dialogProps, updateDialog] = useState<ModalDialogProps>();

    useEffect(() => {
        compositionRoot.orgUnits.getUserRoots().then(setOrgUnitTreeRootIds);
    }, [compositionRoot]);

    const onOrgUnitChange = (orgUnitPaths: string[]) => {
        setSelectedOrgUnits(_.takeRight(orgUnitPaths, 1));
    };

    const onDrop = async (files: File[]) => {
        loading.show(true, i18n.t("Reading file..."));
        setMessages([]);
        setSelectedOrgUnits([]);
        setOrgUnitTreeFilter([]);

        const file = files[0];
        if (!file) {
            snackbar.error(i18n.t("Cannot read file"));
            loading.show(false);
            return;
        }

        try {
            const { dataForm, dataValues, orgUnits } = await compositionRoot.templates.analyze(file);

            if (!dataForm.writeAccess) {
                throw new Error(i18n.t("You don't have write permissions for {{type}} {{name}}", dataForm));
            }

            setOrgUnitTreeFilter(orgUnits.map(({ id }) => id));
            setImportState({
                dataForm,
                file,
                summary: dataValues,
            });
        } catch (err: any) {
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
            loading.show(true, i18n.t("Reading data..."));

            const { file } = importState;
            const useBuilderOrgUnits = settings.orgUnitSelection !== "generation" && overwriteOrgUnits;

            if (useBuilderOrgUnits && selectedOrgUnits.length === 0) {
                throw new Error(i18n.t("Select at least one organisation unit to import data"));
            }

            await startImport({ file, settings, useBuilderOrgUnits, selectedOrgUnits });
        } catch (reason: any) {
            console.error(reason);
            snackbar.error(reason.message || reason.toString());
        }

        loading.show(false);
    };

    const startImport = async (params: ImportTemplateUseCaseParams) => {
        loading.show(true, i18n.t("Importing data..."));
        const result = await compositionRoot.templates.import(params);

        result.match({
            success: syncResults => {
                loading.reset();
                setSyncResults(syncResults);
            },
            error: error => {
                loading.reset();

                switch (error.type) {
                    case "DUPLICATE_VALUES":
                        {
                            const { existingDataValues, dataValues, instanceDataValues } = error;

                            const totalExisting = _.flatMap(
                                instanceDataValues.dataEntries,
                                ({ dataValues }) => dataValues
                            ).length;

                            const dataSetConfig = {
                                title: i18n.t("Existing data values"),
                                message: i18n.t(
                                    "There are {{totalExisting}} data values in the database for this organisation unit and periods. All those data values can either be completely deleted or will be kept and only the ones with different values will be updated. What do you want to do?",
                                    { totalExisting }
                                ),
                                save: i18n.t("Delete and Import"),
                                cancel: i18n.t("Cancel"),
                                info: i18n.t("Import only new data values"),
                                updateText: i18n.t("Import and Update"),
                                saveButtonPrimary: false,
                                saveTooltipText: i18n.t(
                                    "Delete all existing values and import the ones in the spreadsheet"
                                ),
                                infoTooltipText: i18n.t(
                                    "Import only new data values. Without updating or deleting current ones"
                                ),
                                updateTooltipText: i18n.t(
                                    "Import and update data values without deleting the remaining existing data"
                                ),
                            };

                            const programConfig = {
                                title: i18n.t("Warning: Your upload may result in the generation of duplicates", {
                                    nsSeparator: "-",
                                }),
                                message: i18n.t(
                                    "There are {{totalExisting}} records in your template with very similar or exact values as other records that already exist. If you proceed, you risk creating duplicates. What would you like to do?",
                                    { totalExisting: existingDataValues.dataEntries.length }
                                ),
                                save: i18n.t("Import everything anyway"),
                                cancel: i18n.t("Cancel import"),
                                info: i18n.t("Import only new records"),
                                updateText: "",
                                saveButtonPrimary: true,
                                saveTooltipText: "",
                                infoTooltipText: "",
                                updateTooltipText: "",
                            };

                            const {
                                title,
                                message,
                                save,
                                cancel,
                                info,
                                updateText,
                                saveButtonPrimary,
                                saveTooltipText,
                                infoTooltipText,
                                updateTooltipText,
                            } = dataValues.type === "dataSets" ? dataSetConfig : programConfig;

                            updateDialog({
                                title,
                                description: message,
                                onSave: async () => {
                                    updateDialog(undefined);
                                    loading.show(true, i18n.t("Importing data..."));
                                    await startImport({ ...params, duplicateStrategy: "IMPORT" });
                                    loading.reset();
                                },
                                onUpdate: async () => {
                                    updateDialog(undefined);
                                    loading.show(true, i18n.t("Importing data..."));
                                    await startImport({ ...params, duplicateStrategy: "IMPORT_WITHOUT_DELETE" });
                                    loading.reset();
                                },
                                onInfoAction: async () => {
                                    updateDialog(undefined);
                                    loading.show(true, i18n.t("Importing data..."));
                                    await startImport({ ...params, duplicateStrategy: "IGNORE" });
                                    loading.reset();
                                },
                                onCancel: () => {
                                    updateDialog(undefined);
                                },
                                saveText: save,
                                cancelText: cancel,
                                infoActionText: info,
                                updateText,
                                saveButtonPrimary,
                                saveTooltipText,
                                updateTooltipText,
                                infoTooltipText,
                            });
                        }
                        break;

                    case "INVALID_ORG_UNITS":
                        {
                            const { invalidDataValues } = error;

                            const totalInvalid = _.flatMap(
                                invalidDataValues.dataEntries,
                                ({ dataValues }) => dataValues
                            ).length;

                            updateDialog({
                                title: i18n.t("Invalid organisation units found"),
                                description: i18n.t(
                                    "There are {{totalInvalid}} data values with an invalid organisation unit that will be ignored during import.\nYou can still download them and send them to your administrator.",
                                    { totalInvalid }
                                ),
                                onCancel: () => {
                                    updateDialog(undefined);
                                },
                                onSave: async () => {
                                    updateDialog(undefined);
                                    await startImport({
                                        ...params,
                                        organisationUnitStrategy: "IGNORE",
                                    });
                                },
                                onInfoAction: () => {
                                    downloadInvalidOrganisations(invalidDataValues);
                                },
                                cancelText: i18n.t("Cancel"),
                                saveText: i18n.t("Proceed"),
                                infoActionText: i18n.t("Download data values with invalid organisation units"),
                            });
                        }
                        break;
                    case "DATA_FORM_NOT_FOUND":
                        snackbar.error("Couldn't find data form");
                        break;
                    case "INVALID_DATA_FORM_ID":
                        snackbar.error("Invalid data form id");
                        break;
                    case "INVALID_OVERRIDE_ORG_UNIT":
                        snackbar.error("Invalid org units to override");
                        break;
                    case "MALFORMED_TEMPLATE":
                        snackbar.error("Malformed template");
                        break;
                }
            },
        });
    };

    const downloadInvalidOrganisations = (dataPackage: DataPackage) => {
        const object = compositionRoot.form.convertDataPackage(dataPackage);
        const json = JSON.stringify(object, null, 4);
        const blob = new Blob([json], { type: "application/json" });
        const date = moment().format("YYYYMMDDHHmm");
        saveAs(blob, `invalid-organisations-${date}.json`);
    };

    const getNameForModel = (key: DataFormType): string => {
        switch (key) {
            case "dataSets":
                return i18n.t("Data Set");
            case "programs":
            case "trackerPrograms":
                return i18n.t("Program");
        }
    };

    const onOverwriteOrgUnitsChange = useCallback((_event, overwriteOrgUnits) => {
        setOverwriteOrgUnits(overwriteOrgUnits);
    }, []);

    const [syncResults, setSyncResults] = useState<SynchronizationResult[] | null>(null);
    const hideSyncResults = useCallback(() => setSyncResults(null), [setSyncResults]);

    return (
        <React.Fragment>
            {dialogProps && <ModalDialog isOpen={true} maxWidth={"xl"} {...dialogProps} />}

            {syncResults && <SyncSummary results={syncResults} onClose={hideSyncResults} />}

            <h3>{i18n.t("Bulk data import")}</h3>

            <Dropzone
                accept={[
                    "application/zip",
                    "application/x-zip-compressed",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/vnd.ms-excel.sheet.macroEnabled.12",
                ]}
                onDrop={onDrop}
                multiple={false}
            >
                {({ getRootProps, getInputProps, isDragActive, isDragAccept }) => (
                    <section>
                        <div
                            {...getRootProps({
                                className: isDragActive
                                    ? `${classes.stripes} ${
                                          isDragAccept ? classes.acceptStripes : classes.rejectStripes
                                      }`
                                    : classes.dropzone,
                            })}
                        >
                            <input {...getInputProps()} />
                            <div className={classes.dropzoneTextStyle} hidden={importState?.file !== undefined}>
                                <p className={classes.dropzoneParagraph}>{i18n.t("Drag and drop file to import")}</p>
                                <br />
                                <CloudUploadIcon className={classes.uploadIconSize} />
                            </div>
                            <div className={classes.dropzoneTextStyle} hidden={importState?.file === undefined}>
                                {importState?.file !== undefined && (
                                    <p className={classes.dropzoneParagraph}>{importState?.file.name}</p>
                                )}
                                <br />
                                <CloudDoneIcon className={classes.uploadIconSize} />
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
                    {getNameForModel(importState.dataForm.type)}: {importState.dataForm.name} ({importState.dataForm.id}
                    )
                    {importState.summary.map((group, idx) => (
                        <li key={idx} style={{ marginLeft: 10, fontSize: "1em" }}>
                            {importState.dataForm.type === "trackerPrograms" ? (
                                <React.Fragment>
                                    {moment(String(group.period)).format("DD/MM/YYYY")}:{" "}
                                    {group.id ? i18n.t("Create/update") : i18n.t("Create")} {""}
                                    {i18n.t("event")} {""}
                                    {group.id}
                                </React.Fragment>
                            ) : (
                                <React.Fragment>
                                    {importState.dataForm.periodType === "Monthly"
                                        ? moment(String(group.period)).format("DD/MM/YYYY")
                                        : group.period}
                                    : {group.id ? i18n.t("Update") : i18n.t("Create")} {group.count}{" "}
                                    {i18n.t("data values")} {group.id && `(${group.id})`}
                                </React.Fragment>
                            )}
                        </li>
                    ))}
                </div>
            )}

            {settings.orgUnitSelection !== "generation" && (
                <div>
                    <FormControlLabel
                        style={{ marginTop: "1em" }}
                        control={<Checkbox checked={overwriteOrgUnits} onChange={onOverwriteOrgUnitsChange} />}
                        label={i18n.t("Override import Organisation Unit")}
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
                        typeInput={"radio"}
                        fullWidth={false}
                        height={220}
                        controls={{
                            filterByLevel: false,
                            filterByGroup: false,
                            selectAll: false,
                        }}
                        showNameSetting
                        listParams={orgUnitListParams}
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
        </React.Fragment>
    );
}

const useStyles = makeStyles({
    dropzoneTextStyle: { textAlign: "center", top: "15%", position: "relative" },
    dropzoneParagraph: { fontSize: 20 },
    uploadIconSize: { width: 50, height: 50, color: "#909090" },
    dropzone: {
        position: "relative",
        width: "100%",
        height: 270,
        backgroundColor: "#f0f0f0",
        border: "dashed",
        borderColor: "#c8c8c8",
        cursor: "pointer",
    },
    stripes: {
        width: "100%",
        height: 270,
        cursor: "pointer",
        border: "solid",
        borderColor: "#c8c8c8",
        "-webkit-animation": "progress 2s linear infinite !important",
        "-moz-animation": "progress 2s linear infinite !important",
        animation: "progress 2s linear infinite !important",
        backgroundSize: "150% 100%",
    },
    acceptStripes: {
        backgroundImage: `repeating-linear-gradient(
            -45deg,
            #f0f0f0,
            #f0f0f0 25px,
            #c8c8c8 25px,
            #c8c8c8 50px
        )`,
    },
    rejectStripes: {
        backgroundImage: `repeating-linear-gradient(
            -45deg,
            #fc8785,
            #fc8785 25px,
            #f4231f 25px,
            #f4231f 50px
        )`,
    },
});
