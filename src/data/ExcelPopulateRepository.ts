import XLSX, {
    Cell,
    Cell as ExcelCell,
    FormulaError,
    Workbook as ExcelWorkbook,
    Workbook,
} from "@eyeseetea/xlsx-populate";
import _ from "lodash";
import moment from "moment";
import { CellDataValidation } from "../domain/entities/CellDataValidation";
import { Sheet } from "../domain/entities/Sheet";
import {
    CellRef,
    ColumnRef,
    ContentType,
    Range,
    RangeRef,
    RowRef,
    SheetRef,
    ValueRef,
} from "../domain/entities/Template";
import { ThemeStyle } from "../domain/entities/Theme";
import { ExcelRepository, ExcelValue, LoadOptions, ReadCellOptions } from "../domain/repositories/ExcelRepository";
import i18n from "../utils/i18n";
import { cache } from "../utils/cache";
import { fromBase64 } from "../utils/files";
import { removeCharacters } from "../utils/string";
import { Maybe } from "../types/utils";

export class ExcelPopulateRepository extends ExcelRepository {
    private workbooks: Record<string, ExcelWorkbook> = {};

    public async loadTemplate(options: LoadOptions): Promise<string> {
        const workbook = await this.parseFile(options);
        const forcedCleanId = options.type === "file-base64" ? options.templateId : null;
        const cell = workbook.sheet(0).cell("A1");
        const versionPrefix = /Version[:_]/;

        // We need to read and store the template ID in the spreadsheet. Keep old/new way for compatibility:
        //  - Old way: sheets[0].cell("A1").value("Version: ID")
        //  - New way: workbook.definedName("Version_ID")
        let cleanId: string;
        if (forcedCleanId) {
            workbook.definedName(`Version_${forcedCleanId}`, cell);
            cleanId = forcedCleanId;
        } else {
            const idFromDefinedName = workbook.definedName().find(name => name.match(versionPrefix));
            const idFromCell = cell.value();
            const id = idFromDefinedName || idFromCell;

            if (!id || typeof id !== "string") throw new Error("Invalid id");
            cleanId = id.replace(/^.*?[:_]/, "").trim();
        }

        this.workbooks[cleanId] = workbook;
        return cleanId;
    }

    private async parseFile(options: LoadOptions): Promise<ExcelWorkbook> {
        switch (options.type) {
            case "url": {
                const response = await fetch(options.url);
                const data = await response.arrayBuffer();
                return XLSX.fromDataAsync(data);
            }
            case "file": {
                return XLSX.fromDataAsync(options.file);
            }
            case "file-base64": {
                const file = await fromBase64(options.contents);
                const blob = new Blob([file]);
                return XLSX.fromDataAsync(blob);
            }
            default: {
                return XLSX.fromBlankAsync();
            }
        }
    }

