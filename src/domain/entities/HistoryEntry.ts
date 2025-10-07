import { Id } from "./ReferenceObject";
import { generateUid } from "d2/uid";
import { SynchronizationResult } from "./SynchronizationResult";
import { Maybe } from "../../types/utils";
import { ImportTemplateError } from "../usecases/ImportTemplateUseCase";
import { User } from "./User";
import { DataForm } from "./DataForm";
import { Either } from "./Either";
import { Document, UnsavedDocument } from "./Document";

export class HistoryEntry {
    public readonly id: Id;
    public readonly dataForm: Maybe<DataForm>;
    public readonly timestamp: Date;
    public readonly user: User;
    public readonly document: HistoryEntryDocument;
    public readonly syncResults: Maybe<SynchronizationResult[]>;
    public readonly errorDetails: Maybe<ErrorDetails>;

    constructor({
        id = generateUid(),
        timestamp = new Date(),
        dataForm,
        user,
        document,
        syncResults,
        errorDetails,
    }: Partial<HistoryEntry> & {
        dataForm: Maybe<DataForm>;
        user: User;
        document: HistoryEntryDocument;
        syncResults: Maybe<SynchronizationResult[]>;
        errorDetails: Maybe<ErrorDetails>;
    }) {
        this.id = id;
        this.dataForm = dataForm;
        this.timestamp = timestamp;
        this.user = user;
        this.document = document;
        this.syncResults = syncResults;
        this.errorDetails = errorDetails;
        if (!this.syncResults && !this.errorDetails) {
            throw new Error("Either syncResults or errorDetails must be provided");
        }
    }

    static create(data: {
        user: User;
        document: HistoryEntryDocument;
        dataForm: Maybe<DataForm>;
        syncResults: Maybe<SynchronizationResult[]>;
        errorDetails: Maybe<ErrorDetails>;
    }): HistoryEntry {
        return new HistoryEntry(data);
    }

    static fromImportResult(data: {
        user: User;
        document: HistoryEntryDocument;
        dataForm: Maybe<DataForm>;
        result: Either<ImportTemplateError, SynchronizationResult[]>;
    }): HistoryEntry {
        if (data.result.isError()) {
            return new HistoryEntry({
                user: data.user,
                document: data.document,
                dataForm: data.dataForm,
                syncResults: undefined,
                errorDetails: data.result.value.error,
            });
        } else {
            return new HistoryEntry({
                user: data.user,
                document: data.document,
                dataForm: data.dataForm,
                syncResults: data.result.value.data,
                errorDetails: undefined,
            });
        }
    }

    public toSummary(): HistoryEntrySummary {
        const documentInformation =
            "id" in this.document // is it a saved document?
                ? { documentId: this.document.id, ...(this.document.deletedAt ? { documentDeleted: true } : {}) }
                : {
                      documentId: undefined,
                  };
        return {
            id: this.id,
            name: this.dataForm?.name || "",
            timestamp: this.timestamp.toISOString(),
            status: this.computeStatus(),
            username: this.user.username,
            fileName: this.document.name,
            ...documentInformation,
        };
    }

    private computeStatus(): HistoryEntryStatus {
        if (this.errorDetails) {
            return "ERROR";
        }
        if (!this.syncResults || this.syncResults.length === 0) {
            return "ERROR";
        }
        const hasError = this.syncResults.some(
            result => result.status === "ERROR" || result.status === "NETWORK ERROR"
        );
        if (hasError) {
            return "ERROR";
        }
        const hasWarning = this.syncResults.some(result => result.status === "WARNING");
        if (hasWarning) {
            return "WARNING";
        }
        return "SUCCESS";
    }

    public toDetails(): HistoryEntryDetails {
        return {
            results: this.syncResults,
            errorDetails: this.errorDetails,
        };
    }

    static shouldSaveImportResult(result: Either<ImportTemplateError, SynchronizationResult[]>): boolean {
        // errors used for user conflict resolution that are handled in the UI
        const ERROR_TYPES_EXCLUDED_FROM_SAVE: ImportTemplateError["type"][] = ["DUPLICATE_VALUES", "INVALID_ORG_UNITS"];
        return result.match({
            error: error => !ERROR_TYPES_EXCLUDED_FROM_SAVE.includes(error.type),
            success: () => true,
        });
    }
}

export type HistoryEntryStatus = "SUCCESS" | "ERROR" | "WARNING";

export interface HistoryEntrySummary {
    id: Id;
    name: string;
    timestamp: string;
    status: HistoryEntryStatus;
    username: string;
    documentId: Maybe<Id>;
    fileName: string;
    documentDeleted?: boolean;
    deletedAt?: string;
    deletedBy?: string;
}

export interface HistoryEntryDetails {
    results: Maybe<SynchronizationResult[]>;
    errorDetails: Maybe<ErrorDetails>;
}

interface UnhandledException {
    type: "UNHANDLED_EXCEPTION";
    message: string;
}

type ErrorDetails = ImportTemplateError | UnhandledException;

export type HistoryEntryDocument = Document | UnsavedDocument;
