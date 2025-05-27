import { ConfirmationDialog, MultiSelector } from "@eyeseetea/d2-ui-components";
import { makeStyles } from "@material-ui/core";
import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import { DataForm } from "../../../domain/entities/DataForm";
import { NamedRef } from "../../../domain/entities/ReferenceObject";
import i18n from "../../../utils/i18n";
import { useAppContext } from "../../contexts/app-context";
import { Select, SelectOption } from "../select/Select";
import { SettingsFieldsProps } from "./SettingsFields";

interface DuplicateDataElementsFilterDialogProps extends SettingsFieldsProps {
    onClose: () => void;
}

export function DuplicateDataElementsFilterDialog({
    onClose,
    settings,
    onChange,
}: DuplicateDataElementsFilterDialogProps) {
    const { d2, compositionRoot } = useAppContext();
    const classes = useStyles();

    const [programs, setPrograms] = useState<DataForm[]>([]);
    const [selectedProgram, selectProgram] = useState<DataForm>();

    useEffect(() => {
        compositionRoot.templates.list().then(({ programs }) => setPrograms(programs));
    }, [compositionRoot]);

    const onChangeSelect = useCallback(
        ({ value }: SelectOption) => {
            selectProgram(programs.find(({ id }) => id === value));
        },
        [programs]
    );

    const onChangeExclude = useCallback(
        (ids: string[]) => {
            if (selectedProgram) {
                const exclusions = _.difference(
                    selectedProgram.dataElements.map(({ id }) => id),
                    ids
                );
                onChange(settings.setDuplicateExclusions(selectedProgram.id, exclusions));
            }
        },
        [onChange, selectedProgram, settings]
    );

    const excluded = selectedProgram ? settings.duplicateExclusion[selectedProgram.id] : [];
    const selection = _.difference(
        selectedProgram?.dataElements.map(({ id }) => id),
        excluded ?? []
    );

    return (
        <ConfirmationDialog
            isOpen={true}
            title={i18n.t("Data elements used for duplication assessment")}
            maxWidth="lg"
            fullWidth={true}
            onCancel={onClose}
            cancelText={i18n.t("Close")}
        >
            <div className={classes.row}>
                <Select
                    placeholder={i18n.t("Program")}
                    options={modelToSelectOption(programs)}
                    onChange={onChangeSelect}
                    value={selectedProgram?.id ?? ""}
                />
            </div>

            <div className={classes.row}>
                <MultiSelector
                    d2={d2 as object}
                    height={300}
                    onChange={onChangeExclude}
                    options={modelToSelectOption(selectedProgram?.dataElements)}
                    selected={selection}
                    ordered={false}
                />
            </div>
        </ConfirmationDialog>
    );
}

const useStyles = makeStyles({
    row: {
        width: "100%",
        marginBottom: "2em",
    },
});

function modelToSelectOption<T extends NamedRef>(array?: T[]) {
    return (
        array?.map(({ id, name }) => ({
            value: id,
            label: name,
            text: name,
        })) ?? []
    );
}
