import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    makeStyles,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from "@material-ui/core";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import _ from "lodash";
import { useCallback, useMemo } from "react";
import ReactJson from "react-json-view";
import {
    ErrorMessage,
    SynchronizationResult,
    SynchronizationStats,
} from "../../../domain/entities/SynchronizationResult";
import i18n from "../../../utils/i18n";

const useStyles = makeStyles(theme => ({
    accordionHeading1: {
        marginLeft: 30,
        fontSize: theme.typography.pxToRem(15),
        flexBasis: "55%",
        flexShrink: 0,
    },
    accordionHeading2: {
        fontSize: theme.typography.pxToRem(15),
        color: theme.palette.text.secondary,
    },
    accordionDetails: {
        padding: "4px 24px 4px",
    },
    accordion: {
        paddingBottom: "10px",
    },
    tooltip: {
        maxWidth: 650,
        fontSize: "0.9em",
    },
}));

export const formatStatusTag = (value: string) => {
    const text = _.startCase(_.toLower(value));
    const color =
        value === "ERROR" || value === "FAILURE" || value === "NETWORK ERROR"
            ? "#e53935"
            : value === "DONE" || value === "SUCCESS" || value === "OK"
            ? "#7cb342"
            : "#3e2723";

    return <b style={{ color }}>{text}</b>;
};

const buildSummaryTable = (stats: SynchronizationStats[]) => {
    return (
        <Table>
            <TableHead>
                <TableRow>
                    <TableCell>{i18n.t("Type")}</TableCell>
                    <TableCell>{i18n.t("Imported")}</TableCell>
                    <TableCell>{i18n.t("Updated")}</TableCell>
                    <TableCell>{i18n.t("Deleted")}</TableCell>
                    <TableCell>{i18n.t("Ignored")}</TableCell>
                    <TableCell>{i18n.t("Total")}</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {stats.map(({ type, imported, updated, deleted, ignored, total }, i) => (
                    <TableRow key={`row-${i}`}>
                        <TableCell>{type}</TableCell>
                        <TableCell>{imported}</TableCell>
                        <TableCell>{updated}</TableCell>
                        <TableCell>{deleted}</TableCell>
                        <TableCell>{ignored}</TableCell>
                        <TableCell>{total || _.sum([imported, deleted, ignored, updated])}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

const buildMessageTable = (messages: ErrorMessage[]) => {
    return (
        <Table>
            <TableHead>
                <TableRow>
                    <TableCell>{i18n.t("Identifier")}</TableCell>
                    <TableCell>{i18n.t("Message")}</TableCell>
                    <TableCell>{i18n.t("Details")}</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {messages.map(({ id, message, details }, i) => (
                    <TableRow key={`row-${i}`}>
                        <TableCell>{id}</TableCell>
                        <TableCell>{message}</TableCell>
                        <TableCell>{details}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

interface SyncSummaryProps {
    results: SynchronizationResult[];
}

const SyncSummary = ({ results }: SyncSummaryProps) => {
    const classes = useStyles();
    const rawResults = useMemo(
        () =>
            _(results)
                .map(result => result.rawResponse)
                .reject(_.isEmpty)
                .value(),
        [results]
    );

    const copyToClipboard = useCallback((object: unknown) => {
        navigator.clipboard.writeText(JSON.stringify(object, null, 4));
    }, []);

    return (
        <>
            {results.map(({ title, status, stats = [], message, errors }, idx) => (
                <Accordion defaultExpanded={results.length === 1} className={classes.accordion} key={`row-${idx}`}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography className={classes.accordionHeading1}>
                            {title}
                            <br />
                        </Typography>
                        <Typography className={classes.accordionHeading2}>
                            {`${i18n.t("Status")}: `}
                            {formatStatusTag(status)}
                        </Typography>
                    </AccordionSummary>

                    <AccordionDetails className={classes.accordionDetails}>
                        <Typography variant="overline">{i18n.t("Summary")}</Typography>
                    </AccordionDetails>

                    {message && (
                        <AccordionDetails className={classes.accordionDetails}>
                            <Typography variant="body2">{message}</Typography>
                        </AccordionDetails>
                    )}

                    {!_.isEmpty(stats) && (
                        <AccordionDetails className={classes.accordionDetails}>
                            {buildSummaryTable([...stats])}
                        </AccordionDetails>
                    )}

                    {errors && errors.length > 0 && (
                        <div>
                            <AccordionDetails className={classes.accordionDetails}>
                                <Typography variant="overline">{i18n.t("Messages")}</Typography>
                            </AccordionDetails>
                            <AccordionDetails className={classes.accordionDetails}>
                                {buildMessageTable(_.take(errors, 10))}
                            </AccordionDetails>
                        </div>
                    )}
                </Accordion>
            ))}

            {!_.isEmpty(rawResults) && (
                <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography className={classes.accordionHeading1}>{i18n.t("JSON Response")}</Typography>
                    </AccordionSummary>

                    <AccordionDetails>
                        <ReactJson
                            src={rawResults.length === 1 ? rawResults[0] ?? {} : rawResults}
                            collapsed={2}
                            enableClipboard={copyToClipboard}
                        />
                    </AccordionDetails>
                </Accordion>
            )}
        </>
    );
};

export default SyncSummary;
