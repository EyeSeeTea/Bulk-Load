import { Id } from "./ReferenceObject";

export interface OrgUnit {
    id: Id;
    path: string;
    name: string;
    level: number;
}
