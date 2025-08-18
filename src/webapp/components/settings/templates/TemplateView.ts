import _ from "lodash";

import {
    CellRef,
    ColumnRef,
    CustomTemplate,
    DataSource,
    DataSourceValue,
    GeneratedTemplate,
    Range,
    RowDataSource,
    RowRef,
    SheetRef,
    StyleSource,
    TeiRowDataSource,
    Template,
    TrackerEventRowDataSource,
    TrackerRelationship,
    ValueRef,
} from "../../../../domain/entities/Template";
import { assertUnreachable, Maybe, ofType, OkOrError } from "../../../../types/utils";
import { fromBase64, getStringFromFile, toBase64 } from "../../../../utils/files";
import { DataFormType } from "../../../../domain/entities/DataForm";
import { getGeneratedTemplateId } from "../../../logic/sheetBuilder";
import i18n from "../../../../utils/i18n";
import { Id } from "../../../../domain/entities/ReferenceObject";
import { TemplateFilter } from "../../../../domain/entities/TemplateFilter";

export interface TemplateView extends BasicView, AdvancedView {
    mode: "basic" | "advanced";
    generateMetadata: boolean;
    isDefault: boolean;
}

type ValidView = { [K in keyof TemplateView]: NonNullable<TemplateView[K]> };

const baseFields: Array<keyof BaseView> = ["code", "name", "dataFormId", "spreadsheet"];

const advancedFields: Array<keyof AdvancedView> = ["dataSources", "styleSources"];

interface BaseView {
    action: "create" | "edit";
    code: string;
    name: string;
    description: string;
    dataFormType: Maybe<DataFormType>;
    dataFormId: Maybe<string>;
    spreadsheet: Maybe<File>;
}

export interface AdvancedView extends BaseView {
    dataSources: Maybe<File>;
    styleSources: Maybe<File>;
    showLanguage: boolean;
    showPeriod: boolean;
    teiFilter: TeiTemplateFilterView;
}

type TeiTemplateFilterView = TemplateFilter & {
    teiFilterAttributeId: Id;
};

export interface BasicView extends BaseView {
    // Data Source (dataSets and programs)
    eventIdSheet: string;
    eventIdColumn: string;
    orgUnitSheet: string;
    orgUnitColumn: string;
    attributeSheet: string;
    attributeColumn: string;
    periodSheet: string;
    periodColumn: string;
    rangeSheet: string;
    rangeRowStart: string;
    rangeColumnStart: string;
    dataElementSheet: string;
    dataElementRow: string;
    categoryOptionSheet: string;
    categoryOptionRow: string;
    coordinatesLatitudeSheet: string;
    coordinatesLatitudeColumn: string;
    coordinatesLongitudeSheet: string;
    coordinatesLongitudeColumn: string;

    // Data Source (trackerPrograms)
    teiIdSheet: string;
    teiIdColumn: string;
    teiOrgUnitSheet: string;
    teiOrgUnitColumn: string;
    teiGeometrySheet: string;
    teiGeometryColumn: string;
    teiEnrollmentDateSheet: string;
    teiEnrollmentDateColumn: string;
    teiIncidentDateSheet: string;
    teiIncidentDateColumn: string;
    teiAttributesSheet: string;
    teiAttributesRowStart: string;
    teiAttributesColumnStart: string;
    teiAttributeIdSheet: string;
    teiAttributeIdRow: string;
    teiRelRangeSheet: string;
    teiRelRangeRowStart: string;
    teiRelRangeColumnStart: string;
    teiRelRelationshipTypeSheet: string;
    teiRelRelationshipTypeCell: string;
    teiRelFromSheet: string;
    teiRelFromColumn: string;
    teiRelToSheet: string;
    teiRelToColumn: string;
    teiEventEventIdSheet: string;
    teiEventEventIdColumn: string;
    teiEventTeiIdSheet: string;
    teiEventTeiIdColumn: string;
    teiEventCategoryOptionComboSheet: string;
    teiEventCategoryOptionComboColumn: string;
    teiEventDateSheet: string;
    teiEventDateColumn: string;
    teiEventProgramStageSheet: string;
    teiEventProgramStageCell: string;
    teiEventDataElementsSheet: string;
    teiEventDataElementsRowStart: string;
    teiEventDataElementsRowEnd: string;
    teiEventDataElementsColumnStart: string;
    teiEventDataValuesSheet: string;
    teiEventDataValuesRowStart: string;
    teiEventDataValuesColumnStart: string;

    // Styles
    stylesTitleSheet: string;
    stylesTitleRange: string;
    stylesSubtitleSheet: string;
    stylesSubtitleRange: string;
    stylesLogoSheet: string;
    stylesLogoRange: string;
}

const defaultSheet = "Data Entry";
export const defaultTemplateFilter: TeiTemplateFilterView = {
    filters: [],
    teiFilterAttributeId: "",
    label: "TEI Data Filter",
};

type ValidationKey = "column" | "row" | "range" | "cell";

interface Definition {
    default: unknown;
    validations: ValidationKey[];
}

