import React from "react";
import { ConfirmationDialog } from "@eyeseetea/d2-ui-components";
import { makeStyles, Typography, Box } from "@material-ui/core";
import { Warning } from "@material-ui/icons";

export interface OperationConfirmationDialogProps {
    isOpen: boolean;
    title: string;
    operation: string;
    parameters?: [string, string][];
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export const OperationConfirmationDialog: React.FC<OperationConfirmationDialogProps> = ({
    isOpen,
    title,
    operation,
    parameters,
    onConfirm,
    onCancel,
    isLoading = false,
}) => {
    const classes = useStyles();

    return (
        <ConfirmationDialog
            isOpen={isOpen}
            title={title}
            onSave={onConfirm}
            onCancel={onCancel}
            saveText={operation}
            cancelText="Cancel"
            disableSave={isLoading}
            maxWidth="sm"
            fullWidth
        >
            <Box className={classes.content}>
                <Box className={classes.warningHeader}>
                    <Warning className={classes.warningIcon} />
                    <Typography variant="h6" className={classes.warningText}>
                        WARNING: This action cannot be undone
                    </Typography>
                </Box>
                <Box className={classes.details}>
                    <Typography variant="body1" className={classes.detailText}>
                        You are about to execute:
                    </Typography>
                    <Typography variant="body1" className={classes.operationText}>
                        <strong>Operation:</strong> {operation}
                    </Typography>
                    {parameters && parameters.map(([label, value], index) => (
                        <Typography key={index} variant="body1" className={classes.parameterText}>
                            <strong>{label}:</strong> {value}
                        </Typography>
                    ))}
                    <Typography variant="body2" className={classes.confirmText}>
                        Are you sure you want to proceed with this operation?
                    </Typography>
                </Box>
            </Box>
        </ConfirmationDialog>
    );
};

const useStyles = makeStyles(theme => ({
    content: {
        padding: theme.spacing(2, 0),
    },
    warningHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing(1),
        padding: theme.spacing(2),
        backgroundColor: theme.palette.error.light,
        borderRadius: theme.shape.borderRadius,
        marginBottom: theme.spacing(3),
    },
    warningIcon: {
        color: theme.palette.error.contrastText,
        fontSize: "2rem",
    },
    warningText: {
        color: theme.palette.error.contrastText,
        fontWeight: 600,
    },
    details: {
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing(1.5),
        padding: theme.spacing(0, 1),
    },
    detailText: {
        color: theme.palette.text.primary,
        marginBottom: theme.spacing(1),
    },
    operationText: {
        color: theme.palette.text.primary,
        padding: theme.spacing(1),
        backgroundColor: theme.palette.grey[100],
        borderRadius: theme.shape.borderRadius,
    },
    periodText: {
        color: theme.palette.text.primary,
        padding: theme.spacing(1),
        backgroundColor: theme.palette.grey[100],
        borderRadius: theme.shape.borderRadius,
    },
    parameterText: {
        color: theme.palette.text.primary,
        padding: theme.spacing(1),
        backgroundColor: theme.palette.grey[100],
        borderRadius: theme.shape.borderRadius,
    },
    confirmText: {
        color: theme.palette.error.main,
        fontWeight: 500,
        marginTop: theme.spacing(2),
        textAlign: "center",
    },
}));
