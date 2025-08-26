import { makeStyles } from "@material-ui/core";
import React from "react";

export const FlexRow: React.FC = ({ children }) => {
    const classes = useStyles();
    return (
        <div className={classes.flexRow}>
            {React.Children.map(children, child => (
                <div className={classes.flexItem}>{child}</div>
            ))}
        </div>
    );
};

const useStyles = makeStyles({
    flexRow: { display: "flex", gap: "8px" },
    flexItem: { flex: 1 },
});