function definition<T>(defaultValue: T, validations?: ValidationKey[]): Definition {
    return { default: defaultValue, validations: validations || [] };
}
const viewDefs = {
    action: definition("create"),
    isDefault: definition(undefined),
    mode: definition("basic"),
    generateMetadata: definition(false),
    code: definition(""),
    name: definition(""),
    dataFormType: definition(undefined),
    dataFormId: definition(undefined),
    description: definition(""),
    eventIdSheet: definition(defaultSheet),
    eventIdColumn: definition("", ["column"]),
    orgUnitSheet: definition(defaultSheet),
    orgUnitColumn: definition("", ["column"]),
    attributeSheet: definition(defaultSheet),
    attributeColumn: definition("", ["column"]),
    periodSheet: definition(defaultSheet),
    periodColumn: definition("", ["column"]),
    rangeSheet: definition(defaultSheet),
    rangeRowStart: definition("", ["row"]),
    rangeColumnStart: definition("", ["column"]),
    dataElementSheet: definition(defaultSheet),
    dataElementRow: definition("", ["row"]),
    categoryOptionSheet: definition(defaultSheet),
    categoryOptionRow: definition("", ["row"]),
    coordinatesLatitudeSheet: definition(defaultSheet),
    coordinatesLatitudeColumn: definition("", ["column"]),
    coordinatesLongitudeSheet: definition(defaultSheet),
    coordinatesLongitudeColumn: definition("", ["column"]),

    teiIdSheet: definition(""),
    teiIdColumn: definition("", ["column"]),
    teiOrgUnitSheet: definition(""),
    teiOrgUnitColumn: definition("", ["column"]),
    teiGeometrySheet: definition(""),
    teiGeometryColumn: definition("", ["column"]),
    teiEnrollmentDateSheet: definition(""),
    teiEnrollmentDateColumn: definition("", ["column"]),
    teiIncidentDateSheet: definition(""),
    teiIncidentDateColumn: definition("", ["column"]),
    teiAttributesSheet: definition(""),
    teiAttributesRowStart: definition("", ["row"]),
    teiAttributesColumnStart: definition("", ["column"]),
    teiAttributeIdSheet: definition(""),
    teiAttributeIdRow: definition("", ["row"]),
    teiRelRangeSheet: definition(""),
    teiRelRangeRowStart: definition("", ["row"]),
    teiRelRangeColumnStart: definition("", ["column"]),
    teiRelRelationshipTypeSheet: definition(""),
    teiRelRelationshipTypeCell: definition("", ["cell"]),
    teiRelFromSheet: definition(""),
    teiRelFromColumn: definition("", ["column"]),
    teiRelToSheet: definition(""),
    teiRelToColumn: definition("", ["column"]),
    teiEventEventIdSheet: definition(""),
    teiEventEventIdColumn: definition("", ["column"]),
    teiEventTeiIdSheet: definition(""),
    teiEventTeiIdColumn: definition("", ["column"]),
    teiEventCategoryOptionComboSheet: definition(""),
    teiEventCategoryOptionComboColumn: definition("", ["column"]),
    teiEventDateSheet: definition(""),
    teiEventDateColumn: definition("", ["column"]),
    teiEventProgramStageSheet: definition(""),
    teiEventProgramStageCell: definition("", ["cell"]),
    teiEventDataElementsSheet: definition(""),
    teiEventDataElementsRowStart: definition("", ["row"]),
    teiEventDataElementsRowEnd: definition("", ["row"]),
    teiEventDataElementsColumnStart: definition("", ["column"]),
    teiEventDataValuesSheet: definition(""),
    teiEventDataValuesRowStart: definition("", ["row"]),
    teiEventDataValuesColumnStart: definition("", ["column"]),
    stylesTitleSheet: definition(defaultSheet),
    stylesTitleRange: definition("", ["range"]),
    stylesSubtitleSheet: definition(defaultSheet),
    stylesSubtitleRange: definition("", ["range"]),
    stylesLogoSheet: definition(defaultSheet),
    stylesLogoRange: definition("", ["range"]),

    spreadsheet: definition(undefined),
    dataSources: definition(undefined),
    styleSources: definition(undefined),
    showLanguage: definition(false),
    showPeriod: definition(false),
    teiFilter: definition(defaultTemplateFilter),
} as const;

const viewEmpty = _.mapValues(viewDefs, def => def.default) as TemplateView;

