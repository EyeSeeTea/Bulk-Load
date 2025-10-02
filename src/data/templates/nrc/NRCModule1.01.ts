import _ from "lodash";
import "lodash.product";
import { NRCModuleMetadata } from "../../../domain/entities/templates/NRCModuleMetadata";
import { Id, NamedRef, Ref } from "../../../domain/entities/ReferenceObject";
import {
    CustomTemplateWithUrl,
    DataSource,
    DownloadCustomizationOptions,
    DownloadCustomizationRepositories,
    RangeRef,
    StyleSource,
} from "../../../domain/entities/Template";
import { ExcelRepository } from "../../../domain/repositories/ExcelRepository";
import { NRCModuleMetadataRepository } from "../../../domain/repositories/templates/NRCModuleMetadataRepository";
import { Workbook } from "../../../webapp/logic/Workbook";
import { Maybe } from "../../../types/utils";

export class NRCModule101 implements CustomTemplateWithUrl {
    public readonly type = "custom";

    public readonly id = "NRCmodule_v1";
    public readonly name = "NRCModule";
    public readonly description = "";
    public readonly url = "templates/NRCModule.xlsx";

    public readonly dataFormId = { type: "cell" as const, sheet: 0, ref: "F1" };
    public readonly dataFormType = { type: "value" as const, id: "dataSets" as const };
    public readonly fixedPeriod = { type: "cell" as const, sheet: "Data Entry", ref: "D1" };

    public readonly dataSources: DataSource[] = [
        {
            type: "row",
            orgUnit: { sheet: "Data Entry", type: "column", ref: "A" },
            period: this.fixedPeriod,
            dataElement: { sheet: "Data Entry", type: "column", ref: "C" },
            categoryOption: { sheet: "Data Entry", type: "column", ref: "H" },
            attribute: { sheet: "Data Entry", type: "column", ref: "G" },
            range: { sheet: "Data Entry", rowStart: 4, columnStart: "F", columnEnd: "F" },
        },
    ];

    public readonly styleSources: StyleSource[] = [];

    public async downloadCustomization(
        repositories: DownloadCustomizationRepositories,
        options: DownloadCustomizationOptions
    ): Promise<void> {
        const { excelRepository, modulesRepositories } = repositories;
        return new DownloadCustomization(this.id, excelRepository, modulesRepositories.nrc, options).execute();
    }
}

class DownloadCustomization {
    initialValidationRow = 3;
    initialMetadataRow = 4;
    initialDataEntryRow = 4;
    password = "1234";

    sheets = {
        dataEntry: "Data Entry",
        validation: "Validation",
        metadata: "Metadata",
    };

    constructor(
        private id: Id,
        private excelRepository: ExcelRepository,
        private moduleRepository: NRCModuleMetadataRepository,
        private options: DownloadCustomizationOptions
    ) {}

    async execute() {
        await this.createSheet(this.sheets.validation);
        await this.createSheet(this.sheets.metadata);

        const metadata = await this.moduleRepository.get({
            currentUser: this.options.currentUser,
            dataSetId: this.options.id,
        });
        const workbookData = this.getSheetData(metadata);
        await this.fillWorkbook(metadata, workbookData);
    }

    private async createSheet(name: string) {
        await this.excelRepository.getOrCreateSheet(this.id, name);
    }

    private getValidationCells(metadata: NRCModuleMetadata): Cell[] {
        const getCells = (items: Maybe<Ref[]>, options: { column: string; useRef?: boolean }) => {
            const { useRef = true } = options;
            if (!items) return [];

            return items.map((item, idx) => {
                return cell({
                    sheet: this.sheets.validation,
                    column: options.column,
                    row: this.initialValidationRow + idx,
                    value: useRef ? referenceToId(item.id) : item.id,
                });
            });
        };

        const categoryOptions = this.getCategoryOptionsObj(metadata);

        return _.flatten([
            getCells(metadata.organisationUnits, { column: "A" }),
            getCells(categoryOptions.projects, { column: "E" }),
            getCells(categoryOptions.phasesOfEmergency, { column: "B" }),
            getCells(categoryOptions.targetActual, { column: "C" }),
            getCells(metadata.dataElements, { column: "D" }),
            getCells([metadata.dataSet], { column: "G" }),
            getCells(metadata.periods, { column: "F", useRef: false }),
        ]);
    }

    private getCategoryOptionsObj(metadata: NRCModuleMetadata): CategoryOptions {
        const { categories } = metadata.categoryCombo;

        return {
            projects: categories.projects?.categoryOptions,
            phasesOfEmergency: categories.phasesOfEmergency?.categoryOptions,
            targetActual: categories.targetActual?.categoryOptions,
        };
    }

