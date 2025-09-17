import i18n from "../../../utils/i18n";
import { DialogContentText } from "@material-ui/core";
import React from "react";

export default function BlankTemplatePage(): React.ReactElement {
    return (
        <React.Fragment>
            <h3>{i18n.t("User with no permissions")} </h3>
            <DialogContentText>
                {i18n.t("It seems this user account does not have any permission. ") +
                    i18n.t("Please get in touch with the admin if you need access to these sections.")}
            </DialogContentText>
        </React.Fragment>
    );
}
