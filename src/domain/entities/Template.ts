import { Id } from "./ReferenceObject";
import { ThemeableSections, ImageSections } from "./Theme";

export type RefType = "row" | "column" | "cell" | "range";
export type SheetRef = RowRef | ColumnRef | CellRef | RangeRef;
export type DataSource = RowDataSource | ColumnDataSource | CellDataSource;

export type StyleSource = {
    section: ThemeableSections | ImageSections;
    source: CellRef | RangeRef;
};

export type Template = GeneratedTemplate;

export interface GeneratedTemplate {
    id: Id;
    name: string;
    rowOffset: number;
    colOffset: number;
    dataSources?: DataSource[];
    styleSources: StyleSource[];
}

export interface CustomTemplate {
    id: Id;
    name: string;
    url?: string;
    dataSources: DataSource[];
    styleSources: StyleSource[];
}

export interface GenericSheetRef {
    type: RefType;
    ref: string | number;
    sheet: string | number;
}

export interface RowRef extends GenericSheetRef {
    type: "row";
    ref: number;
}

export interface ColumnRef extends GenericSheetRef {
    type: "column";
    ref: string;
}

export interface CellRef extends GenericSheetRef {
    type: "cell";
    ref: string;
}

export interface RangeRef extends GenericSheetRef {
    type: "range";
    ref: string;
}

export interface Range {
    sheet: string;
    rowStart: number;
    rowEnd?: number;
    columnStart: string;
    columnEnd?: string;
}

export interface GenericDataSource {
    type: "row" | "column" | "cell";
    range: Partial<Range>;
    orgUnit: SheetRef;
    period: SheetRef;
    dataElement: SheetRef;
    categoryOption?: SheetRef;
    attribute?: SheetRef;
    eventId?: SheetRef;
}

export interface RowDataSource extends GenericDataSource {
    type: "row";
    range: Range;
    orgUnit: ColumnRef | CellRef;
    period: ColumnRef | CellRef;
    dataElement: RowRef;
    categoryOption?: RowRef;
    attribute?: ColumnRef | CellRef;
    eventId?: ColumnRef | CellRef;
}

export interface ColumnDataSource extends GenericDataSource {
    type: "column";
    range: Range;
    orgUnit: RowRef | CellRef;
    period: RowRef | CellRef;
    dataElement: ColumnRef;
    categoryOption?: ColumnRef;
    attribute?: RowRef | CellRef;
    eventId?: RowRef | CellRef;
}

export interface CellDataSource extends GenericDataSource {
    type: "cell";
    ref: CellRef;
    orgUnit: CellRef;
    period: CellRef;
    dataElement: CellRef;
    categoryOption?: CellRef;
    attribute?: CellRef;
    eventId?: CellRef;
}
