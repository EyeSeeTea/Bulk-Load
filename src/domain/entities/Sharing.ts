import { SharingRule } from "@eyeseetea/d2-ui-components";

export type Sharing = {
    external: boolean;
    public: string;
    userGroups: SharingRule[];
    users: SharingRule[];
};

export const defaultSharing: Sharing = {
    external: false,
    public: "--------",
    userGroups: [],
    users: [],
};

export const publicReadSharing: Sharing = {
    external: false,
    public: "r-------",
    userGroups: [],
    users: [],
};

export enum Permissions {
    NO_ACCESS = "--------",
    READ_ONLY = "r-------",
}
