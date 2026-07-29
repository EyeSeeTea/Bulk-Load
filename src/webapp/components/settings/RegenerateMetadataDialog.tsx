import { ConfirmationDialog } from "@eyeseetea/d2-ui-components";
import { Checkbox, CircularProgress, FormControlLabel, FormGroup, makeStyles } from "@material-ui/core";
import React from "react";
import { xlsxMimeTypes } from "../../../utils/files";
import i18n from "../../../utils/i18n";
import { useRegenerateMetadata } from "../../hooks/useRegenerateMetadata";
import { TemplateDropzone } from "../dropzone/TemplateDropzone";
import Settings from "../../logic/settings";

export type RegenerateMetadataDialogProps = {
    title: string;
    settings: Settings;
    onClose: () => void;
};

export function RegenerateMetadataDialog(props: RegenerateMetadataDialogProps): React.ReactElement {
    const { title, settings, onClose } = props;
    const classes = useStyles();

    const {
        resolution,
        flags,
        isRunning,
        translations,
        droppedFileName,
        onDrop,
        setFlag,
        regenerate,
        cancel,
    } = useRegenerateMetadata({ settings, onClose });

    return (
        <ConfirmationDialog
            isOpen={true}
            title={title}
            maxWidth="md"
            fullWidth={true}
            onSave={regenerate}
            onCancel={cancel}
            saveText={i18n.t("Regenerate")}
            cancelText={i18n.t("Close")}
            disableSave={resolution.type !== "resolved" || isRunning}
        >
            <TemplateDropzone
                accept={xlsxMimeTypes}
                placeholder={i18n.t("Drag and drop the template file to regenerate")}
                selectedFileName={droppedFileName}
                onDrop={onDrop}
                disabled={isRunning || resolution.type === "loading"}
            />

            {resolution.type === "loading" && <CircularProgress size={20} />}

            {resolution.type === "error" && <p className={classes.error}>{resolution.message}</p>}

            {resolution.type === "resolved" && (
                <React.Fragment>
                    <p>
                        {i18n.t("Template")}: {resolution.resolved.template.name}
                    </p>
                    <p>
                        {i18n.t("Data Form")}: {resolution.resolved.dataForm.name} ({resolution.resolved.dataForm.id})
                    </p>
                    <p>
                        {i18n.t("Data Form Type")}: {translations.dataFormTypes[resolution.resolved.dataForm.type]}
                    </p>

                    <FormGroup>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={flags.includeMetadataCodes}
                                    onChange={setFlag("includeMetadataCodes")}
                                />
                            }
                            label={i18n.t("Include the Code column in the Metadata sheet")}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={flags.useCodesForMetadata}
                                    onChange={setFlag("useCodesForMetadata")}
                                />
                            }
                            label={i18n.t("Use codes instead of names for metadata items")}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox checked={flags.orgUnitShortName} onChange={setFlag("orgUnitShortName")} />
                            }
                            label={i18n.t("Use the short name of organisation units")}
                        />
                    </FormGroup>
                </React.Fragment>
            )}

            <p className={classes.note}>
                {i18n.t(
                    "The Metadata sheet will be re-protected with the standard Bulk Load sheet password. All other sheets and the macros are left untouched."
                )}
            </p>
        </ConfirmationDialog>
    );
}

const useStyles = makeStyles({
    error: { color: "#f4231f" },
    note: { color: "#707070", fontStyle: "italic" },
});
