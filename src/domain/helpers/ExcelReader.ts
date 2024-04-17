import XlsxPopulate from "@eyeseetea/xlsx-populate";
import { generateUid } from "d2/uid";
import _ from "lodash";
import moment from "moment";
import { isDefined } from "../../utils";
import { promiseMap } from "../../utils/promises";
import { removeCharacters } from "../../utils/string";
import { DataForm } from "../entities/DataForm";
import { DataPackage, DataPackageData } from "../entities/DataPackage";
import { getGeometryFromString } from "../entities/Geometry";
import { Relationship } from "../entities/Relationship";
import {
    CellDataSource,
    CellRef,
    ColumnRef,
    DataSource,
    DataSourceValue,
    GenericSheetRef,
    RowDataSource,
    setDataEntrySheet,
    setSheet,
    SheetRef,
    TeiRowDataSource,
    Template,
    TrackerEventRowDataSource,
    TrackerRelationship,
    ValueRef,
} from "../entities/Template";
import { TrackedEntity } from "../entities/TrackedEntityInstance";
import { ExcelRepository, ExcelValue, ReadCellOptions } from "../repositories/ExcelRepository";
import { InstanceRepository } from "../repositories/InstanceRepository";

const dateFormat = "YYYY-MM-DD";

export class ExcelReader {
    constructor(private excelRepository: ExcelRepository, private instanceRepository: InstanceRepository) {}

    public async readTemplate(template: Template, dataForm: DataForm): Promise<DataPackage | undefined> {
        const { dataSources = [] } = template;

        const dataFormType = await this.readCellValue(template, template.dataFormType);
        const dataSourceValues = await this.getDataSourceValues(template, dataSources);

        if (dataFormType !== "dataSets" && dataFormType !== "programs" && dataFormType !== "trackerPrograms") {
            return undefined;
        }

        const data: DataPackageData[] = [];
        const trackedEntities: TrackedEntity[] = [];
        const relationships: Relationship[] = [];

        // This should be refactored but need to validate with @tokland about TEIs
        for (const dataSource of dataSourceValues) {
            switch (dataSource.type) {
                case "cell":
                    (await this.readByCell(template, dataSource)).map(item => data.push(item));
                    break;
                case "row":
                    (await this.readByRow(template, dataSource)).map(item => data.push(item));
                    break;
                case "rowTei":
                    (await this.readTeiRows(template, dataSource, dataForm)).map(item => trackedEntities.push(item));
                    break;
                case "rowTeiRelationship":
                    (await this.readTeiRelationships(template, dataSource)).map(item => relationships.push(item));
                    break;
                case "rowTrackedEvent":
                    (await this.readTeiEvents(template, dataSource, trackedEntities, dataForm)).map(item =>
                        data.push(item)
                    );
                    break;
                default:
                    throw new Error(`Type ${dataSource.type} not supported`);
            }
        }

        const dataEntries = _(data)
            .groupBy(d =>
                [
                    d.dataForm,
                    d.id,
                    d.period,
                    d.orgUnit,
                    d.attribute,
                    d.trackedEntityInstance,
                    d.programStage,
                    d.group,
                ].join("@")
            )
            .map((items, key) => {
                const [dataForm = "", id, period, orgUnit, attribute, trackedEntityInstance, programStage, group] =
                    key.split("@");
                return {
                    group,
                    dataForm,
                    id: id ? String(id) : undefined,
                    orgUnit: String(orgUnit),
                    period: String(period),
                    attribute: attribute ? String(attribute) : undefined,
                    trackedEntityInstance: trackedEntityInstance ? String(trackedEntityInstance) : undefined,
                    programStage: programStage ? String(programStage) : undefined,
                    dataValues: _.flatMap(items, ({ dataValues }) => dataValues),
                    coordinate: items[0]?.coordinate,
                };
            })
            .compact()
            .value();

        if (dataFormType === "trackerPrograms") {
            const trackedEntitiesWithRelationships = this.addTrackedEntitiesRelationships(
                trackedEntities,
                relationships
            );
            return { type: "trackerPrograms", dataEntries, trackedEntities: trackedEntitiesWithRelationships };
        }

        return { type: dataFormType, dataEntries };
    }