const fieldsByKey = {
    // dataSets and programs
    eventId: ["eventIdSheet", "eventIdColumn"],
    orgUnit: ["orgUnitSheet", "orgUnitColumn"],
    attribute: ["attributeSheet", "attributeColumn"],
    period: ["periodSheet", "periodColumn"],
    coordinatesLatitude: ["coordinatesLatitudeSheet", "coordinatesLatitudeColumn"],
    coordinatesLongitude: ["coordinatesLongitudeSheet", "coordinatesLongitudeColumn"],
    dataElement: ["dataElementSheet", "dataElementRow"],
    categoryOption: ["categoryOptionSheet", "categoryOptionRow"],
    range: ["rangeSheet", "rangeColumnStart", "rangeRowStart"],

    // trackerPrograms
    teiId: ["teiIdSheet", "teiIdColumn"],
    teiOrgUnit: ["teiOrgUnitSheet", "teiOrgUnitColumn"],
    teiGeometry: ["teiGeometrySheet", "teiGeometryColumn"],
    teiEnrollmentDate: ["teiEnrollmentDateSheet", "teiEnrollmentDateColumn"],
    teiIncidentDate: ["teiIncidentDateSheet", "teiIncidentDateColumn"],
    teiAttributes: ["teiAttributesSheet", "teiAttributesRowStart", "teiAttributesColumnStart"],
    teiAttributeId: ["teiAttributeIdSheet", "teiAttributeIdRow"],
    teiRelRange: ["teiRelRangeRowStart", "teiRelRangeColumnStart"],
    teiRelRelationshipType: ["teiRelRelationshipTypeCell"],
    teiRelFrom: ["teiRelFromColumn"],
    teiRelTo: ["teiRelToColumn"],
    teiEventEventId: ["teiEventEventIdColumn"],
    teiEventTeiId: ["teiEventTeiIdColumn"],
    teiEventCategoryOptionCombo: ["teiEventCategoryOptionComboColumn"],
    teiEventDateSheet: ["teiEventDateColumn"],
    teiEventProgramStage: ["teiEventProgramStageCell"],
    teiEventDataElements: [
        "teiEventDataElementsRowStart",
        "teiEventDataElementsRowEnd",
        "teiEventDataElementsColumnStart",
    ],
    teiEventDataValues: ["teiEventDataValuesRowStart", "teiEventDataValuesColumnStart"],
} as const;

export type TemplateViewKey = keyof TemplateView;

type Validation = { isValid: true; object: ValidView } | { isValid: false; errors: string[] };

type Translations = Record<TemplateViewKey, string>;

export class TemplateViewActions {
    translations: Translations;

    constructor(private customTemplates: CustomTemplate[], private generatedTemplates: GeneratedTemplate[]) {
        this.translations = TemplateViewActions.getTranslations();
    }

    async build(options: { dataFormType: DataFormType | undefined }): Promise<TemplateView> {
        const { dataFormType } = options;
        if (!dataFormType) return viewEmpty;
        const generatedTemplate = this.getGeneratedTemplate(dataFormType);

        return { ...viewEmpty, ...this.get(generatedTemplate), action: "create" };
    }

    private getGeneratedTemplate(dataFormType: DataFormType): GeneratedTemplate {
        const templateId = getGeneratedTemplateId(dataFormType);
        const generatedTemplate = this.generatedTemplates.find(t => t.id === templateId);
        if (!generatedTemplate) throw new Error("Cannot find generated template");
        return generatedTemplate;
    }

    async fromCustomTemplate(template: CustomTemplate): Promise<TemplateView> {
        //only teiFilters are supported for now
        //only one tei Attribute is selected for configuration
        //filters conditions are generated based on potential values
        const teiFilter = template.filters?.teiFilters;
        const teiFilterField = teiFilter?.filters?.[0]?.conditions?.[0]?.field;
        const teifilterAttributeId = teiFilterField ? teiFilterField.split(".")[1] : undefined;

        const base: Partial<TemplateView> = {
            action: "edit",
            isDefault: template.isDefault,
            generateMetadata: template.generateMetadata,
            code: template.id,
            name: template.name,
            dataFormId:
                template.dataFormId.type === "value" ? template.dataFormId.id : template.isDefault ? "ALL" : undefined,
            dataFormType: template.dataFormType.type === "value" ? template.dataFormType.id : undefined,
            description: template.description,
            spreadsheet: await getSpreadsheetFile(template.file).catch(() => undefined),
            showLanguage: template.showLanguage || false,
            showPeriod: template.showPeriod || false,
            teiFilter:
                teiFilter && teifilterAttributeId
                    ? {
                          ...teiFilter,
                          teiFilterAttributeId: teifilterAttributeId,
                      }
                    : defaultTemplateFilter,
        };

        return { ...viewEmpty, ...base, ...this.get(template) };
    }

    getFieldsForDataFormType(dataFormType: Maybe<DataFormType>): Array<readonly TemplateViewKey[]> {
        const fields = fieldsByKey;

        switch (dataFormType) {
            case "dataSets":
                return [
                    fields.orgUnit,
                    fields.period,
                    fields.attribute,
                    fields.range,
                    fields.dataElement,
                    fields.categoryOption,
                ];
            case "programs":
                return [
                    fields.eventId,
                    fields.orgUnit,
                    fields.attribute,
                    fields.period,
                    fields.range,
                    fields.dataElement,
                    fields.coordinatesLatitude,
                    fields.coordinatesLongitude,
                ];
            case "trackerPrograms":
                return [
                    fields.teiId,
                    fields.teiOrgUnit,
                    fields.teiGeometry,
                    fields.teiEnrollmentDate,
                    fields.teiIncidentDate,
                    fields.teiAttributes,
                    fields.teiAttributeId,
                    fields.teiRelRange,
                    fields.teiRelRelationshipType,
                    fields.teiRelFrom,
                    fields.teiRelTo,
                    fields.teiEventEventId,
                    fields.teiEventTeiId,
                    fields.teiEventCategoryOptionCombo,
                    fields.teiEventDateSheet,
                    fields.teiEventProgramStage,
                    fields.teiEventDataElements,
                    fields.teiEventDataValues,
                ];
            default:
                return [];
        }
    }

