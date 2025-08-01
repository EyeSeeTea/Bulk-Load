import { Icon, IconButton, makeStyles, Paper } from "@material-ui/core";
import React from "react";
import { buildClassName } from "../../utils/reactHelpers";

type IconPosition = "left" | "right";
type ArrowStyle = "up_down" | "right_left" | "down_right";

interface SectionProps {
    isOpen?: boolean;
    setOpen?: (open: boolean) => void;
    children: React.ReactNode;
    title: React.ReactNode;
    collapsible?: boolean;
    elevation?: number;
    iconPos?: IconPosition;
    classProps?: {
        sectionPaper?: string;
        sectionHeader?: string;
        sectionContent?: string;
    };
    arrowStyle?: ArrowStyle;
}

export const Section = (props: SectionProps) => {
    const {
        children,
        title,
        collapsible,
        isOpen = true,
        setOpen = () => {},
        elevation = 1,
        iconPos = "right",
        classProps = {},
        arrowStyle = "up_down",
    } = props;
    const classes = useStyles();
    const leftIcon = iconPos === "left" ? classes.leftIcon : null;
    const toggle = () => setOpen(!isOpen);

    return (
        <Paper elevation={elevation} className={buildClassName([classes.paper, classProps.sectionPaper])}>
            <div
                className={buildClassName([
                    classes.header,
                    leftIcon,
                    classProps.sectionHeader,
                    isOpen ? null : classes.noBorder,
                ])}
                onClick={toggle}
            >
                {collapsible && leftIcon && <CollapsibleToggle isOpen={isOpen} arrowStyle={arrowStyle} />}
                {title}
                {collapsible && !leftIcon && <CollapsibleToggle isOpen={isOpen} arrowStyle={arrowStyle} />}
            </div>
            <div className={buildClassName([classProps.sectionContent, isOpen ? null : classes.hidden])}>
                {children}
            </div>
        </Paper>
    );
};

interface CollapsibleToggleProps {
    isOpen: boolean;
    arrowStyle: ArrowStyle;
}

const CollapsibleToggle = (props: CollapsibleToggleProps) => {
    const { isOpen, arrowStyle } = props;
    const classes = useStyles();
    const [open, close] = arrowStyle.split("_");

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
    hidden: { display: "none" },
});
