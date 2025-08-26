import { FileResource } from "./FileResource";
import { Id } from "./ReferenceObject";
import { generateUid } from "d2/uid";
import { SynchronizationResult } from "./SynchronizationResult";
import { Maybe } from "../../types/utils";
import { ImportTemplateError } from "../usecases/ImportTemplateUseCase";
import { User } from "./User";
import { DataForm } from "./DataForm";
import { Either } from "./Either";

export class HistoryEntry {
    public readonly id: Id;
    public readonly dataForm: Maybe<DataForm>;
    public readonly timestamp: Date;
    public readonly user: User;
    public readonly fileResource: FileResource;
    public readonly syncResults: Maybe<SynchronizationResult[]>;
    public readonly errorDetails: Maybe<ErrorDetails>;

    constructor({
        id = generateUid(),
        timestamp = new Date(),
        dataForm,
        user,
        fileResource,
        syncResults,
        errorDetails,
    }: Partial<HistoryEntry> & {
        dataForm: Maybe<DataForm>;
        user: User;
        fileResource: FileResource;
        syncResults: Maybe<SynchronizationResult[]>;
        errorDetails: Maybe<ErrorDetails>;
    }) {
        this.id = id;
        this.dataForm = dataForm;
        this.timestamp = timestamp;
        this.user = user;
        this.fileResource = fileResource;
        this.syncResults = syncResults;
        this.errorDetails = errorDetails;
        if (!this.syncResults && !this.errorDetails) {
            throw new Error("Either syncResults or errorDetails must be provided");
        }
    }

    static create(data: {
        user: User;
        fileResource: FileResource;
        dataForm: Maybe<DataForm>;
        syncResults: Maybe<SynchronizationResult[]>;
        errorDetails: Maybe<ErrorDetails>;
    }): HistoryEntry {
        return new HistoryEntry(data);
    }

    static fromImportResult(data: {
        user: User;
        fileResource: FileResource;
        dataForm: Maybe<DataForm>;
        result: Either<ImportTemplateError, SynchronizationResult[]>;
    }): HistoryEntry {
        if (data.result.isError()) {
            return new HistoryEntry({
                user: data.user,
                fileResource: data.fileResource,
                dataForm: data.dataForm,
                syncResults: undefined,
                errorDetails: data.result.value.error,
            });
        } else {
            return new HistoryEntry({
                user: data.user,
                fileResource: data.fileResource,
                dataForm: data.dataForm,
                syncResults: data.result.value.data,
                errorDetails: undefined,
            });
        }
    }

    private update(partialUpdate: Partial<HistoryEntry>): HistoryEntry {
        return new HistoryEntry({ ...this, ...partialUpdate });
    }

    public toSummary(): HistoryEntrySummary {
        return {
            id: this.id,
            name: this.dataForm?.name || "N/A",
            timestamp: this.timestamp.toISOString(),
            status: this.computeStatus(),
            username: this.user.username,
            fileResourceId: this.fileResource.id,
            fileName: this.fileResource.name,
        };
    }

    private computeStatus(): "SUCCESS" | "ERROR" | "WARNING" {
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
}

export interface HistoryEntrySummary {
    id: Id;
    name: string;
    timestamp: string;
    status: "SUCCESS" | "ERROR" | "WARNING";
    username: string;
    fileResourceId: Id;
    fileName: string;
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