    private get(template: Template): Partial<TemplateView> {
        const { dataSources, styleSources } = template;
        const dataFormType = template.dataFormType.type === "value" ? template.dataFormType.id : undefined;
        if (!dataFormType) return {};

        const advancedView: Partial<TemplateView> = {
            mode: "advanced",
            dataSources: getFileFromTemplateField(template, "Data Sources", template.dataSources),
            styleSources: getFileFromTemplateField(template, "Styles Sources", template.styleSources),
        };

        const stylesBySection = _.keyBy(styleSources, styleSource => styleSource.section);
        const stylesAttrs = _.pickBy({
            stylesTitleSheet: stylesBySection["title"]?.source.sheet,
            stylesTitleRange: stylesBySection["title"]?.source.ref,
            stylesSubtitleSheet: stylesBySection["subtitle"]?.source.sheet,
            stylesSubtitleRange: stylesBySection["subtitle"]?.source.ref,
            stylesLogoSheet: stylesBySection["logo"]?.source.sheet,
            stylesLogoRange: stylesBySection["logo"]?.source.ref,
        });

        const mode1 = template.type === "custom" ? template.mode : "advanced";
        const defaultMode = dataSources && dataSources.length > 1 ? "advanced" : "basic";
        const mode = mode1 ?? defaultMode;
        if (mode === "advanced") return advancedView;

        switch (dataFormType) {
            case "dataSets":
            case "programs": {
                const dataSource = dataSources?.[0];
                const dataSourceHasTypeRow = dataSource && "type" in dataSource && dataSource.type === "row";
                if (!dataSourceHasTypeRow) return advancedView;

                const view: Partial<TemplateView> = {
                    mode: "basic",
                    ...getColumnAttrs(dataSource.eventId, "eventId"),
                    ...getColumnAttrs(dataSource.orgUnit, "orgUnit"),
                    ...getColumnAttrs(dataSource.attribute, "attribute"),
                    ...getColumnAttrs(dataSource.period, "period"),
                    ...getRangeAttrs(dataSource.range, "range"),
                    ...getRowAttrs(dataSource.dataElement, "dataElement"),
                    ...getRowAttrs(dataSource.categoryOption, "categoryOption"),
                    ...getColumnAttrs(dataSource.coordinates?.latitude, "coordinatesLatitude"),
                    ...getColumnAttrs(dataSource.coordinates?.longitude, "coordinatesLongitude"),
                    ...stylesAttrs,
                };

                return view;
            }
            case "trackerPrograms": {
                if (!dataSources || dataSources.length !== 3) return advancedView;

                const rowTei = findDataSourceByType(dataSources, "rowTei");
                const rowTeiRelationship = findDataSourceByType(dataSources, "rowTeiRelationship");
                const rowTrackedEvent = findDataSourceByType(dataSources, "rowTrackedEvent");

                if (!(rowTei && rowTeiRelationship && rowTrackedEvent)) return advancedView;

                const view: Partial<TemplateView> = {
                    mode: "basic",
                    ...getColumnAttrs(rowTei.teiId, "teiId"),
                    ...getColumnAttrs(rowTei.orgUnit, "teiOrgUnit"),
                    ...getColumnAttrs(rowTei.geometry, "teiGeometry"),
                    ...getColumnAttrs(rowTei.enrollmentDate, "teiEnrollmentDate"),
                    ...getColumnAttrs(rowTei.incidentDate, "teiIncidentDate"),
                    ...getRangeAttrs(rowTei.attributes, "teiAttributes"),
                    ...getRowAttrs(rowTei.attributeId, "teiAttributeId"),

                    ...getRangeAttrs(rowTeiRelationship.range, "teiRelRange"),
                    ...getCellAttrs(rowTeiRelationship.relationshipType, "teiRelRelationshipType"),
                    ...getColumnAttrs(rowTeiRelationship.from, "teiRelFrom"),
                    ...getColumnAttrs(rowTeiRelationship.to, "teiRelTo"),

                    ...getColumnAttrs(rowTrackedEvent.eventId, "teiEventEventId"),
                    ...getColumnAttrs(rowTrackedEvent.teiId, "teiEventTeiId"),
                    ...getColumnAttrs(rowTrackedEvent.date, "teiEventDate"),
                    ...getColumnAttrs(rowTrackedEvent.categoryOptionCombo, "teiEventCategoryOptionCombo"),
                    ...getRangeAttrs(rowTrackedEvent.dataValues, "teiEventDataValues"),
                    ...getCellAttrs(rowTrackedEvent.programStage, "teiEventProgramStage"),
                    ...getRangeAttrs(rowTrackedEvent.dataElements, "teiEventDataElements"),

                    ...stylesAttrs,
                };

                return view;
            }
        }
    }

