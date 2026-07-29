import { ConfirmationDialog, useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";
import { Checkbox, CircularProgress, FormControlLabel, FormGroup, makeStyles } from "@material-ui/core";
import React, { useCallback, useMemo, useState } from "react";
import { DataForm, getTranslations } from "../../../domain/entities/DataForm";
import { Template } from "../../../domain/entities/Template";
import { RegenerateTemplateMetadataOptions } from "../../../domain/usecases/RegenerateTemplateMetadataUseCase";
import {
    getBlobFromBase64,
    getExtensionFile,
    MIME_TYPES_BY_EXTENSION,
    toBase64,
    xlsxMimeTypes,
} from "../../../utils/files";
import i18n from "../../../utils/i18n";
import { useAppContext } from "../../contexts/app-context";
import { TemplateDropzone } from "../dropzone/TemplateDropzone";
import Settings from "../../logic/settings";
import { downloadFile } from "../../utils/download";

export type RegenerateMetadataDialogProps = {
    title: string;
    settings: Settings;
    onClose: () => void;
};

type ResolvedTemplate = {
    file: File;
    template: Template;
    dataForm: DataForm;
};

type ResolutionState =
    | { type: "empty" }
    | { type: "loading" }
    | { type: "resolved"; resolved: ResolvedTemplate }
    | { type: "error"; message: string };

type Flags = Readonly<
    Pick<RegenerateTemplateMetadataOptions, "includeMetadataCodes" | "useCodesForMetadata" | "orgUnitShortName">
>;

const defaultFlags: Flags = {
    includeMetadataCodes: false,
    useCodesForMetadata: false,
    orgUnitShortName: false,
};

const metadataLanguage = "en";

export function RegenerateMetadataDialog(props: RegenerateMetadataDialogProps): React.ReactElement {
    const { title, settings, onClose } = props;
    const { api, compositionRoot } = useAppContext();
    const snackbar = useSnackbar();
    const loading = useLoading();
    const classes = useStyles();

    const [resolution, setResolution] = useState<ResolutionState>({ type: "empty" });
    const [flags, setFlags] = useState<Flags>(defaultFlags);
    const [isRunning, setIsRunning] = useState(false);

    const translations = useMemo(getTranslations, []);

    const onDrop = useCallback(
        async (files: File[]) => {
            const file = files[0];

            // Reason: react-dropzone passes an empty list when the dropped file fails the mime-type filter.
            if (!file) {
                setResolution({ type: "error", message: i18n.t("Only .xlsx and .xlsm template files are accepted") });
                setFlags(defaultFlags);
                return;
            }

            setResolution({ type: "loading" });

            try {
                const { template, dataForm } = await compositionRoot.templates.resolveFromFile(file);
                setResolution({ type: "resolved", resolved: { file, template, dataForm } });
                setFlags({ ...defaultFlags, includeMetadataCodes: template.includeMetadataCodes ?? false });
            } catch (error: unknown) {
                console.error(error);
                setResolution({ type: "error", message: getErrorMessage(error) });
                setFlags(defaultFlags);
            }
        },
        [compositionRoot]
    );

    const setFlag = useCallback(
        (flag: keyof Flags) => (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
            setFlags(flags => ({ ...flags, [flag]: checked }));
        },
        []
    );

    const regenerate = useCallback(async () => {
        if (resolution.type !== "resolved") return;
        const { file, dataForm } = resolution.resolved;

        const extension = getExtensionFile(file.name);
        const mimeType = extension ? MIME_TYPES_BY_EXTENSION[extension] : undefined;
        if (!extension || !mimeType) {
            snackbar.error(i18n.t("Unsupported file extension for template"));
            return;
        }

        setIsRunning(true);
        loading.show(true, i18n.t("Regenerating metadata..."));

        try {
            const fileContents = await toBase64(file);
            const contents = await compositionRoot.templates.regenerateMetadata(api, {
                type: dataForm.type,
                id: dataForm.id,
                fileContents,
                settings,
                language: metadataLanguage,
                ...flags,
            });

            downloadFile({
                filename: `${removeExtension(file.name)}-regenerated.${extension}`,
                data: getBlobFromBase64(contents),
                mimeType,
            });

            snackbar.success(i18n.t("Metadata regenerated"));
            loading.hide();
            setIsRunning(false);
            onClose();
        } catch (error: unknown) {
            // Reason: stay open on failure so the message stays readable and the resolved file can be retried.
            console.error(error);
            snackbar.error(getErrorMessage(error));
            loading.hide();
            setIsRunning(false);
        }
    }, [api, compositionRoot, flags, loading, onClose, resolution, settings, snackbar]);

    // Reason: ConfirmationDialog has no disable-cancel prop, and backdrop clicks and Escape reach onCancel as well.
    const cancel = useCallback(() => {
        if (isRunning) return;
        onClose();
    }, [isRunning, onClose]);

    const droppedFileName = resolution.type === "resolved" ? resolution.resolved.file.name : undefined;

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

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function removeExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf(".");
    return lastDotIndex === -1 ? fileName : fileName.slice(0, lastDotIndex);
}

const useStyles = makeStyles({
    error: { color: "#f4231f" },
    note: { color: "#707070", fontStyle: "italic" },
});
