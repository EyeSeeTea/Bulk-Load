import * as Excel from "excel4node";
import _ from "lodash";
import { baseStyle, createColumn, groupStyle, protectedSheet } from "../utils/excel";
import { buildAllPossiblePeriods } from "../utils/periods";
import { getObjectVersion } from "./utils";

export const SheetBuilder = function (builder) {
    this.workbook = new Excel.Workbook();
    this.builder = builder;
    this.validations = new Map();

    this.dataEntrySheet = this.workbook.addWorksheet("Data Entry");
    this.legendSheet = this.workbook.addWorksheet("Legend", protectedSheet);
    this.validationSheet = this.workbook.addWorksheet("Validation", protectedSheet);
    this.metadataSheet = this.workbook.addWorksheet("Metadata", protectedSheet);

    this.fillValidationSheet();
    this.fillMetadataSheet();
    this.fillLegendSheet();
    this.fillDataEntrySheet();
};

SheetBuilder.prototype.fillLegendSheet = function () {
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
            ?.map(({ id }) => metadata.get(id))
            .map(option => this.translate(option).name)
            .join(", ");

        legendSheet.cell(rowId, 1).string(name ?? "");
        legendSheet.cell(rowId, 2).string(description ?? "");
        legendSheet.cell(rowId, 3).string(item?.valueType ?? "");
        legendSheet.cell(rowId, 4).string(optionSetName ?? "");
        legendSheet.cell(rowId, 5).string(options ?? "");

        rowId++;
    });
};

