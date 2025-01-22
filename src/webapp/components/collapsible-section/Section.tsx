import { Icon, IconButton, makeStyles, Paper } from "@material-ui/core";
import React from "react";

type iconPosition = "left" | "right";
type arrowStyle = "upDown" | "rightLeft";

export interface SectionProps {
    isOpen?: boolean;
    setOpen?: (open: boolean) => void;
    children: React.ReactNode;
    title: React.ReactNode;
    collapsible?: boolean;
    elevation?: number;
    iconPos?: iconPosition;
    classProps?: {
        section?: string;
        header?: string;
        content?: string;
    };
    arrowStyle?: arrowStyle;
}

export const Section = ({
    children,
    title,
    collapsible,
    isOpen = true,
    setOpen = () => {},
    elevation = 1,
    iconPos = "right",
    classProps = {},
    arrowStyle = "upDown",
}: SectionProps) => {
    const classes = useStyles();
    const leftIcon = iconPos === "left" ? classes.leftIcon : null;
    const toggle = () => setOpen(!isOpen);

    return (
        <Paper elevation={elevation} className={`${classes.paper} ${classProps.section}`}>
            <div
                className={`${classes.header} ${leftIcon} ${classProps.header} ${isOpen ? "" : classes.noBorder}`}
                onClick={toggle}
            >
                {collapsible && leftIcon && <CollapsibleToggle isOpen={isOpen} arrowStyle={arrowStyle} />}
                {title}
                {collapsible && !leftIcon && <CollapsibleToggle isOpen={isOpen} arrowStyle={arrowStyle} />}
            </div>
            <div className={`${classProps.content}`} style={{ display: isOpen ? "" : "none" }}>
                {children}
            </div>
        </Paper>
    );
};

export interface CollapsibleToggleProps {
    isOpen: boolean;
    arrowStyle: "upDown" | "rightLeft";
}

export const CollapsibleToggle = ({ isOpen, arrowStyle }: CollapsibleToggleProps) => {
    const classes = useStyles();
    const [open, close] = arrowStyle === "upDown" ? ["up", "down"] : ["right", "left"];

    return (
        <IconButton disableTouchRipple={true} style={isOpen ? {} : { left: 0 }} className={classes.button}>
            <Icon>{isOpen ? `keyboard_arrow_${open}` : `keyboard_arrow_${close}`}</Icon>
        </IconButton>
    );
};

const useStyles = makeStyles({
    header: {
        margin: 0,
        padding: "1em",
        paddingLeft: 0,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "solid 1px #e8edf2",
        cursor: "pointer",
    },
    noBorder: { border: "none" },
    leftIcon: {
        justifyContent: "normal",
        gap: 10,
    },
    paper: { padding: "1em", paddingTop: "0.5em", marginBottom: "1em" },
    button: { padding: 0 },
});
