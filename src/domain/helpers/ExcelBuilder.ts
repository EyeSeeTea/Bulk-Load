import { format } from "date-fns";
import _ from "lodash";
import { fromBase64 } from "../../utils/files";
import { promiseMap } from "../../utils/promises";
import { removeCharacters } from "../../utils/string";
import { getGeometryAsString } from "../entities/Geometry";
import { DataPackage, TrackerProgramPackage } from "../entities/DataPackage";
import { Relationship } from "../entities/Relationship";
import {
    CellDataSource,
    CellRef,
    DataSource,
    DataSourceValue,
    DownloadCustomizationOptions,
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
import { Theme, ThemeStyle } from "../entities/Theme";
import { AttributeValue, getRelationships } from "../entities/TrackedEntityInstance";
import { ExcelRepository, ExcelValue } from "../repositories/ExcelRepository";
import { BuilderMetadata, emptyBuilderMetadata, InstanceRepository } from "../repositories/InstanceRepository";
import Settings from "../../webapp/logic/settings";
import { ModulesRepositories } from "../repositories/ModulesRepositories";
import { Maybe } from "../../types/utils";

const dateFormatPattern = "yyyy-MM-dd";

export class ExcelBuilder {
    constructor(
        private excelRepository: ExcelRepository,
        private instanceRepository: InstanceRepository,
        private modulesRepositories: ModulesRepositories
    ) {}

    public async populateTemplate(template: Template, payload: DataPackage, settings: Settings): Promise<void> {
        const { dataSources = [] } = template;
        const dataSourceValues = await this.getDataSourceValues(template, dataSources);
        const metadata =
            payload.type === "trackerPrograms"
                ? await this.instanceRepository.getBuilderMetadata(payload.trackedEntityInstances)
                : emptyBuilderMetadata;

        for (const dataSource of dataSourceValues) {
            if (!dataSource.skipPopulate) {
                switch (dataSource.type) {
                    case "cell":
                        await this.fillCells(template, dataSource, payload);
                        break;
                    case "row":
                        await this.fillRows(template, dataSource, payload);
                        break;
                    case "rowTei":
                        await this.fillTeiRows(template, dataSource, payload);
                        break;
                    case "rowTrackedEvent":
                        await this.fillTrackerEventRows(
                            template,
                            dataSource,
                            payload as TrackerProgramPackage,
                            metadata,
                            settings
                        );
                        break;
                    case "rowTeiRelationship":
                        await this.fillTrackerRelationshipRows(template, dataSource, payload);
                        break;
                    default:
                        throw new Error(`Type ${dataSource.type} not supported`);
                }
            }
        }
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

    private async fillCells(template: Template, dataSource: CellDataSource, payload: DataPackage) {
        const orgUnit = await this.readCellValue(template, dataSource.orgUnit);
        const dataElement = await this.readCellValue(template, dataSource.dataElement);
        const period = await this.readCellValue(template, dataSource.period);
        const categoryOption = await this.readCellValue(template, dataSource.categoryOption);

        const { value } =
            _(payload.dataEntries)
                .filter(dv => dv.orgUnit === orgUnit && dv.period === String(period))
                .flatMap(({ dataValues }) => dataValues)
                .find(dv => dv.dataElement === dataElement && (!dv.category || dv.category === categoryOption)) ?? {};

        if (value) {
            await this.excelRepository.writeCell(template.id, dataSource.ref, value);
        }
    }

    private async readCellValue(
        template: Template,
        ref?: CellRef | ValueRef,
        options: { isFormula: boolean } = { isFormula: false }
    ): Promise<ExcelValue> {
        return removeCharacters(await this.excelRepository.readCell(template.id, ref, { formula: options.isFormula }));
    }

    private async fillTeiRows(template: Template, dataSource: TeiRowDataSource, payload: DataPackage) {
        let { rowStart } = dataSource.attributes;
        if (payload.type !== "trackerPrograms") return;

        const teisToProcess = dataSource.sortBy
            ? _(payload.trackedEntityInstances).sortBy(dataSource.sortBy).value()
            : payload.trackedEntityInstances;

        for (const tei of teisToProcess ?? []) {
            const { orgUnit, id, enrollment } = tei;

            const cells = await this.excelRepository.getCellsInRange(template.id, {
                ...dataSource.attributes,
                rowStart,
                rowEnd: rowStart,
            });

            const orgUnitCell = await this.excelRepository.findRelativeCell(template.id, dataSource.orgUnit, cells[0]);
            if (orgUnitCell && orgUnit) {
                await this.excelRepository.writeCell(template.id, orgUnitCell, `_${orgUnit.id}`);
            }

            const teiIdCell = await this.excelRepository.findRelativeCell(template.id, dataSource.teiId, cells[0]);
            if (teiIdCell && id) {
                await this.excelRepository.writeCell(template.id, teiIdCell, id);
            }

            const geometryCell = await this.excelRepository.findRelativeCell(
                template.id,
                dataSource.geometry,
                cells[0]
            );
            if (geometryCell) {
                await this.excelRepository.writeCell(template.id, geometryCell, getGeometryAsString(tei.geometry));
            }

            const enrollmentDateCell = await this.excelRepository.findRelativeCell(
                template.id,
                dataSource.enrollmentDate,
                cells[0]
            );
            if (enrollmentDateCell && enrollment)
                await this.excelRepository.writeCell(
                    template.id,
                    enrollmentDateCell,
                    format(new Date(enrollment.enrolledAt), dateFormatPattern)
                );

            const incidentDateCell = await this.excelRepository.findRelativeCell(
                template.id,
                dataSource.incidentDate,
                cells[0]
            );
            if (incidentDateCell && enrollment)
                await this.excelRepository.writeCell(
                    template.id,
                    incidentDateCell,
                    format(new Date(enrollment.occurredAt), dateFormatPattern)
                );

            for (const cell of cells) {
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

                const attributeValue = tei.attributeValues.find(av => av.attribute.id === attributeId);

                const isMultiText = attributeValue?.attribute.valueType === "MULTI_TEXT";

                const value =
                    isMultiText && dataSource.multiTextDelimiter
                        ? this.getMultiTextValue(attributeValue, dataSource.multiTextDelimiter)
                        : this.getValueFromAttribute(attributeValue);

                if (value) {
                    this.excelRepository.writeCell(template.id, cell, value);
                }
            }

            rowStart += 1;
        }
    }

    private getValueFromAttribute(attributeValue: Maybe<AttributeValue>): Maybe<string> {
        return attributeValue
            ? (attributeValue.optionId ? `_${attributeValue.optionId}` : null) || attributeValue.value
            : undefined;
    }

    private getMultiTextValue(attributeValue: Maybe<AttributeValue>, multiTextTeiDelimiter: string): string {
        const multiTextValues = attributeValue?.value.split(MULTI_TEXT_OPTION_DELIMITER);
        const options =
            attributeValue?.attribute.optionSet?.options.filter(option => multiTextValues?.includes(option.code)) ?? [];
        return options.map(option => option.name).join(multiTextTeiDelimiter);
    }

    private async fillCell(template: Template, cellRef: CellRef, sheetRef: SheetRef, value: string | number | boolean) {
        const cell = await this.excelRepository.findRelativeCell(template.id, sheetRef, cellRef);

        if (cell && !_.isNil(value)) {
            await this.excelRepository.writeCell(template.id, cell, value);
        }
    }

    private async fillTrackerRelationshipRows(
        template: Template,
        dataSource: TrackerRelationship,
        payload: DataPackage
    ) {
        if (payload.type !== "trackerPrograms") return;

        const relationships: Relationship[] = getRelationships(payload.trackedEntityInstances ?? []);
        const typeId = removeCharacters(
            await this.excelRepository.readCell(template.id, dataSource.relationshipType, {
                formula: true,
            })
        );

        let { rowStart } = dataSource.range;

        for (const relationship of relationships) {
            if (relationship.typeId !== typeId) continue;

            const cells = await this.excelRepository.getCellsInRange(template.id, {
                ...dataSource.range,
                rowStart,
                rowEnd: rowStart,
            });

            if (cells[0]) {
                await this.fillCell(template, cells[0], dataSource.from, relationship.fromId);
                await this.fillCell(template, cells[0], dataSource.to, relationship.toId);
            }

            rowStart += 1;
        }
    }

    private async fillTrackerEventRows(
        template: Template,
        dataSource: TrackerEventRowDataSource,
        payload: TrackerProgramPackage,
        metadata: BuilderMetadata,
        settings: Settings
    ) {
        let { rowStart } = dataSource.dataValues;
        const dataElementCells = await this.excelRepository.getCellsInRange(template.id, dataSource.dataElements);

        const dataElementIds = await Promise.all(
            dataElementCells.map(async dataElementCell => {
                return removeCharacters(
                    await this.excelRepository.readCell(template.id, dataElementCell, {
                        formula: true,
                    })
                );
            })
        );

        const dataElementIdsSet = new Set(dataElementIds);

        const dataSourceProgramStageId = await this.readCellValue(template, dataSource.programStage, {
            isFormula: true,
        });

        const dataEntriesToProcess = dataSource.sortBy
            ? _(payload.dataEntries).sortBy(dataSource.sortBy).value()
            : payload.dataEntries;

        for (const dataEntry of dataEntriesToProcess) {
            const { id, period, dataValues, trackedEntityInstance, attribute: cocId, programStage } = dataEntry;
            const someDataElementPresentInSheet = _(dataValues).some(dv => dataElementIdsSet.has(dv.dataElement));
            if (!someDataElementPresentInSheet && !_.isEmpty(dataValues)) continue;

            const eventBelongsToCurrentProgramStage =
                dataSourceProgramStageId && dataSourceProgramStageId === programStage;
            if (!eventBelongsToCurrentProgramStage) continue;

            const cells = await this.excelRepository.getCellsInRange(template.id, {
                ...dataSource.dataValues,
                rowStart,
                rowEnd: rowStart,
            });

            const teiIdCell = await this.excelRepository.findRelativeCell(template.id, dataSource.teiId, cells[0]);
            if (teiIdCell && trackedEntityInstance) {
                await this.excelRepository.writeCell(template.id, teiIdCell, trackedEntityInstance);
            }

            const eventIdCell = await this.excelRepository.findRelativeCell(template.id, dataSource.eventId, cells[0]);
            if (eventIdCell && id) {
                await this.excelRepository.writeCell(template.id, eventIdCell, id);
            }

            const cocIdCell = await this.excelRepository.findRelativeCell(
                template.id,
                dataSource.categoryOptionCombo,
                cells[0]
            );
            if (cocIdCell && cocId) {
                await this.excelRepository.writeCell(template.id, cocIdCell, `_${cocId}`);
            }

            const dateCell = await this.excelRepository.findRelativeCell(template.id, dataSource.date, cells[0]);
            if (dateCell) await this.excelRepository.writeCell(template.id, dateCell, period);

            for (const [dataElementId, cell] of _.zip(dataElementIds, cells)) {
                if (!dataElementId || !cell) continue;
                const { value } = dataValues.find(dv => dv.dataElement === dataElementId) ?? {};
                if (value) {
                    const optionId = metadata.options[value.toString()]?.id;
                    await this.excelRepository.writeCell(template.id, cell, optionId ? `_${optionId}` : value);
                }
            }
            rowStart += 1;
        }

        if (settings.programStagePopulateEventsForEveryTei[String(dataSourceProgramStageId)]) {
            const allTEIs = payload.trackedEntityInstances.map(trackedEntityInstances => trackedEntityInstances.id);
            const existingTEIs = _(dataEntriesToProcess)
                .filter(
                    dataEntry =>
                        _(dataEntry.dataValues).some(dv => dataElementIdsSet.has(dv.dataElement)) &&
                        dataSourceProgramStageId !== undefined &&
                        dataSourceProgramStageId === dataEntry.programStage
                )
                .map(dataEntry => dataEntry.trackedEntityInstance)
                .compact()
                .uniq()
                .value();

            const newTEIs = _.difference(allTEIs, existingTEIs).reverse(); // reverse the list

            return await promiseMap(newTEIs, async (id, index) => {
                const teiRowStart = dataSource.dataValues.rowStart + newTEIs.length - index - 1; // reverse tei ids
                const cells = await this.excelRepository.getCellsInRange(template.id, {
                    ...dataSource.dataValues,
                    rowStart: teiRowStart,
                    rowEnd: teiRowStart,
                });

                const eventId = dataEntriesToProcess[index]?.id;
                const teiIdCell = await this.excelRepository.findRelativeCell(template.id, dataSource.teiId, cells[0]);

                if (eventId && teiIdCell && id) {
                    await this.excelRepository.writeCell(template.id, teiIdCell, id);
                }
            });
        }
    }

    private async fillRows(template: Template, dataSource: RowDataSource, payload: DataPackage) {
        let { rowStart } = dataSource.range;

        for (const { id, orgUnit, period, attribute, dataValues, coordinate } of payload.dataEntries) {
            const cells = await this.excelRepository.getCellsInRange(template.id, {
                ...dataSource.range,
                rowStart,
                rowEnd: rowStart,
            });

            const orgUnitCell = await this.findRelative(template, dataSource.orgUnit, cells[0]);
            if (orgUnitCell && orgUnit) {
                await this.excelRepository.writeCell(template.id, orgUnitCell, orgUnit);
            }

            const eventIdCell = await this.findRelative(template, dataSource.eventId, cells[0]);
            if (eventIdCell && id) {
                await this.excelRepository.writeCell(template.id, eventIdCell, id);
            }

            const periodCell = await this.findRelative(template, dataSource.period, cells[0]);
            if (periodCell) await this.excelRepository.writeCell(template.id, periodCell, period);

            const attributeCell = await this.findRelative(template, dataSource.attribute, cells[0]);
            if (attributeCell && attribute) {
                await this.excelRepository.writeCell(template.id, attributeCell, attribute);
            }

            const longitudeCell = await this.findRelative(template, dataSource.coordinates?.longitude, cells[0]);
            if (longitudeCell && coordinate) {
                await this.excelRepository.writeCell(template.id, longitudeCell, coordinate.longitude);
            }

            const latitudeCell = await this.findRelative(template, dataSource.coordinates?.latitude, cells[0]);
            if (latitudeCell && coordinate) {
                await this.excelRepository.writeCell(template.id, latitudeCell, coordinate.latitude);
            }

            for (const cell of cells) {
                const dataElementCell = await this.findRelative(template, dataSource.dataElement, cell);

                const categoryCell = await this.findRelative(template, dataSource.categoryOption, cell);

                const dataElement = dataElementCell
                    ? removeCharacters(await this.excelRepository.readCell(template.id, dataElementCell))
                    : undefined;

                const category = categoryCell
                    ? removeCharacters(await this.excelRepository.readCell(template.id, categoryCell))
                    : undefined;

                const { value } =
                    dataValues.find(
                        dv => dv.dataElement === dataElement && (!dv.category || dv.category === category)
                    ) ?? {};

                if (value) await this.excelRepository.writeCell(template.id, cell, value);
            }

            rowStart += 1;
        }
    }

    private async findRelative(template: Template, ref?: SheetRef | ValueRef, relative?: CellRef) {
        if (ref && ref.type === "value") return undefined;
        return this.excelRepository.findRelativeCell(template.id, ref, relative);
    }

    public async applyTheme(template: Template, theme: Theme): Promise<void> {
        _.forOwn(theme.sections, (style: ThemeStyle, section: string) => {
            const styleSource = template.styleSources.find(source => source.section === section);
            const { source } = styleSource ?? {};

            if (source) {
                const height = (style.text?.split("\n")?.length ?? 1) * (style.fontSize ?? 12) * 2;
                this.excelRepository.styleCell(template.id, source, {
                    ...style,
                    merged: true,
                    rowSize: height,
                    verticalAlignment: "center",
                });
            }
        });

        await promiseMap(_.toPairs(theme.pictures), async ([section, image]) => {
            const file = image ? await fromBase64(image.src) : undefined;
            const styleSource = template.styleSources.find(source => source.section === section);
            const { source } = styleSource ?? {};
            if (source && file) this.excelRepository.addPicture(template.id, source, file);
        });
    }

    public async templateCustomization(template: Template, options: DownloadCustomizationOptions): Promise<void> {
        if (template.type === "custom" && template.downloadCustomization) {
            await template.downloadCustomization(
                this.excelRepository,
                this.instanceRepository,
                this.modulesRepositories,
                options
            );
        }
    }
}

export const MULTI_TEXT_OPTION_DELIMITER = ",";