SheetBuilder.prototype.fillValidationSheet = function () {
    const {
        organisationUnits,
        element,
        rawMetadata,
        elementMetadata,
        startDate,
        endDate,
    } = this.builder;
    const validationSheet = this.validationSheet;

    // Freeze and format column titles
    validationSheet.row(2).freeze();

    // Add column titles
    let rowId = 2;
    let columnId = 1;
    validationSheet.cell(rowId++, columnId).string("Organisation Units");
    _.forEach(organisationUnits, orgUnit => {
        validationSheet.cell(rowId++, columnId).formula("_" + orgUnit.id);
    });
    this.validations.set(
        "organisationUnits",
        `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
    );

    if (element.type === "dataSet") {
        rowId = 2;
        columnId++;
        validationSheet.cell(rowId++, columnId).string("Periods");
        buildAllPossiblePeriods(element.periodType, startDate, endDate).forEach(period => {
            if (isNaN(period)) {
                validationSheet.cell(rowId++, columnId).string(period);
            } else {
                validationSheet.cell(rowId++, columnId).number(Number(period));
            }
        });
        this.validations.set(
            "periods",
            `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(
                columnId
            )}$${rowId}`
        );
    }

    rowId = 2;
    columnId++;
    validationSheet.cell(rowId++, columnId).string("Options");
    const dataSetOptionComboId = element.categoryCombo.id;
    elementMetadata.forEach(e => {
        if (e.type === "categoryOptionCombo" && e.categoryCombo.id === dataSetOptionComboId) {
            validationSheet.cell(rowId++, columnId).formula("_" + e.id);
        }
    });
    this.validations.set(
        "options",
        `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(columnId)}$${rowId}`
    );

    _.forEach(rawMetadata.optionSets, optionSet => {
        rowId = 2;
        columnId++;

        validationSheet.cell(rowId++, columnId).formula("_" + optionSet.id);
        _.forEach(optionSet.options, option => {
            validationSheet.cell(rowId++, columnId).formula("_" + option.id);
        });
        this.validations.set(
            optionSet.id,
            `=Validation!$${Excel.getExcelAlpha(columnId)}$3:$${Excel.getExcelAlpha(
                columnId
            )}$${rowId}`
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
};

SheetBuilder.prototype.fillMetadataSheet = function () {
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
            ?.map(({ id }) => metadata.get(id))
            .map(option => this.translate(option).name)
            .join(", ");

        metadataSheet.cell(rowId, 1).string(item.id ?? "");
        metadataSheet.cell(rowId, 2).string(item.type ?? "");
        metadataSheet.cell(rowId, 3).string(name ?? "");
        metadataSheet.cell(rowId, 4).string(item.valueType ?? "");
        metadataSheet.cell(rowId, 5).string(optionSetName ?? "");
        metadataSheet.cell(rowId, 6).string(options ?? "");

        if (name !== undefined) {
            this.workbook.definedNameCollection.addDefinedName({
                refFormula: "'Metadata'!$" + Excel.getExcelAlpha(3) + "$" + rowId,
                name: "_" + item.id,
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
                refFormula: "'Metadata'!$" + Excel.getExcelAlpha(3) + "$" + rowId,
                name: "_" + orgUnit.id,
            });

        rowId++;
    });

    metadataSheet.cell(rowId, 1).string("true");
    metadataSheet.cell(rowId, 2).string("boolean");
    metadataSheet.cell(rowId, 3).string("Yes");
    this.workbook.definedNameCollection.addDefinedName({
        refFormula: "'Metadata'!$" + Excel.getExcelAlpha(3) + "$" + rowId,
        name: "_true",
    });
    rowId++;

    metadataSheet.cell(rowId, 1).string("false");
    metadataSheet.cell(rowId, 2).string("boolean");
    metadataSheet.cell(rowId, 3).string("No");
    this.workbook.definedNameCollection.addDefinedName({
        refFormula: "'Metadata'!$" + Excel.getExcelAlpha(3) + "$" + rowId,
        name: "_false",
    });
    rowId++;
};

SheetBuilder.prototype.getVersion = function () {
    const { element } = this.builder;
    const defaultVersion =
        element.type === "dataSet" ? "DATASET_GENERATED_v1" : "PROGRAM_GENERATED_v2";
    return getObjectVersion(element) ?? defaultVersion;
};

SheetBuilder.prototype.fillDataEntrySheet = function () {
    const { element, elementMetadata: metadata } = this.builder;
    const dataEntrySheet = this.dataEntrySheet;

    // Add cells for themes
    const sectionRow = 6;
    const itemRow = 7;

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

    createColumn(
        this.workbook,
        dataEntrySheet,
        itemRow,
        columnId++,
        "Org Unit",
        null,
        this.validations.get("organisationUnits")
    );
    if (element.type === "program") {
        createColumn(this.workbook, dataEntrySheet, itemRow, columnId++, "Latitude");
        createColumn(this.workbook, dataEntrySheet, itemRow, columnId++, "Longitude");
    } else if (element.type === "dataSet") {
        createColumn(
            this.workbook,
            dataEntrySheet,
            itemRow,
            columnId++,
            "Period",
            null,
            this.validations.get("periods")
        );
    }

    const { code: attributeCode } = metadata.get(element.categoryCombo?.id);
    const optionsTitle = attributeCode !== "default" ? `_${element.categoryCombo.id}` : "Options";

    createColumn(
        this.workbook,
        dataEntrySheet,
        itemRow,
        columnId++,
        optionsTitle,
        null,
        this.validations.get("options")
    );

    // Add element title
    dataEntrySheet
        .cell(sectionRow, 1, sectionRow, columnId - 1, true)
        .formula(`_${element.id}`)
        .style(baseStyle);

    if (element.type === "dataSet") {
        const categoryOptionCombos = [];
        for (const [, value] of metadata) {
            if (value.type === "categoryOptionCombo") {
                categoryOptionCombos.push(value);
            }
        }

        const sections = _.groupBy(categoryOptionCombos, "categoryCombo.id");
        _.forOwn(sections, (_section, categoryComboId) => {
            const categoryCombo = metadata.get(categoryComboId);
            if (categoryCombo !== undefined) {
                _(element.dataSetElements)
                    .map(({ dataElement }) => metadata.get(dataElement.id))
                    .filter({
                        categoryCombo: { id: categoryComboId },
                    })
                    .forEach(dataElement => {
                        const { name, description } = this.translate(dataElement);
                        const firstColumnId = columnId;

                        const sectionCategoryOptionCombos = sections[categoryComboId];
                        _.forEach(sectionCategoryOptionCombos, categoryOptionCombo => {
                            const validation = dataElement.optionSet
                                ? dataElement.optionSet.id
                                : dataElement.valueType;
                            createColumn(
                                this.workbook,
                                dataEntrySheet,
                                itemRow,
                                columnId,
                                "_" + categoryOptionCombo.id,
                                groupId,
                                this.validations.get(validation)
                            );

                            columnId++;
                        });

                        if (columnId - 1 === firstColumnId) {
                            dataEntrySheet.column(firstColumnId).setWidth(name.length / 2.5 + 15);
                        }

                        dataEntrySheet
                            .cell(sectionRow, firstColumnId, sectionRow, columnId - 1, true)
                            .formula("_" + dataElement.id)
                            .style(groupStyle(groupId));

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
            }
        });
    } else {
        _.forEach(element.programStages, programStageT => {
            const programStage = metadata.get(programStageT.id);

            createColumn(this.workbook, dataEntrySheet, itemRow, columnId++, "Event id");

            createColumn(
                this.workbook,
                dataEntrySheet,
                itemRow,
                columnId++,
                programStage.executionDateLabel ?? "Date"
            );

            if (programStage.programStageSections.length === 0) {
                programStage.programStageSections.push({
                    dataElements: programStage.programStageDataElements.map(e => e.dataElement),
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
                    const { name, description } = this.translate(dataElement);

                    const validation = dataElement.optionSet
                        ? dataElement.optionSet.id
                        : dataElement.valueType;
                    createColumn(
                        this.workbook,
                        dataEntrySheet,
                        itemRow,
                        columnId,
                        "_" + dataElement.id,
                        groupId,
                        this.validations.get(validation)
                    );
                    dataEntrySheet.column(columnId).setWidth(name.length / 2.5 + 10);

                    if (description !== undefined) {
                        dataEntrySheet.cell(itemRow, columnId).comment(description, {
                            height: "100pt",
                            width: "160pt",
                        });
                    }

                    columnId++;
                });

                if (firstColumnId < columnId)
                    dataEntrySheet
                        .cell(sectionRow, firstColumnId, sectionRow, columnId - 1, true)
                        .formula("_" + programStageSection.id)
                        .style(groupStyle(groupId));

                groupId++;
            });
        });
    }
};

SheetBuilder.prototype.toBlob = async function () {
    try {
        const data = await this.workbook.writeToBuffer();
        return new Blob([data], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
    } catch (error) {
        console.error("Failed building/downloading template");
        throw error;
    }
};

SheetBuilder.prototype.translate = function (item) {
    const { elementMetadata, language } = this.builder;
    const translations = item?.translations?.filter(({ locale }) => locale === language) ?? [];

    const { value: formName } = translations.find(({ property }) => property === "FORM_NAME") ?? {};
    const { value: regularName } = translations.find(({ property }) => property === "NAME") ?? {};
    const { value: shortName } =
        translations.find(({ property }) => property === "SHORT_NAME") ?? {};

    const defaultName = item?.displayName ?? item?.formName ?? item?.name;
    const name = formName ?? regularName ?? shortName ?? defaultName;

    const { value: description = item?.description } =
        translations.find(({ property }) => property === "DESCRIPTION") ?? {};

    if (item?.type === "categoryOptionCombo" && name === defaultName) {
        const options = item?.categoryOptions?.map(({ id }) => {
            const element = elementMetadata.get(id);
            const { name } = this.translate(element);
            return name;
        });

        return { name: options.join(", "), description };
    } else {
        return { name, description };
    }
};
