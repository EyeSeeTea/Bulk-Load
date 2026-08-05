import { useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";
import React, { useCallback, useMemo, useState } from "react";
import { DataForm, getTranslations } from "../../domain/entities/DataForm";
import { Template } from "../../domain/entities/Template";
import { RegenerateTemplateMetadataOptions } from "../../domain/usecases/RegenerateTemplateMetadataUseCase";
import { getBlobFromBase64, getExtensionFile, MIME_TYPES_BY_EXTENSION, toBase64 } from "../../utils/files";
import i18n from "../../utils/i18n";
import { useAppContext } from "../contexts/app-context";
import Settings from "../logic/settings";
import { downloadFile } from "../utils/download";

export type ResolvedTemplate = {
    file: File;
    template: Template;
    dataForm: DataForm;
};

export type ResolutionState =
    | { type: "empty" }
    | { type: "loading" }
    | { type: "resolved"; resolved: ResolvedTemplate }
    | { type: "error"; message: string };

export type Flags = Readonly<
    Pick<RegenerateTemplateMetadataOptions, "includeMetadataCodes" | "useCodesForMetadata" | "orgUnitShortName">
>;

const defaultFlags: Flags = {
    includeMetadataCodes: false,
    useCodesForMetadata: false,
    orgUnitShortName: false,
};

const metadataLanguage = "en";

export type UseRegenerateMetadataOptions = {
    settings: Settings;
    onClose: () => void;
};

export type UseRegenerateMetadataState = {
    resolution: ResolutionState;
    flags: Flags;
    isRunning: boolean;
    translations: ReturnType<typeof getTranslations>;
    droppedFileName: string | undefined;
    onDrop: (files: File[]) => Promise<void>;
    setFlag: (flag: keyof Flags) => (event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => void;
    regenerate: () => Promise<void>;
    cancel: () => void;
};

export function useRegenerateMetadata(options: UseRegenerateMetadataOptions): UseRegenerateMetadataState {
    const { settings, onClose } = options;
    const { api, compositionRoot } = useAppContext();
    const snackbar = useSnackbar();
    const loading = useLoading();

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

    return {
        resolution,
        flags,
        isRunning,
        translations,
        droppedFileName,
        onDrop,
        setFlag,
        regenerate,
        cancel,
    };
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function removeExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf(".");
    return lastDotIndex === -1 ? fileName : fileName.slice(0, lastDotIndex);
}
