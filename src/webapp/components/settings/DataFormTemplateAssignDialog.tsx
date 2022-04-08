import React, { useCallback, useEffect, useMemo, useState } from "react";
import _ from "lodash";
import { ConfirmationDialog, MultiSelector } from "@eyeseetea/d2-ui-components";
import { makeStyles } from "@material-ui/core";

import { Id, NamedRef } from "../../../domain/entities/ReferenceObject";
import { CustomTemplate, getDataFormRef } from "../../../domain/entities/Template";
import i18n from "../../../locales";
import { useAppContext } from "../../contexts/app-context";
import { modelToSelectOption } from "../../utils/refs";
import { Select } from "../select/Select";
import { SettingsFieldsProps } from "./SettingsFields";
import { autogeneratedTemplateId } from "../../../domain/entities/DataFormTemplate";
import { useDataForms } from "./settings.hooks";

export interface ModuleTemplateDialogProps extends SettingsFieldsProps {
    title: string;
    onClose: () => void;
    customTemplates: CustomTemplate[];
}

export function DataFormTemplateAssignDialog(props: ModuleTemplateDialogProps): React.ReactElement {
    const { title, onClose, settings, onChange, customTemplates } = props;
    const { d2 } = useAppContext();
    const classes = useStyles();

    const [templates, setTemplates] = useState<NamedRef[]>([]);

    const dataForms = useDataForms();
    const selectedDataForm = dataForms.selected;

    useEffect(() => {
        if (!selectedDataForm) return;

        const autogeneratedTemplate: NamedRef = {
            name: i18n.t("Autogenerated"),
            id: autogeneratedTemplateId,
        };

        const selectedDataFormHasCustomTemplate = _(customTemplates).some(
            template => getDataFormRef(template).id === selectedDataForm.id
        );

        const templateOptions = _(customTemplates)
            .filter(template => getDataFormRef(template).type === selectedDataForm.type)
            .filter(template =>
                selectedDataFormHasCustomTemplate ? selectedDataForm.id === getDataFormRef(template).id : true
            )
            .map(template => _.pick(template, ["id", "name"]))
            .concat([autogeneratedTemplate])
            .value();

        setTemplates(templateOptions);
    }, [customTemplates, selectedDataForm]);

    const itemOptions = dataForms.options;
    const templatesOptions = useMemo(() => modelToSelectOption(templates), [templates]);
    const templateIdsSelected: Id[] = settings.getTemplateIdsForDataForm(selectedDataForm);

    const updateSelection = useCallback(
        (newSelectedIds: string[]) => {
            if (selectedDataForm) {
                const newSettings = settings.updateDataFormTemplateRelationship(selectedDataForm, newSelectedIds);
                onChange(newSettings);
            }
        },
        [selectedDataForm, settings, onChange]
    );

    return (
        <ConfirmationDialog
            isOpen={true}
            title={title}
            maxWidth="lg"
            fullWidth={true}
            onCancel={onClose}
            cancelText={i18n.t("Close")}
        >
            <div className={classes.row}>
                <Select
                    placeholder={i18n.t("Dataset/Program")}
                    options={itemOptions}
                    onChange={dataForms.setSelected}
                    value={selectedDataForm?.id ?? ""}
                />
            </div>

            {selectedDataForm && (
                <div className={classes.row}>
                    <MultiSelector
                        d2={d2}
                        searchFilterLabel={i18n.t("Search templates")}
                        height={300}
                        onChange={updateSelection}
                        options={templatesOptions}
                        selected={templateIdsSelected}
                        ordered={false}
                    />
                </div>
            )}
        </ConfirmationDialog>
    );
}

const useStyles = makeStyles({
    row: { width: "100%", marginBottom: "2em" },
});
