import _ from "lodash";
import "lodash.product";
import { Moment } from "moment";
import { DataFormType } from "../../domain/entities/DataForm";
import { NamedRef, Ref } from "../../domain/entities/ReferenceObject";
import { getDataSources, Template } from "../../domain/entities/Template";
import { Theme } from "../../domain/entities/Theme";
import i18n from "../../utils/i18n";
import { defaultColorScale } from "../utils/colors";
import { buildAllPossiblePeriods } from "../utils/periods";
import Settings from "./settings";
import { getObjectVersion } from "./utils";
import { Sheet, StyleOptions, Workbook } from "./Workbook";
import { Maybe } from "../../types/utils";
import { MetadataService } from "./MetadataService";

export const dataSetId = "DATASET_GENERATED_v2";
export const programId = "PROGRAM_GENERATED_v4";
export const trackerProgramId = "TRACKER_PROGRAM_GENERATED_v3";

const Excel = Workbook;
const teiSheetName = "TEI Instances";

const maxRow = 1048576;

// Excel shows all empty rows, limit the maximum number of TEIs
export const defaultMaxTeiRows = 1024;

const dateFormats: Record<string, string> = {
    DATE: "YYYY-MM-DD",
    TIME: "HH:mm",
    DATETIME: "YYYY-MM-DDTHH:mm",
};

const dateFormatInfo = `\n(${dateFormats["DATE"]})`;

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
    template: Template;
    settings: Settings;
    downloadRelationships: boolean;
    splitDataEntryTabsBySection: boolean;
    useCodesForMetadata: boolean;
    orgUnitShortName: boolean;
    maxTeiRows?: number;
}

export class SheetBuilder {
    private validations: Validations;
    private instancesSheetValuesRow = 0;
    private rowOffset;
    private metadataService: MetadataService;
    private readonly maxTeiRows;

    constructor(private builder: SheetBuilderParams) {
        this.validations = new Map();
        const { template } = this.builder;
        this.rowOffset = template.type === "custom" ? 3 : template.rowOffset;
        this.metadataService = new MetadataService(builder.elementMetadata, (item: TranslatableItem) =>
            this.translate(item)
        );

        this.maxTeiRows = builder.maxTeiRows ?? defaultMaxTeiRows;
    }

    public async generate(): Promise<Workbook> {
        const { builder } = this;
        const { element, rawMetadata, template } = builder;

        const workbook = await (template.type === "custom"
            ? Workbook.fromBase64(template.file.contents)
            : Workbook.empty());

        const useDataSetSections =
            builder.splitDataEntryTabsBySection && (element.formType === "SECTION" || !_(element.sections).isEmpty());

        let instancesSheet: Sheet | undefined = undefined;
        const programStageSheets: Record<string, Sheet> = {};
        const relationshipsSheets: Array<[relationshipType: unknown, sheet: Sheet]> = [];
        const dataEntrySheetsInfo: Array<{ sheet: Sheet; options: { includedDataElementIds?: Set<string> } }> = [];

        if (isTrackerProgram(element)) {
            const { elementMetadata: metadata } = builder;
            instancesSheet = workbook.addWorksheet(teiSheetName);

            // ProgramStage sheets
            const programStages = this.getProgramStagesWithReadPermission().map(programStageT =>
                metadata.get(programStageT.id)
            );

            withSheetNames(programStages).forEach((programStage: any) => {
                const sheet = workbook.addWorksheet(programStage.sheetName);
                programStageSheets[programStage.id] = sheet;
            });

            if (builder.downloadRelationships) {
                // RelationshipType sheets
                withSheetNames(builder.metadata.relationshipTypes, { prefix: "Rel" }).forEach(
                    (relationshipType: any) => {
                        const sheet = workbook.addWorksheet(relationshipType.sheetName);
                        relationshipsSheets.push([relationshipType, sheet]);
                    }
                );
            }
        } else {
            const dataEntryTabName = "Data Entry";

            if (useDataSetSections) {
                const sections = _.orderBy(rawMetadata.sections as Section[], section => section.sortOrder);

                sections.forEach(section => {
                    const tabName = getValidSheetName(`${dataEntryTabName} - ${this.translate(section).name}`);
                    const dataEntrySheet = workbook.addWorksheet(tabName);
                    const includedDataElementIds = new Set(section.dataElements.map(de => de.id));
                    dataEntrySheetsInfo.push({ sheet: dataEntrySheet, options: { includedDataElementIds } });
                });
            } else {
                const dataEntrySheet = workbook.addWorksheet(dataEntryTabName);
                dataEntrySheetsInfo.push({ sheet: dataEntrySheet, options: {} });
            }
        }

        const legendSheet = workbook.addWorksheet("Legend", protectedSheet);
        const validationSheet = workbook.addWorksheet("Validation", protectedSheet);
        const metadataSheet = workbook.addWorksheet("Metadata", protectedSheet);

        this.fillValidationSheet(validationSheet);
        this.fillMetadataSheet(metadataSheet, this.builder.orgUnitShortName || false);
        this.fillLegendSheet(legendSheet);

        if (isTrackerProgram(element)) {
            if (instancesSheet) this.fillInstancesSheet(instancesSheet);
            this.fillProgramStageSheets(programStageSheets);
            this.fillRelationshipSheets(relationshipsSheets);
        } else {
            dataEntrySheetsInfo.forEach(({ sheet, options }) => {
                this.fillDataEntrySheet(sheet, options);
            });
        }

        // Add template version
        workbook.definedNameCollection.addDefinedName({
            name: `Version_${this.getVersion()}`, // Restrict to [a-zA-Z0-9_] characters
            refFormula: "Metadata!A1", // Excel needs a formula, reference an always existing cell
        });

        return workbook;
    }

