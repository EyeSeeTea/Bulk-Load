import _ from "lodash";
import "lodash.product";
import { Id } from "../../../domain/entities/ReferenceObject";
import {
    CustomTemplateWithUrl,
    DataSource,
    DownloadCustomizationOptions,
    DownloadCustomizationRepositories,
    StyleSource,
} from "../../../domain/entities/Template";
import {
    Category,
    CategoryCombo,
    CategoryOption,
    CategoryOptionCombo,
    DataElement,
    DataSetSection,
    MSFModuleMetadata,
} from "../../../domain/entities/templates/MSFModuleMetadata";
import { ThemeStyle } from "../../../domain/entities/Theme";
import { ExcelRepository } from "../../../domain/repositories/ExcelRepository";
import { MSFModuleMetadataRepository } from "../../../domain/repositories/templates/MSFModuleMetadataRepository";
import { Maybe } from "../../../types/utils";
import { getOptionsKey } from "../../../webapp/logic/sheetBuilder";
import { Workbook } from "../../../webapp/logic/Workbook";
import i18n from "../../../locales";
import { CellDataValidation, getValidationFromValueType } from "../../../domain/entities/CellDataValidation";

const DEFAULT_COLUMN_COLOR = "#000000";
const DEFAULT_SECTION_BG_COLOR = "#f2f2f2";
const DEFAULT_DE_CELL_BG_COLOR = "#ffffff";
const DEFAULT_GREYED_CELL_BG_COLOR = "#cccccc";

export class MSFModule101 implements CustomTemplateWithUrl {
    public readonly type = "custom";

    public readonly id = "MSFmodule_v1";
    public readonly name = "MSFModule";
    public readonly description = "";
    public readonly url = "templates/MSFModule.xlsx";

    public readonly generateMetadata = true;

    public readonly dataFormId = { type: "cell" as const, sheet: "Data Entry", ref: "A4" };
    public readonly dataFormType = { type: "value" as const, id: "dataSets" as const };

    public readonly dataSources: DataSource[] = [
        {
            type: "row",
            orgUnit: { sheet: "Data Entry", type: "column", ref: "A" },
            period: { sheet: "Data Entry", type: "column", ref: "B" },
            attribute: { sheet: "Data Entry", type: "column", ref: "C" },
            range: { sheet: "Data Entry", rowStart: 6, columnStart: "D" },
            dataElement: { sheet: "Data Entry", type: "row", ref: 4 },
            categoryOption: { sheet: "Data Entry", type: "row", ref: 5 },
        },
    ];

    public readonly styleSources: StyleSource[] = [];

    public async downloadCustomization(
        repositories: DownloadCustomizationRepositories,
        options: DownloadCustomizationOptions
    ): Promise<void> {
        const { excelRepository, modulesRepositories } = repositories;
        await new DownloadCustomization(this.id, excelRepository, modulesRepositories.msf, options).execute();
    }
}

class DownloadCustomization {
    constructor(
        private templateId: string,
        private excelRepository: ExcelRepository,
        private moduleRepository: MSFModuleMetadataRepository,
        private options: DownloadCustomizationOptions
    ) {}

    password = "Wiscentd2019!";

    sheets = { mapping: "mapping", entryForm: "Entry form", dataEntry: "Data Entry", validation: "Validation" };

    sectionCellStyle = {
        bold: true,
        fontSize: 12,
        merged: true,
        horizontalAlignment: "left",
        fillColor: DEFAULT_SECTION_BG_COLOR,
    } as ThemeStyle;

    dataElementCellStyle = { border: true, fillColor: DEFAULT_DE_CELL_BG_COLOR, merged: true };

    greyedFieldCellStyle = { fillColor: DEFAULT_GREYED_CELL_BG_COLOR };

    headerCellStyle = {
        bold: true,
        fontSize: 12,
        merged: true,
        horizontalAlignment: "center",
        fillColor: DEFAULT_SECTION_BG_COLOR,
    } as ThemeStyle;

    combinationCellStyle = {
        border: true,
        fontSize: 10,
        fillColor: DEFAULT_DE_CELL_BG_COLOR,
        horizontalAlignment: "center",
        columnSize: 12,
    } as ThemeStyle;

