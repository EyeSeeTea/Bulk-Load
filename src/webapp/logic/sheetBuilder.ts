//@ts-ignore
import * as Excel from "excel4node";
import _ from "lodash";
import "lodash.product";
import { Moment } from "moment";
import { GeneratedTemplate } from "../../domain/entities/Template";
import { Theme } from "../../domain/entities/Theme";
import i18n from "../../locales";
import { defaultColorScale } from "../utils/colors";
import { buildAllPossiblePeriods } from "../utils/periods";
import Settings from "./settings";
import { getObjectVersion } from "./utils";

export const dataSetId = "DATASET_GENERATED_v2";
export const programId = "PROGRAM_GENERATED_v4";
export const trackerProgramId = "TRACKER_PROGRAM_GENERATED_v2";

const teiSheetName = "TEI Instances";

const maxRow = 1048576;

// Excel shows all empty rows, limit the maximum number of TEIs
const maxTeiRows = 1024;

export interface SheetBuilderParams {
    element: any;
    metadata: any;
    elementMetadata: Map<any, any>;
    organisationUnits: {
        id: string;
        displayName: string;
        translations: any;
    }[];
    rawMetadata: any;
    startDate?: Moment;
    endDate?: Moment;
    language: string;
    theme?: Theme;
    template: GeneratedTemplate;
    settings: Settings;
}

export class SheetBuilder {
    private workbook: any;
    private validations: any;

    private instancesSheet: any;
    private programStageSheets: any;
    private relationshipsSheets: any;
    private dataEntrySheet: any;
    private legendSheet: any;
    private validationSheet: any;
    private metadataSheet: any;

    private instancesSheetValuesRow = 0;

    constructor(private builder: SheetBuilderParams) {
        this.workbook = new Excel.Workbook();
        this.validations = new Map();
    }

    public generate() {
        const { builder } = this;
        const { element } = builder;

        if (isTrackerProgram(element)) {
            const { elementMetadata: metadata } = builder;
            this.instancesSheet = this.workbook.addWorksheet(teiSheetName);
            this.programStageSheets = {};
            this.relationshipsSheets = [];

            // ProgramStage sheets
            const programStages = this.getProgramStages().map(programStageT => metadata.get(programStageT.id));

            withSheetNames(programStages).forEach((programStage: any) => {
                const sheet = this.workbook.addWorksheet(programStage.sheetName);
                this.programStageSheets[programStage.id] = sheet;
            });

            // RelationshipType sheets
            withSheetNames(builder.metadata.relationshipTypes, { prefix: "Rel" }).forEach((relationshipType: any) => {
                const sheet = this.workbook.addWorksheet(relationshipType.sheetName);
                this.relationshipsSheets.push([relationshipType, sheet]);
            });
        } else {
            this.dataEntrySheet = this.workbook.addWorksheet("Data Entry");
        }

        this.legendSheet = this.workbook.addWorksheet("Legend", protectedSheet);
        this.validationSheet = this.workbook.addWorksheet("Validation", protectedSheet);
        this.metadataSheet = this.workbook.addWorksheet("Metadata", protectedSheet);

        this.fillValidationSheet();
        this.fillMetadataSheet();
        this.fillLegendSheet();

        if (isTrackerProgram(element)) {
            this.fillInstancesSheet();
            this.fillProgramStageSheets();
            this.fillRelationshipSheets();
        } else {
            this.fillDataEntrySheet();
        }

        return this.workbook;
    }

    private fillRelationshipSheets() {
        const { element: program } = this.builder;

        _.forEach(this.relationshipsSheets, ([relationshipType, sheet]) => {
            sheet.cell(1, 1).formula(`=_${relationshipType.id}`).style(baseStyle);

            ["from", "to"].forEach((key, idx) => {
                const constraint = relationshipType.constraints[key];
                const columnId = idx + 1;

                const oppositeConstraint = relationshipType.constraints[key === "from" ? "to" : "from"];
                const isFromEvent = oppositeConstraint.type === "eventInProgram";

                switch (constraint.type) {
                    case "tei": {
                        const validation =
                            isFromEvent || constraint.program?.id === program.id
                                ? this.getTeiIdValidation()
                                : this.validations.get(getRelationshipTypeKey(relationshipType, key));
                        const columnName = `${_.startCase(key)} TEI (${constraint.name})`;
                        this.createColumn(sheet, 2, columnId, columnName, null, validation);
                        sheet.column(columnId).setWidth(columnName.length + 10);
                        break;
                    }
                    case "eventInProgram": {
                        const validation = this.validations.get(getRelationshipTypeKey(relationshipType, key));
                        const columnName =
                            `${_.startCase(key)} event in program ${constraint.program.name}` +
                            (constraint.programStage ? ` (${constraint.programStage.name})` : "");
                        this.createColumn(sheet, 2, columnId, columnName, null, validation);
                        sheet.column(columnId).setWidth(columnName.length + 10);
                        break;
                    }
                    default:
                        throw new Error(`Unsupported constraint: ${constraint.type}`);
                }
            });
        });
    }