    private fillRelationshipSheets(relationshipsSheets: Array<[relationshipType: any, sheet: Sheet]>) {
        const { element: program } = this.builder;

        _.forEach(relationshipsSheets, ([relationshipType, sheet]) => {
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

    private fillProgramStageSheets(programStageSheets: Record<Id, Sheet>) {
        const { elementMetadata: metadata, element: program, settings } = this.builder;

        const programStages = this.getProgramStagesWithReadPermission().map(programStageT =>
            metadata.get(programStageT.id)
        );
        const sheets = withSheetNames(programStages);

        _.forEach(programStageSheets, (sheet, programStageId) => {
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

            this.createColumn(sheet, itemRow, columnId++, i18n.t("Event id", { lng: this.builder.language }));

            this.createColumn(
                sheet,
                itemRow,
                columnId++,
                i18n.t("TEI Id", { lng: this.builder.language }),
                null,
                this.getTeiIdValidation()
            );

            const { code: attributeCode } = metadata.get(program.categoryCombo?.id);
            const optionsTitle =
                attributeCode !== "default"
                    ? `_${program.categoryCombo.id}`
                    : i18n.t("Options", { lng: this.builder.language });

            this.createColumn(sheet, itemRow, columnId++, optionsTitle, null, this.validations.get("options"));

            this.createColumn(
                sheet,
                itemRow,
                columnId++,
                `${
                    programStage.executionDateLabel
                        ? i18n.t(programStage.executionDateLabel, {
                              lng: this.builder.language,
                          })
                        : i18n.t("Date", { lng: this.builder.language })
                } *` + dateFormatInfo
            );

            // Include attribute look-up from TEI Instances sheet
            _.forEach(settingsFilter?.attributesIncluded, ({ id: attributeId }) => {
                const attribute = metadata.get(attributeId);
                if (!attribute) return;

                this.createColumn(sheet, itemRow, columnId, `_${attribute.id}`);

                const colName = Excel.getExcelAlpha(columnId);

                for (let row = itemRow + 1; row <= defaultMaxTeiRows; row++) {
                    const bRef = `B${row}`;
                    const headerRef = `${colName}${itemRow}`;

                    const lookupFormula = this.buildLookupFormula({
                        sheetName: teiSheetName,
                        bRef,
                        headerRef,
                    });

                    sheet.cell(row, columnId).singleFormula(lookupFormula);

                    this.lockCellWithValidation({
                        sheet,
                        colName,
                        startRow: itemRow + 1,
                        endRow: maxRow,
                        formula: lookupFormula,
                    });
                }

                columnId++;
            });

            // Include external data element look-up from Other program stage sheets
            _.forEach(settingsFilter?.externalDataElementsIncluded, ({ id }) => {
                const [programStageId, dataElementId] = id.split(".");
                const programStageSheet = sheets.find(({ id }) => id === programStageId)?.sheetName;
                const dataElement = metadata.get(dataElementId);
                if (!programStageSheet || !dataElement) return;

                this.createColumn(sheet, itemRow, columnId, `_${dataElement.id}`);

                const colName = Excel.getExcelAlpha(columnId);
                const lookupFormula = `IFERROR(INDEX('${programStageSheet}'!$B$2:$ZZ$${defaultMaxTeiRows},MATCH(INDIRECT("B" & ROW()),'${programStageSheet}'!$B$2:$B$${defaultMaxTeiRows},0),MATCH(${colName}$${itemRow},'${programStageSheet}'!$B$2:$ZZ$2,0)),"")`;

                sheet.cell(itemRow + 1, columnId, defaultMaxTeiRows, columnId).formula(lookupFormula);

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

                    const { name = "", description = "" } = this.translate(dataElement);

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

                    if (description) {
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

    private buildLookupFormula(options: { sheetName: string; bRef: string; headerRef: string }): string {
        const { sheetName, bRef, headerRef } = options;
        return `IFERROR(
            INDEX(
                '${sheetName}'!$A$5:$ZZ$${defaultMaxTeiRows},
                MATCH(${bRef},'${sheetName}'!$A$5:$A$${defaultMaxTeiRows},0),
                MATCH(${headerRef},'${sheetName}'!$A$5:$ZZ$5,0)
            ), 
            "")
        `
            .replace(/\s+/g, " ")
            .trim();
    }

    private lockCellWithValidation(options: {
        sheet: Sheet;
        startRow: number;
        endRow: number;
        colName: string;
        formula: string;
        errorMessage?: string;
    }) {
        const { colName, endRow, errorMessage, formula, sheet, startRow } = options;
        sheet.addDataValidation({
            type: "textLength",
            error: errorMessage ?? "This cell cannot be changed",
            sqref: `${colName}${startRow}:${colName}${endRow}`,
            operator: "equal",
            // for excel we need min and max length
            formulas: [formula.length.toString(), formula.length.toString()],
        });
    }

    private fillInstancesSheet(sheet: Sheet) {
        const { element: program } = this.builder;
        const { rowOffset } = this;

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

        this.createColumn(sheet, itemRow, 1, i18n.t("TEI id", { lng: this.builder.language }));

        this.createColumn(
            sheet,
            itemRow,
            2,
            i18n.t("Org Unit *", { lng: this.builder.language }),
            null,
            this.validations.get("organisationUnits"),
            i18n.t(
                "This site does not exist in DHIS2, please talk to your administrator to create this site before uploading data",
                { lng: this.builder.language }
            )
        );

        this.createFeatureTypeColumn({ program, sheet, itemRow, columnId: 3 });

        this.createColumn(
            sheet,
            itemRow,
            4,
            `${
                program.enrollmentDateLabel
                    ? i18n.t(program.enrollmentDateLabel, { lng: this.builder.language })
                    : i18n.t("Enrollment Date", { lng: this.builder.language })
            } *` + dateFormatInfo
        );

        this.createColumn(
            sheet,
            itemRow,
            5,
            (program.incidentDateLabel
                ? i18n.t(program.incidentDateLabel, { lng: this.builder.language })
                : i18n.t("Incident Date", { lng: this.builder.language })) + dateFormatInfo
        );

        const programAttributes = program.programTrackedEntityAttributes || [];
        this.instancesSheetValuesRow = itemRow + 1;

        let idx = 0;
        programAttributes.forEach((attribute: any) => {
            const tea = attribute.trackedEntityAttribute;
            if (tea.confidential) return;
            const validationId = tea.optionSet ? tea.optionSet.id : tea.valueType;
            const validation = this.validations.get(validationId);
            this.createColumn(sheet, itemRow, 6 + idx, `_${tea.id}`, 1, validation);
            idx++;
        });
    }

    private fillLegendSheet(legendSheet: Sheet) {
        const { elementMetadata: metadata, rawMetadata } = this.builder;

        // Freeze and format column titles
        legendSheet.row(2).freeze();
        legendSheet.column(1).setWidth(50);
        legendSheet.column(2).setWidth(50);
        legendSheet.column(3).setWidth(20);
        legendSheet.column(4).setWidth(20);
        legendSheet.column(5).setWidth(40);

        // Add column titles
        legendSheet
            .cell(1, 1, 2, 1, true)
            .string(i18n.t("Name", { lng: this.builder.language }))
            .style(baseStyle);
        legendSheet
            .cell(1, 2, 2, 2, true)
            .string(i18n.t("Description", { lng: this.builder.language }))
            .style(baseStyle);
        legendSheet
            .cell(1, 3, 2, 3, true)
            .string(i18n.t("Value Type", { lng: this.builder.language }))
            .style(baseStyle);
        legendSheet
            .cell(1, 4, 2, 4, true)
            .string(i18n.t("Option Set", { lng: this.builder.language }))
            .style(baseStyle);
        legendSheet
            .cell(1, 5, 2, 5, true)
            .string(i18n.t("Possible Values", { lng: this.builder.language }))
            .style(baseStyle);

        let rowId = 3;
        _.sortBy(rawMetadata["dataElements"], ["name"]).forEach(item => {
            const { name, description } = this.translate(item);
            const optionSet = metadata.get(item.optionSet?.id);
            const { name: optionSetName } = this.translate(optionSet);
            const options = _.slice(optionSet?.options ?? [], 0, 25)
                .map(({ id }: any) => this.translate(metadata.get(id)).name)
                .join(", ");

            legendSheet.cell(rowId, 1).string(name ?? "");
            legendSheet.cell(rowId, 2).string(description ?? "");
            legendSheet.cell(rowId, 3).string(item?.valueType ?? "");
            legendSheet.cell(rowId, 4).string(optionSetName ?? "");
            legendSheet.cell(rowId, 5).string(options ?? "");

            rowId++;
        });
    }

    private fillValidationSheet(validationSheet: Sheet) {
        const { organisationUnits, element, metadata, rawMetadata, startDate, endDate } = this.builder;

        // Freeze and format column titles
        validationSheet.row(2).freeze();

        // Add column titles
        let rowId = 2;
        let columnId = 1;
        validationSheet.cell(rowId++, columnId).string(i18n.t("Organisation Units", { lng: this.builder.language }));
        const sortedOrganisationUnits = this.metadataService.sortMetadata(
            organisationUnits.map(ou => ({ ...ou, type: "organisationUnits" }))
        );
        _.forEach(sortedOrganisationUnits, orgUnit => {
            validationSheet.cell(rowId++, columnId).formula(`_${orgUnit.id}`);
        });
        this.validations.set(
            "organisationUnits",
            `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
        );

        if (element.type === "dataSets") {
            rowId = 2;
            columnId++;
            validationSheet.cell(rowId++, columnId).string(i18n.t("Periods", { lng: this.builder.language }));
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
            validationSheet
                .cell(rowId++, columnId)
                .string(i18n.t("Relationship Types", { lng: this.builder.language }));
            const sortedRelationshipTypes = this.metadataService.sort(metadata.relationshipType);
            _.forEach(sortedRelationshipTypes, relationshipType => {
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
                        .string(
                            `${i18n.t("Relationship Type", { lng: this.builder.language })} ${
                                relationshipType.name
                            } (${key})`
                        );
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
        validationSheet.cell(rowId++, columnId).string(i18n.t("Options", { lng: this.builder.language }));
        const dataSetOptionComboId = element.categoryCombo.id;

        const sortedMetadata = this.metadataService.sortedMetadata;
        sortedMetadata.forEach(e => {
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
            const sortedOptions = this.metadataService.sortMetadata(optionSet.options);
            _.forEach(sortedOptions, option => {
                validationSheet.cell(rowId++, columnId).formula(`_${option.id}`);
            });
            this.validations.set(
                optionSet.id,
                `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
            );
        });

        rowId = 2;
        columnId++;
        validationSheet.cell(rowId++, columnId).string(i18n.t("Boolean", { lng: this.builder.language }));
        validationSheet.cell(rowId++, columnId).formula("_true");
        validationSheet.cell(rowId++, columnId).formula("_false");
        this.validations.set(
            "BOOLEAN",
            `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
        );

        rowId = 2;
        columnId++;
        validationSheet.cell(rowId++, columnId).string(i18n.t("True only", { lng: this.builder.language }));
        validationSheet.cell(rowId++, columnId).formula("_true");
        this.validations.set(
            "TRUE_ONLY",
            `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
        );

        // Add program title
        validationSheet.cell(1, 1, 1, columnId, true).formula(`_${element.id}`).style(baseStyle);
    }

    private fillMetadataSheet(metadataSheet: Sheet, orgUnitShortName: boolean) {
        const { workbook } = metadataSheet;
        const { elementMetadata: metadata, organisationUnits } = this.builder;

        // Freeze and format column titles
        metadataSheet.row(2).freeze();
        metadataSheet.column(1).setWidth(30);
        metadataSheet.column(2).setWidth(30);
        metadataSheet.column(3).setWidth(70);

        // Add column titles
        metadataSheet
            .cell(1, 1, 2, 1, true)
            .string(i18n.t("Identifier", { lng: this.builder.language }))
            .style(baseStyle);
        metadataSheet
            .cell(1, 2, 2, 2, true)
            .string(i18n.t("Type", { lng: this.builder.language }))
            .style(baseStyle);
        metadataSheet
            .cell(1, 3, 2, 3, true)
            .string(i18n.t("Name", { lng: this.builder.language }))
            .style(baseStyle);
        metadataSheet
            .cell(1, 4, 2, 4, true)
            .string(i18n.t("Value Type", { lng: this.builder.language }))
            .style(baseStyle);
        metadataSheet
            .cell(1, 5, 2, 5, true)
            .string(i18n.t("Option Set", { lng: this.builder.language }))
            .style(baseStyle);
        metadataSheet
            .cell(1, 6, 2, 6, true)
            .string(i18n.t("Possible Values", { lng: this.builder.language }))
            .style(baseStyle);
        metadataSheet
            .cell(1, 7, 2, 7, true)
            .string(i18n.t("Metadata version", { lng: this.builder.language }))
            .style(baseStyle);

        let rowId = 3;

        const sortedMetadata = this.metadataService.sortedMetadata;

        sortedMetadata.forEach(item => {
            const { name } = this.translate(item);
            const optionSet = metadata.get(item.optionSet?.id);
            const { name: optionSetName } = this.translate(optionSet);
            const options = _.slice(optionSet?.options ?? [], 0, 25)
                .map(({ id }: any) => this.translate(metadata.get(id)).name)
                .join(", ");
            const isCompulsory = this.isMetadataItemCompulsory(item);
            const dateFormat = dateFormats[item.valueType ?? ""];
            const nameCellValue = _.compact([
                name,
                isCompulsory ? " *" : "",
                dateFormat ? `\n(${dateFormat})` : "",
            ]).join("");

            metadataSheet.cell(rowId, 1).string(item.id ?? "");
            metadataSheet.cell(rowId, 2).string(item.type ?? "");
            metadataSheet.cell(rowId, 3).string(nameCellValue);
            metadataSheet.cell(rowId, 4).string(item.valueType ?? "");
            metadataSheet.cell(rowId, 5).string(optionSetName ?? "");
            metadataSheet.cell(rowId, 6).string(options ?? "");
            metadataSheet.cell(rowId, 7).string(`${item.version ?? ""}`);

            if (name !== undefined) {
                workbook.definedNameCollection.addDefinedName({
                    refFormula: `'Metadata'!$${Excel.getExcelAlpha(3)}$${rowId}`,
                    name: `_${item.id}`,
                });
            }

            rowId++;
        });

        organisationUnits.forEach(orgUnit => {
            const { name } = this.translate({ ...orgUnit, type: "organisationUnits" }, orgUnitShortName);
            metadataSheet.cell(rowId, 1).string(orgUnit.id !== undefined ? orgUnit.id : "");
            metadataSheet.cell(rowId, 2).string("organisationUnit");
            metadataSheet.cell(rowId, 3).string(name ?? "");

            if (name !== undefined)
                workbook.definedNameCollection.addDefinedName({
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
                workbook.definedNameCollection.addDefinedName({
                    refFormula: `'Metadata'!$${Excel.getExcelAlpha(3)}$${rowId}`,
                    name: `_${relationshipType.id}`,
                });
                rowId++;
            });
        }

        metadataSheet.cell(rowId, 1).string("true");
        metadataSheet.cell(rowId, 2).string("boolean");
        metadataSheet.cell(rowId, 3).string(i18n.t("Yes", { lng: this.builder.language }));
        workbook.definedNameCollection.addDefinedName({
            refFormula: `'Metadata'!$${Excel.getExcelAlpha(3)}$${rowId}`,
            name: "_true",
        });
        rowId++;

        metadataSheet.cell(rowId, 1).string("false");
        metadataSheet.cell(rowId, 2).string("boolean");
        metadataSheet.cell(rowId, 3).string(i18n.t("No", { lng: this.builder.language }));
        workbook.definedNameCollection.addDefinedName({
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
        const { element, template } = this.builder;
        const customVersion = template.type === "custom" ? template.id : undefined;
        const defaultVersion = getGeneratedTemplateId(element.type);
        return customVersion ?? getObjectVersion(element) ?? defaultVersion;
    }

    private fillDataEntrySheet(dataEntrySheet: Sheet, options: { includedDataElementIds?: Set<string> }) {
        const { includedDataElementIds } = options;
        const { element, elementMetadata: metadata, settings } = this.builder;
        const { rowOffset } = this;
        const dataSource = this.getDataSource({ sheet: dataEntrySheet });

        // Add cells for themes
        const sectionRow = rowOffset + 1;
        const itemRow = rowOffset + 2;
        const rowDataElement = dataSource?.dataElements.row ?? sectionRow;

        // Hide theme rows by default
        for (let row = 1; row < sectionRow; row++) {
            dataEntrySheet.row(row).hide();
        }

        // Freeze and format column titles
        dataEntrySheet.row(itemRow).freeze();
        dataEntrySheet.row(sectionRow).setHeight(30);
        dataEntrySheet.row(itemRow).setHeight(50);

        // Add column titles
        let columnId = 1;
        let groupId = 0;

        if (element.type === "programs") {
            this.createColumn(dataEntrySheet, itemRow, columnId++, i18n.t("Event id", { lng: this.builder.language }));
        }

        this.createColumn(
            dataEntrySheet,
            itemRow,
            columnId++,
            i18n.t("Org Unit *", { lng: this.builder.language }),
            null,
            this.validations.get("organisationUnits"),
            "This site does not exist in DHIS2, please talk to your administrator to create this site before uploading data"
        );

        if (element.type === "programs") {
            this.createColumn(dataEntrySheet, itemRow, columnId++, i18n.t("Latitude", { lng: this.builder.language }));
            this.createColumn(dataEntrySheet, itemRow, columnId++, i18n.t("Longitude", { lng: this.builder.language }));
        } else if (element.type === "dataSets") {
            this.createColumn(
                dataEntrySheet,
                itemRow,
                columnId++,
                i18n.t("Period", { lng: this.builder.language }),
                null,
                this.validations.get("periods")
            );
        }

        const { code: attributeCode } = metadata.get(element.categoryCombo?.id);
        const optionsTitle =
            attributeCode !== "default"
                ? `_${element.categoryCombo.id}`
                : i18n.t("Options", { lng: this.builder.language });

        this.createColumn(dataEntrySheet, itemRow, columnId++, optionsTitle, null, this.validations.get("options"));

        // Add dataSet or program title
        dataEntrySheet
            .cell(sectionRow, 1, sectionRow, columnId - 1, true)
            .formula(`_${element.id}`)
            .style({ ...baseStyle, font: { size: 16, bold: true } });

        if (element.type === "dataSets") {
            const dataSet = element;
            const dataElementsAll = getDataSetDataElements(dataSet, metadata);
            const dataElements = includedDataElementIds
                ? dataElementsAll.filter(obj => includedDataElementIds.has(obj.dataElement.id))
                : dataElementsAll;
            const dataElementsExclusion = settings.dataSetDataElementsFilter;

            columnId = dataSource?.dataElements.column ?? columnId;
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
                        dataSource?.categoryOptionCombos.row ?? itemRow,
                        columnId,
                        `_${categoryOptionCombo.id}`,
                        groupId,
                        this.validations.get(validation),
                        undefined,
                        categoryOptionCombo.code === "default",
                        { skipIfCustomTemplate: false }
                    );

                    columnId++;
                });

                const noColumnAdded = columnId === firstColumnId;
                if (noColumnAdded) return;

                if (columnId - 1 === firstColumnId) {
                    dataEntrySheet.column(firstColumnId).setWidth(name.length / 2.5 + 15);
                }

                dataEntrySheet
                    .cell(rowDataElement, firstColumnId, rowDataElement, columnId - 1, true)
                    .formula(`_${dataElement.id}`)
                    .style(this.groupStyle(groupId));

                if (dataElement.url !== undefined) {
                    dataEntrySheet
                        .cell(rowDataElement, firstColumnId, rowDataElement, columnId - 1, true)
                        .link(dataElement.url)
                        .formula(`=_${dataElement.id}`);
                }

                if (description !== undefined) {
                    dataEntrySheet.cell(rowDataElement, firstColumnId, rowDataElement, columnId - 1, true);
                    /* TEMPORAL: When MSF template is clean (with no notes), uncomment this.
                       Currently, Excel show the repair warning with adding comment/notes. */
                    //.comment("description", { height: "100pt", width: "160pt" });
                }

                groupId++;
            });
        } else {
            _.forEach(this.getProgramStagesWithReadPermission(), programStageT => {
                const programStage = metadata.get(programStageT.id);

                this.createColumn(
                    dataEntrySheet,
                    itemRow,
                    columnId++,
                    `${
                        programStage.executionDateLabel
                            ? i18n.t(programStage.executionDateLabel, {
                                  lng: this.builder.language,
                              })
                            : i18n.t("Date", { lng: this.builder.language })
                    } *` + dateFormatInfo
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
                            dataElement.valueType === "ORGANISATION_UNIT"
                                ? this.validations.get("organisationUnits")
                                : this.validations.get(validation)
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

    getDataSource(options: { sheet: Sheet }) {
        const { template } = this.builder;
        const dataSource = getDataSources(template, options.sheet.name)[0];

        // Partial support: dataSource[row] and categoryOption[row]
        if (!(dataSource && dataSource.type === "row")) return;

        const column = dataSource.range.columnStart;
        const columnStartIndex = Workbook.getColumnIndex(column);
        const rowNumberCoc = dataSource.categoryOption?.type === "row" ? dataSource.categoryOption.ref : undefined;
        const rowNumberDataElement = dataSource.dataElement?.type === "row" ? dataSource.dataElement.ref : undefined;

        if (!(rowNumberCoc && rowNumberDataElement)) return;

        return {
            dataElements: { column: columnStartIndex, row: rowNumberDataElement },
            categoryOptionCombos: { column: columnStartIndex, row: rowNumberCoc },
        };
    }

    private getProgramStagesWithReadPermission() {
        const { element } = this.builder;

        return _(element.programStages)
            .filter(({ access }) => access?.read && access?.data?.read)
            .value();
    }

    private translate(item: Maybe<TranslatableItem>, selectedName?: boolean): { name: string; description?: string } {
        const { language } = this.builder;
        const translations = item?.translations?.filter(({ locale }: any) => locale === language) ?? [];

        const { value: formName } = translations.find(({ property }: any) => property === "FORM_NAME") ?? {};
        const { value: regularName } = translations.find(({ property }: any) => property === "NAME") ?? {};
        const { value: shortName } = translations.find(({ property }: any) => property === "SHORT_NAME") ?? {};

        const defaultName = item?.displayName ?? item?.formName ?? item?.name;
        const name = formName ?? regularName ?? shortName ?? defaultName;

        const { value: description = item?.description } =
            translations.find(({ property }: any) => property === "DESCRIPTION") ?? {};

        if (item?.type === "categoryOptionCombos" && name === defaultName) {
            return { name: this.buildCategoryOptionComboName(item), description };
        } else if (
            this.builder.useCodesForMetadata &&
            item?.code &&
            item?.type &&
            ["organisationUnits", "dataElements", "options", "categoryOptions"].includes(item.type)
        ) {
            return { name: item.code, description };
        } else {
            return { name: (selectedName ? item?.displayShortName : name) || "", description };
        }
    }

    private getTranslatedMetadataName(props: { id: Maybe<string>; type: Maybe<string> }): string {
        const { id, type = "Metadata" } = props;
        const metadata = this.builder.elementMetadata.get(id);
        if (!metadata) {
            console.error(`${type} not found: ${id}`);
            return "";
        }

        const { name } = this.translate(metadata);
        return name;
    }

    private buildCategoryOptionComboName(item: CategoryOptionCombo): string {
        const categoryOptionIds = new Set(item.categoryOptions.map(({ id }) => id));

        if (!categoryOptionIds.size) {
            return "";
        } else if (categoryOptionIds.size === 1) {
            const [categoryOptionId] = categoryOptionIds;
            return this.getTranslatedMetadataName({ id: categoryOptionId, type: "CategoryOption" });
        } else {
            return this.getMultipleCategoryOptionOptionsName(item, categoryOptionIds);
        }
    }

    private getMultipleCategoryOptionOptionsName(item: CategoryOptionCombo, categoryOptionIds: Set<string>): string {
        const { elementMetadata } = this.builder;

        const categoryCombo = elementMetadata.get(item.categoryCombo.id) as TranslatableItem;
        if (categoryCombo?.type !== "categoryCombos") {
            console.error(`Category combo not found: ${item.categoryCombo.id}`);
            return "";
        }

        const orderedCategoryOptions = this.getCategoryOrderedCategoryOptions(categoryCombo, categoryOptionIds);

        const isOrderedCategoryOptionsValid = orderedCategoryOptions.length === categoryOptionIds.size;
        if (!isOrderedCategoryOptionsValid) {
            console.error(
                `Category options mismatch for combo ${item.categoryCombo.id}. Using CategoryOptionCombo options`
            );
        }

        const categoryOptions = isOrderedCategoryOptionsValid ? orderedCategoryOptions : item.categoryOptions;

        const options = categoryOptions.map(categoryOption => {
            return this.getTranslatedMetadataName({ id: categoryOption.id, type: "CategoryOption" });
        });
        return options.join(", ");
    }

    private getCategoryOrderedCategoryOptions(categoryCombo: CategoryCombo, categoryOptionIds: Set<string>): Ref[] {
        const { elementMetadata } = this.builder;
        const orderedCategories = _(categoryCombo?.categories)
            .map(ccCategory => {
                const category = elementMetadata.get(ccCategory.id) as TranslatableItem;

                if (category?.type !== "categories") return undefined;

                return {
                    ...category,
                    optionIds: category?.categoryOptions.map(categoryOptions => categoryOptions.id),
                };
            })
            .compact();

        return orderedCategories
            .map(category => {
                return category.optionIds.find(id => categoryOptionIds.has(id));
            })
            .compact()
            .map(id => ({ id }))
            .value();
    }

    protected createColumn(
        sheet: Sheet,
        rowId: any,
        columnId: any,
        label: any,
        groupId: any = null,
        validation: Validation | undefined | null = null,
        validationMessage: any = null,
        defaultLabel = false,
        _options: { skipIfCustomTemplate: boolean } = { skipIfCustomTemplate: true }
    ) {
        // if (this.builder.template.type === "custom" && options.skipIfCustomTemplate) return;

        const workbook = sheet.workbook;
        sheet.column(columnId).setWidth(20);
        const cell = sheet.cell(rowId, columnId);

        if (!defaultLabel) cell.style(groupId !== null ? this.groupStyle(groupId) : baseStyle);
        else {
            cell.style(groupId !== null ? this.groupStyle(groupId) : baseStyle).style(
                this.transparentFontStyle(groupId)
            );
        }

        const isEmpty = !cell.value();
        if (isEmpty) {
            if (label.startsWith("_")) cell.formula(label);
            else cell.string(label);
        }

        sheet.addDataValidation({
            type: "custom",
            error: "This cell cannot be changed",
            sqref: `${Excel.getExcelAlpha(columnId)}${rowId}`,
            formulas: [`${Excel.getExcelAlpha(columnId)}${rowId} <> "${label}"`],
        });

        if (validation !== null) {
            const ref = `${Excel.getExcelAlpha(columnId)}${rowId + 1}:${Excel.getExcelAlpha(columnId)}${maxRow}`;
            sheet.addDataValidation({
                type: "list",
                allowBlank: true,
                error: validationMessage ?? i18n.t("Invalid choice was chosen", { lng: this.builder.language }),
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
                style: workbook.createStyle({
                    font: {
                        bold: true,
                        color: "FF0000",
                    },
                }), // a style object containing styles to apply
            });
        }
    }

    private transparentFontStyle(groupId: number): StyleOptions {
        const { palette = defaultColorScale } = this.builder.theme ?? {};

        return {
            font: {
                color: palette[groupId % palette.length],
            },
        };
    }

    private groupStyle(groupId: number): StyleOptions {
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
        return `='${teiSheetName}'!$A$${this.instancesSheetValuesRow}:$A$${
            this.maxTeiRows + this.instancesSheetValuesRow
        }`;
    }

    private createFeatureTypeColumn(options: { program: any; sheet: Sheet; itemRow: number; columnId: number }) {
        const { program, sheet, itemRow, columnId } = options;
        const header = this.getFeatureTypeHeader(program);
        const defaultHeader = i18n.t("No geometry", { lng: this.builder.language });

        this.createColumn(sheet, itemRow, 3, header || defaultHeader);
        if (!header) sheet.column(columnId).hide();
    }

    private getFeatureTypeHeader(program: any): string | undefined {
        const { featureType } = program.trackedEntityType;
        const opts = { lng: this.builder.language };

        switch (featureType) {
            case "POINT":
                return [i18n.t("Point in map", opts), "([LON, LAT])"].join("\n");
            case "POLYGON":
                return [i18n.t("Polygon in map", opts), "([[LON1, LAT1], [LON2, LAT2], ...])"].join("\n");
            default:
                return undefined;
        }
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
export function getOptionsKey(categoryOptions: any) {
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
 */
const baseStyle: StyleOptions = {
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

export function getGeneratedTemplateId(type: DataFormType) {
    switch (type) {
        case "dataSets":
            return dataSetId;
        case "programs":
            return programId;
        case "trackerPrograms":
            return trackerProgramId;
        default:
            throw new Error("Unsupported type");
    }
}

function getRelationshipTypeKey(relationshipType: any, key: any) {
    return ["relationshipType", relationshipType.id, key].join("-");
}

function getValidSheetName(name: string, maxLength = 31) {
    // Invalid chars: \ / * ? : [ ]
    // Maximum length: 31
    return name.replace(/[\\/*?:[\]]/g, "").slice(0, maxLength);
}

/* Add prop 'sheetName' with a valid sheet name to an array of objects having a string property 'name' */
function withSheetNames(objs: NamedRef[], options: any = {}) {
    const { prefix } = options;

    return objs.filter(Boolean).map((obj, idx: number) => {
        const baseSheetName = _([prefix, `(${idx + 1}) ${obj.name}`])
            .compact()
            .join(" ");

        return {
            ...obj,
            sheetName: getValidSheetName(baseSheetName),
        };
    });
}

type Id = string;
type Section = BaseTranslatableItem & { type: "section"; name: string; sortOrder: number; dataElements: Ref[] };

type Validations = Map<IdOrValueType, Validation>;
type IdOrValueType = string;
type Validation = string;

export type Translation = {
    locale: string;
    property: string;
    value: string;
};

export type TranslatableItem =
    | GenericTranslatableItem
    | CategoryOptionCombo
    | CategoryCombo
    | Category
    | Section
    | OrganisationUnit
    | DataElement;

type BaseTranslatableItem = {
    id?: string;
    translations?: Translation[];
    valueType?: string;
    displayName?: string;
    formName?: string;
    name?: string;
    description?: string;
    code?: string;
    type?: string;
    displayShortName?: string;
    version?: string;
    optionSet?: Ref;
};

type OrganisationUnit = BaseTranslatableItem & {
    id: string;
    displayName: string;
    translations: Translation[];
    type: "organisationUnits";
};

type GenericTranslatableItem = BaseTranslatableItem & {
    type: "options" | "categoryOptions";
};

type DataElement = BaseTranslatableItem & {
    type: "dataElements";
    categoryCombo: Ref;
};

type CategoryOptionCombo = BaseTranslatableItem & {
    type: "categoryOptionCombos";
    categoryOptions: Ref[];
    categoryCombo: Ref;
};

type CategoryCombo = BaseTranslatableItem & {
    type: "categoryCombos";
    categories: Ref[];
};

type Category = BaseTranslatableItem & {
    type: "categories";
    categoryOptions: Ref[];
};