    async execute() {
        const dataEntryCells = await this.getDataEntryCombinationsCells();
        const metadata = await this.moduleRepository.get({
            language: this.options.language,
            dataSetId: this.options.id,
            catOptionCombinationIds: _(dataEntryCells)
                .map(cell => this.getIdFromCellFormula(cell.value))
                .compact()
                .value(),
        });
        const dataElementsWithCombinations = this.getDataElementsWithCombinations(metadata);

        const cells = this.createSectionCells(metadata, dataElementsWithCombinations);

        await this.fillHeaderSection(metadata);
        await this.fillEntryForm(cells);
        await this.fillMapping(metadata, cells, dataEntryCells);
        await this.setPeriodDataValidation();
        await this.setMappingAsDone();
    }

    private getDataElementsWithCombinations(metadata: MSFModuleMetadata) {
        const allCategories = metadata.dataSet.dataSetElements.flatMap(dse => {
            return dse.categoryCombo.categories.map(category => {
                return category;
            });
        });

        const allCategoryCombos = metadata.dataSet.dataSetElements.map(dse => {
            return dse.categoryCombo;
        });

        const getCocsByCategoryComboId = this.getCocsByCategoryCombo(
            metadata.categoryOptionCombos,
            allCategories,
            allCategoryCombos
        ) as Record<Id, CategoryOptionCombo[]>;

        const allDataElements = metadata.dataSet.dataSetElements.map(dse => dse.dataElement);

        const categoryComboIdByDataElementId = _(metadata.dataSet.dataSetElements)
            .map(dse => {
                return [dse.dataElement.id, dse.categoryCombo.id];
            })
            .fromPairs()
            .value();

        const getDeGroupedWithCombo = _(allDataElements)
            .groupBy(dataElement => categoryComboIdByDataElementId[dataElement.id])
            .toPairs()
            .flatMap(([categoryComboId, dataElements]) => {
                return dataElements.map(dataElement => ({
                    dataElement,
                    categoryOptionCombos: getCocsByCategoryComboId[categoryComboId] || [],
                }));
            })
            .value();

        return getDeGroupedWithCombo;
    }

