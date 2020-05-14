import { Checkbox, FormControlLabel, makeStyles } from "@material-ui/core";
import { DatePicker, OrgUnitsSelector } from "d2-ui-components";
import _ from "lodash";
import moment, { Moment } from "moment";
import React, { useEffect, useState } from "react";
import { CompositionRoot } from "../../../CompositionRoot";
import { DataForm, DataFormType } from "../../../domain/entities/DataForm";
import { Theme } from "../../../domain/entities/Theme";
import i18n from "../../../locales";
import { cleanOrgUnitPaths } from "../../../utils/dhis";
import { PartialBy } from "../../../utils/types";
import { useAppContext } from "../../contexts/api-context";
import Settings from "../../logic/settings";
import { Select, SelectOption } from "../select/Select";

type TemplateType = DataFormType | "custom";
type DataSource = Record<TemplateType, DataForm[]>;

interface TemplateSelectorState {
    type: TemplateType;
    id: string;
    populate: boolean;
    language: string;
    orgUnits?: string[];
    theme?: string;
    startDate?: Moment;
    endDate?: Moment;
}

type PickerUnit = "year" | "month" | "date";
interface PickerFormat {
    unit: PickerUnit;
    views: PickerUnit[];
    format: string;
}

export interface TemplateSelectorProps {
    settings: Settings;
    themes: Theme[];
    onChange(state: TemplateSelectorState | null): void;
}

