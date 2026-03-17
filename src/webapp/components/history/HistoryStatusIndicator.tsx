import React from "react";
import { Icon } from "@material-ui/core";
import { HistoryEntryStatus } from "../../../domain/entities/HistoryEntry";
import i18n from "../../../utils/i18n";
import { getStatusConfig } from "../../utils/statusConfig";

interface HistoryStatusIndicatorProps {
    status: HistoryEntryStatus;
    style?: React.CSSProperties;
    iconStyle?: React.CSSProperties;
}

function getHistoryStatusConfig(status: HistoryEntryStatus) {
    const base = getStatusConfig(status);
    switch (status) {
        case "SUCCESS":
            return { ...base, label: i18n.t("Success") };
        case "ERROR":
            return { ...base, label: i18n.t("Error") };
        case "WARNING":
            return { ...base, label: i18n.t("Warning") };
        default:
            return { ...base, label: status };
    }
}

export function HistoryStatusIndicator({ status, style, iconStyle }: HistoryStatusIndicatorProps) {
    const config = getHistoryStatusConfig(status);

    return (
        <span
            style={{
                color: config.color,
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
                {config.icon}
            </Icon>
            {config.label}
        </span>
    );
}
