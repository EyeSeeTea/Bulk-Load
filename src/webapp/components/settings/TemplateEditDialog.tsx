import {
    Button,
    ButtonProps,
    Checkbox,
    FormControlLabel,
    Grid,
    GridSize,
    makeStyles,
    Switch,
    SwitchProps,
    TextField,
    TextFieldProps,
    Typography,
} from "@material-ui/core";
import { ConfirmationDialog, useSnackbar } from "@eyeseetea/d2-ui-components";
import { useDropzone } from "react-dropzone";
import i18n from "../../../utils/i18n";
import { Select, SelectOption } from "../select/Select";
import { CustomTemplate } from "../../../domain/entities/Template";
import React from "react";
import { useDataFormsSelector } from "../../hooks/useDataForms";
import {
    TemplateView,
    TemplateView as ViewModel,
    TemplateViewActions as ViewModelActions,
    TemplateViewKey as ViewModelField,
} from "./templates/TemplateView";
import { downloadFile } from "../../utils/download";
import { useAppContext } from "../../contexts/app-context";
import { isValueInUnionType, Maybe } from "../../../types/utils";
import { xlsxMimeTypes } from "../../../utils/files";
import { getExtensionFile, MIME_TYPES_BY_EXTENSION } from "../../../utils/files";
import { DataForm } from "../../../domain/entities/DataForm";
import { generateUid } from "d2/uid";
import { TemplateDataFilter } from "../../../domain/entities/TemplateFilter";
import { FlexRow } from "../FlexRow";

export interface CustomTemplateEditDialogProps {
    formMode: FormMode;
    onSave: (template: CustomTemplate) => void;
    onCancel: () => void;
    customTemplates: CustomTemplate[];
}

export interface CustomTemplateEditDialogProps2 extends CustomTemplateEditDialogProps {
    template: ViewModel;
    setTemplate: SetTemplate;
    actions: ViewModelActions;
}

type SetTemplate = (event: UpdateEvent<ViewModelField>) => void;

export type FormMode = { type: "new" } | { type: "edit"; template: CustomTemplate };

type UpdateEvent<Field extends ViewModelField> = { field: Field; value: ViewModel[Field] };

type StateEvent<Field extends ViewModelField> =
    | { type: "load"; viewModel: ViewModel; actions: ViewModelActions }
    | { type: "update"; field: Field; value: ViewModel[Field] };

type State = { type: "initial" } | { type: "loaded"; viewModel: ViewModel; actions: ViewModelActions };

function viewModelReducer(state: State, event: StateEvent<ViewModelField>): State {
    switch (event.type) {
        case "load":
            return { type: "loaded", viewModel: event.viewModel, actions: event.actions };
        case "update":
            return state.type === "loaded"
                ? {
                      ...state,
                      viewModel: state.actions.update(state.viewModel, event.field, event.value),
                  }
                : state;
    }
}

export const CustomTemplateEditDialog: React.FC<CustomTemplateEditDialogProps> = React.memo(props => {
    const { formMode, customTemplates } = props;
    const [state, dispatch] = React.useReducer(viewModelReducer, { type: "initial" } as State);
    const { compositionRoot } = useAppContext();

    React.useEffect(() => {
        async function load() {
            if (state.type === "loaded") return;

            const generatedTemplates = await compositionRoot.templates.getGenerated();
            const actions = new ViewModelActions(customTemplates, generatedTemplates);

            const viewModel =
                formMode.type === "edit"
                    ? await actions.fromCustomTemplate(formMode.template)
                    : await actions.build({ dataFormType: undefined });

            dispatch({ type: "load", viewModel, actions });
        }
        load();
    }, [formMode, compositionRoot, state, customTemplates]);

    const setTemplate = React.useCallback((updateEvent: UpdateEvent<ViewModelField>) => {
        dispatch({ type: "update", ...updateEvent });
    }, []);

    return state.type === "loaded" ? (
        <EditDialog {...props} template={state.viewModel} actions={state.actions} setTemplate={setTemplate} />
    ) : null;
});