    private getSheetData(metadata: NRCModuleMetadata): WorkbookData {
        const cellGroups = [
            this.getValidationCells(metadata),
            this.getMetadataCells(metadata),
            this.getAttributeOptionComboCells(metadata),
            this.getCategoryOptionComboCells(metadata),
            this.getDataSetCells(metadata),
            this.getClearedOutCellsByCategories(metadata),
        ];

        return { cells: _.flatten(cellGroups) };
    }

    private getDataSetCells(metadata: NRCModuleMetadata) {
        return [
            cell({
                sheet: this.sheets.dataEntry,
                column: "F",
                row: 1,
                value: referenceToId(metadata.dataSet.id),
            }),
        ];
    }

    private getClearedOutCellsByCategories(metadata: NRCModuleMetadata): Cell[] {
        const { categories } = metadata.categoryCombo;

        const emptyCell = (options: { row: number; column: string }) =>
            cell({ row: options.row, column: options.column, sheet: this.sheets.dataEntry, value: "" });

        return _.flatten([
            categories.projects ? [] : [emptyCell({ column: "A", row: 1 }), emptyCell({ column: "B", row: 1 })],
            categories.phasesOfEmergency ? [] : [emptyCell({ column: "B", row: 3 })],
            categories.targetActual ? [] : [emptyCell({ column: "E", row: 3 })],
        ]);
    }

    private getCategoryOptionComboCells(metadata: NRCModuleMetadata): Cell[] {
        const initialColumnIndex = Workbook.getColumnIndex("M");

        return _(metadata.dataElements)
            .sortBy(dataElement => dataElement.id.toLowerCase())
            .flatMap((dataElement, dataElementIdx) => {
                const column = Workbook.getExcelAlpha(initialColumnIndex + dataElementIdx);

                const dataElementCell = cell({
                    sheet: this.sheets.validation,
                    column: column,
                    row: this.initialValidationRow,
                    value: dataElement.id,
                });

                const cocCells = dataElement.categoryCombo.categoryOptionCombos.map((coc, cocIdx) => {
                    return cell({
                        sheet: this.sheets.validation,
                        column: column,
                        row: this.initialValidationRow + 1 + cocIdx,
                        value: referenceToId(coc.id),
                    });
                });

                return [dataElementCell, ...cocCells];
            })
            .value();
    }

    private getAttributeOptionComboCells(metadata: NRCModuleMetadata) {
        const { categories } = metadata.categoryCombo;
        const projectCategoryOptions = categories.projects?.categoryOptions;
        const empty: NamedRef[] = [{ id: "", name: "EMPTY" }];

        const groups = [
            projectCategoryOptions ? projectCategoryOptions : empty,
            categories.phasesOfEmergency?.categoryOptions || empty,
            categories.targetActual?.categoryOptions || empty,
        ];

        const categoryOptionsProduct = _.product(...groups);

        const cocsByKey = _.keyBy(metadata.categoryCombo.categoryOptionCombos, getCocKey);

        const projectCategoryOptionCell = this.getProjectCategoryOptionCell(projectCategoryOptions);

        const aocCells = _(categoryOptionsProduct)
            .map(categoryOptions => {
                const key = getCocKey({ categoryOptions });
                const coc = cocsByKey[key];
                if (!coc) {
                    console.error(`Category option combo not found: categoryOptionIds=${key}`);
                    return null;
                } else {
                    return { categoryOptions: categoryOptions, categoryOptionCombo: coc };
                }
            })
            .compact()
            .flatMap((obj, idx) => {
                const row = this.initialValidationRow + idx;
                const sum = { id: "=" + [`I${row}`, `J${row}`, `K${row}`].join(" & ") };
                const objs = [obj.categoryOptionCombo, ...obj.categoryOptions, sum];
                const sheet = this.sheets.validation;

                return _.zip(objs, ["H", "I", "J", "K", "L"]).map(([obj, column]) => {
                    return !obj || !column ? null : cell({ sheet, column, row, value: obj.id });
                });
            })
            .compact()
            .concat(projectCategoryOptionCell ? [projectCategoryOptionCell] : [])
            .value();

        return aocCells;
    }

    private getProjectCategoryOptionCell(projectCategoryOptions: NamedRef[] | undefined) {
        const firstProject = _.first(projectCategoryOptions);
        const onlyOneCategoryOption = projectCategoryOptions?.length === 1;

        return cell({
            sheet: this.sheets.dataEntry,
            column: "B",
            row: 1,
            value: firstProject && onlyOneCategoryOption ? referenceToId(firstProject.id) : "",
        });
    }

