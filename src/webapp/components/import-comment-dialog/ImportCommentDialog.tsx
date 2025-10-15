import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@material-ui/core";
import React, { useState } from "react";
import i18n from "../../../utils/i18n";

export interface ImportCommentDialogProps {
    isOpen: boolean;
    onContinue: (comment: string | undefined) => void;
    onCancel: () => void;
    defaultComment?: string;
}

export const ImportCommentDialog: React.FC<ImportCommentDialogProps> = ({
    isOpen,
    onContinue,
    onCancel,
    defaultComment,
}) => {
    const [comment, setComment] = useState<string>("");

    React.useEffect(() => {
        if (isOpen && defaultComment !== undefined) {
            setComment(defaultComment);
        }
    }, [isOpen, defaultComment]);

    const handleCommentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setComment(event.target.value);
    };

    const handleContinueWithoutComment = () => {
        onContinue(undefined);
        setComment("");
    };

    const handleSaveAndContinue = () => {
        const trimmedComment = comment.trim();
        onContinue(trimmedComment || undefined);
        setComment("");
    };

    const isCommentProvided = comment.trim().length > 0;

    return (
        <Dialog open={isOpen} onClose={onCancel} maxWidth="sm" fullWidth>
            <DialogTitle>{i18n.t("Comment for all imported data values")}</DialogTitle>

            <DialogContent>
                <p>
                    {i18n.t(
                        "You can add an optional comment below. If provided, it will be associated with every data value that is created, updated, or deleted during this import."
                    )}
                </p>
                <TextField
                    autoFocus
                    margin="dense"
                    label={i18n.t("Comment (optional)")}
                    fullWidth
                    multiline
                    rows={4}
                    value={comment}
                    onChange={handleCommentChange}
                    variant="outlined"
                />
            </DialogContent>

            <DialogActions>
                <Button onClick={handleContinueWithoutComment} color="default">
                    {i18n.t("CONTINUE WITHOUT COMMENT")}
                </Button>
                <Button onClick={handleSaveAndContinue} color="primary" disabled={!isCommentProvided}>
                    {i18n.t("SAVE AND CONTINUE")}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