    private async readByRow(template: Template, dataSource: RowDataSource): Promise<DataPackageData[]> {
        const cells = await this.excelRepository.getCellsInRange(template.id, dataSource.range);

        const values = await promiseMap(cells, async cell => {
            const value = cell ? await this.readCellValue(template, cell) : undefined;
            const optionId = await this.excelRepository.readCell(template.id, cell, { formula: true });
            if (!isDefined(value)) return undefined;

            const orgUnit = await this.readCellValue(template, dataSource.orgUnit, cell);

            const period = await this.readCellValue(template, dataSource.period, cell);
            if (!period) return undefined;

            const dataElement = await this.readCellValue(template, dataSource.dataElement, cell);
            if (!dataElement) return undefined;

            const dataFormId = await this.readCellValue(template, template.dataFormId, cell);
            if (!dataFormId) return undefined;

            const category = await this.readCellValue(template, dataSource.categoryOption, cell);
            const attribute = await this.readCellValue(template, dataSource.attribute, cell);
            const eventId = await this.readCellValue(template, dataSource.eventId, cell);

            const latitude = await this.readCellValue(template, dataSource.coordinates?.latitude, cell);
            const longitude = await this.readCellValue(template, dataSource.coordinates?.longitude, cell);
            const hasCoordinate = isDefined(latitude) && isDefined(longitude);

            return {
                group: this.excelRepository.buildRowNumber(cell.ref),
                dataForm: this.formatValue(dataFormId),
                id: eventId ? this.formatValue(eventId) : undefined,
                orgUnit: this.formatValue(orgUnit),
                period: this.formatValue(period),
                attribute: attribute ? this.formatValue(attribute) : undefined,
                coordinate: hasCoordinate
                    ? { latitude: this.formatValue(latitude), longitude: this.formatValue(longitude) }
                    : undefined,
                dataValues: [
                    {
                        dataElement: this.formatValue(dataElement),
                        category: category ? this.formatValue(category) : undefined,
                        value: this.formatValue(value),
                        optionId: optionId ? removeCharacters(optionId) : undefined,
                    },
                ],
            };
        });

        return _.compact(values);
    }

    private async readByCell(template: Template, dataSource: CellDataSource): Promise<DataPackageData[]> {
        const cell = await this.excelRepository.findRelativeCell(template.id, dataSource.ref);
        const value = cell ? await this.readCellValue(template, cell) : undefined;
        const optionId = await this.excelRepository.readCell(template.id, cell, { formula: true });
        if (!isDefined(value) || value === "") return [];

        const orgUnit = await this.readCellValue(template, dataSource.orgUnit);

        const period = await this.readCellValue(template, dataSource.period);
        if (!period) return [];

        const dataElement = await this.readCellValue(template, dataSource.dataElement);
        if (!dataElement) return [];

        const dataFormId = await this.readCellValue(template, template.dataFormId);
        if (!dataFormId) return [];

        const category = await this.readCellValue(template, dataSource.categoryOption);
        const attribute = await this.readCellValue(template, dataSource.attribute);
        const eventId = await this.readCellValue(template, dataSource.eventId);

        return [
            {
                group: undefined, // TODO: Add a way for custom templates to group by event
                dataForm: String(dataFormId),
                id: eventId ? String(eventId) : undefined,
                orgUnit: String(orgUnit),
                period: String(period),
                attribute: attribute ? String(attribute) : undefined,
                dataValues: [
                    {
                        dataElement: String(dataElement),
                        category: category ? String(category) : undefined,
                        value: this.formatValue(value),
                        optionId: optionId ? removeCharacters(optionId) : undefined,
                    },
                ],
            },
        ];
    }

    private async getFormulaCell(template: Template, ref: CellRef | ValueRef): Promise<ExcelValue> {
        return removeCharacters(await this.excelRepository.readCell(template.id, ref, { formula: true }));
    }

    private async getRowIndexes(template: Template, ref: GenericSheetRef, rowStart: number): Promise<number[]> {
        const rowsCount = await this.excelRepository.getSheetRowsCount(template.id, ref.sheet);
        return rowsCount ? _.range(rowStart, rowsCount + 1, 1) : [];
    }

    private async getFormulaValue(template: Template, columnRef: ColumnRef, rowIndex: number) {
        return removeCharacters(
            await this.getCellValue(template, columnRef, rowIndex, {
                formula: true,
            })
        );
    }

    private addTrackedEntitiesRelationships(
        trackedEntities: TrackedEntity[],
        relationships: Relationship[]
    ): TrackedEntity[] {
        const relationshipsByFromId = _.groupBy(relationships, relationship => relationship.fromId);
        const relationshipsByToId = _.groupBy(relationships, relationship => relationship.toId);

        return trackedEntities.map(trackedEntity => ({
            ...trackedEntity,
            relationships: _.concat(
                relationshipsByFromId[trackedEntity.id] || [],
                relationshipsByToId[trackedEntity.id] || []
            ),
        }));
    }

