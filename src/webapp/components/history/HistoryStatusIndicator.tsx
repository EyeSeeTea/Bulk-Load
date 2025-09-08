import React from "react";
import { Icon } from "@material-ui/core";
import { HistoryEntryStatus } from "../../../domain/entities/HistoryEntry";
import i18n from "../../../utils/i18n";

interface HistoryStatusIndicatorProps {
    status: HistoryEntryStatus;
    style?: React.CSSProperties;
    iconStyle?: React.CSSProperties;
}

function getStatusConfig(status: HistoryEntryStatus) {
    switch (status) {
        case "SUCCESS":
            return {
                icon: "check_circle",
                label: i18n.t("Success"),
                color: "#4caf50",
            };
        case "ERROR":
            return {
                icon: "error",
                label: i18n.t("Error"),
                color: "#f44336",
            };
        case "WARNING":
            return {
                icon: "warning",
                label: i18n.t("Warning"),
                color: "#ff9800",
            };
        default:
            return {
                icon: "help",
                label: status,
                color: "#666",
            };
    }
}

export function HistoryStatusIndicator({ status, style, iconStyle }: HistoryStatusIndicatorProps) {
    const statusConfig = getStatusConfig(status);

    return (
        <span
            style={{
                color: statusConfig.color,
                display: "flex",
                alignItems: "center",
                ...style,
            }}
        >
            <Icon
                style={{
                    marginRight: 4,
                    fontSize: 16,
                    ...iconStyle,
                }}
            >
                {statusConfig.icon}
            </Icon>
            {statusConfig.label}
        </span>
    );
}
