import React from "react";
import { makeStyles, Tooltip } from "@material-ui/core";
import HelpOutlineIcon from "@material-ui/icons/HelpOutline";

type LabelHelpProps = {
    helpText: string;
    label: React.ReactNode;
    onClick?: () => void;
};

export const LabelHelp = (props: LabelHelpProps) => {
    const { helpText, label, onClick } = props;
    const classes = useStyles();
    return (
        <div className={classes.root}>
            {label}
            <Tooltip title={helpText} onClick={onClick}>
                <HelpOutlineIcon className={classes.tooltip}></HelpOutlineIcon>
            </Tooltip>
        </div>
    );
};

const useStyles = makeStyles({
    root: { display: "flex", alignItems: "center" },
    tooltip: { marginLeft: 10, color: "#000000DE" },
});