    private async readTeiEvents(
        template: Template,
        dataSource: TrackerEventRowDataSource,
        teis: TrackedEntity[],
        dataForm: DataForm
    ): Promise<DataPackageData[]> {
        const programId = await this.getFormulaCell(template, template.dataFormId);
        const teiById = _.keyBy(teis, tei => tei.id);
        if (!programId) return [];

        const programStageId = await this.getFormulaCell(template, dataSource.programStage);

        const dataElementCells = await this.excelRepository.getCellsInRange(template.id, dataSource.dataElements);
        const dataValuesCells = await this.excelRepository.getCellsInRange(template.id, dataSource.dataValues);

        const dataValues = await promiseMap(dataValuesCells, async cell => {
            return {
                row: this.excelRepository.buildRowNumber(cell.ref),
                value: await this.excelRepository.readCell(template.id, cell),
                optionId: await this.excelRepository.readCell(template.id, cell, {
                    formula: true,
                }),
            };
        });

        const dataValuesByRow = _(dataValues).compact().groupBy("row").toPairs().value();

        const dataElementIds = await promiseMap(dataElementCells, cell =>
            this.excelRepository.readCell(template.id, cell, { formula: true })
        );

        const events = await promiseMap(dataValuesByRow, async ([row, dataItems]) => {
            const rowIdx = parseInt(row);

            const teiId = await this.getCellValue(template, dataSource.teiId, rowIdx);
            const cocId = await this.getFormulaValue(template, dataSource.categoryOptionCombo, rowIdx);
            const eventId = await this.getCellValue(template, dataSource.eventId, rowIdx);
            const date = parseDate(await this.getCellValue(template, dataSource.date, rowIdx));
            if (!teiId || !date) return [];

            const tei = teiById[String(teiId)];
            if (!tei) return [];

            const dataList = _.zip(dataItems, dataElementIds).map(([item, deIdFormula]) => {
                const dataElementId = deIdFormula ? removeCharacters(deIdFormula) : null;
                if (!item || !programStageId || !dataElementId || !programStageId) return null;

                // If column id does not exist on program, exclude values => Attributes
                if (!dataForm.dataElements.find(({ id }) => id === dataElementId)) return null;

                const { value, optionId } = item;

                const data: DataPackageData = {
                    group: rowIdx,
                    id: eventId ? String(eventId) : undefined,
                    dataForm: String(programId),
                    orgUnit: tei.orgUnit.id,
                    period: this.formatValue(date),
                    attribute: cocId,
                    trackedEntityInstance: String(teiId),
                    programStage: String(programStageId),
                    dataValues: [
                        {
                            dataElement: String(dataElementId),
                            value: this.formatValue(value),
                            optionId: optionId ? removeCharacters(optionId) : undefined,
                        },
                    ],
                };
                return data;
            });

            return _.compact(dataList);
        });

        return _.flatten(events);
    }

    private async readTeiRelationships(template: Template, dataSource: TrackerRelationship): Promise<Relationship[]> {
        const rowStart = dataSource.range.rowStart;
        const programId = await this.getFormulaCell(template, template.dataFormId);
        if (!programId) return [];
        const typeName = await this.excelRepository.readCell(template.id, dataSource.relationshipType);
        const typeId = await this.getFormulaCell(template, dataSource.relationshipType);

        const rowIndexes = await this.getRowIndexes(template, dataSource.from, rowStart);

        const relationships = await promiseMap<number, Relationship | undefined>(rowIndexes, async rowIdx => {
            const fromId = await this.getCellValue(template, dataSource.from, rowIdx);
            const toId = await this.getCellValue(template, dataSource.to, rowIdx);
            if (!fromId || !toId || !typeId) return;

            const relationship: Relationship = {
                typeId: String(typeId),
                typeName: String(typeName),
                fromId: String(fromId),
                toId: String(toId),
            };
            return relationship;
        });

        return _.compact(relationships);
    }