    private fillProgramStageSheets() {
        const { elementMetadata: metadata, element: program, settings } = this.builder;

        _.forEach(this.programStageSheets, (sheet, programStageId) => {
            const programStageT = { id: programStageId };
            const programStage = metadata.get(programStageId);
            const settingsFilter = settings.programStageFilter[programStage.id];

            const rowOffset = 0;
            const sectionRow = rowOffset + 1;
            const itemRow = rowOffset + 2;

            // Freeze and format column titles
            sheet.row(itemRow).freeze();
            sheet.row(sectionRow).setHeight(30);
            sheet.row(itemRow).setHeight(50);

            sheet.cell(sectionRow, 1).formula(`=_${programStageId}`).style(baseStyle);

            // Add column titles
            let columnId = 1;
            let groupId = 0;

            this.createColumn(sheet, itemRow, columnId++, "Event id");

            this.createColumn(sheet, itemRow, columnId++, "TEI Id", null, this.getTeiIdValidation());

            const { code: attributeCode } = metadata.get(program.categoryCombo?.id);
            const optionsTitle = attributeCode !== "default" ? `_${program.categoryCombo.id}` : "Options";

            this.createColumn(sheet, itemRow, columnId++, optionsTitle, null, this.validations.get("options"));

            this.createColumn(sheet, itemRow, columnId++, `${programStage.executionDateLabel ?? "Date"} *`);

            // Include attribute look-up from TEI Instances sheet
            _.forEach(settingsFilter?.attributesIncluded, ({ id: attributeId }) => {
                const attribute = metadata.get(attributeId);
                if (!attribute) return;

                this.createColumn(sheet, itemRow, columnId, `_${attribute.id}`);

                const colName = Excel.getExcelAlpha(columnId);
                const lookupFormula = `IFERROR(INDEX('${teiSheetName}'!$A$5:$ZZ$${maxTeiRows},MATCH(INDIRECT("B" & ROW()),'${teiSheetName}'!$A$5:$A$${maxTeiRows},0),MATCH(${colName}$${itemRow},'${teiSheetName}'!$A$5:$ZZ$5,0)),"")`;

                sheet.cell(itemRow + 1, columnId, maxTeiRows, columnId).formula(lookupFormula);

                sheet.addDataValidation({
                    type: "textLength",
                    error: "This cell cannot be changed",
                    sqref: `${colName}${itemRow + 1}:${colName}${maxRow}`,
                    operator: "equal",
                    formulas: [`${lookupFormula.length}`],
                });

                columnId++;
            });

            if (programStage.programStageSections.length === 0) {
                programStage.programStageSections.push({
                    dataElements: programStage.programStageDataElements.map((e: any) => e.dataElement),
                    id: programStageT.id,
                });
            }

            _.forEach(programStage.programStageSections, programStageSectionT => {
                const programStageSection = programStageSectionT.dataElements
                    ? programStageSectionT
                    : metadata.get(programStageSectionT.id);
                const firstColumnId = columnId;

                _.forEach(programStageSection.dataElements, dataElementT => {
                    const dataElement = metadata.get(dataElementT.id);
                    if (!dataElement) {
                        console.error(`Data element not found ${dataElementT.id}`);
                        return;
                    }

                    const dataElementsExcluded = settingsFilter?.dataElementsExcluded ?? [];
                    const isColumnExcluded = _.some(dataElementsExcluded, dataElementExcluded =>
                        _.isEqual(dataElementExcluded, { id: dataElement.id })
                    );
                    if (isColumnExcluded) return;

                    const { name, description } = this.translate(dataElement);

                    const validation = dataElement.optionSet ? dataElement.optionSet.id : dataElement.valueType;
                    this.createColumn(
                        sheet,
                        itemRow,
                        columnId,
                        `_${dataElement.id}`,
                        groupId,
                        this.validations.get(validation)
                    );
                    sheet.column(columnId).setWidth(name.length / 2.5 + 10);

                    if (dataElement.url !== undefined) {
                        sheet.cell(itemRow, columnId).link(dataElement.url).formula(`=_${dataElement.id}`);
                    }

                    if (description !== undefined) {
                        sheet.cell(itemRow, columnId).comment(description, {
                            height: "100pt",
                            width: "160pt",
                        });
                    }

                    columnId++;
                });

                const noColumnAdded = columnId === firstColumnId;
                if (noColumnAdded) return;

                if (firstColumnId < columnId)
                    sheet
                        .cell(sectionRow, firstColumnId, sectionRow, columnId - 1, true)
                        .formula(`_${programStageSection.id}`)
                        .style(this.groupStyle(groupId));

                groupId++;
            });
        });
    }