export const TemplateSelector = ({ settings, themes, onChange }: TemplateSelectorProps) => {
    const classes = useStyles();
    const { api } = useAppContext();

    const [dataSource, setDataSource] = useState<DataSource>();
    const [models, setModels] = useState<{ value: string; label: string }[]>([]);
    const [templates, setTemplates] = useState<{ value: string; label: string }[]>([]);
    const [orgUnitTreeRootIds, setOrgUnitTreeRootIds] = useState<string[]>([]);
    const [availableLanguages, setAvailableLanguages] = useState<SelectOption[]>([]);
    const [selectedOrgUnits, setSelectedOrgUnits] = useState<string[]>([]);
    const [datePickerFormat, setDatePickerFormat] = useState<PickerFormat>();
    const [state, setState] = useState<PartialBy<TemplateSelectorState, "type" | "id">>({
        startDate: moment().add("-1", "year").startOf("year"),
        endDate: moment(),
        populate: false,
        language: "en",
    });

    useEffect(() => {
        CompositionRoot.attach()
            .templates.list.execute()
            .then(dataSource => {
                const modelOptions = _.compact([
                    settings.isModelEnabled("dataSet") && {
                        value: "dataSet",
                        label: i18n.t("Data Set"),
                    },
                    settings.isModelEnabled("program") && {
                        value: "program",
                        label: i18n.t("Program"),
                    },
                    dataSource.custom.length > 0 && {
                        value: "custom",
                        label: i18n.t("Custom"),
                    },
                ]);

                setDataSource(dataSource);
                setModels(modelOptions);
                if (modelOptions.length === 1) {
                    const model = modelOptions[0].value as TemplateType;
                    const templates = modelToSelectOption(dataSource[model]);
                    setTemplates(templates);
                    setState(state => ({ ...state, type: model }));
                }
            });
    }, [settings]);

    useEffect(() => {
        CompositionRoot.attach().orgUnits.getRoots.execute().then(setOrgUnitTreeRootIds);
    }, []);

    useEffect(() => {
        CompositionRoot.attach().languages.list.execute().then(setAvailableLanguages);
    }, []);

    useEffect(() => {
        const { type, id, ...rest } = state;
        if (type && id) {
            const orgUnits = cleanOrgUnitPaths(selectedOrgUnits);
            onChange({ type, id, orgUnits, ...rest });
        } else {
            onChange(null);
        }
    }, [state, selectedOrgUnits, onChange]);

    const showModelSelector = models.length > 1;
    const elementLabel = showModelSelector ? i18n.t("elements") : models[0]?.label;
    const themeOptions = dataSource ? modelToSelectOption(themes) : [];

    const onModelChange = ({ value }: SelectOption) => {
        if (!dataSource) return;

        const model = value as TemplateType;
        const options = modelToSelectOption(dataSource[model]);

        setState(state => ({ ...state, type: model, id: undefined }));
        setTemplates(options);
    };

    const onTemplateChange = ({ value }: SelectOption) => {
        if (dataSource && state.type) {
            const { periodType } = dataSource[state.type].find(({ id }) => id === value) ?? {};
            if (periodType === "Yearly") {
                setDatePickerFormat({ unit: "year", views: ["year"], format: "YYYY" });
            } else if (periodType === "Monthly") {
                setDatePickerFormat({
                    unit: "month",
                    views: ["year", "month"],
                    format: "MMMM YYYY",
                });
            } else {
                setDatePickerFormat(undefined);
            }
        }

        setState(state => ({ ...state, id: value }));
    };

    const onThemeChange = ({ value }: SelectOption) => {
        setState(state => ({ ...state, theme: value }));
    };

    const onStartDateChange = (date: Date) => {
        const { unit = "date" } = datePickerFormat ?? {};
        const startDate = date ? moment(date).startOf(unit) : undefined;
        setState(state => ({ ...state, startDate }));
    };

    const onEndDateChange = (date: Date) => {
        const { unit = "date" } = datePickerFormat ?? {};
        const endDate = date ? moment(date).endOf(unit) : undefined;
        setState(state => ({ ...state, endDate }));
    };

    const onOrgUnitChange = (orgUnitPaths: string[]) => {
        setSelectedOrgUnits(orgUnitPaths);
    };

    const onPopulateChange = (_event: React.ChangeEvent, checked: boolean) => {
        setState(state => ({ ...state, populate: checked }));
    };

    const onLanguageChange = ({ value }: SelectOption) => {
        setState(state => ({
            ...state,
            language: value,
        }));
    };

    const enablePopulate = state.type && state.id && selectedOrgUnits.length > 0;

    return (
        <React.Fragment>
            <div className={classes.row}>
                {showModelSelector && (
                    <div className={classes.modelSelect}>
                        <Select
                            placeholder={i18n.t("Model")}
                            onChange={onModelChange}
                            options={models}
                            value={state.type ?? ""}
                        />
                    </div>
                )}

                <div className={classes.templateSelect}>
                    <Select
                        placeholder={i18n.t("Select {{elementLabel}} to export...", {
                            elementLabel,
                        })}
                        onChange={onTemplateChange}
                        options={templates}
                        value={state.id ?? ""}
                    />
                </div>
            </div>

            <div className={classes.row}>
                <div className={classes.languageSelect}>
                    <Select
                        placeholder={i18n.t("Language")}
                        onChange={onLanguageChange}
                        options={availableLanguages}
                        value={state.language ?? ""}
                    />
                </div>
                {themeOptions.length > 0 && (
                    <div className={classes.themeSelect}>
                        <Select
                            placeholder={i18n.t("Theme")}
                            onChange={onThemeChange}
                            options={themeOptions}
                            allowEmpty={true}
                            emptyLabel={i18n.t("No theme")}
                            value={state.theme ?? ""}
                        />
                    </div>
                )}
            </div>

            <div className={classes.row}>
                <div className={classes.startDateSelect}>
                    <DatePicker
                        className={classes.fullWidth}
                        label={i18n.t("Start date")}
                        value={state.startDate ?? null}
                        onChange={onStartDateChange}
                        maxDate={state.endDate}
                        views={datePickerFormat?.views}
                        format={datePickerFormat?.format}
                        InputLabelProps={{ style: { color: "#494949" } }}
                    />
                </div>
                <div className={classes.endDateSelect}>
                    <DatePicker
                        className={classes.fullWidth}
                        label={i18n.t("End date")}
                        value={state.endDate ?? null}
                        onChange={onEndDateChange}
                        minDate={state.startDate}
                        views={datePickerFormat?.views}
                        format={datePickerFormat?.format}
                        InputLabelProps={{ style: { color: "#494949" } }}
                    />
                </div>
            </div>

            {!_.isEmpty(orgUnitTreeRootIds) ? (
                settings.showOrgUnitsOnGeneration && state.type !== "custom" ? (
                    <div className={classes.orgUnitSelector}>
                        <OrgUnitsSelector
                            api={api}
                            onChange={onOrgUnitChange}
                            selected={selectedOrgUnits}
                            controls={{
                                filterByLevel: true,
                                filterByGroup: true,
                                selectAll: false,
                            }}
                            rootIds={orgUnitTreeRootIds}
                            fullWidth={false}
                            height={250}
                        />
                    </div>
                ) : null
            ) : (
                i18n.t("No capture organisations units")
            )}

            {settings.showOrgUnitsOnGeneration && (
                <FormControlLabel
                    disabled={!enablePopulate}
                    className={classes.populateCheckbox}
                    control={<Checkbox checked={state.populate} onChange={onPopulateChange} />}
                    label={i18n.t("Populate template with instance data")}
                />
            )}
        </React.Fragment>
    );
};

const useStyles = makeStyles({
    row: {
        display: "flex",
        flexFlow: "row nowrap",
        justifyContent: "space-around",
        marginTop: "0.5em",
        marginRight: "1em",
    },
    modelSelect: { flexBasis: "30%", margin: "0.5em", marginLeft: 0 },
    templateSelect: { flexBasis: "70%", margin: "0.5em" },
    languageSelect: { flexBasis: "30%", margin: "0.5em", marginLeft: 0 },
    themeSelect: { flexBasis: "30%", margin: "0.5em" },
    startDateSelect: { flexBasis: "30%", margin: "0.5em", marginLeft: 0 },
    endDateSelect: { flexBasis: "30%", margin: "0.5em" },
    populateCheckbox: { marginTop: "1em" },
    orgUnitSelector: { marginTop: "1em" },
    fullWidth: { width: "100%" },
});

function modelToSelectOption<T extends { id: string; name: string }>(array: T[]) {
    return array.map(({ id, name }) => ({
        value: id,
        label: name,
    }));
}
