import { Id } from "@eyeseetea/d2-api";
import { DatePicker, OrgUnitsSelector } from "@eyeseetea/d2-ui-components";
import { Checkbox, FormControlLabel, makeStyles, Typography } from "@material-ui/core";
import _ from "lodash";
import moment from "moment";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RelationshipOrgUnitFilter } from "../../../data/Dhis2RelationshipTypes";
import { CustomTemplate, DataFormTemplate, TemplateType } from "../../../domain/entities/Template";
import { Theme } from "../../../domain/entities/Theme";
import { DownloadTemplateProps } from "../../../domain/usecases/DownloadTemplateUseCase";
import i18n from "../../../utils/i18n";
import { PartialBy } from "../../../types/utils";
import { cleanOrgUnitPaths } from "../../../utils/dhis";
import { useAppContext } from "../../contexts/app-context";
import Settings from "../../logic/settings";
import { orgUnitListParams } from "../../utils/template";
import { Select, SelectOption } from "../select/Select";
import { Section } from "../collapsible-section/Section";
import { LabelHelp } from "./LabelHelp";

type DataSource = Record<string, DataFormTemplate[]>;

type PickerUnit = "year" | "month" | "date";
interface PickerFormat {
    unit: PickerUnit;
    views: PickerUnit[];
    format: string;
}

export interface TemplateSelectorState extends DownloadTemplateProps {
    templateId: string;
    templateType: TemplateType;
    dataFilterOptions: {
        teiFilter?: {
            label: string;
            filters: SelectOption[];
        };
    };
}

export interface DataModelProps {
    value: string;
    label: string;
}

export interface TemplateSelectorProps {
    settings: Settings;
    themes: Theme[];
    onChange(state: TemplateSelectorState | null): void;
    onChangeModel?(state: DataModelProps[]): void;
    customTemplates: CustomTemplate[];
    onUseShortNamesChange(value: boolean): void;
}

