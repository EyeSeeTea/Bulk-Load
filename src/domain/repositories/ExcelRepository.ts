import { Sheet } from "../entities/Sheet";
import { CellRef, Range, SheetRef, ValueRef } from "../entities/Template";
import { ThemeStyle } from "../entities/Theme";

export type LoadOptions = WebLoadOptions | FileLoadOptions;
export type ExcelValue = string | number | boolean | Date;
export type Result = [string, ExcelValue];

export interface BaseLoadOptions {
    type: "url" | "file";
    url?: string;
    file?: File | Blob;
}

export interface ReadCellOptions {
    formula?: boolean;
}

export interface WebLoadOptions extends BaseLoadOptions {
    type: "url";
    url: string;
}

export interface FileLoadOptions extends BaseLoadOptions {
    type: "file";
    file: Blob;
}

export abstract class ExcelRepository {
    public abstract loadTemplate(options: LoadOptions): Promise<string>;
    public abstract toBlob(id: string): Promise<Blob>;
    public abstract toBuffer(id: string): Promise<Buffer>;
    public abstract findRelativeCell(
        id: string,
        location?: SheetRef,
        cell?: CellRef
    ): Promise<CellRef | undefined>;
    public abstract writeCell(id: string, cellRef: CellRef, value: ExcelValue): Promise<void>;
    public abstract readCell(
        id: string,
        cellRef?: CellRef | ValueRef,
        options?: ReadCellOptions
    ): Promise<ExcelValue | undefined>;
    public abstract getCellsInRange(id: string, range: Range): Promise<CellRef[]>;
    public abstract addPicture(id: string, location: SheetRef, file: File): Promise<void>;
    public abstract styleCell(id: string, source: SheetRef, style: ThemeStyle): Promise<void>;
    public abstract getSheets(id: string): Promise<Sheet[]>;
    public abstract getConstants(id: string): Promise<Record<string, string>>;
    public abstract getSheetRowsCount(
        id: string,
        sheetId: string | number
    ): Promise<number | undefined>;
    public abstract listDefinedNames(id: string): Promise<string[]>;
    public abstract getOrCreateSheet(id: string, name: string): Promise<Sheet>;
    public abstract buildColumnName(column: number | string): string;
    public abstract defineName(id: string, name: string, cell: CellRef): Promise<void>;
    public abstract mergeCells(id: string, range: Range): Promise<void>;
}
