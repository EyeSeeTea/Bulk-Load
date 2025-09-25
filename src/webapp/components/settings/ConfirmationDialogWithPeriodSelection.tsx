import React, { useState } from "react";
import { ConfirmationDialog } from "@eyeseetea/d2-ui-components";
import { Select, SelectOption } from "../select/Select";
import { makeStyles } from "@material-ui/core";
import moment from "moment";
import i18n from "../../../utils/i18n";

type ConfirmationDialogProps = React.ComponentProps<typeof ConfirmationDialog>;

export interface ConfirmationDialogWithPeriodSelectionProps
    extends Omit<ConfirmationDialogProps, "onSave" | "children"> {
    onSave: (selectedDate: Date) => void;
    defaultPeriod?: string;
    periodInputLabel: string;
    /**
     * value must be in the format "number|unit", e.g., "3|months", "1|years"
     */
    periodOptions?: SelectOption[];
}

const defaultPeriodOptions: SelectOption[] = [
    { value: "3|months", label: i18n.t("3 months") },
    { value: "6|months", label: i18n.t("6 months") },
    { value: "1|years", label: i18n.t("1 year") },
    { value: "2|years", label: i18n.t("2 years") },
];

export const ConfirmationDialogWithPeriodSelection: React.FC<ConfirmationDialogWithPeriodSelectionProps> = ({
    onSave,
    defaultPeriod = "1|years",
    periodInputLabel,
    periodOptions = defaultPeriodOptions,
    ...dialogProps
}) => {
    const classes = useStyles();
    const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);

    const calculateDateFromPeriod = (period: string): Date => {
        const [amount, unit] = period.split("|");
        if (!amount || !unit) {
            // Fallback to default 1 year if period format is invalid
            return moment().subtract(1, "years").toDate();
        }
        const cutoffDate = moment().subtract(parseInt(amount), unit as moment.unitOfTime.DurationConstructor);
        return cutoffDate.toDate();
    };

    const handleSave = () => {
        const selectedDate = calculateDateFromPeriod(selectedPeriod);
        onSave(selectedDate);
    };

    const handlePeriodChange = ({ value }: SelectOption) => {
        setSelectedPeriod(value);
    };

    return (
        <ConfirmationDialog {...dialogProps} onSave={handleSave}>
            <div className={classes.content}>
                <div className={classes.selectContainer}>
                    <label className={classes.label}>{periodInputLabel}</label>
                    <Select
                        options={periodOptions}
                        value={selectedPeriod}
                        onChange={handlePeriodChange}
                        className={classes.select}
                    />
                </div>
            </div>
        </ConfirmationDialog>
    );
};

const useStyles = makeStyles({
    content: {
        padding: "0.5em 0",
    },
    selectContainer: {
        display: "flex",
        alignItems: "center",
        gap: "1em",
    },
    label: {
        fontWeight: 500,
        minWidth: "140px",
    },
    select: {
        minWidth: "120px",
    },
});