export const TemplateSelector = ({
    settings,
    themes,
    onChange,
    onChangeModel,
    customTemplates,
    onUseShortNamesChange,
}: TemplateSelectorProps) => {
    const classes = useStyles();
    const { api, compositionRoot } = useAppContext();

    const [dataSource, setDataSource] = useState<DataSource>();
    const [templates, setTemplates] = useState<{ value: string; label: string }[]>([]);
    const [orgUnitTreeRootIds, setOrgUnitTreeRootIds] = useState<string[]>([]);
    const [orgUnitTreeFilter, setOrgUnitTreeFilter] = useState<string[]>([]);
    const [availableLanguages, setAvailableLanguages] = useState<SelectOption[]>([]);
    const [selectedOrgUnits, setSelectedOrgUnits] = useState<string[]>([]);
    const [datePickerFormat, setDatePickerFormat] = useState<PickerFormat>();
    const [userHasReadAccess, setUserHasReadAccess] = useState<boolean>(false);
    const [filterOrgUnits, setFilterOrgUnits] = useState<boolean>(true);
    const [selectedModel, setSelectedModel] = useState<string>("");
    const [state, setState] = useState<PartialBy<TemplateSelectorState, "type" | "id" | "templateId" | "templateType">>(
        {
            startDate: moment().add("-1", "year").startOf("year"),
            endDate: moment().add("-1", "year").endOf("year"),
            relationshipsOuFilter: "SELECTED",
            populate: false,
            downloadRelationships: true,
            filterTEIEnrollmentDate: false,
            language: "en",
            settings,
            splitDataEntryTabsBySection: false,
            useCodesForMetadata: false,
            showPeriod: false,
            showLanguage: false,
            dataFilter: {},
            dataFilterOptions: {},
        }
    );
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

    const dataSets = dataSource?.dataSets;
    const { templateId, id } = state;

    const isDataSet = React.useMemo(() => {
        if (!dataSets) return false;
        const dataSetIds = dataSets.map(ds => ds.id);
        return (templateId && dataSetIds.includes(templateId)) || (id && dataSetIds.includes(id));
    }, [dataSets, templateId, id]);

    const models = useMemo(() => {
        return _.compact([
            settings.allModelsEnabled() && {
                value: "all",
                label: i18n.t("All"),
            },
            settings.isModelEnabled("dataSet") && {
                value: "dataSets",
                label: i18n.t("Data Set"),
            },
            settings.isModelEnabled("program") && {
                value: "programs",
                label: i18n.t("Program"),
            },
        ]);
    }, [settings]);

    useEffect(() => {
        compositionRoot.templates
            .getDataFormsForGeneration({ settings, customTemplates })
            .then(({ dataSets, programs }) => {
                const dataSource: DataSource = {
                    dataSets,
                    programs,
                    all: _.sortBy([...dataSets, ...programs], ["name"]),
                };

                setDataSource(dataSource);
                const model = models[0]?.value;
                const dataSourceModel = dataSource[model ?? ""];

                if (model && dataSourceModel) {
                    const options = dataFormsToSelectOptions(dataSourceModel);
                    setTemplates(options);
                    setSelectedModel(model);
                }
            });
    }, [models, compositionRoot, customTemplates, settings]);

    useEffect(() => {
        onChangeModel?.(templates);
    }, [onChangeModel, templates]);

    useEffect(() => {
        const { type, id } = state;
        if (type && id) {
            compositionRoot.orgUnits.getRootsByForm(type, id).then(setOrgUnitTreeFilter);
        }
    }, [state, compositionRoot]);

    useEffect(() => {
        compositionRoot.orgUnits.getUserRoots().then(setOrgUnitTreeRootIds);
    }, [compositionRoot]);

    useEffect(() => {
        compositionRoot.languages.list().then(setAvailableLanguages);
    }, [compositionRoot]);

    useEffect(() => {
        const { type, id, templateId, templateType, ...rest } = state;
        if (type && id && templateId && templateType) {
            const orgUnits = cleanOrgUnitPaths(selectedOrgUnits);
            onChange({ type, id, orgUnits, templateId, templateType, ...rest });
        } else {
            onChange(null);
        }
    }, [state, selectedOrgUnits, orgUnitTreeFilter, onChange]);

    const themeOptions = dataSource ? modelToSelectOption(themes) : [];

    const clearPopulateDates = () => {
        setState(state => ({ ...state, populateStartDate: undefined, populateEndDate: undefined }));
    };

    const onModelChange = ({ value }: SelectOption) => {
        if (!dataSource) return;
        const options = dataFormsToSelectOptions(dataSource[value] ?? []);

        setSelectedModel(value);
        clearPopulateDates();
        setTemplates(options);
        onChangeModel?.(templates);
    };

    const onTemplateChange = ({ value }: SelectOption) => {
        const [dataFormId, templateId] = value.split(/-(.+)/).map(str => str.trim());

        if (dataSource) {
            const {
                periodType,
                type,
                readAccess = false,
            } = dataSource[selectedModel]?.find(({ id }) => id === dataFormId) ?? {};
            setUserHasReadAccess(readAccess);

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

            const customTemplate = customTemplates.find(t => t.id === templateId);
            const templateType: TemplateType = customTemplate ? "custom" : "generated";

            const teiFilter =
                templateType === "custom" && type === "trackerPrograms" && customTemplate?.filters?.teiFilters;

            setState(state => ({
                ...state,
                id: dataFormId,
                type: type,
                templateId,
                templateType,
                populate: false,
                showLanguage: customTemplate?.showLanguage || false,
                showPeriod: customTemplate?.showPeriod || false,
                dataFilter: {},
                dataFilterOptions: {
                    teiFilter: teiFilter
                        ? {
                              label: teiFilter.label || "TEI Data Filter",
                              filters: teiFilter.filters.map(filter => ({ label: filter.name, value: filter.id })),
                          }
                        : undefined,
                },
            }));

            clearPopulateDates();
            setSelectedOrgUnits([]);
        }
    };

    const onDataFilterChange = useCallback((value: SelectOption) => {
        setState(state => ({
            ...state,
            dataFilter: {
                ...state.dataFilter,
                teiFilterId: value.value,
            },
        }));
    }, []);

    const onThemeChange = ({ value }: SelectOption) => {
        setState(state => ({ ...state, theme: value }));
    };

    const onStartDateChange = (field: keyof DownloadTemplateProps, date: Date, clear = false) => {
        const { unit = "date" } = datePickerFormat ?? {};
        const startDate = date ? moment(date).startOf(unit) : undefined;
        setState(state => ({ ...state, [field]: startDate }));
        if (clear) clearPopulateDates();
    };

    const onEndDateChange = (field: keyof DownloadTemplateProps, date: Date, clear = false) => {
        const { unit = "date" } = datePickerFormat ?? {};
        const endDate = date ? moment(date).endOf(unit) : undefined;
        setState(state => ({ ...state, [field]: endDate }));
        if (clear) clearPopulateDates();
    };

    const onCustomFormDateChange = (date: Date) => {
        const { unit = "date" } = datePickerFormat ?? {};
        const startDate = date ? moment(date).startOf(unit) : undefined;
        const endDate = date ? moment(date).endOf(unit) : undefined;
        setState(state => ({ ...state, startDate, endDate }));
    };

    const onOrgUnitChange = (orgUnitPaths: string[]) => {
        setSelectedOrgUnits(orgUnitPaths);
    };

    const onRelationshipsOuFilterChange = (relationshipsOuFilter: RelationshipOrgUnitFilter) => {
        setState(state => ({ ...state, relationshipsOuFilter }));
    };

    const onPopulateChange = (_event: React.ChangeEvent, populate: boolean) => {
        setState(state => ({ ...state, populate }));
    };

    const setUseCodesMetadata = React.useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
        setState(state => ({ ...state, useCodesForMetadata: ev.target.checked }));
    }, []);

    const onDownloadRelationshipsChange = (_event: React.ChangeEvent, downloadRelationships: boolean) => {
        setState(state => ({ ...state, downloadRelationships }));
    };

    const toggleSplitDataEntryTabsBySection = () => {
        setState(state => ({ ...state, splitDataEntryTabsBySection: !state.splitDataEntryTabsBySection }));
    };

    const onFilterTEIEnrollmentDateChange = (_event: React.ChangeEvent, filterTEIEnrollmentDate: boolean) => {
        setState(state => ({ ...state, filterTEIEnrollmentDate }));
    };

    const onFilterOrgUnitsChange = (filterOrgUnits: boolean) => {
        setFilterOrgUnits(filterOrgUnits);
    };

    const onLanguageChange = ({ value }: SelectOption) => {
        setState(state => ({ ...state, language: value }));
    };

    const openTeiRelationshipHelp = () => {
        window.open(
            "https://docs.dhis2.org/en/use/user-guides/dhis-core-version-master/understanding-the-data-model/relationship-model.html",
            "_blank"
        );
    };

    const orgUnitHelpText =
        state.templateType === "custom"
            ? i18n.t("Select organisation unit to populate data")
            : i18n.t("Select available organisation units to include in the template");

    const isCustomDataSet = state.templateType === "custom" && state.type === "dataSets";
    const isMultipleSelection = !isCustomDataSet;
    const showPopulate = !(state.templateType === "custom" && !settings.showPopulateInCustomForms);
    const selected = state.id && state.templateId ? getOptionValue({ id: state.id, templateId: state.templateId }) : "";
    const hasDataFilter = Boolean(state.dataFilterOptions.teiFilter?.filters.length);

    const subSectionClasses = useMemo(() => {
        return { sectionHeader: classes.subSectionHeader, sectionPaper: classes.subSection };
    }, [classes]);

    return (
        <>
            <Section title={<h3 className={classes.title}>{i18n.t("Template")}</h3>} classProps={classes}>
                <div className={classes.row}>
                    {models.length > 1 && (
                        <div className={classes.select}>
                            <Select
                                placeholder={i18n.t("Data Model")}
                                onChange={onModelChange}
                                options={models}
                                value={selectedModel}
                            />
                        </div>
                    )}
                    <div className={classes.select}>
                        <Select
                            placeholder={i18n.t("Select template to export...")}
                            onChange={onTemplateChange}
                            options={templates}
                            value={selected}
                        />
                    </div>
                </div>

                {hasDataFilter && state.dataFilterOptions.teiFilter && (
                    <div className={classes.select}>
                        <Select
                            placeholder={state.dataFilterOptions.teiFilter.label}
                            onChange={onDataFilterChange}
                            options={state.dataFilterOptions.teiFilter.filters}
                            value={state.dataFilter.teiFilterId}
                            allowEmpty={true}
                            emptyLabel={i18n.t("<No value>")}
                        />
                    </div>
                )}

                {state.type === "dataSets" && <h4 className={classes.subSectionTitle}>Periods</h4>}

                {state.type === "dataSets" && state.templateType === "custom" && showPopulate && (
                    <DatePicker
                        className={classes.fullWidth}
                        label={i18n.t("Period")}
                        value={state.startDate ?? null}
                        onChange={(date: Date) => onCustomFormDateChange(date)}
                        maxDate={state.endDate}
                        views={datePickerFormat?.views}
                        format={datePickerFormat?.format ?? "DD/MM/YYYY"}
                        InputLabelProps={{ style: { color: "#494949" } }}
                    />
                )}

                {state.type === "dataSets" && (showPopulate || state.showPeriod) && (
                    <div className={classes.row}>
                        <div className={classes.select}>
                            <DatePicker
                                className={classes.fullWidth}
                                label={i18n.t("Start period")}
                                value={state.startDate ?? null}
                                onChange={(date: Date) => onStartDateChange("startDate", date, true)}
                                maxDate={state.endDate}
                                views={datePickerFormat?.views}
                                format={datePickerFormat?.format ?? "DD/MM/YYYY"}
                                InputLabelProps={{ style: { color: "#494949" } }}
                            />
                        </div>
                        <div className={classes.select}>
                            <DatePicker
                                className={classes.fullWidth}
                                label={i18n.t("End period")}
                                value={state.endDate ?? null}
                                onChange={(date: Date) => onEndDateChange("endDate", date, true)}
                                minDate={state.startDate}
                                views={datePickerFormat?.views}
                                format={datePickerFormat?.format ?? "DD/MM/YYYY"}
                                InputLabelProps={{ style: { color: "#494949" } }}
                            />
                        </div>
                    </div>
                )}

                {settings.orgUnitSelection !== "import" && showPopulate && (
                    <Section
                        setOpen={onFilterOrgUnitsChange}
                        isOpen={filterOrgUnits}
                        elevation={0}
                        collapsible={true}
                        iconPos={"left"}
                        classProps={subSectionClasses}
                        arrowStyle={"down_right"}
                        title={
                            <div>
                                <h4 className={classes.title}>
                                    {i18n.t("Organisation units")}
                                    <LabelHelp
                                        label={
                                            <Typography
                                                variant="caption"
                                                color="textSecondary"
                                                className={classes.orgUnitCount}
                                            >
                                                ({selectedOrgUnits.length})
                                            </Typography>
                                        }
                                        helpText={orgUnitHelpText}
                                    />
                                </h4>
                            </div>
                        }
                    >
                        {!_.isEmpty(orgUnitTreeRootIds) ? (
                            <div className={classes.orgUnitSelector}>
                                <OrgUnitsSelector
                                    api={api}
                                    rootIds={orgUnitTreeRootIds}
                                    selectableIds={orgUnitTreeFilter}
                                    selected={selectedOrgUnits}
                                    onChange={onOrgUnitChange}
                                    fullWidth={false}
                                    height={250}
                                    controls={{
                                        filterByLevel: isMultipleSelection,
                                        filterByGroup: isMultipleSelection,
                                        selectAll: isMultipleSelection,
                                    }}
                                    withElevation={false}
                                    singleSelection={!isMultipleSelection}
                                    typeInput={isMultipleSelection ? undefined : "radio"}
                                    listParams={orgUnitListParams}
                                    showNameSetting
                                    onUseShortNamesChange={onUseShortNamesChange}
                                />
                            </div>
                        ) : (
                            <div className={classes.orgUnitError}>
                                {i18n.t("User does not have any capture organisations units")}
                            </div>
                        )}
                    </Section>
                )}
            </Section>

            {userHasReadAccess && !!selectedOrgUnits.length && state.templateType !== "custom" && (
                <Section title={<h3 className={classes.title}>{i18n.t("Populate")}</h3>} classProps={classes}>
                    <div>
                        <FormControlLabel
                            className={classes.checkbox}
                            control={<Checkbox checked={state.populate} onChange={onPopulateChange} />}
                            label={i18n.t("Populate template with data")}
                        />
                    </div>

                    {/*start/end date*/}
                    {state.populate && !isCustomDataSet && (
                        <>
                            {!isDataSet && (
                                <div>
                                    <FormControlLabel
                                        className={classes.checkbox}
                                        control={
                                            <Checkbox
                                                checked={state.filterTEIEnrollmentDate}
                                                onChange={onFilterTEIEnrollmentDateChange}
                                            />
                                        }
                                        label={i18n.t("Also filter TEI and relationships by their enrollment date")}
                                    />
                                </div>
                            )}

                            <div className={classes.row}>
                                <div className={classes.select}>
                                    <DatePicker
                                        className={classes.fullWidth}
                                        label={getPopulateDateLabel(state, "start")}
                                        value={state.populateStartDate ?? null}
                                        onChange={(date: Date) => onStartDateChange("populateStartDate", date)}
                                        minDate={
                                            state.type === "dataSets"
                                                ? state.startDate?.startOf(datePickerFormat?.unit ?? "day")
                                                : undefined
                                        }
                                        maxDate={moment.min(
                                            _.compact([
                                                state.type === "dataSets" && state.endDate,
                                                state.populateEndDate,
                                            ])
                                        )}
                                        views={datePickerFormat?.views}
                                        format={datePickerFormat?.format ?? "DD/MM/YYYY"}
                                        InputLabelProps={{ style: { color: "#494949" } }}
                                    />
                                </div>

                                <div className={classes.select}>
                                    <DatePicker
                                        className={classes.fullWidth}
                                        label={getPopulateDateLabel(state, "end")}
                                        value={state.populateEndDate ?? null}
                                        onChange={(date: Date) => onEndDateChange("populateEndDate", date)}
                                        minDate={moment.max(
                                            _.compact([
                                                state.type === "dataSets" && state.startDate,
                                                state.populateStartDate,
                                            ])
                                        )}
                                        maxDate={
                                            state.type === "dataSets"
                                                ? state.endDate?.endOf(datePickerFormat?.unit ?? "day")
                                                : undefined
                                        }
                                        views={datePickerFormat?.views}
                                        format={datePickerFormat?.format ?? "DD/MM/YYYY"}
                                        InputLabelProps={{ style: { color: "#494949" } }}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {state.populate && state.type === "trackerPrograms" && userHasReadAccess && (
                        <div>
                            <h4 className={classes.subSectionTitle}>
                                {i18n.t("TEI and relationships enrollment by organisation unit type")}
                            </h4>
                            <div className={classes.row}>
                                <div className={classes.select}>
                                    <Select
                                        value={state.relationshipsOuFilter}
                                        onChange={({ value }) =>
                                            onRelationshipsOuFilterChange(value as RelationshipOrgUnitFilter)
                                        }
                                        options={[
                                            {
                                                label: i18n.t("Current user organisation units (data capture)"),
                                                value: "CAPTURE",
                                            },
                                            {
                                                label: i18n.t("Selected organisation units with their descendants"),
                                                value: "DESCENDANTS",
                                            },
                                            { label: i18n.t("Only selected organisation units"), value: "SELECTED" },
                                        ]}
                                    />
                                </div>
                            </div>

                            <div>
                                <FormControlLabel
                                    className={classes.checkbox}
                                    control={
                                        <Checkbox
                                            checked={state.downloadRelationships}
                                            onChange={onDownloadRelationshipsChange}
                                        />
                                    }
                                    label={
                                        <LabelHelp
                                            label={i18n.t("Include relationships")}
                                            helpText={i18n.t(
                                                "Creates a tab for each available TEI relationship type, showing their contents. Click here to learn more about the relationship model."
                                            )}
                                            onClick={openTeiRelationshipHelp}
                                        />
                                    }
                                />
                            </div>
                        </div>
                    )}
                </Section>
            )}

            <Section
                title={<h3 className={classes.title}>{i18n.t("Advanced template properties")}</h3>}
                classProps={classes}
                isOpen={showAdvancedOptions}
                setOpen={setShowAdvancedOptions}
                collapsible={true}
            >
                {availableLanguages.length > 0 && (state.templateType !== "custom" || state.showLanguage) && (
                    <div className={classes.row}>
                        <div className={classes.select}>
                            <Select
                                placeholder={i18n.t("Language")}
                                onChange={onLanguageChange}
                                options={availableLanguages}
                                value={state.language ?? ""}
                            />
                        </div>
                    </div>
                )}

                {themeOptions.length > 0 && (
                    <div className={classes.row}>
                        <div className={classes.select}>
                            <Select
                                placeholder={i18n.t("Theme")}
                                onChange={onThemeChange}
                                options={themeOptions}
                                allowEmpty={true}
                                emptyLabel={i18n.t("<No value>")}
                                value={state.theme ?? ""}
                            />
                        </div>
                    </div>
                )}

                {isDataSet && state.templateType !== "custom" && (
                    <FormControlLabel
                        className={classes.checkbox}
                        control={
                            <Checkbox
                                checked={state.splitDataEntryTabsBySection}
                                onChange={toggleSplitDataEntryTabsBySection}
                            />
                        }
                        label={i18n.t("Split data entry tabs by section")}
                    />
                )}

                {state.type && (
                    <div>
                        <FormControlLabel
                            className={classes.checkbox}
                            control={<Checkbox checked={state.useCodesForMetadata} onChange={setUseCodesMetadata} />}
                            label={i18n.t("Use metadata codes (organisation units, data elements and options)")}
                        />
                    </div>
                )}
            </Section>
        </>
    );
};

const useStyles = makeStyles({
    row: {
        display: "flex",
        flexFlow: "row nowrap",
        justifyContent: "space-around",
        marginRight: "1em",
    },
    title: { margin: 0, padding: 0, display: "flex", alignItems: "center" },
    formHeader: { marginTop: 0 },
    subSection: { padding: 0, margin: 0, background: "#fbfcfd" },
    subSectionTitle: { marginBottom: 0 },
    subSectionHeader: { borderBottom: "none" },
    sectionPaper: { background: "#fbfcfd" },
    select: { flexBasis: "100%", margin: "0.5em", marginLeft: 0, marginTop: "1em" },
    checkbox: { marginTop: "1em" },
    orgUnitSelector: { marginTop: "1em", marginBottom: "2em" },
    fullWidth: { width: "100%" },
    orgUnitError: {
        height: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    orgUnitCount: { marginLeft: "3px" },
});

function modelToSelectOption<T extends { id: string; name: string }>(array: T[]) {
    return (
        array?.map(({ id, name }) => ({
            value: id,
            label: name,
        })) ?? []
    );
}

function dataFormsToSelectOptions(forms: DataFormTemplate[]) {
    return forms
        .map(form => ({
            value: getOptionValue(form),
            label: form.name,
        }))
        .sort((formA, formB) => formA.label.localeCompare(formB.label));
}

function getOptionValue<T extends { id: Id; templateId: Id }>(form: T) {
    return [form.id, form.templateId].join("-");
}

function getPopulateDateLabel(state: Partial<TemplateSelectorState>, picker: "start" | "end") {
    if (state.type === "trackerPrograms" && state.filterTEIEnrollmentDate && picker === "start") {
        return i18n.t("Start date of Events and TEI enrollments");
    } else if (state.type === "trackerPrograms" && state.filterTEIEnrollmentDate && picker === "end") {
        return i18n.t("End date of Events and TEI enrollments");
    } else if (state.type === "trackerPrograms" && picker === "start") {
        return i18n.t("Start date of Events");
    } else if (state.type === "trackerPrograms" && picker === "end") {
        return i18n.t("End date of Events");
    } else if (picker === "start") {
        return i18n.t("Start date");
    } else if (picker === "end") {
        return i18n.t("End date");
    } else {
        return "Unknown date picker";
    }
}
