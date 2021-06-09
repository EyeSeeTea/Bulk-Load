import { ExcelRepository } from "../repositories/ExcelRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";
import { DataFormType } from "./DataForm";
import { DataPackage } from "./DataPackage";
import { Id } from "./ReferenceObject";
import { ImageSections, ThemeableSections } from "./Theme";

export type TemplateType = "generated" | "custom";
export type DataSourceType = "row" | "column" | "cell";
export type RefType = "row" | "column" | "cell" | "range";
export type SheetRef = RowRef | ColumnRef | CellRef | RangeRef;

export type DataSourceValue =
    | RowDataSource
    | TeiRowDataSource
    | TrackerEventRowDataSource
    | TrackerRelationship
    | ColumnDataSource
    | CellDataSource;

// Use to reference data sources for dynamic sheets
type DataSourceValueGetter = (sheet: string) => DataSourceValue | DataSourceValue[] | false;

export type DataSource = DataSourceValue | DataSourceValueGetter;

export type StyleSource = {
    section: ThemeableSections | ImageSections;
    source: CellRef | RangeRef;
};

export type Template = GeneratedTemplate | CustomTemplate;

interface BaseTemplate {
    type: TemplateType;
    id: Id;
    name: string;
    dataSources?: DataSource[];
    styleSources: StyleSource[];
    dataFormId: CellRef | ValueRef;
    dataFormType: CellRef | ValueRef<DataFormType>;
}

export interface GeneratedTemplate extends BaseTemplate {
    type: "generated";
    rowOffset: number;
    colOffset: number;
}

export interface DownloadCustomizationOptions {
    populate: boolean;
    dataPackage?: DataPackage;
    orgUnits: string[];
}

export interface ImportCustomizationOptions {
    dataPackage: DataPackage;
}

export interface CustomTemplate extends BaseTemplate {
    type: "custom";
    url: string;
    fixedOrgUnit?: CellRef;
    fixedPeriod?: CellRef;
    downloadCustomization?: (
        excelRepository: ExcelRepository,
        instanceRepository: InstanceRepository,
        options: DownloadCustomizationOptions
    ) => Promise<void>;
    importCustomization?: (
        excelRepository: ExcelRepository,
        instanceRepository: InstanceRepository,
        options: ImportCustomizationOptions
    ) => Promise<DataPackage | undefined>;
}

export interface GenericSheetRef {
    type: RefType;
    ref: string | number;
    sheet: Sheet;
}

type Sheet = string | number;

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

export interface ValueRef<T extends string = string> {
    type: "value";
    id: T;
}

export interface Range {
    sheet: Sheet;
    rowStart: number;
    rowEnd?: number;
    columnStart: string;
    columnEnd?: string;
}

interface BaseDataSource {
    type: DataSourceType;
    skipPopulate?: boolean;
    range?: Partial<Range>;
    ref?: CellRef;
    orgUnit: SheetRef | ValueRef;
    period: SheetRef | ValueRef;
    dataElement: SheetRef | ValueRef;
    categoryOption?: SheetRef | ValueRef;
    attribute?: SheetRef | ValueRef;
    eventId?: SheetRef | ValueRef;
    coordinates?: {
        latitude: SheetRef | ValueRef;
        longitude: SheetRef | ValueRef;
    };
}

export interface TrackerRelationship {
    type: "rowTeiRelationship";
    skipPopulate?: boolean;
    range: Range;
    relationshipType: CellRef;
    from: ColumnRef;
    to: ColumnRef;
}

export interface TrackerEventRowDataSource {
    type: "rowTrackedEvent";
    skipPopulate?: boolean;
    teiId: ColumnRef;
    eventId: ColumnRef;
    date: ColumnRef;
    categoryOptionCombo: ColumnRef;
    dataValues: Range;
    programStage: CellRef;
    dataElements: Range;
}

export interface RowDataSource extends BaseDataSource {
    type: "row";
    range: Range;
    orgUnit: ColumnRef | CellRef | ValueRef;
    period: ColumnRef | CellRef | ValueRef;
    dataElement: RowRef | ValueRef;
    categoryOption?: RowRef | ValueRef;
    attribute?: ColumnRef | CellRef | ValueRef;
    eventId?: ColumnRef | CellRef | ValueRef;
}

export interface TeiRowDataSource {
    type: "rowTei";
    skipPopulate?: boolean;
    teiId: ColumnRef;
    orgUnit: ColumnRef;
    enrollmentDate: ColumnRef;
    incidentDate: ColumnRef;
    attributes: Range;
    attributeId: RowRef;
}

export interface ColumnDataSource extends BaseDataSource {
    type: "column";
    range: Range;
    orgUnit: RowRef | CellRef;
    period: RowRef | CellRef;
    dataElement: ColumnRef;
    categoryOption?: ColumnRef;
    attribute?: RowRef | CellRef;
    eventId?: RowRef | CellRef;
}

export interface CellDataSource extends BaseDataSource {
    type: "cell";
    ref: CellRef;
    orgUnit: CellRef | ValueRef;
    period: CellRef | ValueRef;
    dataElement: CellRef | ValueRef;
    categoryOption?: CellRef | ValueRef;
    attribute?: CellRef | ValueRef;
    eventId?: CellRef | ValueRef;
}