    async toCustomTemplate(view: ValidView): Promise<CustomTemplate> {
        type BaseField =
            | "type"
            | "isDefault"
            | "generateMetadata"
            | "id"
            | "name"
            | "dataFormType"
            | "dataFormId"
            | "description"
            | "file"
            | "created"
            | "lastUpdated"
            | "mode";

        const base: Pick<CustomTemplate, BaseField> = {
            type: "custom",
            mode: view.mode,
            isDefault: view.isDefault,
            generateMetadata: view.generateMetadata,
            id: view.code,
            name: view.name,
            dataFormType: { type: "value", id: view.dataFormType },
            dataFormId: { type: "value", id: view.dataFormId },
            description: view.description,
            file: { name: view.spreadsheet.name, contents: await toBase64(view.spreadsheet) },
            created: undefined,
            lastUpdated: undefined,
        };

        const styleSources: StyleSource[] = [
            getStyleSource("title", defaultSheet, view.stylesTitleRange),
            getStyleSource("subtitle", defaultSheet, view.stylesSubtitleRange),
            getStyleSource("logo", defaultSheet, view.stylesLogoRange),
        ];

        const { teiFilterAttributeId, ...teiFilters } = view.teiFilter;

        switch (view.mode) {
            case "basic": {
                switch (view.dataFormType) {
                    case "dataSets": {
                        const dataSource: RowDataSource = {
                            type: "row",
                            orgUnit: getDataSourceColumnAttrs(view, "orgUnit"),
                            period: getDataSourceColumnAttrs(view, "period"),
                            attribute: getDataSourceColumnAttrs(view, "attribute"),
                            range: getDataSourceRangeAttrs(view, "range"),
                            dataElement: getDataSourceRowAttrs(view, "dataElement"),
                            categoryOption: getDataSourceRowAttrs(view, "categoryOption"),
                        };

                        return { ...base, dataSources: [dataSource], styleSources };
                    }
                    case "programs": {
                        const dataSource: RowDataSource = {
                            type: "row",
                            eventId: getDataSourceColumnAttrs(view, "eventId"),
                            orgUnit: getDataSourceColumnAttrs(view, "orgUnit"),
                            attribute: getDataSourceColumnAttrs(view, "attribute"),
                            period: getDataSourceColumnAttrs(view, "period"),
                            range: getDataSourceRangeAttrs(view, "range"),
                            dataElement: getDataSourceRowAttrs(view, "dataElement"),
                            coordinates: {
                                latitude: getDataSourceColumnAttrs(view, "coordinatesLatitude"),
                                longitude: getDataSourceColumnAttrs(view, "coordinatesLongitude"),
                            },
                        };

                        return { ...base, dataSources: [dataSource], styleSources };
                    }
                    case "trackerPrograms": {
                        const dataSourceRowTei: TeiRowDataSource = {
                            type: "rowTei",
                            teiId: getDataSourceColumnAttrs(view, "teiId"),
                            orgUnit: getDataSourceColumnAttrs(view, "teiOrgUnit"),
                            geometry: getDataSourceColumnAttrs(view, "teiGeometry"),
                            enrollmentDate: getDataSourceColumnAttrs(view, "teiEnrollmentDate"),
                            incidentDate: getDataSourceColumnAttrs(view, "teiIncidentDate"),
                            attributes: getDataSourceRangeAttrs(view, "teiAttributes"),
                            attributeId: getDataSourceRowAttrs(view, "teiAttributeId"),
                        };

                        const dataSourceRelationships: TrackerRelationship = {
                            type: "rowTeiRelationship",
                            sheetsMatch: "^Rel",
                            range: getDataSourceRangeAttrs(view, "teiRelRange"),
                            relationshipType: getDataSourceCellAttrs(view, "teiRelRelationshipType"),
                            from: getDataSourceColumnAttrs(view, "teiRelFrom"),
                            to: getDataSourceColumnAttrs(view, "teiRelTo"),
                        };

                        const dataSourceEvents: TrackerEventRowDataSource = {
                            type: "rowTrackedEvent",
                            sheetsMatch: "^(Stage|\\()",
                            eventId: getDataSourceColumnAttrs(view, "teiEventEventId"),
                            teiId: getDataSourceColumnAttrs(view, "teiEventTeiId"),
                            date: getDataSourceColumnAttrs(view, "teiEventDate"),
                            categoryOptionCombo: getDataSourceColumnAttrs(view, "teiEventCategoryOptionCombo"),
                            dataValues: getDataSourceRangeAttrs(view, "teiEventDataValues"),
                            programStage: getDataSourceCellAttrs(view, "teiEventProgramStage"),
                            dataElements: getDataSourceRangeAttrs(view, "teiEventDataElements"),
                        };

                        const dataSources = [dataSourceRowTei, dataSourceRelationships, dataSourceEvents];
                        return { ...base, dataSources, styleSources };
                    }
                }
                break;
            }
            case "advanced":
                return {
                    ...base,
                    dataSources: await arrayFromFile<DataSource>(view.dataSources),
                    styleSources: await arrayFromFile<StyleSource>(view.styleSources),
                    showLanguage: view.showLanguage,
                    showPeriod: view.showPeriod,
                    filters: teiFilterAttributeId
                        ? {
                              teiFilters: teiFilters,
                          }
                        : undefined,
                };
        }
    }

