import { UseCase } from "../../CompositionRoot";
import { DocumentRepository } from "../repositories/DocumentRepository";
import { Id } from "../entities/ReferenceObject";

export interface DownloadFileResourceProps {
    documentId: string;
    filename: string;
}

export class DownloadDocumentUseCase implements UseCase {
    constructor(private documentRepository: DocumentRepository) {}

    public async execute(documentId: Id): Promise<Blob> {
        return this.documentRepository.download(documentId);
    }
}