    private getMetadataCells(metadata: NRCModuleMetadata) {
        const categoryOptionsObj = this.getCategoryOptionsObj(metadata);

        const categoryOptions = _([{ id: "", name: "" }]) // Blank option to match empty categoryOption
            .concat(categoryOptionsObj.projects || [])
            .concat(categoryOptionsObj.phasesOfEmergency || [])
            .concat(categoryOptionsObj.targetActual || [])
            .value();

        const categoryOptionCombos = _(metadata.dataElements)
            .flatMap(dataElement => dataElement.categoryCombo.categoryOptionCombos)
            .concat(metadata.categoryCombo.categoryOptionCombos)
            .uniqBy(coc => coc.id)
            .value();

        const metadataObj: Array<{ metadataType: string; items: NamedRef[] }> = [
            { metadataType: "dataSets", items: [metadata.dataSet] },
            { metadataType: "categoryOptions", items: categoryOptions },
            { metadataType: "organisationUnits", items: metadata.organisationUnits },
            { metadataType: "dataElements", items: metadata.dataElements },
            { metadataType: "categoryOptionCombos", items: categoryOptionCombos },
        ];

        return _(metadataObj)
            .flatMap(({ metadataType, items }) => items.map(item => ({ metadataType, item })))
            .sortBy(({ metadataType, item }) => [metadataType, "-", item.name.toLowerCase()].join(""))
            .flatMap(({ metadataType, item }, idx) => {
                const row = this.initialMetadataRow + idx;

                const cells = [
                    { column: "A", value: item.id },
                    { column: "B", value: metadataType },
                    { column: "C", value: item.name, id: item.id },
                    { column: "D", value: `=B${row}&"-"&C${row}` },
                ];

                return cells.map(obj => cell({ sheet: this.sheets.metadata, row: row, ...obj }));
            })
            .value();
    }

    private async setDropdown(columns: { data: string; validation: string }, objects: unknown[]) {
        const row = this.initialValidationRow;
        const range: RangeRef = {
            type: "range",
            sheet: this.sheets.dataEntry,
            ref: `${columns.data}4:${columns.data}1000`,
        };
        const value = `Validation!$${columns.validation}$${row}:$${columns.validation}$${row + objects.length - 1}`;

        await this.excelRepository.setDataValidation(this.id, range, value);
    }

    private async setDropdownCell(cellRef: string, columns: { validation: string }, objects: unknown[]) {
        const row = this.initialValidationRow;

        await this.excelRepository.setDataValidation(
            this.id,
            { type: "cell", sheet: this.sheets.dataEntry, ref: cellRef },
            `Validation!$${columns.validation}$${row}:$${columns.validation}$${row + objects.length - 1}`
        );
    }

    private async fillWorkbook(_metadata: NRCModuleMetadata, sheetData: WorkbookData) {
        const { excelRepository } = this;

        for (const cell of sheetData.cells) {
            await excelRepository.writeCell(
                this.id,
                {
                    type: "cell" as const,
                    sheet: cell.sheet,
                    ref: cell.ref,
                },
                cell.value
            );
        }

        // Defined names must be set after cell values, as writeCell looks for existing names.

        for (const cell of sheetData.cells) {
            if (!cell.id) continue;

            await excelRepository.defineName(this.id, nameForId(cell.id), {
                type: "cell" as const,
                sheet: cell.sheet,
                ref: cell.ref,
            });
        }

        this.hideIdCells(excelRepository);

        excelRepository.protectSheet(this.id, this.sheets.validation, this.password);
        excelRepository.protectSheet(this.id, this.sheets.metadata, this.password);
    }

    private hideIdCells(excelRepository: ExcelRepository) {
        const idColumns = ["G", "H", "I", "J"];
        const sheet = this.sheets.dataEntry;

        idColumns.forEach(idColumn => {
            excelRepository.hideCells(this.id, { sheet: sheet, type: "column", ref: idColumn }, true);
        });
    }
}

interface Cell {
    sheet: string;
    ref: string;
    value: string;
    id?: Id;
}

interface WorkbookData {
    cells: Cell[];
}

function nameForId(id: Id): string {
    return `_${id}`;
}

function referenceToId(id: Id): string {
    return `=${nameForId(id)}`;
}

function getCocKey(categoryOptionCombo: { categoryOptions: Ref[] }): string {
    return _(categoryOptionCombo.categoryOptions)
        .map(co => co.id)
        .sortBy()
        .reject(id => id === "")
        .join(".");
}

function cell(options: { sheet: string; column: string; row: number; value: string; id?: Id }): Cell {
    return {
        sheet: options.sheet,
        ref: `${options.column}${options.row}`,
        value: options.value,
        id: options.id,
    };
}

type CategoryOptions = {
    projects?: NamedRef[];
    phasesOfEmergency?: NamedRef[];
    targetActual?: NamedRef[];
};