    update<Field extends keyof TemplateView>(
        view: TemplateView,
        field: Field,
        value: TemplateView[Field]
    ): TemplateView {
        const dataFormTypeChanged = field === "dataFormType" && value && view.dataFormType !== value;

        if (dataFormTypeChanged) {
            const newDataFormType = value as DataFormType;
            const generatedTemplate = this.getGeneratedTemplate(newDataFormType);
            return { ...view, dataFormType: newDataFormType, ...this.get(generatedTemplate) };
        } else {
            return { ...view, [field]: value };
        }
    }

    validateCodeUniqueness(view: TemplateView): OkOrError {
        return view.action === "create" && _(this.customTemplates).some(ct => ct.id === view.code)
            ? { status: false, error: i18n.t("A custom template exists with this same code - ") + view.code }
            : { status: true };
    }

    validate(view: TemplateView): Validation {
        const codeValidation = this.validateCodeUniqueness(view);
        if (!codeValidation.status) return { isValid: false, errors: [codeValidation.error] };

        switch (view.mode) {
            case "basic": {
                const fieldsForType = _.flatten(this.getFieldsForDataFormType(view.dataFormType));
                const errorsByDefinition = getErrorsByDefinition(fieldsForType, view, this.translations);
                if (!_.isEmpty(errorsByDefinition)) return { isValid: false, errors: errorsByDefinition };

                return this.validatePresence(view, _.concat(baseFields, fieldsForType));
            }
            case "advanced":
                return this.validatePresence(view, _.concat(baseFields, advancedFields));
        }
    }

    private validatePresence(view: TemplateView, fields: TemplateViewKey[]): Validation {
        const translations = TemplateViewActions.getTranslations();
        const emptyFields = fields.filter(field => !view[field]);
        const errors = emptyFields.map(field => `${i18n.t("Field cannot be empty")}: ${translations[field]}`);

        return _.isEmpty(errors) ? { isValid: true, object: view as ValidView } : { isValid: false, errors };
    }

    static getTranslations() {
        return ofType<Translations>({
            action: i18n.t("Action"),
            isDefault: i18n.t("Is default"),
            mode: i18n.t("Mode"),
            generateMetadata: i18n.t("Generate automatic metadata"),
            code: i18n.t("Code"),
            name: i18n.t("Name"),
            description: i18n.t("Description"),
            dataFormType: i18n.t("Type"),
            dataFormId: i18n.t("Program/Dataset"),
            spreadsheet: i18n.t("Spreadsheet template"),

            eventIdSheet: i18n.t("Event UID - Sheet"),
            eventIdColumn: i18n.t("Event UID - Column"),
            orgUnitSheet: i18n.t("Organisation Unit - Sheet"),
            orgUnitColumn: i18n.t("Organisation Unit - Column"),
            attributeSheet: i18n.t("Attribute - Sheet"),
            attributeColumn: i18n.t("Attribute - Column"),
            periodSheet: i18n.t("Period - Sheet"),
            periodColumn: i18n.t("Period - Column"),
            rangeSheet: i18n.t("Range - Sheet"),
            rangeRowStart: i18n.t("Range - Starting row"),
            rangeColumnStart: i18n.t("Range - Starting column"),
            dataElementSheet: i18n.t("Data Element - Sheet"),
            dataElementRow: i18n.t("Data Element - Row"),
            categoryOptionSheet: i18n.t("Category Option - Sheet"),
            categoryOptionRow: i18n.t("Category Option - Row"),
            coordinatesLatitudeSheet: i18n.t("Coordinates Latitude - Sheet"),
            coordinatesLatitudeColumn: i18n.t("Coordinates Latitude - Column"),
            coordinatesLongitudeSheet: i18n.t("Coordinates Longitude - Sheet"),
            coordinatesLongitudeColumn: i18n.t("Coordinates Longitude - Column"),
            stylesTitleSheet: i18n.t("Title - Sheet"),
            stylesTitleRange: i18n.t("Title Range (example D2:I2)", { nsSeparator: false }),
            stylesSubtitleSheet: i18n.t("Subtitle - Sheet"),
            stylesSubtitleRange: i18n.t("Subtitle - Range (example D3:I3)", { nsSeparator: false }),
            stylesLogoSheet: i18n.t("Logo - Sheet"),
            stylesLogoRange: i18n.t("Title Range (example A2:C3)", { nsSeparator: false }),

            teiIdSheet: i18n.t("TEI Id - Sheet"),
            teiIdColumn: i18n.t("TEI Id - Column"),
            teiOrgUnitSheet: i18n.t("TEI Organisation Unit - Sheet"),
            teiOrgUnitColumn: i18n.t("TEI Organisation Unit - Column"),
            teiGeometrySheet: i18n.t("TEI Geometry - Sheet"),
            teiGeometryColumn: i18n.t("TEI Geometry - Column"),
            teiEnrollmentDateSheet: i18n.t("TEI Enrolmment Date - Sheet"),
            teiEnrollmentDateColumn: i18n.t("TEI Enrolmment Date - Column"),
            teiIncidentDateSheet: i18n.t("TEI Incident Date - Sheet"),
            teiIncidentDateColumn: i18n.t("TEI Incident Date - Column"),
            teiAttributesSheet: i18n.t("TEI Attributes - Sheet"),
            teiAttributesRowStart: i18n.t("TEI Attributes - Row Start"),
            teiAttributesColumnStart: i18n.t("TEI Attributes - Column Start"),
            teiAttributeIdSheet: i18n.t("TEI Attribute ID - Sheet"),
            teiAttributeIdRow: i18n.t("TEI Attribute ID - Row"),
            teiRelRangeSheet: i18n.t("TEI Relationship Range - Sheet"),
            teiRelRangeRowStart: i18n.t("TEI Relationship Range - Row Start"),
            teiRelRangeColumnStart: i18n.t("TEI Relationship Range - Column Start"),
            teiRelRelationshipTypeSheet: i18n.t("TEI Relationship Type - Sheet"),
            teiRelRelationshipTypeCell: i18n.t("TEI Relationship Type - Cell"),
            teiRelFromSheet: i18n.t("TEI Relationship From - Sheet"),
            teiRelFromColumn: i18n.t("TEI Relationship From - Column"),
            teiRelToSheet: i18n.t("TEI Relationship To - Sheet"),
            teiRelToColumn: i18n.t("TEI Relationship To - Column"),
            teiEventEventIdSheet: i18n.t("TEI Event Event-Id - Sheet"),
            teiEventEventIdColumn: i18n.t("TEI Event Event-Id - Column"),
            teiEventTeiIdSheet: i18n.t("TEI Event TEI Id - Sheet"),
            teiEventTeiIdColumn: i18n.t("TEI Event TEI Id - Column"),
            teiEventCategoryOptionComboSheet: i18n.t("TEI Event Category Option Combo - Sheet"),
            teiEventCategoryOptionComboColumn: i18n.t("TEI Event Category Option Combo - Column"),
            teiEventDateSheet: i18n.t("TEI Event Date - Sheet"),
            teiEventDateColumn: i18n.t("TEI Event Date - Column"),
            teiEventProgramStageSheet: i18n.t("TEI Event Program Stage - Sheet"),
            teiEventProgramStageCell: i18n.t("TEI Event Program Stage - Cell"),
            teiEventDataElementsSheet: i18n.t("TEI Event Data Elements - Sheet"),
            teiEventDataElementsRowStart: i18n.t("TEI Event Data Elements - Row Start"),
            teiEventDataElementsRowEnd: i18n.t("TEI Event Data Elements - Row End"),
            teiEventDataElementsColumnStart: i18n.t("TEI Event Data Elements - Column Start"),
            teiEventDataValuesSheet: i18n.t("TEI Event Data Values - Sheet"),
            teiEventDataValuesRowStart: i18n.t("TEI Event Data Values - Row Start"),
            teiEventDataValuesColumnStart: i18n.t("TEI Event Data Values - Column Start"),

            dataSources: i18n.t("Data Source"),
            styleSources: i18n.t("Styles"),
            showLanguage: i18n.t("Show Language"),
            showPeriod: i18n.t("Show Period"),
            teiFilter: i18n.t("Tei Data Filter - Label"),
        });
    }
}