    private fillInstancesSheet() {
        const { element: program } = this.builder;
        const { rowOffset = 0 } = this.builder.template;
        const sheet = this.instancesSheet;

        // Add cells for themes
        const sectionRow = rowOffset + 1;
        const itemRow = rowOffset + 2;

        // Hide theme rows by default
        for (let row = 1; row < sectionRow; row++) {
            sheet.row(row).hide();
        }

        // Freeze and format column titles
        sheet.row(itemRow).freeze();
        sheet.row(sectionRow).setHeight(30);
        sheet.row(itemRow).setHeight(50);

        // Add template version
        sheet.cell(1, 1).string(`Version: ${this.getVersion()}`).style(baseStyle);

        this.createColumn(sheet, itemRow, 1, "TEI id");

        this.createColumn(
            sheet,
            itemRow,
            2,
            "Org Unit *",
            null,
            this.validations.get("organisationUnits"),
            "This site does not exist in DHIS2, please talk to your administrator to create this site before uploading data"
        );

        this.createColumn(sheet, itemRow, 3, (program.enrollmentDateLabel || "Enrollment Date") + " *");

        this.createColumn(sheet, itemRow, 4, program.incidentDateLabel || "Incident Date");

        const programAttributes = program.programTrackedEntityAttributes || [];
        this.instancesSheetValuesRow = itemRow + 1;

        let idx = 0;
        programAttributes.forEach((attribute: any) => {
            const tea = attribute.trackedEntityAttribute;
            if (tea.confidential) return;
            const validationId = tea.optionSet ? tea.optionSet.id : tea.valueType;
            const validation = this.validations.get(validationId);
            this.createColumn(sheet, itemRow, 5 + idx, `_${tea.id}`, 1, validation);
            idx++;
        });
    }

    private fillLegendSheet() {
        const { elementMetadata: metadata, rawMetadata } = this.builder;
        const legendSheet = this.legendSheet;

        // Freeze and format column titles
        legendSheet.row(2).freeze();
        legendSheet.column(1).setWidth(50);
        legendSheet.column(2).setWidth(50);
        legendSheet.column(3).setWidth(20);
        legendSheet.column(4).setWidth(20);
        legendSheet.column(5).setWidth(40);

        // Add column titles
        legendSheet.cell(1, 1, 2, 1, true).string("Name").style(baseStyle);
        legendSheet.cell(1, 2, 2, 2, true).string("Description").style(baseStyle);
        legendSheet.cell(1, 3, 2, 3, true).string("Value Type").style(baseStyle);
        legendSheet.cell(1, 4, 2, 4, true).string("Option Set").style(baseStyle);
        legendSheet.cell(1, 5, 2, 5, true).string("Possible Values").style(baseStyle);

        let rowId = 3;
        _.sortBy(rawMetadata["dataElements"], ["name"]).forEach(item => {
            const { name, description } = this.translate(item);
            const optionSet = metadata.get(item.optionSet?.id);
            const { name: optionSetName } = this.translate(optionSet);
            const options = optionSet?.options
                ?.map(({ id }: any) => metadata.get(id))
                .map((option: any) => this.translate(option).name)
                .join(", ");

            legendSheet.cell(rowId, 1).string(name ?? "");
            legendSheet.cell(rowId, 2).string(description ?? "");
            legendSheet.cell(rowId, 3).string(item?.valueType ?? "");
            legendSheet.cell(rowId, 4).string(optionSetName ?? "");
            legendSheet.cell(rowId, 5).string(options ?? "");

            rowId++;
        });
    }

    private fillValidationSheet() {
        const { organisationUnits, element, metadata, rawMetadata, elementMetadata, startDate, endDate } = this.builder;
        const validationSheet = this.validationSheet;

        // Freeze and format column titles
        validationSheet.row(2).freeze();

        // Add column titles
        let rowId = 2;
        let columnId = 1;
        validationSheet.cell(rowId++, columnId).string("Organisation Units");
        _.forEach(organisationUnits, orgUnit => {
            validationSheet.cell(rowId++, columnId).formula(`_${orgUnit.id}`);
        });
        this.validations.set(
            "organisationUnits",
            `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
        );

        if (element.type === "dataSets") {
            rowId = 2;
            columnId++;
            validationSheet.cell(rowId++, columnId).string("Periods");
            buildAllPossiblePeriods(element.periodType, startDate, endDate).forEach((period: any) => {
                if (isNaN(period)) {
                    validationSheet.cell(rowId++, columnId).string(period);
                } else {
                    validationSheet.cell(rowId++, columnId).number(Number(period));
                }
            });
            this.validations.set(
                "periods",
                `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
            );
        }