    private getCocsByCategoryCombo(
        categoryOptionCombos: CategoryOptionCombo[],
        categories: Category[],
        categoryCombos: CategoryCombo[]
    ) {
        const unsortedCocsByCatComboId = _.groupBy(categoryOptionCombos, coc => coc.categoryCombo.id);
        const categoryById = _.keyBy(categories, category => category.id);
        const cocsByKey = _.groupBy(categoryOptionCombos, coc => getOptionsKey(coc.categoryOptions));

        const cocsByCategoryPairs = categoryCombos.map(categoryCombo => {
            const unsortedCocsForCategoryCombo = unsortedCocsByCatComboId[categoryCombo.id] || [];
            const categoryOptionsList = categoryCombo.categories.map(
                category => categoryById[category.id]?.categoryOptions || []
            );

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

    private async fillHeaderSection(metadata: MSFModuleMetadata): Promise<void> {
        await this.excelRepository.writeCell(
            this.templateId,
            { type: "cell", sheet: this.sheets.entryForm, ref: "H7" },
            i18n.t("Service")
        );
        await this.excelRepository.writeCell(
            this.templateId,
            { type: "cell", sheet: this.sheets.entryForm, ref: "H9" },
            i18n.t("DataSet")
        );
        await this.excelRepository.writeCell(
            this.templateId,
            { type: "cell", sheet: this.sheets.entryForm, ref: "H11" },
            i18n.t("Period")
        );
        await this.excelRepository.writeCell(
            this.templateId,
            { type: "cell", sheet: this.sheets.entryForm, ref: "J7" },
            metadata.dataSet.name
        );
        await this.excelRepository.writeCell(
            this.templateId,
            { type: "cell", sheet: this.sheets.entryForm, ref: "J9" },
            metadata.dataSet.name
        );
    }

    private async fillMapping(
        metadata: MSFModuleMetadata,
        cells: Cell[],
        dataEntryCells: CellWithCombinationId[]
    ): Promise<void> {
        const combinationCells = cells.filter(cell => cell.includeInMapping);
        const mappingCells = this.createMappingCells(metadata, combinationCells, dataEntryCells);
        for (const cell of mappingCells) {
            await this.excelRepository.writeCell(
                this.templateId,
                { type: "cell", sheet: cell.sheet, ref: cell.ref },
                cell.value
            );
            if (cell.style) {
                await this.excelRepository.styleCell(
                    this.templateId,
                    {
                        type: "cell",
                        sheet: this.sheets.entryForm,
                        ref: cell.value,
                    },
                    cell.style
                );
            }
        }
    }

    private async fillEntryForm(cells: Cell[]): Promise<void> {
        for (const cell of cells) {
            if (cell.merge) {
                await this.excelRepository.mergeCells(this.templateId, {
                    sheet: cell.sheet,
                    rowStart: cell.merge.rowStart,
                    rowEnd: cell.merge.rowEnd,
                    columnStart: cell.merge.columnStart,
                    columnEnd: cell.merge.columnEnd,
                });
            }
            await this.excelRepository.writeCell(
                this.templateId,
                { type: "cell", sheet: cell.sheet, ref: cell.ref },
                cell.value
            );
            if (cell.style) {
                await this.excelRepository.styleCell(
                    this.templateId,
                    {
                        ref: cell.merge
                            ? `${cell.merge.columnStart}${cell.merge.rowStart}:${cell.merge.columnEnd}${cell.merge.rowEnd}`
                            : cell.ref,
                        sheet: cell.sheet,
                        type: cell.merge ? "range" : "cell",
                    },
                    cell.style
                );
            }
            if (cell.dataValidation) {
                await this.excelRepository.setCellValidation(
                    this.templateId,
                    { type: "cell", ref: cell.ref, sheet: this.sheets.entryForm },
                    cell.dataValidation
                );
            }
        }
    }

    private async setPeriodDataValidation(): Promise<void> {
        const periodStartRow = 3;
        const validationSheet = this.sheets.validation;
        const cells = await this.excelRepository.getCellsInRange(this.templateId, {
            sheet: validationSheet,
            columnStart: "B",
            columnEnd: "B",
            rowStart: periodStartRow,
        });

        const lastCell = _(cells).last();
        if (lastCell) {
            const rowNumberFromRef = lastCell.ref.substring(1);
            this.excelRepository.setDataValidation(
                this.templateId,
                {
                    ref: "J11",
                    sheet: this.sheets.entryForm,
                    type: "cell",
                },
                `=${this.sheets.validation}!$B$${periodStartRow}:$B${rowNumberFromRef}`
            );
        }
    }

    private async getDataEntryCombinationsCells(): Promise<CellWithCombinationId[]> {
        const dataEntrySheet = this.sheets.dataEntry;
        const cellsCatOptComb = await this.excelRepository.getCellsInRange(this.templateId, {
            sheet: dataEntrySheet,
            columnStart: "D",
            rowStart: 5,
            rowEnd: 5,
        });

        const result = [];

        for (const cell of cellsCatOptComb) {
            const value = await this.excelRepository.readCell(this.templateId, cell);
            if (value) {
                const column = this.removeLastChar(cell.ref);
                const lastChar = Number(_(cell.ref).last());
                const deValue = await this.excelRepository.readCell(this.templateId, {
                    ...cell,
                    ref: `${column}${lastChar - 1}`,
                });
                if (!deValue) throw Error(`Cannot get dataElement for categoryOptionCombo from cell: ${cell.ref}`);
                result.push({
                    sheet: dataEntrySheet,
                    ref: cell.ref,
                    value: value.toString(),
                    column: column,
                    dataElementId: deValue.toString().replace("_", ""),
                });
            }
        }

        return result;
    }

    private removeLastChar(value: string): string {
        return value.slice(0, -1);
    }

    private getIdFromCellFormula(value: string): string {
        return value.replace("_", "");
    }

    private createSectionCells(
        metadata: MSFModuleMetadata,
        dataElementsByCombination: { dataElement: DataElement; categoryOptionCombos: CategoryOptionCombo[] }[]
    ): Cell[] {
        const initialSectionRefCell = Workbook.getColumnIndex("G");
        const initialSectionletter = Workbook.getExcelAlpha(initialSectionRefCell);

        const deByKeys = _.keyBy(metadata.dataSet.dataSetElements, dse => dse.dataElement.id);
        const spaceBetweenSections = 1;
        const spaceAtEndOfSection = 1;
        const initialSectionRowNumber = 17;

        const totalRowsPerSection = _(metadata.dataSet.sections)
            .flatMap(section => {
                const deByCategoryCombos = this.groupDataElementsByCategoryCombo(section, deByKeys);
                return deByCategoryCombos.map(categoryCombo => {
                    const firstDe = _(categoryCombo.dataElements).first();
                    if (!firstDe) return undefined;
                    const dataElement = deByKeys[firstDe.id];
                    if (!dataElement) return undefined;
                    return categoryCombo.dataElements.length + dataElement.categoryCombo.categories.length;
                });
            })
            .compact()
            .value();

        let sectionComboIndex = 0;

        const cells = _(metadata.dataSet.sections)
            .flatMap(section => {
                const deByCategoryCombos = this.groupDataElementsByCategoryCombo(section, deByKeys);

                return deByCategoryCombos.map(categoryCombo => {
                    const firstDe = _(categoryCombo.dataElements).first();
                    if (!firstDe) return undefined;

                    const dataElement = deByKeys[firstDe.id];

                    if (!dataElement) return undefined;
                    const totalCategories = dataElement.categoryCombo.categories.length;

                    const sumTotalRowsPerSection = _(totalRowsPerSection).slice(0, sectionComboIndex).sum();

                    const currentSpaces = (spaceBetweenSections + spaceAtEndOfSection) * sectionComboIndex;

                    const initialSectionCellNumber =
                        sectionComboIndex === 0
                            ? initialSectionRowNumber
                            : initialSectionRowNumber + sumTotalRowsPerSection + currentSpaces;

                    const sectionColumnEndLetter = Workbook.getExcelAlpha(initialSectionRefCell + 4);

                    const sectionNameCell: Cell = {
                        ref: `${initialSectionletter}${initialSectionCellNumber}`,
                        sheet: this.sheets.entryForm,
                        value: section.name,
                        style: this.sectionCellStyle,
                        includeInMapping: false,
                        merge: {
                            rowStart: initialSectionCellNumber,
                            rowEnd: initialSectionCellNumber,
                            columnStart: initialSectionletter,
                            columnEnd: sectionColumnEndLetter,
                        },
                        metadata: undefined,
                    };

                    const headerColumnIndex = Workbook.getColumnIndex("L");

                    const allCategoryOptions = dataElement.categoryCombo.categories.map(
                        category => category.categoryOptions
                    );
                    const productCategories = _.product(...allCategoryOptions);
                    const columnsGroups = this.generateColumnsCombinations(dataElement);
                    const fontColors = this.generateColors(totalCategories);

                    // Headers from Category Options
                    const cellsHeaders = columnsGroups.flatMap((columnGroup, colGroupIndex) => {
                        const quantityMergeCells = productCategories.length / columnGroup.length;
                        return columnGroup.flatMap((cell, cellIndex) => {
                            const nextLetter = cellIndex * quantityMergeCells;
                            const headerLetter = Workbook.getExcelAlpha(headerColumnIndex + nextLetter);
                            const rowNumber = initialSectionCellNumber + colGroupIndex;

                            const endMergeIndex = Workbook.getColumnIndex(headerLetter);
                            const endMergeLetter = Workbook.getExcelAlpha(endMergeIndex + (quantityMergeCells - 1));

                            const emptyCellForSection =
                                colGroupIndex > 0
                                    ? [
                                          {
                                              ...sectionNameCell,
                                              ref: `${initialSectionletter}${rowNumber}`,
                                              merge: sectionNameCell.merge
                                                  ? {
                                                        ...sectionNameCell.merge,
                                                        rowStart: rowNumber,
                                                        rowEnd: rowNumber,
                                                    }
                                                  : undefined,
                                              value: "",
                                          },
                                      ]
                                    : [];

                            const newCell: Cell = {
                                ...cell,
                                ref: `${headerLetter}${rowNumber}`,
                                style: {
                                    ...this.headerCellStyle,
                                    fontColor: fontColors[colGroupIndex] || DEFAULT_COLUMN_COLOR,
                                },
                                merge: {
                                    rowStart: rowNumber,
                                    rowEnd: rowNumber,
                                    columnStart: headerLetter,
                                    columnEnd: endMergeLetter,
                                },
                                includeInMapping: false,
                            };

                            const columnSpaceAtEnd = this.generateColumnSpaceAtEnd(
                                cellIndex,
                                columnGroup,
                                endMergeIndex,
                                quantityMergeCells,
                                cell,
                                rowNumber
                            );

                            return [...emptyCellForSection, newCell, ...columnSpaceAtEnd];
                        });
                    });

                    const cellsDe = _(categoryCombo.dataElements)
                        .map((sectionDe, deIndex) => {
                            const deWithCombination = dataElementsByCombination.find(
                                de => de.dataElement.id === sectionDe.id
                            );
                            const currentDe = deByKeys[sectionDe.id];
                            if (!currentDe || !deWithCombination) {
                                throw Error(`Data element not found ${sectionDe.id}`);
                            }
                            const rowNumber = initialSectionCellNumber + totalCategories + deIndex;
                            const endMergeIndex = Workbook.getColumnIndex(initialSectionletter);
                            const endMergeLetter = Workbook.getExcelAlpha(endMergeIndex + 3);

                            const deIndeCell: Cell = {
                                sheet: this.sheets.entryForm,
                                ref: `F${rowNumber}`,
                                value: String(sectionComboIndex + 1),
                                includeInMapping: false,
                                style: undefined,
                                merge: undefined,
                                metadata: undefined,
                            };

                            const deCell: Cell = {
                                sheet: this.sheets.entryForm,
                                ref: `${initialSectionletter}${rowNumber}`,
                                value: sectionDe.name,
                                style: this.dataElementCellStyle,
                                includeInMapping: false,
                                merge: {
                                    rowStart: rowNumber,
                                    rowEnd: rowNumber,
                                    columnStart: initialSectionletter,
                                    columnEnd: endMergeLetter,
                                },
                                metadata: undefined,
                            };

                            const combinationsCells = productCategories.flatMap((record, productIndex): Cell[] => {
                                const combColumnIndex = Workbook.getColumnIndex("L");
                                const combLetter = Workbook.getExcelAlpha(combColumnIndex + productIndex);

                                const isLastCell = productIndex + 1 === productCategories.length;
                                const lastCellColumn = Workbook.getExcelAlpha(combColumnIndex + productIndex + 1);
                                const spaceEndCell = isLastCell
                                    ? [
                                          {
                                              sheet: this.sheets.entryForm,
                                              ref: `${lastCellColumn}${
                                                  initialSectionCellNumber + totalCategories + deIndex
                                              }`,
                                              style: { ...this.headerCellStyle },
                                              value: "",
                                              includeInMapping: false,
                                              merge: undefined,
                                              metadata: undefined,
                                          },
                                      ]
                                    : [];

                                const combinationCellRef = `${combLetter}${
                                    initialSectionCellNumber + totalCategories + deIndex
                                }`;

                                return [
                                    {
                                        sheet: this.sheets.entryForm,
                                        ref: combinationCellRef,
                                        value: "",
                                        style: this.combinationCellStyle,
                                        includeInMapping: true,
                                        metadata: {
                                            dataElement: { ...sectionDe },
                                            categoryOptions: record.map(r => r.id),
                                            categoryCombinationId:
                                                deWithCombination.categoryOptionCombos[productIndex]?.id,
                                        },
                                        dataValidation: getValidationFromValueType(
                                            sectionDe.valueType,
                                            combinationCellRef,
                                            {
                                                booleanFormula: `=${this.sheets.validation}!$D$${3}:$D${4}`,
                                                trueOnlyFormula: `=${this.sheets.validation}!$D$${3}`,
                                            }
                                        ),
                                        merge: undefined,
                                    },
                                    ...spaceEndCell,
                                ];
                            });

                            const isLastDe = deIndex + 1 === categoryCombo.dataElements.length;
                            const spaceColumnEnd = Workbook.getExcelAlpha(
                                initialSectionRefCell + productCategories.length + 1 + 4
                            );
                            const spaceRow = rowNumber + 1;
                            const endSpaceDeCell = isLastDe
                                ? [
                                      {
                                          sheet: this.sheets.entryForm,
                                          ref: `${initialSectionletter}${rowNumber + 1}`,
                                          value: "",
                                          style: this.headerCellStyle,
                                          includeInMapping: false,
                                          merge: {
                                              rowStart: spaceRow,
                                              rowEnd: spaceRow,
                                              columnStart: initialSectionletter,
                                              columnEnd: spaceColumnEnd,
                                          },
                                          metadata: undefined,
                                      },
                                  ]
                                : [];

                            return [deIndeCell, deCell, ...combinationsCells, ...endSpaceDeCell];
                        })
                        .compact()
                        .flatMap()
                        .value();

                    sectionComboIndex += 1;
                    return [sectionNameCell, ...cellsHeaders, ...cellsDe];
                });
            })
            .compact()
            .flatMap()
            .value();

        return cells;
    }

    private groupDataElementsByCategoryCombo(
        section: DataSetSection,
        deByKeys: Record<Id, { dataElement: DataElement; categoryCombo: CategoryCombo }>
    ) {
        const dataElementsIdsInSection = _(section.dataElements).map(dataElement => dataElement.id);

        const dataElementsWithCategoryCombo = dataElementsIdsInSection
            .map(dataElementId => {
                const dataElement = deByKeys[dataElementId];
                if (!dataElement) throw Error(`Cannot find dataElement with id ${dataElementId}`);
                return { id: dataElement.categoryCombo.id, dataElement };
            })
            .groupBy("id")
            .value();

        const transformedArray = _.map(dataElementsWithCategoryCombo, (group, categoryComboId) => {
            return {
                categoryComboId,
                dataElements: group.map(item => item.dataElement.dataElement),
            };
        });
        return transformedArray;
    }

    private generateColumnSpaceAtEnd(
        cellIndex: number,
        columnGroup: Cell[],
        endMergeIndex: number,
        quantityMergeCells: number,
        cell: Cell,
        rowNumber: number
    ) {
        const isLastHeaderCell = cellIndex + 1 === columnGroup.length;
        const endSpaceColumn = Workbook.getExcelAlpha(endMergeIndex + (quantityMergeCells - 1) + 1);

        const lastCell = isLastHeaderCell
            ? [
                  {
                      ...cell,
                      ref: `${endSpaceColumn}${rowNumber}`,
                      value: "",
                      includeInMapping: false,
                      style: { ...this.headerCellStyle, merged: false },
                      merge: undefined,
                      metadata: undefined,
                  },
              ]
            : [];
        return lastCell;
    }

    private createMappingCells(
        metadata: MSFModuleMetadata,
        combinationCells: Cell[],
        dataEntryCells: CellWithCombinationId[]
    ): Cell[] {
        const greyedFields = _(metadata.dataSet.sections)
            .flatMap(section => {
                return section.greyedFields;
            })
            .value();

        const cells = _(combinationCells)
            .flatMap((cell, index) => {
                if (!cell.metadata) return undefined;
                const rowNumber = index + 1;

                const combinationCell: Cell = {
                    sheet: this.sheets.mapping,
                    includeInMapping: false,
                    value: cell.ref,
                    ref: `A${rowNumber}`,
                    style: undefined,
                    merge: undefined,
                    metadata: undefined,
                };

                const combinationId = cell.metadata.categoryCombinationId;
                if (!combinationId) return undefined;

                const dataEntryCell = dataEntryCells.find(dec => {
                    const condition =
                        this.getIdFromCellFormula(dec.value) === combinationId &&
                        dec.dataElementId === cell.metadata?.dataElement.id;
                    return condition;
                });

                if (!dataEntryCell) return undefined;

                const greyedField = greyedFields.find(
                    greyedField =>
                        greyedField.dataElement.id === dataEntryCell.dataElementId &&
                        greyedField.categoryOptionCombo.id === dataEntryCell.value.replace("_", "")
                );

                const dataEntryCocCell: Cell = {
                    sheet: this.sheets.mapping,
                    includeInMapping: false,
                    value: dataEntryCell.column,
                    ref: `B${rowNumber}`,
                    style: undefined,
                    merge: undefined,
                    metadata: undefined,
                };

                const dataElementCell: Cell = {
                    sheet: this.sheets.mapping,
                    value: cell.metadata?.dataElement.name || "",
                    ref: `E${rowNumber}`,
                    includeInMapping: false,
                    style: undefined,
                    merge: undefined,
                    metadata: undefined,
                };

                const blockCell: Cell = {
                    sheet: this.sheets.mapping,
                    includeInMapping: false,
                    value: greyedField ? cell.ref : "",
                    ref: `G${rowNumber}`,
                    style: undefined,
                    merge: undefined,
                    metadata: undefined,
                };

                const combinationCellWithStyle =
                    blockCell.value === combinationCell.value
                        ? {
                              ...combinationCell,
                              style: this.greyedFieldCellStyle,
                          }
                        : combinationCell;

                return [
                    combinationCellWithStyle,
                    dataEntryCocCell,
                    dataElementCell,
                    { ...dataElementCell, ref: `F${rowNumber}` },
                    blockCell,
                ];
            })
            .compact()
            .value();

        return cells;
    }

    private generateColumnsCombinations({ categoryCombo }: { categoryCombo: CategoryCombo }): Cell[][] {
        const result = categoryCombo.categories.reduce<ReduceCombinations>(
            (acum, category) => {
                const cartesian =
                    acum.prevCatOptions.length > 0
                        ? _.product(...acum.prevCatOptions, category.categoryOptions)
                        : _.product(category.categoryOptions);

                acum.prevCatOptions.push(category.categoryOptions);

                const columnsRows = _(cartesian)
                    .map(product => {
                        const lastItem = _(product).last();
                        return lastItem
                            ? {
                                  ref: "",
                                  value: lastItem.name !== "default" ? lastItem.name : "",
                                  sheet: this.sheets.entryForm,
                                  includeInMapping: false,
                                  style: undefined,
                                  metadata: undefined,
                                  merge: undefined,
                              }
                            : undefined;
                    })
                    .compact()
                    .value();

                acum.cells.push(columnsRows);

                return acum;
            },
            {
                prevCatOptions: [],
                cells: [],
            }
        );
        return result.cells;
    }

    private async setMappingAsDone() {
        await this.excelRepository.writeCell(
            this.templateId,
            { type: "cell", sheet: this.sheets.mapping, ref: "C1" },
            1
        );
        await this.excelRepository.protectSheet(this.templateId, this.sheets.mapping, this.password);
    }

    private generateColors(numberOfColorsToGenerate: number): string[] {
        const colors = Array.from({ length: numberOfColorsToGenerate }, (_, i) =>
            i === 0 ? DEFAULT_COLUMN_COLOR : ""
        );

        const lighterColors = colors.map((_, i) =>
            i === 0 ? DEFAULT_COLUMN_COLOR : this.makeColorLighter(colors[i - 1] || "")
        );
        return lighterColors;
    }

    private makeColorLighter(color: string): string {
        const getHexValue = (channel: number) => {
            const value = parseInt(color.slice(channel, channel + 2), 16);
            const newValue = Math.min(255, Math.max(0, value + 50));
            return newValue.toString(16).padStart(2, "0");
        };

        return `#${getHexValue(1)}${getHexValue(3)}${getHexValue(5)}`;
    }
}

type BaseCell = {
    sheet: string;
    ref: string;
    value: string;
};

export interface Cell extends BaseCell {
    style: Maybe<ThemeStyle>;
    includeInMapping: boolean;
    merge: Maybe<MergeCell>;
    metadata: Maybe<{ dataElement: DataElement; categoryOptions: Id[]; categoryCombinationId?: Id }>;
    dataValidation?: CellDataValidation | null;
}

type MergeCell = {
    rowStart: number;
    rowEnd: number;
    columnStart: string;
    columnEnd: string;
};

type ReduceCombinations = {
    prevCatOptions: CategoryOption[][];
    cells: Cell[][];
};

interface CellWithCombinationId extends BaseCell {
    column: string;
    dataElementId: Id;
}