/* Helpers */

type DataSourceColumnField =
    | "eventId"
    | "orgUnit"
    | "attribute"
    | "period"
    | "coordinatesLatitude"
    | "coordinatesLongitude"
    | "teiId"
    | "teiOrgUnit"
    | "teiGeometry"
    | "teiEnrollmentDate"
    | "teiIncidentDate"
    | "teiRelFrom"
    | "teiRelTo"
    | "teiEventTeiId"
    | "teiEventEventId"
    | "teiEventDate"
    | "teiEventCategoryOptionCombo";

function getColumnAttrs<Field extends DataSourceColumnField>(columnRef: Maybe<SheetRef | ValueRef>, field: Field) {
    if (columnRef?.type !== "column") return;

    const sheetField = (field + "Sheet") as `${typeof field}Sheet`;
    const columnField = (field + "Column") as `${typeof field}Column`;
    const attrs = { [sheetField]: columnRef.sheet.toString(), [columnField]: columnRef.ref };

    return attrs as Record<typeof sheetField | typeof columnField, string>;
}

type DataSourceRowField = "dataElement" | "categoryOption" | "teiAttributeId";

function getRowAttrs<Field extends DataSourceRowField>(
    rowRef: ColumnRef | RowRef | ValueRef | undefined,
    field: Field
) {
    if (rowRef?.type !== "row") return;

    const sheetField = (field + "Sheet") as `${typeof field}Sheet`;
    const columnField = (field + "Row") as `${typeof field}Row`;
    const attrs = { [sheetField]: rowRef.sheet.toString(), [columnField]: rowRef.ref };

    return attrs as Record<`${Field}Sheet` | `${Field}Row`, string>;
}

type DataSourceRangeField = "range" | "teiAttributes" | "teiRelRange" | "teiEventDataValues" | "teiEventDataElements";