        if (isTrackerProgram(element)) {
            rowId = 2;
            columnId++;
            validationSheet.cell(rowId++, columnId).string("Relationship Types");
            _.forEach(metadata.relationshipTypes, relationshipType => {
                validationSheet.cell(rowId++, columnId).formula(`_${relationshipType.id}`);
            });
            this.validations.set(
                "relationshipTypes",
                `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
            );

            _.forEach(metadata.relationshipTypes, relationshipType => {
                ["from", "to"].forEach(key => {
                    rowId = 2;
                    columnId++;
                    validationSheet
                        .cell(rowId++, columnId)
                        .string(`Relationship Type ${relationshipType.name} (${key})`);
                    const constraint = relationshipType.constraints[key];

                    switch (constraint.type) {
                        case "tei": {
                            constraint.teis.forEach((tei: any) => {
                                validationSheet.cell(rowId++, columnId).string(tei.id);
                            });

                            const value = `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(
                                columnId
                            )}$${rowId}`;
                            this.validations.set(getRelationshipTypeKey(relationshipType, key), value);
                            break;
                        }
                        case "eventInProgram": {
                            constraint.events.forEach((event: any) => {
                                validationSheet.cell(rowId++, columnId).string(event.id);
                            });

                            const value = `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(
                                columnId
                            )}$${rowId}`;
                            this.validations.set(getRelationshipTypeKey(relationshipType, key), value);
                            break;
                        }
                        default:
                            throw new Error(`Unsupported constraint: ${constraint.type}`);
                    }
                });
            });
        }

        rowId = 2;
        columnId++;
        validationSheet.cell(rowId++, columnId).string("Options");
        const dataSetOptionComboId = element.categoryCombo.id;
        elementMetadata.forEach(e => {
            if (e.type === "categoryOptionCombos" && e.categoryCombo.id === dataSetOptionComboId) {
                validationSheet.cell(rowId++, columnId).formula(`_${e.id}`);
            }
        });
        this.validations.set(
            "options",
            `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
        );

        const programAttributes = element.programTrackedEntityAttributes || [];
        const programOptionSets = _(programAttributes)
            .map(pa => pa.trackedEntityAttribute?.optionSet)
            .compact()
            .value();

        const optionSets = _.concat(programOptionSets, _.toArray(rawMetadata.optionSets));

        _.forEach(optionSets, optionSet => {
            rowId = 2;
            columnId++;

            validationSheet.cell(rowId++, columnId).formula(`_${optionSet.id}`);
            _.forEach(optionSet.options, option => {
                validationSheet.cell(rowId++, columnId).formula(`_${option.id}`);
            });
            this.validations.set(
                optionSet.id,
                `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
            );
        });

        rowId = 2;
        columnId++;
        validationSheet.cell(rowId++, columnId).string("Boolean");
        validationSheet.cell(rowId++, columnId).formula("_true");
        validationSheet.cell(rowId++, columnId).formula("_false");
        this.validations.set(
            "BOOLEAN",
            `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
        );

        rowId = 2;
        columnId++;
        validationSheet.cell(rowId++, columnId).string("True only");
        validationSheet.cell(rowId++, columnId).formula("_true");
        this.validations.set(
            "TRUE_ONLY",
            `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
        );

        // Add program title
        validationSheet.cell(1, 1, 1, columnId, true).formula(`_${element.id}`).style(baseStyle);
    }

    private fillMetadataSheet() {
        const { elementMetadata: metadata, organisationUnits } = this.builder;
        const metadataSheet = this.metadataSheet;

        // Freeze and format column titles
        metadataSheet.row(2).freeze();
        metadataSheet.column(1).setWidth(30);
        metadataSheet.column(2).setWidth(30);
        metadataSheet.column(3).setWidth(70);

        // Add column titles
        metadataSheet.cell(1, 1, 2, 1, true).string("Identifier").style(baseStyle);
        metadataSheet.cell(1, 2, 2, 2, true).string("Type").style(baseStyle);
        metadataSheet.cell(1, 3, 2, 3, true).string("Name").style(baseStyle);
        metadataSheet.cell(1, 4, 2, 4, true).string("Value Type").style(baseStyle);
        metadataSheet.cell(1, 5, 2, 5, true).string("Option Set").style(baseStyle);
        metadataSheet.cell(1, 6, 2, 6, true).string("Possible Values").style(baseStyle);

        let rowId = 3;
        metadata.forEach(item => {
            const { name } = this.translate(item);
            const optionSet = metadata.get(item.optionSet?.id);
            const { name: optionSetName } = this.translate(optionSet);
            const options = optionSet?.options
                ?.map(({ id }: any) => metadata.get(id))
                .map((option: any) => this.translate(option).name)
                .join(", ");
            const isCompulsory = this.isMetadataItemCompulsory(item);

            metadataSheet.cell(rowId, 1).string(item.id ?? "");
            metadataSheet.cell(rowId, 2).string(item.type ?? "");
            metadataSheet.cell(rowId, 3).string(name?.concat(isCompulsory ? " *" : "") ?? "");
            metadataSheet.cell(rowId, 4).string(item.valueType ?? "");
            metadataSheet.cell(rowId, 5).string(optionSetName ?? "");
            metadataSheet.cell(rowId, 6).string(options ?? "");

            if (name !== undefined) {
                this.workbook.definedNameCollection.addDefinedName({
                    refFormula: `'Metadata'!$${Excel.getExcelAlpha(3)}$${rowId}`,
                    name: `_${item.id}`,
                });
            }

            rowId++;
        });

        organisationUnits.forEach(orgUnit => {
            const { name } = this.translate(orgUnit);
            metadataSheet.cell(rowId, 1).string(orgUnit.id !== undefined ? orgUnit.id : "");
            metadataSheet.cell(rowId, 2).string("organisationUnit");
            metadataSheet.cell(rowId, 3).string(name ?? "");

            if (name !== undefined)
                this.workbook.definedNameCollection.addDefinedName({
                    refFormula: `'Metadata'!$${Excel.getExcelAlpha(3)}$${rowId}`,
                    name: `_${orgUnit.id}`,
                });

            rowId++;
        });

        const { relationshipTypes } = this.builder.metadata;

        if (relationshipTypes) {
            relationshipTypes.forEach((relationshipType: any) => {
                metadataSheet.cell(rowId, 1).string(relationshipType.id);
                metadataSheet.cell(rowId, 2).string("relationshipType");
                metadataSheet.cell(rowId, 3).string(relationshipType.name);
                this.workbook.definedNameCollection.addDefinedName({
                    refFormula: `'Metadata'!$${Excel.getExcelAlpha(3)}$${rowId}`,
                    name: `_${relationshipType.id}`,
                });
                rowId++;
            });
        }

        metadataSheet.cell(rowId, 1).string("true");
        metadataSheet.cell(rowId, 2).string("boolean");
        metadataSheet.cell(rowId, 3).string("Yes");
        this.workbook.definedNameCollection.addDefinedName({
            refFormula: `'Metadata'!$${Excel.getExcelAlpha(3)}$${rowId}`,
            name: "_true",
        });
        rowId++;

        metadataSheet.cell(rowId, 1).string("false");
        metadataSheet.cell(rowId, 2).string("boolean");
        metadataSheet.cell(rowId, 3).string("No");
        this.workbook.definedNameCollection.addDefinedName({
            refFormula: `'Metadata'!$${Excel.getExcelAlpha(3)}$${rowId}`,
            name: "_false",
        });
        rowId++;
    }

    private isMetadataItemCompulsory(item: any) {
        const { rawMetadata, element } = this.builder;

        const isProgramStageDataElementCompulsory = _.some(
            rawMetadata.programStageDataElements,
            ({ dataElement, compulsory }) => dataElement?.id === item.id && compulsory
        );

        const isTeiAttributeCompulsory = _.some(
            rawMetadata.programTrackedEntityAttributes,
            ({ trackedEntityAttribute, mandatory }) => trackedEntityAttribute?.id === item.id && mandatory
        );

        const isProgram = element.type === "programs" || isTrackerProgram(element);
        const isCategoryComboForProgram = isProgram && item.type === "categoryCombos";

        return isProgramStageDataElementCompulsory || isTeiAttributeCompulsory || isCategoryComboForProgram;
    }

    private getVersion() {
        const { element } = this.builder;
        const { id: defaultVersion } = getTemplateId(element.type, element.id);
        return getObjectVersion(element) ?? defaultVersion;
    }

    private fillDataEntrySheet() {
        const { element, elementMetadata: metadata, settings } = this.builder;
        const { rowOffset = 0 } = this.builder.template;
        const dataEntrySheet = this.dataEntrySheet;

        // Add cells for themes
        const sectionRow = rowOffset + 1;
        const itemRow = rowOffset + 2;

        // Hide theme rows by default
        for (let row = 1; row < sectionRow; row++) {
            dataEntrySheet.row(row).hide();
        }

        // Freeze and format column titles
        dataEntrySheet.row(itemRow).freeze();
        dataEntrySheet.row(sectionRow).setHeight(30);
        dataEntrySheet.row(itemRow).setHeight(50);

        // Add template version
        dataEntrySheet.cell(1, 1).string(`Version: ${this.getVersion()}`).style(baseStyle);

        // Add column titles
        let columnId = 1;
        let groupId = 0;

        if (element.type === "programs") {
            this.createColumn(dataEntrySheet, itemRow, columnId++, "Event id");
        }

        this.createColumn(
            dataEntrySheet,
            itemRow,
            columnId++,
            "Org Unit *",
            null,
            this.validations.get("organisationUnits"),
            "This site does not exist in DHIS2, please talk to your administrator to create this site before uploading data"
        );

        if (element.type === "programs") {
            this.createColumn(dataEntrySheet, itemRow, columnId++, i18n.t("Latitude", { lng: this.builder.language }));
            this.createColumn(dataEntrySheet, itemRow, columnId++, "Longitude");
        } else if (element.type === "dataSets") {
            this.createColumn(dataEntrySheet, itemRow, columnId++, "Period", null, this.validations.get("periods"));
        }

        const { code: attributeCode } = metadata.get(element.categoryCombo?.id);
        const optionsTitle = attributeCode !== "default" ? `_${element.categoryCombo.id}` : "Options";

        this.createColumn(dataEntrySheet, itemRow, columnId++, optionsTitle, null, this.validations.get("options"));

        // Add dataSet or program title
        dataEntrySheet
            .cell(sectionRow, 1, sectionRow, columnId - 1, true)
            .formula(`_${element.id}`)
            .style({ ...baseStyle, font: { size: 16, bold: true } });

        if (element.type === "dataSets") {
            const dataSet = element;
            const dataElements = getDataSetDataElements(dataSet, metadata);
            const dataElementsExclusion = settings.dataSetDataElementsFilter;

            _.forEach(dataElements, ({ dataElement, categoryOptionCombos }) => {
                const { name, description } = this.translate(dataElement);
                const firstColumnId = columnId;

                _.forEach(categoryOptionCombos, categoryOptionCombo => {
                    const dataElementsExcluded = _.get(dataElementsExclusion, dataSet.id, []);
                    const isColumnExcluded = _.some(dataElementsExcluded, dataElementExcluded =>
                        _.isEqual(dataElementExcluded, {
                            id: dataElement.id,
                            categoryOptionComboId: categoryOptionCombo.id,
                        })
                    );
                    if (isColumnExcluded) return;

                    const validation = dataElement.optionSet ? dataElement.optionSet.id : dataElement.valueType;
                    this.createColumn(
                        dataEntrySheet,
                        itemRow,
                        columnId,
                        `_${categoryOptionCombo.id}`,
                        groupId,
                        this.validations.get(validation),
                        undefined,
                        categoryOptionCombo.code === "default"
                    );

                    columnId++;
                });

                const noColumnAdded = columnId === firstColumnId;
                if (noColumnAdded) return;

                if (columnId - 1 === firstColumnId) {
                    dataEntrySheet.column(firstColumnId).setWidth(name.length / 2.5 + 15);
                }

                dataEntrySheet
                    .cell(sectionRow, firstColumnId, sectionRow, columnId - 1, true)
                    .formula(`_${dataElement.id}`)
                    .style(this.groupStyle(groupId));

                if (dataElement.url !== undefined) {
                    dataEntrySheet
                        .cell(sectionRow, firstColumnId, sectionRow, columnId - 1, true)
                        .link(dataElement.url)
                        .formula(`=_${dataElement.id}`);
                }

                if (description !== undefined) {
                    dataEntrySheet
                        .cell(sectionRow, firstColumnId, sectionRow, columnId - 1, true)
                        .comment(description, {
                            height: "100pt",
                            width: "160pt",
                        });
                }

                groupId++;
            });
        } else {
            _.forEach(this.getProgramStages(), programStageT => {
                const programStage = metadata.get(programStageT.id);

                this.createColumn(
                    dataEntrySheet,
                    itemRow,
                    columnId++,
                    `${programStage.executionDateLabel ?? "Date"} *`
                );

                if (programStage.programStageSections.length === 0) {
                    programStage.programStageSections.push({
                        dataElements: programStage.programStageDataElements.map((e: any) => e.dataElement),
                        id: programStageT.id,
                    });
                }

                _.forEach(programStage.programStageSections, programStageSectionT => {
                    const programStageSection = programStageSectionT.dataElements
                        ? programStageSectionT
                        : metadata.get(programStageSectionT.id);
                    const firstColumnId = columnId;

                    _.forEach(programStageSection.dataElements, dataElementT => {
                        const dataElement = metadata.get(dataElementT.id);
                        if (!dataElement) {
                            console.error(`Data element not found ${dataElementT.id}`);
                            return;
                        }

                        const filter = settings.programStageFilter[programStage.id];
                        const dataElementsExcluded = filter?.dataElementsExcluded ?? [];
                        const isColumnExcluded = _.some(dataElementsExcluded, dataElementExcluded =>
                            _.isEqual(dataElementExcluded, { id: dataElement.id })
                        );
                        if (isColumnExcluded) return;

                        const { name, description } = this.translate(dataElement);

                        const validation = dataElement.optionSet ? dataElement.optionSet.id : dataElement.valueType;
                        this.createColumn(
                            dataEntrySheet,
                            itemRow,
                            columnId,
                            `_${dataElement.id}`,
                            groupId,
                            this.validations.get(validation)
                        );
                        dataEntrySheet.column(columnId).setWidth(name.length / 2.5 + 10);

                        if (dataElement.url !== undefined) {
                            dataEntrySheet.cell(itemRow, columnId).link(dataElement.url).formula(`=_${dataElement.id}`);
                        }

                        if (description !== undefined) {
                            dataEntrySheet.cell(itemRow, columnId).comment(description, {
                                height: "100pt",
                                width: "160pt",
                            });
                        }

                        columnId++;
                    });

                    const noColumnAdded = columnId === firstColumnId;
                    if (noColumnAdded) return;

                    if (firstColumnId < columnId)
                        dataEntrySheet
                            .cell(sectionRow, firstColumnId, sectionRow, columnId - 1, true)
                            .formula(`_${programStageSection.id}`)
                            .style(this.groupStyle(groupId));

                    groupId++;
                });
            });
        }
    }

    // Return only program stages for which the current user has permissions to export/import data.
    private getProgramStages() {
        const { element } = this.builder;

        return _(element.programStages)
            .filter(({ access }) => access?.read && access?.data?.read && access?.data?.write)
            .value();
    }

    private translate(item: any) {
        const { elementMetadata, language } = this.builder;
        const translations = item?.translations?.filter(({ locale }: any) => locale === language) ?? [];

        const { value: formName } = translations.find(({ property }: any) => property === "FORM_NAME") ?? {};
        const { value: regularName } = translations.find(({ property }: any) => property === "NAME") ?? {};
        const { value: shortName } = translations.find(({ property }: any) => property === "SHORT_NAME") ?? {};

        const defaultName = item?.displayName ?? item?.formName ?? item?.name;
        const name = formName ?? regularName ?? shortName ?? defaultName;

        const { value: description = item?.description } =
            translations.find(({ property }: any) => property === "DESCRIPTION") ?? {};

        if (item?.type === "categoryOptionCombos" && name === defaultName) {
            const options = item?.categoryOptions?.map(({ id }: any) => {
                const element = elementMetadata.get(id);
                const { name } = this.translate(element);
                return name;
            });

            return { name: options.join(", "), description };
        } else {
            return { name, description };
        }
    }

    private createColumn(
        sheet: any,
        rowId: any,
        columnId: any,
        label: any,
        groupId: any = null,
        validation: any = null,
        validationMessage = "Invalid choice was chosen",
        defaultLabel = false
    ) {
        sheet.column(columnId).setWidth(20);
        const cell = sheet.cell(rowId, columnId);

        if (!defaultLabel) cell.style(groupId !== null ? this.groupStyle(groupId) : baseStyle);
        else {
            cell.style(groupId !== null ? this.groupStyle(groupId) : baseStyle).style(
                this.transparentFontStyle(groupId)
            );
        }

        if (label.startsWith("_")) cell.formula(label);
        else cell.string(label);

        sheet.addDataValidation({
            type: "custom",
            error: "This cell cannot be changed",
            sqref: `${Excel.getExcelAlpha(columnId)}${rowId}`,
            formulas: [`${Excel.getExcelAlpha(columnId)}${rowId} <> ${label}`],
        });

        if (validation !== null) {
            const ref = `${Excel.getExcelAlpha(columnId)}${rowId + 1}:${Excel.getExcelAlpha(columnId)}${maxRow}`;
            sheet.addDataValidation({
                type: "list",
                allowBlank: true,
                error: validationMessage,
                errorStyle: "warning",
                showDropDown: true,
                sqref: ref,
                formulas: [validation.toString()],
            });

            sheet.addConditionalFormattingRule(ref, {
                type: "expression", // the conditional formatting type
                priority: 1, // rule priority order (required)
                formula: `ISERROR(MATCH(${Excel.getExcelAlpha(columnId)}${rowId + 1},${validation
                    .toString()
                    .substr(1)},0))`, // formula that returns nonzero or 0
                style: this.workbook.createStyle({
                    font: {
                        bold: true,
                        color: "FF0000",
                    },
                }), // a style object containing styles to apply
            });
        }
    }

    private transparentFontStyle(groupId: number) {
        const { palette = defaultColorScale } = this.builder.theme ?? {};

        return {
            font: {
                color: palette[groupId % palette.length],
            },
        };
    }

    private groupStyle(groupId: number) {
        const { palette = defaultColorScale } = this.builder.theme ?? {};
        return {
            ...baseStyle,
            fill: {
                type: "pattern",
                patternType: "solid",
                fgColor: palette[groupId % palette.length],
            },
        };
    }

    private getTeiIdValidation() {
        return `='${teiSheetName}'!$A$${this.instancesSheetValuesRow}:$A$${maxTeiRows}`;
    }
}

function getCategoryComboIdByDataElementId(dataSet: any, metadata: any) {
    return _(dataSet.dataSetElements)
        .map(dse => {
            const dataElement = metadata.get(dse.dataElement.id);
            const disaggregationId = dse.categoryCombo ? dse.categoryCombo.id : dataElement.categoryCombo.id;
            return [dataElement.id, disaggregationId];
        })
        .fromPairs()
        .value();
}

function getDataElementsForSectionDataSet(dataSet: any, metadata: any, cocsByCatComboId: any) {
    const categoryComboIdByDataElementId = getCategoryComboIdByDataElementId(dataSet, metadata);

    const dataElementsInSections = _(dataSet.sections)
        .sortBy(section => section.sortOrder)
        .flatMap(section => section.dataElements)
        .value();

    const dataElementsOutsideSections = _(dataSet.dataSetElements)
        .map(dse => dse.dataElement)
        .differenceBy(dataElementsInSections, "id")
        .value();

    const allDataElements = _.concat(dataElementsInSections, dataElementsOutsideSections);

    return _(allDataElements)
        .map(dataElement => metadata.get(dataElement.id))
        .compact()
        .groupBy(dataElement => categoryComboIdByDataElementId[dataElement.id])
        .toPairs()
        .flatMap(([categoryComboId, dataElements]) => {
            return dataElements.map(dataElement => ({
                dataElement,
                categoryOptionCombos: cocsByCatComboId[categoryComboId] || [],
            }));
        })
        .value();
}

function getDataElementsForDefaultDataSet(dataSet: any, metadata: any, cocsByCatComboId: any) {
    const categoryComboIdByDataElementId = getCategoryComboIdByDataElementId(dataSet, metadata);

    return (
        _(cocsByCatComboId)
            .toPairs()
            // Mimic loadForm.action: sort category combos by cocs length.
            .sortBy(([_ccId, categoryOptionCombos]) => categoryOptionCombos.length)
            .flatMap(([categoryComboId, categoryOptionCombos]) => {
                // Mimic loadForm.action: sort data elements (within a category combo) by name.
                return _(dataSet.dataSetElements)
                    .map(dse => metadata.get(dse.dataElement.id))
                    .compact()
                    .filter(de => categoryComboIdByDataElementId[de.id] === categoryComboId)
                    .sortBy(dataElement => dataElement.name)
                    .map(dataElement => ({ dataElement, categoryOptionCombos }))
                    .value();
            })
            .value()
    );
}

/* Return a unique key for a set of categoryOptions */
function getOptionsKey(categoryOptions: any) {
    return _.sortBy(categoryOptions.map((co: any) => co.id)).join("-");
}

/*
Get an object with category combo IDs as keys and their related category option combos as values.

Note that we cannot simply use categoryCombo.categoryOptionCombos as it contains an unsorted
set of category option combos. Instead, use the cartesian product of category.categoryOptions
for each category in the category combo, which yields a sorted collection.
*/

function getCocsByCategoryComboId(metadata: any) {
    const objsByType = _.groupBy(Array.from(metadata.values()), (obj: any) => obj.type);
    const getObjsOfType = (type: any) => objsByType[type] || [];
    const categoryOptionCombos = getObjsOfType("categoryOptionCombos");
    const unsortedCocsByCatComboId = _.groupBy(categoryOptionCombos, (coc: any) => coc.categoryCombo.id);
    const categoryById: any = _.keyBy(getObjsOfType("categories"), (category: any) => category.id);
    const cocsByKey = _.groupBy(categoryOptionCombos, (coc: any) => getOptionsKey(coc.categoryOptions));

    const cocsByCategoryPairs = getObjsOfType("categoryCombos").map((categoryCombo: any) => {
        const unsortedCocsForCategoryCombo = unsortedCocsByCatComboId[categoryCombo.id] || [];
        const categoryOptionsList = categoryCombo.categories.map(
            (category: any) => categoryById[category.id]?.categoryOptions || []
        );
        // @ts-ignore Polyfilled
        const categoryOptionsProduct = _.product(...categoryOptionsList);
        const cocsForCategoryCombo = _(categoryOptionsProduct)
            .map(getOptionsKey)
            .map(optionsKey =>
                _(cocsByKey[optionsKey] || [])
                    .intersectionBy(unsortedCocsForCategoryCombo, "id")
                    .first()
            )
            .compact()
            .value();
        if (cocsForCategoryCombo.length !== categoryOptionsProduct.length)
            console.warn(`Fewer COCs than expected for CC: ${categoryCombo.id}`);
        return [categoryCombo.id, cocsForCategoryCombo];
    });

    return _.fromPairs(cocsByCategoryPairs);
}

function getDataSetDataElements(dataSet: any, metadata: any) {
    const cocsByCategoryComboId = getCocsByCategoryComboId(metadata);
    const useDataSetSections = dataSet.formType === "SECTION" || !_(dataSet.sections).isEmpty();

    if (useDataSetSections) {
        return getDataElementsForSectionDataSet(dataSet, metadata, cocsByCategoryComboId);
    } else {
        // "DEFAULT" | "CUSTOM" | "SECTION_MULTIORG"
        return getDataElementsForDefaultDataSet(dataSet, metadata, cocsByCategoryComboId);
    }
}

/**
 * Common cell style definition
 * @type {{alignment: {horizontal: string, vertical: string, wrapText: boolean, shrinkToFit: boolean}}}
 */
const baseStyle = {
    alignment: {
        horizontal: "center",
        vertical: "center",
        wrapText: true,
        shrinkToFit: true,
    },
    fill: {
        type: "pattern",
        patternType: "solid",
        fgColor: "ffffff",
    },
};

const protectedSheet = {
    sheetProtection: {
        sheet: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        password: "Wiscentd2019!",
    },
};

function isTrackerProgram(element: any) {
    return element.type === "trackerPrograms";
}

export function getTemplateId(type: any, id: any) {
    switch (id) {
        case "Tu81BTLUuCT":
            return { type: "custom", id: "NHWA_MODULE_1_v1" };
        case "m5MiTPdlK17":
            return { type: "custom", id: "NHWA_MODULE_2_v1" };
        case "pZ3XRBi9gYE":
            return { type: "custom", id: "NHWA_MODULE_3_v1" };
        case "HtZb6Cg7TXo":
            return { type: "custom", id: "NHWA_MODULE_4_v1" };
        case "cxfAcMbSZe1":
            return { type: "custom", id: "NHWA_MODULE_5_v1" };
        case "WDyQKfAvY3V":
            return { type: "custom", id: "NHWA_MODULE_6_v1" };
        case "ZRsZdd2AvAR":
            return { type: "custom", id: "NHWA_MODULE_7_v1" };
        case "p5z7F51v1ag":
            return { type: "custom", id: "NHWA_MODULE_8_v1" };
        case "XBgvNrxpcDC":
            return { type: "custom", id: "SNAKEBITE_ANNUAL_REPORT_v1" };
        default:
            switch (type) {
                case "dataSets":
                    return { type: "generated", id: dataSetId };
                case "programs":
                    return { type: "generated", id: programId };
                case "trackerPrograms":
                    return { type: "generated", id: trackerProgramId };
                default:
                    throw new Error("Unsupported type");
            }
    }
}

function getRelationshipTypeKey(relationshipType: any, key: any) {
    return ["relationshipType", relationshipType.id, key].join("-");
}

function getValidSheetName(name: any, maxLength = 31) {
    // Invalid chars: \ / * ? : [ ]
    // Maximum length: 31
    return name.replace(/[\\/*?:[\]]/g, "").slice(0, maxLength);
}

/* Add prop 'sheetName' with a valid sheet name to an array of objects having a string property 'name' */
function withSheetNames(objs: any, options: any = {}) {
    const { prefix } = options;

    return objs.filter(Boolean).map((obj: any, idx: number) => {
        const baseSheetName = _([prefix, `(${idx + 1}) ${obj.name}`])
            .compact()
            .join(" ");

        return {
            ...obj,
            sheetName: getValidSheetName(baseSheetName),
        };
    });
}
