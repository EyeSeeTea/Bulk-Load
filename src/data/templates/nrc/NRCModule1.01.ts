import _ from "lodash";
import "lodash.product";
import { NRCModuleMetadata } from "../../../domain/entities/templates/NRCModuleMetadata";
import { Id, NamedRef, Ref } from "../../../domain/entities/ReferenceObject";
import {
    CustomTemplateWithUrl,
    DataSource,
    DownloadCustomizationOptions,
    RangeRef,
    StyleSource,
} from "../../../domain/entities/Template";
import { ExcelRepository } from "../../../domain/repositories/ExcelRepository";
import { InstanceRepository } from "../../../domain/repositories/InstanceRepository";
import { ModulesRepositories } from "../../../domain/repositories/ModulesRepositories";
import { NRCModuleMetadataRepository } from "../../../domain/repositories/templates/NRCModuleMetadataRepository";
import { Workbook } from "../../../webapp/logic/Workbook";

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
        excelRepository: ExcelRepository,
        _instanceRepository: InstanceRepository,
        modulesRepositories: ModulesRepositories,
        options: DownloadCustomizationOptions
    ): Promise<void> {
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

    private getValidationCells(metadata: NRCModuleMetadata) {
        const { categories } = metadata.categoryCombo;
        const projectCategoryOption = categories.project.categoryOption;

        const getCells = (items: Ref[], options: { column: string; useRef?: boolean }) => {
            const { useRef = true } = options;

            return items.map((item, idx) => {
                return cell({
                    sheet: this.sheets.validation,
                    column: options.column,
                    row: this.initialValidationRow + idx,
                    value: useRef ? referenceToId(item.id) : item.id,
                });
            });
        };

        return _.flatten([
            getCells(metadata.organisationUnits, { column: "A" }),
            getCells(categories.phasesOfEmergency.categoryOptions, { column: "B" }),
            getCells(categories.targetActual.categoryOptions, { column: "C" }),
            getCells(metadata.dataElements, { column: "D" }),
            getCells([metadata.dataSet], { column: "G" }),
            getCells([projectCategoryOption], { column: "E" }),
            getCells(metadata.periods, { column: "F", useRef: false }),
        ]);
    }

    private getSheetData(metadata: NRCModuleMetadata): WorkbookData {
        const validationCells = this.getValidationCells(metadata);
        const metadataCells = this.getMetadataCells(metadata);
        const aocCells = this.getAttributeOptionComboCells(metadata);
        const cocCells = this.getCategoryOptionComboCells(metadata);
        const miscCells = [
            cell({ sheet: this.sheets.dataEntry, column: "F", row: 1, value: referenceToId(metadata.dataSet.id) }),
        ];

        return {
            cells: _.concat(miscCells, validationCells, metadataCells, aocCells, cocCells),
        };
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
        const projectCategoryOption = categories.project.categoryOption;

        const categoryOptionsProduct = _.product(
            [categories.project.categoryOption],
            categories.phasesOfEmergency.categoryOptions,
            categories.targetActual.categoryOptions
        );

        const cocsByKey = _.keyBy(metadata.categoryCombo.categoryOptionCombos, getCocKey);

        const projectCategoryOptionCell = cell({
            sheet: this.sheets.dataEntry,
            column: "B",
            row: 1,
            value: referenceToId(projectCategoryOption.id),
        });

        const aocCells = _(categoryOptionsProduct)
            .map(categoryOptions => {
                const key = getCocKey({ categoryOptions });
                const coc = cocsByKey[key];
                if (!coc) {
                    console.error(`Category option combo not found: categoryOptionIds=${key}`);
                    return null;
                } else {
                    return { categoryOptions, categoryOptionCombo: coc };
                }
            })
            .compact()
            .flatMap((obj, idx) => {
                const row = this.initialValidationRow + idx;
                const sum = { id: "=" + [`I${row}`, `J${row}`, `K${row}`].join(" & ") };

                return _.zip([obj.categoryOptionCombo, ...obj.categoryOptions, sum], ["H", "I", "J", "K", "L"]).map(
                    ([obj, column]) => {
                        if (!obj || !column) return null;

                        return cell({
                            sheet: this.sheets.validation,
                            column: column,
                            row: row,
                            value: obj.id,
                        });
                    }
                );
            })
            .compact()
            .concat([projectCategoryOptionCell])
            .value();

        return aocCells;
    }

    private getMetadataCells(metadata: NRCModuleMetadata) {
        const { categories } = metadata.categoryCombo;
        const projectCategoryOption = categories.project.categoryOption;

        const categoryOptions = _([projectCategoryOption])
            .concat(categories.phasesOfEmergency.categoryOptions)
            .concat(categories.targetActual.categoryOptions)
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

        /*
        await excelRepository.defineName(this.id, nameForId(cell.id), {
            type: "cell" as const,
            sheet: cell.sheet,
            ref: cell.ref,
        });
        */

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
        /*
        const { categories } = metadata.categoryCombo;

        await this.setDropdown({ data: "A", validation: "A" }, metadata.organisationUnits);
        await this.setDropdown({ data: "B", validation: "B" }, categories.phasesOfEmergency.categoryOptions);
        await this.setDropdown({ data: "C", validation: "D" }, metadata.dataElements);
        await this.setDropdown({ data: "E", validation: "C" }, categories.targetActual.categoryOptions);
        await this.setDropdownCell("D1", { validation: "F" }, metadata.periods);
        */

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

        excelRepository.protectSheet(this.id, this.sheets.validation, this.password);
        excelRepository.protectSheet(this.id, this.sheets.metadata, this.password);
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
