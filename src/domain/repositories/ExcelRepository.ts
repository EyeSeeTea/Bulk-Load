import { CellDataValidation } from "../entities/CellDataValidation";
import { Sheet } from "../entities/Sheet";
import { CellRef, ColumnRef, ContentType, Range, RangeRef, RowRef, SheetRef, ValueRef } from "../entities/Template";
import { ThemeStyle } from "../entities/Theme";

export type LoadOptions = WebLoadOptions | FileLoadOptions | FileBase64LoadOptions;
export type ExcelValue = string | number | boolean | Date;
export type Result = [string, ExcelValue];

export interface ReadCellOptions {
    formula?: boolean;
}

export interface WebLoadOptions {
    type: "url";
    url: string;
}

export interface FileLoadOptions {
    type: "file";
    file: Blob;
}

export interface FileBase64LoadOptions {
    type: "file-base64";
    contents: string;
    templateId: string;
}

export abstract class ExcelRepository {
    public abstract loadTemplate(options: LoadOptions): Promise<string>;
    public abstract toBlob(id: string): Promise<Blob>;
    public abstract toBuffer(id: string): Promise<Buffer>;
    public abstract findRelativeCell(id: string, location?: SheetRef, cell?: CellRef): Promise<CellRef | undefined>;
    public abstract writeCell(id: string, cellRef: CellRef, value: ExcelValue): Promise<void>;
    public abstract readCell(
        id: string,
        cellRef?: CellRef | ValueRef,
        options?: ReadCellOptions
    ): Promise<ExcelValue | undefined>;
    public abstract getContentType(
        id: string,
        cellRef?: CellRef | ValueRef,
        options?: ReadCellOptions
    ): Promise<ContentType | undefined>;
    public abstract getCellsInRange(id: string, range: Range): Promise<CellRef[]>;
    public abstract addPicture(id: string, location: SheetRef, file: File): Promise<void>;
    public abstract styleCell(id: string, source: SheetRef, style: ThemeStyle): Promise<void>;
    public abstract getSheets(id: string): Promise<Sheet[]>;
    public abstract getConstants(id: string): Promise<Record<string, string>>;
    public abstract getSheetRowsCount(id: string, sheetId: string | number): Promise<number | undefined>;
    public abstract listDefinedNames(id: string): Promise<string[]>;
    public abstract getOrCreateSheet(id: string, name: string): Promise<Sheet>;
    public abstract buildColumnName(column: number | string): string;
    public abstract buildColumnNumber(column: string): number;
    public abstract buildRowNumber(row: string): number;
    public abstract defineName(id: string, name: string, cell: CellRef): Promise<void>;
    public abstract mergeCells(id: string, range: Range): Promise<void>;
    public abstract hideCells(id: string, ref: ColumnRef | RowRef, hidden?: boolean): Promise<void>;
    public abstract hideSheet(id: string, sheet: string | number, hidden?: boolean): Promise<void>;
    public abstract deleteSheet(id: string, sheet: string | number): Promise<void>;
    public abstract protectSheet(id: string, sheet: string | number, password: string): Promise<void>;
    public abstract setActiveCell(id: string, cell: CellRef): Promise<void>;
    public abstract setDataValidation(id: string, ref: CellRef | RangeRef, formula: string | null): Promise<void>;
    public abstract setCellValidation(id: string, ref: CellRef | RangeRef, options: CellDataValidation): Promise<void>;
}
