import React from "react";
import { Icon, Link, makeStyles } from "@material-ui/core";
import {
    SynchronizationResult as FullSynchronizationResult,
    SynchronizationStatus,
    computeOverallSyncStatus,
} from "../../../domain/entities/SynchronizationResult";
import i18n from "../../../utils/i18n";
import { getStatusConfig } from "../../utils/statusConfig";
import { colors } from "../app/themes/dhis2.theme";

type SynchronizationResult = Pick<FullSynchronizationResult, "status">;

interface ImportResultBadgeProps {
    results: SynchronizationResult[];
    onClick: () => void;
}

function getBadgeConfig(status: SynchronizationStatus) {
    const base = getStatusConfig(status);
    switch (status) {
        case "SUCCESS":
            return { ...base, label: i18n.t("Import successful") };
        case "WARNING":
            return { ...base, label: i18n.t("Import with warnings") };
        case "ERROR":
            return { ...base, label: i18n.t("Import with errors") };
        case "NETWORK ERROR":
            return { ...base, label: i18n.t("Network error") };
        case "PENDING":
            return { ...base, label: i18n.t("Import pending") };
        default: {
            const _exhaustive: never = status;
            return _exhaustive;
        }
    }
}

const useStyles = makeStyles({
    badge: {
        display: "inline-flex",
        alignItems: "center",
        marginTop: 12,
        marginBottom: 12,
        padding: "8px 16px 8px 12px",
        borderRadius: 16,
        color: colors.white,
        fontWeight: 500,
        fontSize: "0.95em",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
        transition: "filter 0.2s ease",
        "&:hover": {
            filter: "brightness(0.9)",
        },
    },
    icon: {
        marginRight: 6,
        fontSize: 20,
    },
});

export function ImportResultBadge({ results, onClick }: ImportResultBadgeProps) {
    const classes = useStyles();
    const overallStatus = computeOverallSyncStatus(results);
    const config = getBadgeConfig(overallStatus);

    return (
        <Link
            component="button"
            underline="none"
            onClick={onClick}
            className={classes.badge}
            style={{ backgroundColor: config.color }}
        >
            <Icon className={classes.icon}>{config.icon}</Icon>
            {config.label}
        </Link>
    );
}