function getRangeAttrs<Field extends DataSourceRangeField>(range: Range, field: Field) {
    const sheetField = (field + "Sheet") as `${Field}Sheet`;
    const rowStartField = (field + "RowStart") as `${Field}RowStart`;
    const rowEndField = (field + "RowEnd") as `${Field}RowEnd`;
    const columnStartField = (field + "ColumnStart") as `${Field}ColumnStart`;

    return {
        [sheetField]: range.sheet,
        [rowStartField]: range.rowStart,
        [rowEndField]: range.rowEnd,
        [columnStartField]: range.columnStart,
    } as Record<`${Field}RowStart`, string> &
        Record<`${Field}RowEnd`, string | undefined> &
        Record<`${Field}Sheet` | `${Field}ColumnStart`, string>;
}

type DataSourceCellField = "teiRelRelationshipType" | "teiEventProgramStage";

function getCellAttrs<Field extends DataSourceCellField>(range: CellRef, field: Field) {
    const sheetField = (field + "Sheet") as `${Field}Sheet`;
    const cellField = (field + "Cell") as `${Field}Cell`;

    return {
        [sheetField]: range.sheet,
        [cellField]: range.ref,
    } as Record<`${Field}Sheet` | `${Field}Cell`, string>;
}

//

function getDataSourceColumnAttrs<Field extends DataSourceColumnField>(view: ValidView, field: Field): ColumnRef {
    const sheetField = (field + "Sheet") as `${Field}Sheet`;
    const columnField = (field + "Column") as `${Field}Column`;

    return {
        type: "column",
        sheet: view[sheetField],
        ref: view[columnField],
    };
}

function getDataSourceRangeAttrs<Field extends DataSourceRangeField>(view: ValidView, field: Field): Range {
    const sheetField = (field + "Sheet") as `${Field}Sheet`;
    const rowStartField = (field + "RowStart") as `${Field}RowStart`;
    const rowEndField = (field + "RowEnd") as `${Field}RowEnd`;
    const columnStartField = (field + "ColumnStart") as `${Field}ColumnStart`;

    return {
        sheet: view[sheetField],
        rowStart: toInt(view[rowStartField]),
        rowEnd: toOptionalInt(view[rowEndField as keyof ValidView & `${string}RowEnd`]),
        columnStart: view[columnStartField],
    };
}

function getDataSourceRowAttrs<Field extends DataSourceRowField>(view: ValidView, field: Field): RowRef {
    const sheetField = (field + "Sheet") as `${Field}Sheet`;
    const rowField = (field + "Row") as `${Field}Row`;

    return {
        type: "row",
        sheet: view[sheetField],
        ref: toInt(view[rowField]),
    };
}

function getDataSourceCellAttrs<Field extends DataSourceCellField>(view: ValidView, field: Field): CellRef {
    const sheetField = (field + "Sheet") as `${Field}Sheet`;
    const cellField = (field + "Cell") as `${Field}Cell`;
    return {
        type: "cell",
        sheet: view[sheetField],
        ref: view[cellField],
    };
}

async function getSpreadsheetFile(file: CustomTemplate["file"]): Promise<File> {
    return fromBase64(file.contents, file.name);
}

function getFileFromTemplateField<T>(customTemplate: Template, name: string, obj: T[] | undefined): File {
    const json = JSON.stringify(obj || [], null, 4);
    const filename = `${customTemplate.name} - ${name}.json`;
    return new File([json], filename);
}

async function arrayFromFile<T>(file: File): Promise<T[]> {
    const contents = await getStringFromFile(file);
    const obj = JSON.parse(contents) || [];
    return obj as T[];
}

function findDataSourceByType<Type extends DataSourceValue["type"]>(
    dataSources: Maybe<DataSource[]>,
    type: Type
): Extract<DataSourceValue, { type: Type }> | undefined {
    return _(dataSources)
        .map(ds => ("type" in ds && ds.type === type ? (ds as Extract<DataSourceValue, { type: Type }>) : null))
        .compact()
        .first();
}

function getStyleSource(section: StyleSource["section"], sheet: string, ref: string): StyleSource {
    return {
        section,
        source: { type: "range", sheet, ref },
    };
}

function toInt(s: string): number {
    const n = parseInt(s);
    return Number.isNaN(n) ? 0 : n;
}

function toOptionalInt(s: string): number | undefined {
    const n = parseInt(s);
    return Number.isNaN(n) ? undefined : n;
}

function getErrorsByDefinition(fieldsByType: (keyof TemplateView)[], view: TemplateView, translations: Translations) {
    return _.flatMap(fieldsByType, field => {
        const value = view[field];
        const { validations } = viewDefs[field];
        const fieldT = translations[field];
        const msg = i18n.t("Value for field '{{field}}' is invalid - {{value}}", {
            field: fieldT,
            value: String(value),
        });

        return _(validations)
            .map((validation): string | null => {
                switch (validation) {
                    case "column":
                        return value?.toString().match(/^[A-Z]+$/) ? null : msg;
                    case "row":
                        return value?.toString().match(/^\d+$/) ? null : msg;
                    case "range":
                        return value?.toString().match(/^[A-Z]+\d+:[A-Z]+\d+$/) ? null : msg;
                    case "cell":
                        return value?.toString().match(/^[A-Z]+\d+$/) ? null : msg;
                    default:
                        return assertUnreachable(validation);
                }
            })
            .compact()
            .value();
    });
}