    private async readTeiRows(
        template: Template,
        dataSource: TeiRowDataSource,
        dataForm: DataForm
    ): Promise<TrackedEntity[]> {
        const programId = await this.getFormulaCell(template, template.dataFormId);
        if (!programId) return [];

        const attributeCells = await this.excelRepository.getCellsInRange(template.id, dataSource.attributes);

        const attributeValues = await promiseMap(attributeCells, async cell => {
            const attributeIdCell = await this.excelRepository.findRelativeCell(
                template.id,
                dataSource.attributeId,
                cell
            );

            const attributeId = attributeIdCell
                ? removeCharacters(
                      await this.excelRepository.readCell(template.id, attributeIdCell, {
                          formula: true,
                      })
                  )
                : undefined;

            if (!attributeId) return undefined;

            const attributeValueVal = await this.excelRepository.readCell(template.id, cell);
            const attributeValueFormula = await this.excelRepository.readCell(template.id, cell, { formula: true });

            return {
                row: this.excelRepository.buildRowNumber(cell.ref),
                attribute: {
                    id: attributeId,
                    valueType: dataForm.teiAttributes?.find(attribute => attribute.id === attributeId)?.valueType,
                },
                value: attributeValueVal !== undefined ? String(attributeValueVal) : "",
                optionId: attributeValueFormula ? removeCharacters(attributeValueFormula) : undefined,
            };
        });

        const attributeValuesByRow = _(attributeValues).compact().groupBy("row").toPairs().value();

        const values = await promiseMap(attributeValuesByRow, async ([row, attributeValues]) => {
            const rowIdx = parseInt(row);

            // Generate random one UID for TEI if empty.
            const teiId = (await this.getCellValue(template, dataSource.teiId, rowIdx)) || generateUid();
            const orgUnitId = await this.getFormulaValue(template, dataSource.orgUnit, rowIdx);
            const geometryExcelValue = await this.getCellValue(template, dataSource.geometry, rowIdx);
            const geometry = getGeometryFromString(dataForm.trackedEntityType, geometryExcelValue.toString());
            const enrollmentDate = parseDate(await this.getCellValue(template, dataSource.enrollmentDate, rowIdx));
            const incidentDate = parseDate(await this.getCellValue(template, dataSource.incidentDate, rowIdx));

            if (!teiId || !orgUnitId || !enrollmentDate) return undefined;

            const trackedEntity: TrackedEntity = {
                program: { id: String(programId) },
                id: String(teiId),
                orgUnit: { id: orgUnitId },
                disabled: false,
                attributeValues,
                enrollment: {
                    enrolledAt: this.formatValue(enrollmentDate),
                    occurredAt: this.formatValue(incidentDate || enrollmentDate),
                },
                relationships: [],
                geometry,
            };

            return trackedEntity;
        });

        return _.compact(values);
    }

    private async getCellValue(
        template: Template,
        columnRef: ColumnRef | undefined,
        rowIndex: number,
        options?: ReadCellOptions
    ): Promise<ExcelValue> {
        if (!columnRef) return "";

        const relative: CellRef = {
            ...columnRef,
            type: "cell",
            ref: columnRef.ref + rowIndex.toString(),
        };

        const cell = await this.excelRepository.findRelativeCell(template.id, columnRef, relative);
        if (!cell) return "";
        const value = await this.excelRepository.readCell(template.id, cell, options);
        return value === undefined ? "" : value;
    }

    private async readCellValue(template: Template, ref?: SheetRef | ValueRef, relative?: CellRef) {
        if (!ref) return undefined;
        if (ref.type === "value") return ref.id;

        const cell = await this.excelRepository.findRelativeCell(template.id, ref, relative);
        if (cell) {
            const value = await this.excelRepository.readCell(template.id, cell);
            const formula = await this.excelRepository.readCell(template.id, cell, {
                formula: true,
            });

            const definedNames = await this.excelRepository.listDefinedNames(template.id);
            if (typeof formula === "string" && definedNames.includes(formula.replace(/^=/, ""))) {
                return removeCharacters(formula);
            }

            return value;
        }
    }

    private formatValue(value: ExcelValue | undefined): string {
        if (value instanceof Date) {
            return moment(value).format("YYYY-MM-DD[T]HH:mm");
        }

        return String(value ?? "");
    }

    private async getDataSourceValues(template: Template, dataSources: DataSource[]): Promise<DataSourceValue[]> {
        const sheets = await this.excelRepository.getSheets(template.id);

        return _.flatMap(dataSources, dataSource => {
            if (typeof dataSource === "function") {
                return _(sheets)
                    .flatMap(sheet => dataSource(sheet.name))
                    .compact()
                    .value();
            } else if ("sheetsMatch" in dataSource) {
                return _(sheets)
                    .map(sheet => (sheet.name.match(dataSource.sheetsMatch) ? setSheet(dataSource, sheet.name) : null))
                    .compact()
                    .value();
            } else if (dataSource.type === "row") {
                return setDataEntrySheet(dataSource, sheets);
            } else {
                return [dataSource];
            }
        });
    }

    public async templateCustomization(template: Template, dataPackage: DataPackage): Promise<DataPackage | undefined> {
        if (template.type === "custom" && template.importCustomization) {
            return template.importCustomization(this.excelRepository, this.instanceRepository, {
                dataPackage,
            });
        }
    }
}

export function parseDate(value: ExcelValue): ExcelValue {
    if (typeof value === "number") {
        const date = XlsxPopulate.numberToDate(value);
        return moment(date).format(dateFormat);
    } else {
        return value;
    }
}
