import { SynchronizationStatus } from "../../domain/entities/SynchronizationResult";
import { colors } from "../components/app/themes/dhis2.theme";

export interface StatusConfig {
    icon: string;
    color: string;
}

const legacyColorAliases: Record<string, string> = {
    FAILURE: colors.negative,
    DONE: colors.positive,
    OK: colors.positive,
};

export function getStatusColor(status: string): string {
    return legacyColorAliases[status] ?? getStatusConfig(status as SynchronizationStatus).color;
}

export function getStatusConfig(status: SynchronizationStatus): StatusConfig {
    switch (status) {
        case "ERROR":
        case "NETWORK ERROR":
            return { icon: "error", color: colors.negative };
        case "SUCCESS":
            return { icon: "check_circle", color: colors.positive };
        case "WARNING":
            return { icon: "warning", color: colors.warning };
        case "PENDING":
            return { icon: "hourglass_empty", color: colors.grey };
        default: {
            const _exhaustive: never = status;
            return _exhaustive;
        }
    }
}
