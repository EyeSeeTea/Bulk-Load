import { Id } from "./ReferenceObject";

export type FileResource = {
    id: Id;
    name: string;
    data: Blob;
    createdAt?: string;
};

export type ImportSource = { spreadSheet: Blob; images: FileResource[] };
