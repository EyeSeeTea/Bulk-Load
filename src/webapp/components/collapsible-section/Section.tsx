import { Icon, IconButton, makeStyles, Paper } from "@material-ui/core";
import React, {useMemo} from "react";

type iconPosition = "left" | "right";
type arrowStyle = "up_down" | "right_left" | "down_right";

interface SectionProps {
    isOpen?: boolean;
    setOpen?: (open: boolean) => void;
    children: React.ReactNode;
    title: React.ReactNode;
    collapsible?: boolean;
    elevation?: number;
    iconPos?: iconPosition;
    classProps?: {
        sectionPaper?: string;
        sectionHeader?: string;
        sectionContent?: string;
    };
    arrowStyle?: arrowStyle;
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

    const paperClasses = useMemo(() => ( _.compact([classes.paper, classProps.sectionPaper]).join(" ")),
        [classes.paper, classProps.sectionPaper]);
    const headerClasses = useMemo(() => ( _.compact([classes.header, leftIcon, classProps.sectionHeader, (isOpen ? null : classes.noBorder)]).join(" ")),
        [classes.header, leftIcon, classProps.sectionHeader, isOpen, classes.noBorder]);
    const contentClasses = useMemo(() => (_.compact([classProps.sectionContent, (isOpen ? null : classes.hidden)]).join(" ")),
        [classProps.sectionContent, isOpen, classes.hidden]);

    return (
        <Paper elevation={elevation} className={paperClasses}>
            <div
                className={headerClasses}
                onClick={toggle}
            >
                {collapsible && leftIcon && <CollapsibleToggle isOpen={isOpen} arrowStyle={arrowStyle} />}
                {title}
                {collapsible && !leftIcon && <CollapsibleToggle isOpen={isOpen} arrowStyle={arrowStyle} />}
            </div>
            <div className={contentClasses}>
                {children}
            </div>
        </Paper>
    );
};

interface CollapsibleToggleProps {
    isOpen: boolean;
    arrowStyle: arrowStyle;
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
