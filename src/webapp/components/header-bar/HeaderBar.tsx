// @ts-ignore - @dhis2/ui-widgets exports HeaderBar but types may not be available
import { HeaderBar as D2HeaderBar } from "@dhis2/ui-widgets";
import { makeStyles } from "@material-ui/core/styles";

type HeaderBarProps = {
    appName: string;
};

// avoid rendering header for versions > 2.41
//https://developers.dhis2.org/docs/references/global-shell/#header-bars
export const HeaderBar: React.FC<HeaderBarProps> = props => {
    const { appName } = props;

    const classes = useStyles();

    const shouldRenderHeaderBar = window.self === window.top;

    return shouldRenderHeaderBar ? (
        <div className={classes.headerBarWrapper}>
            <D2HeaderBar app appName={appName} />
        </div>
    ) : null;
};

const useStyles = makeStyles({
    headerBarWrapper: {
        "& div:first-of-type": {
            boxSizing: "border-box",
        },
    },
});
