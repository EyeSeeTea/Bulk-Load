import { Id } from "./ReferenceObject";

export interface Document {
    id: Id;
    fileResourceId: Id;
    name: string;
    createdAt: string;
    deletedAt?: string;
    deletedBy?: string;
}