const EditDialog: React.FC<CustomTemplateEditDialogProps2> = React.memo(props => {
    const { formMode, actions, onSave, onCancel, template, setTemplate, customTemplates } = props;

    const translations = React.useMemo(() => ViewModelActions.getTranslations(), []);
    const snackbar = useSnackbar();
    const dataForms = useDataFormsSelector({
        type: template.dataFormType || undefined,
        initialSelectionId: template.dataFormId || undefined,
    });
    const dataFilter = useDataFiltersSelector({
        dataForm: dataForms.selected,
        template: template,
        setTemplate: setTemplate,
    });

    const title = formMode.type === "edit" ? i18n.t("Edit custom template") : i18n.t("New custom template");
    const isAdvancedMode = template.mode === "advanced";

    const validateAndSendSaveEvent = React.useCallback(async () => {
        const validation = actions.validate(template);
        if (validation.isValid) {
            const customTemplate = await actions.toCustomTemplate(validation.object);
            onSave(customTemplate);
        } else {
            snackbar.error(validation.errors.join("\n"));
        }
    }, [onSave, template, snackbar, actions]);

    const toggleMode = React.useCallback<NonNullable<SwitchProps["onChange"]>>(
        ev => {
            const mode = ev.target.checked ? "advanced" : "basic";
            setTemplate(update("mode", mode));
        },
        [setTemplate]
    );

    const generateMetadata = template.generateMetadata;
    const toggleGenerateMetadata = React.useCallback<NonNullable<SwitchProps["onChange"]>>(
        ev => {
            const newValue = ev.target.checked;
            setTemplate(update("generateMetadata", newValue));
        },
        [setTemplate]
    );

    React.useEffect(() => {
        const dataForm = dataForms.selected;
        if (!dataForm) return;
        setTemplate(update("dataFormId", dataForm.id));
        setTemplate(update("dataFormType", dataForm.type));
    }, [dataForms.selected, setTemplate]);

    const data = React.useMemo(() => ({ template, setTemplate }), [template, setTemplate]);

    const hasDataFormType = Boolean(template.dataFormType);

    const applyTo = useApplyTo(customTemplates, template, setTemplate);

    const onLanguageChange = (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
        setTemplate(update("showLanguage", checked));
    };

    const onPeriodChange = (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
        setTemplate(update("showPeriod", checked));
    };

    return (
        <ConfirmationDialog
            isOpen={true}
            title={title}
            onSave={validateAndSendSaveEvent}
            onCancel={onCancel}
            maxWidth={"lg"}
            fullWidth={true}
        >
            <Group>
                <Field field="name" data={data} />
                <Field field="code" data={data} disabled={formMode.type === "edit"} />
                <Field field="description" data={data} />

                <Select
                    placeholder={i18n.t("Apply to")}
                    options={applyTo.options}
                    value={applyTo.current?.value}
                    onChange={applyTo.set}
                />

                <div>
                    <FormControlLabel
                        control={<Checkbox checked={template.showLanguage} onChange={onLanguageChange} />}
                        label={i18n.t("Show languages in download template")}
                    />
                </div>

                <div>
                    <FormControlLabel
                        control={<Checkbox checked={template.showPeriod} onChange={onPeriodChange} />}
                        label={i18n.t("Show periods in download template")}
                    />
                </div>

                {applyTo.current.value === "select" && (
                    <Select
                        placeholder={translations.dataFormId}
                        options={dataForms.options}
                        value={dataForms.selected?.id}
                        onChange={dataForms.setSelected}
                    />
                )}
            </Group>

            <Div key={template.dataFormType} visible={hasDataFormType}>
                <div>
                    <FormControlLabel
                        control={<Switch checked={isAdvancedMode} onChange={toggleMode} />}
                        label={isAdvancedMode ? i18n.t("Advanced") : i18n.t("Basic (only row schema)")}
                    />
                </div>

                <Group title={i18n.t("Data Source Configuration")}>
                    {false && (
                        <div>
                            <FormControlLabel
                                control={<Switch checked={generateMetadata} onChange={toggleGenerateMetadata} />}
                                label={i18n.t("Fixed Metadata / Dynamic Metadata (TODO)")}
                            />
                        </div>
                    )}

                    {isAdvancedMode ? (
                        <FileField data={data} field="dataSources" mimeType={["application/json"]} />
                    ) : (
                        actions
                            .getFieldsForDataFormType(template.dataFormType)
                            .map(fields => <FieldsRow key={fields.join()} fields={fields} data={data} />)
                    )}
                </Group>

                <Group title={i18n.t("Styles")}>
                    {isAdvancedMode ? (
                        <>
                            <FileField data={data} field="styleSources" mimeType={["application/json"]} />
                        </>
                    ) : (
                        <>
                            <FieldsRow fields={stylesFields.title} data={data} />
                            <FieldsRow fields={stylesFields.subtitle} data={data} />
                            <FieldsRow fields={stylesFields.logo} data={data} />
                        </>
                    )}
                </Group>

                <Group title={i18n.t("File")}>
                    <FileField data={data} field="spreadsheet" mimeType={xlsxMimeTypes} />
                </Group>

                {isAdvancedMode && template.dataFormType === "trackerPrograms" && (
                    <Group title={i18n.t("Data Filter")}>
                        <FlexRow>
                            <Field
                                field={"teiFilter"}
                                data={data}
                                onChange={dataFilter.updateFilterLabel}
                                value={template.teiFilter.label}
                            ></Field>

                            <Select
                                placeholder={i18n.t("Tei Attribute")}
                                options={dataFilter.teiAttributeOptions}
                                value={template.teiFilter.teiFilterAttributeId}
                                onChange={dataFilter.updateFilterTeiAttribute}
                            />
                        </FlexRow>
                    </Group>
                )}
            </Div>
        </ConfirmationDialog>
    );
});

