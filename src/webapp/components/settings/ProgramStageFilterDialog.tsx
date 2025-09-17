import { ConfirmationDialog, MultiSelector } from "@eyeseetea/d2-ui-components";
import { makeStyles, Checkbox, FormControlLabel } from "@material-ui/core";
import _ from "lodash";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DataForm } from "../../../domain/entities/DataForm";
import { NamedRef, Ref } from "../../../domain/entities/ReferenceObject";
import i18n from "../../../utils/i18n";
import { useAppContext } from "../../contexts/app-context";
import Settings from "../../logic/settings";
import { getMultiSelectorOptionsFromNamedRefs, getSelectOptionsFromNamedRefs } from "../../utils/refs";
import { Select, SelectOption } from "../select/Select";
import { SettingsFieldsProps } from "./SettingsFields";

export interface ProgramStageFilterDialogProps extends SettingsFieldsProps {
    title: string;
    onClose: () => void;
}

export function ProgramStageFilterDialog(props: ProgramStageFilterDialogProps): React.ReactElement {
    const { title, onClose, settings, onChange } = props;
    const { d2, compositionRoot } = useAppContext();
    const classes = useStyles();

    const [programStages, setProgramStages] = useState<ProgramStage[]>([]);
    const [programStage, setProgramStage] = useState<ProgramStage>();

    useEffect(() => {
        compositionRoot.templates.list().then(({ programs }) => {
            const programStages = getProgramStages(programs);
            setProgramStages(programStages);
        });
    }, [compositionRoot]);

    const selectProgram = useCallback(
        ({ value }: SelectOption) => {
            setProgramStage(programStages.find(program => program.id === value));
        },
        [programStages]
    );

    const programStageOptions = useMemo(() => getSelectOptionsFromNamedRefs(programStages), [programStages]);
    const dataElementItems = useMemo(
        () => getDataElementItems(programStages, programStage),
        [programStages, programStage]
    );
    const dataElementsOptions = useMemo(
        () => getMultiSelectorOptionsFromNamedRefs(dataElementItems),
        [dataElementItems]
    );
    const selectedIds = getSelectedIds(settings, programStage);

    const updateSelection = useCallback(
        (newSelectedIds: string[]) => {
            if (!programStage) return;

            const dataElementsExcluded = _.difference(
                programStage.dataElements.map(({ id }) => id),
                newSelectedIds
            ).map(id => ({ id }));

            const attributesIncluded = newSelectedIds
                .filter(id => programStage.attributes.find(e => e.id === id))
                .map(id => ({ id }));

            const externalDataElementsIncluded = _.difference(newSelectedIds, [
                ...programStage.dataElements.map(({ id }) => id),
                ...programStage.attributes.map(({ id }) => id),
            ]).map(id => ({ id }));

            onChange(
                settings.setProgramStageFilterFromSelection({
                    programStage: programStage.id,
                    dataElementsExcluded,
                    attributesIncluded,
                    externalDataElementsIncluded,
                })
            );
        },
        [programStage, settings, onChange]
    );

    const updatePopulateEventsForEveryTeiCheckbox = useCallback(
        (_event: React.ChangeEvent, populateEventsForEveryTei: boolean) => {
            if (!programStage) return;

            onChange(
                settings.setPopulateEventsForEveryTei({ programStage: programStage.id, populateEventsForEveryTei })
            );
        },
        [programStage, settings, onChange]
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
                    placeholder={i18n.t("Program stage")}
                    options={programStageOptions}
                    onChange={selectProgram}
                    value={programStage?.id ?? ""}
                />
            </div>

            <div className={classes.row}>
                <MultiSelector
                    d2={d2 as object}
                    searchFilterLabel={i18n.t("Search data elements or attributes")}
                    height={300}
                    onChange={updateSelection}
                    options={dataElementsOptions}
                    selected={selectedIds}
                    ordered={false}
                />
            </div>
            {programStage && (
                <div className={classes.row}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={settings.programStagePopulateEventsForEveryTei[programStage.id]}
                                onChange={updatePopulateEventsForEveryTeiCheckbox}
                            />
                        }
                        label={i18n.t("Populate events for every Tracked Entity Instance (TEI)")}
                    />
                </div>
            )}
        </ConfirmationDialog>
    );
}

const useStyles = makeStyles({
    row: { width: "100%", marginBottom: "2em" },
});

interface ProgramStage {
    id: string;
    name: string;
    program: Ref;
    dataElements: NamedRef[];
    attributes: NamedRef[];
    repeatable: boolean;
}

function getProgramStages(programs: DataForm[]): ProgramStage[] {
    return _.flatMap(programs, ({ id: programId, name: programName, sections, teiAttributes = [] }) =>
        sections.map(({ id, name, dataElements, repeatable }) => ({
            id,
            name: programName === name ? programName : `${programName} - ${name}`,
            dataElements: dataElements.map(({ id, name }) => ({ id, name })),
            attributes: teiAttributes,
            program: { id: programId },
            repeatable,
        }))
    );
}

function getSelectedIds(settings: Settings, programStage: ProgramStage | undefined) {
    if (!programStage) return [];

    const programStageFilter = settings.programStageFilter[programStage.id];
    const includedAttributes = programStageFilter?.attributesIncluded ?? [];
    const excludedDataElements = programStageFilter?.dataElementsExcluded ?? [];
    const externalDataElementsIncluded = programStageFilter?.externalDataElementsIncluded ?? [];

    const selectedAttributes = includedAttributes.map(({ id }) => id);
    const selectedExternalDataElements = externalDataElementsIncluded.map(({ id }) => id);
    const selectedDataElements = _.difference(
        programStage.dataElements.map(({ id }) => id),
        excludedDataElements.map(({ id }) => id)
    );

    return [...selectedAttributes, ...selectedDataElements, ...selectedExternalDataElements];
}

function getDataElementItems(allStages: ProgramStage[], stage?: ProgramStage): NamedRef[] {
    if (!stage) return [];

    const dataElements = stage.dataElements.map(({ id, name }) => ({ id, name: `[Data element] ${name}` })) ?? [];
    const attributes = stage.attributes.map(({ id, name }) => ({ id, name: `[Attribute] ${name}` })) ?? [];
    const externalDataElements = allStages
        .filter(({ id, program, repeatable }) => {
            const sameProgram = program.id === stage.program.id;
            const differentStage = id !== stage.id;

            return sameProgram && differentStage && !repeatable;
        })
        .flatMap(({ id: stageId, name: stageName, dataElements }) =>
            dataElements.map(({ id, name }) => ({ id: `${stageId}.${id}`, name: `[External] ${name} (${stageName})` }))
        );

    return [...dataElements, ...attributes, ...externalDataElements];
}
