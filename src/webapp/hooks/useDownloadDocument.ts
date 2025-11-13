import { useSnackbar } from "@eyeseetea/d2-ui-components";
import { useCallback } from "react";
import { Id } from "../../domain/entities/ReferenceObject";
import { Maybe } from "../../types/utils";
import i18n from "../../utils/i18n";
import { useAppContext } from "../contexts/app-context";
import { downloadFile } from "../utils/download";

interface DownloadDocumentParams {
    documentId: Maybe<Id>;
    fileName: string;
}

interface UseDownloadDocumentReturn {
    downloadDocument: (params: DownloadDocumentParams) => Promise<void>;
}

export function useDownloadDocument(): UseDownloadDocumentReturn {
    const { compositionRoot } = useAppContext();
    const snackbar = useSnackbar();
    const downloadDocument = useCallback(
        async ({ documentId, fileName }: DownloadDocumentParams) => {
            if (documentId) {
                try {
                    const blob = await compositionRoot.history.downloadDocument(documentId);
                    downloadFile({
                        filename: fileName,
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
        [compositionRoot.history, snackbar]
    );
    return {
        downloadDocument,
    };
}