const stylesFields = {
    title: ["stylesTitleSheet", "stylesTitleRange"],
    subtitle: ["stylesSubtitleSheet", "stylesSubtitleRange"],
    logo: ["stylesLogoSheet", "stylesLogoRange"],
} as const;

const FileField: React.FC<{
    data: { template: ViewModel; setTemplate: SetTemplate };
    field: "spreadsheet" | "dataSources" | "styleSources";
    mimeType: string | string[];
}> = React.memo(props => {
    const { data, field, mimeType } = props;
    const { template, setTemplate } = data;
    const classes = useStyles();
    const file = template[field];

    const onDrop = React.useCallback(
        async (files: File[]) => {
            const file = files[0];
            if (file) setTemplate(update(field, file));
        },
        [field, setTemplate]
    );

    const download = React.useCallback<NonNullable<ButtonProps["onClick"]>>(
        ev => {
            if (!file) return;
            const extensionFile = getExtensionFile(file.name);
            if (!extensionFile) return;
            const fileMimeType = MIME_TYPES_BY_EXTENSION[extensionFile] || file.type;
            ev.stopPropagation();
            downloadFile({ filename: file.name, data: file, mimeType: fileMimeType });
        },
        [file]
    );

    const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: mimeType, multiple: false });

    const mainProps = React.useMemo(() => ({ className: classes.dropzone }), [classes]);

    return (
        <div {...getRootProps(mainProps)}>
            <input {...getInputProps()} />

            {file ? (
                <div className={classes.dropZoneWrapper}>
                    <div>{file.name}</div>

                    <Button variant="contained" onClick={download} className={classes.dropZoneButton}>
                        {i18n.t("Download")}
                    </Button>
                </div>
            ) : (
                <p>{i18n.t("Drag and drop template file")}</p>
            )}
        </div>
    );
});

interface FieldDataProp {
    template: ViewModel;
    setTemplate: SetTemplate;
}

type FieldProps = Omit<TextFieldProps, "onChange"> & {
    field: ViewModelField;
    data: FieldDataProp;
    disabled?: boolean;
    multiline?: boolean;
    onChange?: (value: string) => void;
    value?: string;
};

const Field: React.FC<FieldProps> = React.memo(props => {
    const { field, data, disabled, multiline, onChange, value: initialValue, ...rest } = props;

    const { template, setTemplate } = data;
    const classes = useStyles();
    const translations = React.useMemo(() => ViewModelActions.getTranslations(), []);
    const propValue = template[field];
    const [value, setValue] = React.useState(initialValue ?? propValue);

    const setFromEvent = React.useCallback<NonNullable<TextFieldProps["onChange"]>>(
        ev => setValue(ev.target.value),
        [setValue]
    );

    const notifyParent = React.useCallback<NonNullable<TextFieldProps["onChange"]>>(
        ev => (onChange ? onChange(ev.target.value) : setTemplate(update(field, ev.target.value))),
        [setTemplate, field, onChange]
    );

    return (
        <TextField
            {...rest}
            className={classes.text}
            label={translations[field]}
            fullWidth={true}
            multiline={multiline}
            maxRows={10}
            value={value}
            onChange={setFromEvent}
            onBlur={notifyParent}
            disabled={disabled}
        />
    );
});

interface TextFieldPairProps extends Omit<FieldProps, "field"> {
    fields: readonly ViewModelField[];
}

const FieldsRow: React.FC<TextFieldPairProps> = React.memo(props => {
    const { fields, data } = props;
    const xs = 12 / fields.length;

    return (
        <Grid container spacing={1}>
            {fields.map(field => (
                <Grid key={field} item xs={xs as GridSize}>
                    <Field field={field} data={data} />
                </Grid>
            ))}
        </Grid>
    );
});

