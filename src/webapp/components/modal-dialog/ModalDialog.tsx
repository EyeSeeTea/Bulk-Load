import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogProps,
    DialogTitle,
    makeStyles,
    Tooltip,
} from "@material-ui/core";
import _ from "lodash";
import React from "react";

import i18n from "../../../utils/i18n";

export interface ModalDialogProps extends Partial<Omit<DialogProps, "title">> {
    isOpen?: boolean;
    title?: string;
    description?: string;
    onSave?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    onCancel?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    onInfoAction?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    onUpdate?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    saveText?: string;
    cancelText?: string;
    infoActionText?: string;
    disableSave?: boolean;
    updateText?: string;
    saveButtonPrimary?: boolean;
    saveTooltipText?: string;
    updateTooltipText?: string;
    infoTooltipText?: string;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
    title = "",
    description,
    onSave,
    onUpdate,
    onCancel,
    onInfoAction,
    isOpen = false,
    children,
    cancelText = i18n.t("Cancel"),
    saveText = i18n.t("Save"),
    updateText,
    infoActionText = i18n.t("Info"),
    disableSave = false,
    saveButtonPrimary = true,
    saveTooltipText = "",
    updateTooltipText = "",
    infoTooltipText = "",
    ...other
}) => {
    const classes = useStyles();

    return (
        <Dialog open={isOpen} onClose={onCancel || _.noop} {...other}>
            <DialogTitle>{title}</DialogTitle>

            <DialogContent>
                {description}
                {children}
            </DialogContent>

            <DialogActions>
                {onInfoAction && (
                    <Tooltip placement="top" title={infoTooltipText}>
                        <Button key={"info"} className={classes.infoButton} onClick={onInfoAction} autoFocus>
                            {infoActionText}
                        </Button>
                    </Tooltip>
                )}
                {onCancel && (
                    <Button key={"cancel"} onClick={onCancel} autoFocus>
                        {cancelText}
                    </Button>
                )}
                {onUpdate && (
                    <Tooltip placement="top" title={updateTooltipText}>
                        <Button key={"update"} onClick={onUpdate} color="primary">
                            {updateText}
                        </Button>
                    </Tooltip>
                )}
                {onSave && (
                    <Tooltip placement="top" title={saveTooltipText}>
                        <Button
                            key={"save"}
                            onClick={onSave}
                            color={saveButtonPrimary ? "primary" : "secondary"}
                            disabled={disableSave}
                        >
                            {saveText}
                        </Button>
                    </Tooltip>
                )}
            </DialogActions>
        </Dialog>
    );
};

const useStyles = makeStyles({
    infoButton: { marginRight: "auto" },
});

export default ModalDialog;
