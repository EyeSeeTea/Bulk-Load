import { Icon, Typography, makeStyles } from "@material-ui/core";

interface WarningAlertProps {
    message: string;
}

export function WarningAlert({ message }: WarningAlertProps) {
    const classes = useStyles();

    return (
        <div className={classes.alert} role="alert">
            <Icon className={classes.icon}>warning</Icon>
            <Typography variant="body2">{message}</Typography>
        </div>
    );
}

const useStyles = makeStyles({
    alert: {
        display: "flex",
        alignItems: "center",
        marginTop: "1em",
        marginBottom: "1em",
        padding: "8px 16px",
        backgroundColor: "#fff3cd",
        border: "1px solid #ffeaa7",
        borderRadius: 4,
        color: "#856404",
    },
    icon: {
        marginRight: 8,
        color: "#f39c12",
    },
});