const useStyles = makeStyles({
    group: { marginBottom: 25, marginLeft: 0 },
    text: { marginTop: 10, marginBottom: 10 },
    colorOptions: { marginTop: 12, marginBottom: 0, display: "flex" },
    colorOptionsPicker: { width: "20%", marginRight: 30 },
    dropzone: {
        flex: 1,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        padding: 20,
        margin: 8,
        borderWidth: 2,
        borderRadius: 2,
        borderColor: "#c8c8c8",
        borderStyle: "dashed",
        backgroundColor: "#f0f0f0",
        cursor: "pointer",
    },
    dropZoneWrapper: { display: "flex", alignItems: "center" },
    dropZoneButton: { marginLeft: 20 },
});

const Div: React.FC<{ visible: boolean }> = React.memo(props => {
    const { visible = true, children } = props;

    return visible ? <div>{children}</div> : null;
});

const Group: React.FC<{ title?: string; visible?: boolean }> = React.memo(props => {
    const { title, visible = true, children } = props;
    const classes = useStyles();
    if (!visible) return null;

    return (
        <div className={classes.group}>
            {title && <Typography variant="h6">{title}</Typography>}
            {children}
        </div>
    );
});

function update<Field extends ViewModelField>(field: Field, value: ViewModel[Field]) {
    return { field, value };
}

function useApplyTo(customTemplates: CustomTemplate[], template: ViewModel, setTemplate: SetTemplate) {
    const [optionsObj, options, values] = React.useMemo(() => {
        const obj = {
            select: { value: "select" as const, label: i18n.t("Specific program/dataset") },
            dataSets: { value: "dataSets" as const, label: i18n.t("All datasets") },
            programs: { value: "programs" as const, label: i18n.t("All programs") },
            trackerPrograms: { value: "trackerPrograms" as const, label: i18n.t("All tracker programs") },
        };

        const options = [obj.select, obj.dataSets, obj.programs, obj.trackerPrograms];
        const values = options.map(opt => opt.value);

        return [obj, options, values];
    }, []);

    const defaultOption =
        template.isDefault && template.dataFormType ? optionsObj[template.dataFormType] : optionsObj.select;

    const [currentOption, setCurrentOption] = React.useState(defaultOption);

    const setFromString = React.useCallback(
        (option: SelectOption) => {
            const { value } = option;

            if (isValueInUnionType(value, values)) {
                setCurrentOption({ value: value, label: option.label });
                if (value !== "select") {
                    setTemplate(update("dataFormId", "ALL"));
                    setTemplate(update("dataFormType", value));
                    setTemplate(update("isDefault", true));
                } else {
                    setTemplate(update("isDefault", false));
                    setTemplate(update("dataFormId", undefined));
                }
            }
        },
        [values, setTemplate]
    );

    return { current: currentOption, options: options, set: setFromString };
}

type useDataFiltersSelectorProps = {
    dataForm: Maybe<DataForm>;
    template: TemplateView;
    setTemplate: SetTemplate;
};

export function useDataFiltersSelector(props: useDataFiltersSelectorProps) {
    const { dataForm, template, setTemplate } = props;

    const teiAttributes = React.useMemo(() => {
        if (!dataForm?.teiAttributes) return [];
        return dataForm.teiAttributes.filter(attribute => Boolean(attribute.options));
    }, [dataForm]);

    const teiAttributeOptions = React.useMemo(
        () => teiAttributes.map(attribute => ({ label: attribute.name, value: attribute.id })),
        [teiAttributes]
    );

    const updateFilterTeiAttribute = React.useCallback(
        ({ value }: SelectOption) => {
            const teiAttributeOptions = teiAttributes.find(attribute => attribute.id === value)?.options;
            const filters: TemplateDataFilter[] = teiAttributeOptions
                ? teiAttributeOptions.map(option => ({
                      id: generateUid(),
                      name: option.name,
                      conditions: [
                          {
                              field: `attribute.${value}`,
                              operator: "equals",
                              value: option.code,
                          },
                      ],
                  }))
                : [];
            const teiFilter = {
                ...template.teiFilter,
                teiFilterAttributeId: value,
                filters,
            };
            setTemplate(update("teiFilter", teiFilter));
        },
        [teiAttributes, template, setTemplate]
    );

    const updateFilterLabel = React.useCallback(
        (value: string) => {
            const teiFilter = {
                ...template.teiFilter,
                label: value,
            };
            setTemplate(update("teiFilter", teiFilter));
        },
        [template, setTemplate]
    );

    return {
        teiAttributeOptions,
        updateFilterTeiAttribute,
        updateFilterLabel,
    };
}