    public async toBlob(id: string): Promise<Blob> {
        const data = await this.toBuffer(id);
        return new Blob([data], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
    }

    public async toBuffer(id: string): Promise<Buffer> {
        const workbook = await this.getWorkbook(id);
        return workbook.outputAsync() as unknown as Buffer;
    }

    public async findRelativeCell(id: string, location?: SheetRef, cellRef?: CellRef): Promise<CellRef | undefined> {
        const workbook = await this.getWorkbook(id);

        if (location?.type === "cell") {
            const destination = workbook.sheet(location.sheet)?.cell(location.ref);
            if (!destination) return undefined;
            return { type: "cell", sheet: destination.sheet().name(), ref: destination.address() };
        } else if (location && cellRef) {
            const cell = workbook.sheet(cellRef.sheet).cell(cellRef.ref);
            const row = location.type === "row" ? location.ref : cell.rowNumber();
            const column = location.type === "column" ? location.ref : cell.columnName();
            const destination = workbook.sheet(location.sheet).cell(row, column);
            return { type: "cell", sheet: destination.sheet().name(), ref: destination.address() };
        }
    }

    public async writeCell(id: string, cellRef: CellRef, value: string | number | boolean): Promise<void> {
        const workbook = await this.getWorkbook(id);
        const mergedCells = this.listMergedCells(workbook, cellRef.sheet);
        const definedNames = await this.listDefinedNames(id);
        const definedName = definedNames.find(name => removeCharacters(name) === removeCharacters(value));

        const cell = workbook.sheet(cellRef.sheet)?.cell(cellRef.ref);
        if (!cell) return;

        const { startCell: destination = cell } = mergedCells.find(range => range.hasCell(cell)) ?? {};

        if (!!value && !isNaN(Number(value))) {
            destination.value(Number(value));
        } else if (String(value).startsWith("=")) {
            destination.formula(String(value));
        } else if (definedName) {
            destination.formula(`=${definedName}`);
        } else {
            destination.value(value);
        }
    }

    public async readCell(
        id: string,
        cellRef?: CellRef | ValueRef,
        options?: ReadCellOptions
    ): Promise<ExcelValue | undefined> {
        if (!cellRef) return undefined;
        if (cellRef.type === "value") return cellRef.id;

        const workbook = await this.getWorkbook(id);
        return this.readCellValue(workbook, cellRef, options?.formula);
    }

    public async getContentType(id: string, cellRef?: CellRef | ValueRef): Promise<Maybe<ContentType>> {
        if (!cellRef) return undefined;
        if (cellRef.type === "value") return "raw";

        const workbook = await this.getWorkbook(id);
        const { cell } = this.getDestination(workbook, cellRef);

        const formula = cell.formula();

        if (!formula) {
            return "raw";
        } else if (formula.includes("(") && formula.includes(")")) {
            //using excel specific functions
            return "function";
        } else {
            return "formula";
        }
    }

    public async getConstants(id: string): Promise<Record<string, string>> {
        const workbook = await this.getWorkbook(id);
        const keys = (workbook as any).definedName() as string[];

        return _(keys)
            .map(key => {
                const element = workbook.definedName(key);
                if (!isCell(element)) return null;
                const value = element.value();
                return value ? ([key, value.toString()] as [string, string]) : null;
            })
            .compact()
            .fromPairs()
            .value();
    }

    public async getSheets(id: string): Promise<Sheet[]> {
        const workbook = await this.getWorkbook(id);

        return workbook.sheets().map((sheet, index) => {
            return {
                index,
                name: sheet.name(),
                active: sheet.active(),
            };
        });
    }

    private getDestination(workbook: Workbook, cellRef: CellRef): { cell: XLSX.Cell; sheet: XLSX.Sheet } {
        const mergedCells = this.listMergedCells(workbook, cellRef.sheet);
        const sheet = workbook.sheet(cellRef.sheet);
        const cell = sheet.cell(cellRef.ref);
        const matchingMergedCell = mergedCells.find(mergedCell => mergedCell.hasCell(cell));
        const destinationCell = matchingMergedCell?.startCell || cell;
        return {
            cell: destinationCell,
            sheet,
        };
    }

    private async readCellValue(
        workbook: Workbook,
        cellRef: CellRef,
        formula = false
    ): Promise<ExcelValue | undefined> {
        const { cell: destination, sheet } = this.getDestination(workbook, cellRef);

        const getFormulaValue = () => getFormulaWithValidation(workbook, sheet as SheetWithValidations, destination);

        const formulaValue = getFormulaValue();
        const textValue = getValue(destination);
        const value = formula ? formulaValue : this.resolveNA(textValue, formulaValue);

        if (value instanceof FormulaError) return "";

        if (isTimeFormat(destination.style("numberFormat"))) {
            const date = moment(XLSX.numberToDate(value));
            if (date.isValid()) return date.format("HH:mm");
        } else if (isDateFormat(destination.style("numberFormat"))) {
            const date = moment(XLSX.numberToDate(value));
            if (date.isValid()) return XLSX.numberToDate(value);
        }

        return value;
    }

    // #N/A is a common result of a formula that does not find a value
    // return a blank string when formula results to #N/A
    // -----
    // can be used as a workaround:
    // formulas that result to blank cells store the raw formula in the value
    // use #N/A as default value instead of blank
    private resolveNA(value: Maybe<ExcelValue>, formula: Maybe<ExcelValue>): Maybe<ExcelValue> {
        if (value === "#N/A") return "";
        return value ?? formula;
    }

    public async getCellsInRange(id: string, range: Range): Promise<CellRef[]> {
        const workbook = await this.getWorkbook(id);

        const { sheet, columnStart, rowStart, columnEnd, rowEnd } = range;

        const rangeColumnEnd = columnEnd ?? (await this.getSheetFinalColumn(id, range.sheet)) ?? "XFD";
        const rangeRowEnd = rowEnd ?? (await this.getSheetRowsCount(id, range.sheet)) ?? 1048576;

        if (rangeRowEnd < rowStart) return [];

        const rangeCells = workbook.sheet(sheet).range(rowStart, columnStart, rangeRowEnd, rangeColumnEnd);

        return _.flatten(rangeCells.cells()).map(cell => ({
            type: "cell",
            sheet,
            ref: cell.address(),
        }));
    }

    public async addPicture(id: string, location: SheetRef, file: File): Promise<void> {
        const workbook = await this.getWorkbook(id);

        const { sheet, ref } = location;
        const [from, to] = location.type === "range" ? String(ref).split(":") : [ref, ref];

        // @ts-ignore: This part is not typed (we need to create an extension)
        workbook.sheet(sheet).drawings("logo", file).from(from).to(to);
    }

    public async styleCell(id: string, source: SheetRef, style: ThemeStyle): Promise<void> {
        const workbook = await this.getWorkbook(id);

        const { sheet } = source;
        const {
            text,
            bold,
            italic,
            fontSize = 12,
            fontColor,
            fillColor,
            wrapText,
            horizontalAlignment,
            verticalAlignment = "center",
            border,
            borderColor,
            rowSize,
            columnSize,
            merged = false,
            locked,
        } = style;

        const textStyle = _.omitBy(
            {
                bold,
                italic,
                fontSize,
                fontColor: fontColor?.replace(/#/g, ""),
            },
            _.isUndefined
        );

        const cellStyle = _.omitBy(
            {
                verticalAlignment,
                horizontalAlignment,
                wrapText,
                fill: fillColor?.replace(/#/g, ""),
                border,
                borderColor: borderColor?.replace(/#/g, ""),
                locked,
            },
            _.isUndefined
        );

        const range =
            source.type === "range"
                ? workbook.sheet(sheet).range(String(source.ref))
                : workbook.sheet(sheet).range(`${source.ref}:${source.ref}`);

        const cells = source.type === "cell" ? [workbook.sheet(sheet).cell(source.ref)] : _.flatten(range.cells());

        if (source.type === "range") range.merged(merged);

        try {
            for (const cell of cells) {
                const value = text ?? String(getValue(cell) ?? "");
                const formula = cell.formula();

                //@ts-ignore Not properly typed
                const richText = new XLSX.RichText();
                richText.add(value, textStyle);

                const destination = cell.style(cellStyle).value(richText);
                if (formula) destination.formula(formula);

                if (rowSize) cell.row().hidden(false).height(rowSize);
                if (columnSize) cell.column().hidden(false).width(columnSize);
            }
        } catch (error) {
            console.error("Could not apply style", { source, style, error });
        }
    }

    @cache()
    public async getSheetRowsCount(id: string, sheetId: string | number): Promise<number | undefined> {
        const workbook = await this.getWorkbook(id);
        const sheet = workbook.sheet(sheetId);
        if (!sheet) return;

        const lastRowWithValues = _(sheet._rows)
            .compact()
            .dropRightWhile(row =>
                _((row as RowWithCells)._cells)
                    .compact()
                    .every(c => c.value() === undefined)
            )
            .last();

        return lastRowWithValues ? lastRowWithValues.rowNumber() : 0;
    }

    @cache()
    public async getSheetFinalColumn(id: string, sheetId: string | number): Promise<string | undefined> {
        const workbook = await this.getWorkbook(id);
        const sheet = workbook.sheet(sheetId);
        if (!sheet) return;

        const maxColumn = _(sheet._rows)
            .take(1000)
            .compact()
            //@ts-ignore
            .map(row => row.maxUsedColumnNumber())
            .max();

        return this.buildColumnName(maxColumn ?? 0);
    }

    public async getOrCreateSheet(id: string, name: string): Promise<Sheet> {
        const workbook = await this.getWorkbook(id);
        const sheet = workbook.sheet(name) ?? workbook.addSheet(name);
        const index = _.findIndex(workbook.sheets(), sheet => sheet.name() === name);

        return {
            index,
            name: sheet.name(),
            active: sheet.active(),
        };
    }

    public buildColumnName(column: number | string): string {
        if (typeof column === "string") return column;

        let dividend = column;
        let name = "";
        let modulo = 0;

        while (dividend > 0) {
            modulo = (dividend - 1) % 26;
            name = String.fromCharCode("A".charCodeAt(0) + modulo) + name;
            dividend = Math.floor((dividend - modulo) / 26);
        }

        return name;
    }

    public buildColumnNumber(column: string): number {
        const letters = column.split("");
        let number = 0;

        for (let i = 0; i < letters.length; i++) {
            const start = letters[i]?.charCodeAt(0) ?? 0;
            number += Math.pow(26, letters.length - i - 1) * (start - "A".charCodeAt(0) + 1);
        }

        return number - 1;
    }

    public buildRowNumber(row: string): number {
        const rowNumber = row.match(/\d+/g);
        return rowNumber ? parseInt(rowNumber[0] ?? "0") : 0;
    }

    private listMergedCells(workbook: Workbook, sheet: string | number): MergedCell[] {
        return workbook
            .sheet(sheet)
            ?.merged()
            .map(range => {
                const startCell = range.startCell();
                const hasCell = (cell: ExcelCell) => range.cells()[0]?.includes(cell);

                return { range, startCell, hasCell };
            });
    }

    private async getWorkbook(id: string) {
        const workbook = this.workbooks[id];

        if (!workbook) {
            const loaded = Object.keys(this.workbooks).join(", ");
            throw new Error(
                i18n.t("Template {{id}} not loaded. Loaded: {{loaded}}", { id, loaded, nsSeparator: false })
            );
        }

        return workbook;
    }

    public async listDefinedNames(id: string): Promise<string[]> {
        const workbook = await this.getWorkbook(id);
        try {
            return workbook.definedName();
        } catch (error) {
            return [];
        }
    }

    public async defineName(id: string, name: string, cell: CellRef): Promise<void> {
        const workbook = await this.getWorkbook(id);
        const location = workbook.sheet(cell.sheet).cell(cell.ref);
        workbook.definedName(name, location);
    }

    public async mergeCells(id: string, range: Range): Promise<void> {
        const workbook = await this.getWorkbook(id);

        const { sheet, columnStart, rowStart, columnEnd, rowEnd } = range;

        const rangeColumnEnd = columnEnd ?? (await this.getSheetFinalColumn(id, range.sheet)) ?? "XFD";
        const rangeRowEnd = rowEnd ?? (await this.getSheetRowsCount(id, range.sheet)) ?? 1048576;

        if (rangeRowEnd >= rowStart) {
            workbook.sheet(sheet).range(rowStart, columnStart, rangeRowEnd, rangeColumnEnd).merged(true);
        }
    }

    public async hideCells(id: string, ref: ColumnRef | RowRef, hidden = true): Promise<void> {
        const workbook = await this.getWorkbook(id);
        const sheet = workbook.sheet(ref.sheet);
        const item = ref.type === "row" ? sheet.row(ref.ref) : sheet.column(ref.ref);
        item.hidden(hidden);
    }

    public async hideSheet(id: string, sheet: string | number, hidden = true): Promise<void> {
        const workbook = await this.getWorkbook(id);
        workbook.sheet(sheet).hidden(hidden);
    }

    public async deleteSheet(id: string, sheet: string | number): Promise<void> {
        const workbook = await this.getWorkbook(id);
        const xlsSheet = workbook.sheet(sheet);
        workbook.deleteSheet(xlsSheet);
    }

    public async protectSheet(id: string, sheet: string | number, password: string): Promise<void> {
        const workbook = await this.getWorkbook(id);
        workbook.sheet(sheet).protected(password, {
            selectLockedCells: true,
        });
    }

    public async setActiveCell(id: string, cell: CellRef): Promise<void> {
        const workbook = await this.getWorkbook(id);
        workbook.sheet(cell.sheet).activeCell(cell.ref);
    }

    public async setDataValidation(id: string, ref: CellRef | RangeRef, formula: string | null): Promise<void> {
        const workbook = await this.getWorkbook(id);
        const sheet = workbook.sheet(ref.sheet);
        const item = ref.type === "range" ? sheet.range(ref.ref) : sheet.cell(ref.ref);
        // @ts-ignore Not properly typed (https://app.clickup.com/t/e14mnv)
        item.dataValidation(formula);
    }

    public async setCellValidation(id: string, ref: CellRef, options: CellDataValidation): Promise<void> {
        const workbook = await this.getWorkbook(id);
        const sheet = workbook.sheet(ref.sheet);
        const item = sheet.cell(ref.ref);
        item.dataValidation(options);
    }
}

function isCell(element: any): element is ExcelCell {
    return element?.constructor?.name === "Cell";
}

interface SheetWithValidations extends XLSX.Sheet {
    _dataValidations: Record<string, unknown>;
    dataValidation(address: string): false | { type: string; formula1: string };
}

/* Get formula of associated cell (through data valudation). Basic implementation. No caching */
function getFormulaWithValidation(workbook: XLSX.Workbook, sheet: SheetWithValidations, cell: XLSX.Cell) {
    try {
        return _getFormulaWithValidation(workbook, sheet, cell);
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

function _getFormulaWithValidation(workbook: XLSX.Workbook, sheet: SheetWithValidations, cell: XLSX.Cell) {
    // Formulas some times return the = prefix, which the called does not expect. Force the removal.
    const defaultValue = cell.formula()?.replace(/^=/, "");
    const value = getValue(cell);
    if (defaultValue || !value) return defaultValue;

    // Support only for data validations over ranges
    const addressMatch = _(sheet._dataValidations)
        .keys()
        .find(validationKey => {
            const validations = validationKey.split(" ").map(address => {
                if (address.includes(":")) {
                    const range = sheet.range(address);
                    const rowStart = range.startCell().rowNumber();
                    const columnStart = range.startCell().columnNumber();
                    const rowEnd = range.endCell().rowNumber();
                    const columnEnd = range.endCell().columnNumber();
                    const isCellInRange =
                        cell.columnNumber() >= columnStart &&
                        cell.columnNumber() <= columnEnd &&
                        cell.rowNumber() >= rowStart &&
                        cell.rowNumber() <= rowEnd;

                    return isCellInRange;
                } else {
                    return cell.address() === address;
                }
            });

            return _.some(validations, value => value === true);
        });

    if (!addressMatch) return defaultValue;

    const validation = sheet.dataValidation(addressMatch);
    if (!validation || validation.type !== "list" || !validation.formula1) return defaultValue;

    const [sheetName, rangeAddress] = validation.formula1.replace(/^=/, "").split("!", 2);
    const validationSheet = sheetName ? workbook.sheet(sheetName.replace(/^'/, "").replace(/'$/, "")) : sheet;

    if (!validationSheet || !rangeAddress) return defaultValue;
    const validationRange = validationSheet.range(rangeAddress);

    const formulaByValue = _(validationRange.cells())
        .map(cells => cells[0])
        .map(cell => [getCellValueWithDefinedNameFallback(workbook, cell), cell.formula()])
        .fromPairs()
        .value();

    return formulaByValue[String(value)] || defaultValue;
}

function getCellValueWithDefinedNameFallback(workbook: XLSX.Workbook, cell: XLSX.Cell): string | undefined {
    // xlsx files saved with xlsx-populate generate empty values for 'Validation' sheets
    // Workaround: use the formula to get the value from defined names
    return String(getValue(cell) || getDefinedName(workbook, cell));
}

function getDefinedName(workbook: XLSX.Workbook, cell: XLSX.Cell): string | undefined {
    const formula = cell.formula();
    const element = formula ? workbook.definedName(formula) : undefined;

    if (!element) {
        return;
    } else if (typeof element === "string") {
        return element;
    } else if (isCell(element)) {
        return String(element.value());
    }
}

function getValue(cell: Cell): ExcelValue | undefined {
    const value = cell.value();

    //@ts-ignore This should be improved on xlsx-populate
    if (typeof value === "object" && _.isFunction(value.text)) {
        // @ts-ignore This should be improved on xlsx-populate
        const result = value.text();

        // FIXME: There's an error with RichText.text()
        if (result === "undefined") return undefined;
        return result;
    }

    return value;
}

type RowWithCells = XLSX.Row & { _cells: XLSX.Cell[] };

type MergedCell = {
    range: XLSX.Range;
    startCell: XLSX.Cell;
    hasCell: (cell: ExcelCell) => boolean | undefined;
};

export function isDateFormat(format: string) {
    return (
        format
            .replace(/\[[^\]]*]/g, "")
            .replace(/"[^"]*"/g, "")
            .match(/[ymdhMsb]+/) !== null
    );
}

export function isTimeFormat(format: string) {
    const cleanFormat = format
        .replace(/\[[^\]]*]/g, "")
        .replace(/"[^"]*"/g, "")
        .replace(/[AM]|[PM]/g, "")
        .replace(/\\|\/|\s/g, "");

    const isDate = cleanFormat.match(/[ymdhMsb]+/) !== null;
    const isTime = _.every(cleanFormat, token => ["h", "m", "s", ":"].includes(token));

    return isDate && isTime;
}
