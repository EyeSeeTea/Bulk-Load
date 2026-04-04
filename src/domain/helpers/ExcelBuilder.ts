import { format } from "date-fns";
import _ from "lodash";
import { fromBase64 } from "../../utils/files";
import { promiseMap } from "../../utils/promises";
import { removeCharacters } from "../../utils/string";
import { getGeometryAsString } from "../entities/Geometry";
import { DataPackage } from "../entities/DataPackage";
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
    TemplateDataPackage,
    TemplateDataPackageData,
    TemplateDataValue,
    templateFromDataPackage,
    TemplateTrackerProgramPackage,
    TrackerEventRowDataSource,
    TrackerRelationship,
    ValueRef,
} from "../entities/Template";
import { Theme, ThemeStyle } from "../entities/Theme";
import { AttributeValue, getRelationships, TrackedEntityInstance } from "../entities/TrackedEntityInstance";
import { ExcelRepository, ExcelValue } from "../repositories/ExcelRepository";
import { BuilderMetadata, emptyBuilderMetadata, InstanceRepository } from "../repositories/InstanceRepository";
import Settings from "../../webapp/logic/settings";
import { ModulesRepositories } from "../repositories/ModulesRepositories";
import { Maybe } from "../../types/utils";
import { DataElementDisaggregationsMappingRepository } from "../repositories/DataElementDisaggregationsMappingRepository";
import { DataProcessingService, DataToProcess } from "./DataProcessingService";
import { readCellResolvingDefinedNames } from "./ExcelCellReader";
import { DataElement, DataForm } from "../entities/DataForm";
import { Id } from "../entities/ReferenceObject";

const dateFormatPattern = "yyyy-MM-dd";

export class ExcelBuilder {
    constructor(
        private excelRepository: ExcelRepository,
        private instanceRepository: InstanceRepository,
        private modulesRepositories: ModulesRepositories,
        private dataElementDisaggregationsMappingRepository: DataElementDisaggregationsMappingRepository
    ) {}

    public async populateTemplate(
        template: Template,
        payload: DataPackage,
        settings: Settings,
        dataForm?: DataForm
    ): Promise<void> {
        const { dataSources = [] } = template;
        const dataSourceValues = await this.getDataSourceValues(template, dataSources);
        const metadata =
            payload.type === "trackerPrograms"
                ? await this.instanceRepository.getBuilderMetadata(payload.trackedEntityInstances)
                : emptyBuilderMetadata;
        const templatePayload = templateFromDataPackage(payload);
        const dataElementById = _.keyBy(dataForm?.dataElements ?? [], de => de.id);
        const multiTextLookup: MultiTextLookup = {
            dataElementById,
            optionByCodeByDe: _.mapValues(dataElementById, de => _.keyBy(de.options, o => o.code)),
        };

        for (const dataSource of dataSourceValues) {
            if (!dataSource.skipPopulate) {
                switch (dataSource.type) {
                    case "cell":
                        await this.fillCells(template, dataSource, templatePayload, multiTextLookup);
                        break;
                    case "row":
                        await this.fillRows(template, dataSource, templatePayload, multiTextLookup);
                        break;
                    case "rowTei":
                        await this.fillTeiRows(template, dataSource, templatePayload);
                        break;
                    case "rowTrackedEvent":
                        await this.fillTrackerEventRows(
                            template,
                            dataSource,
                            templatePayload,
                            metadata,
                            settings,
                            multiTextLookup
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

    private async fillCells(
        template: Template,
        dataSource: CellDataSource,
        payload: TemplateDataPackage,
        multiTextLookup: MultiTextLookup
    ) {
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
            const writeValue = this.formatDataElementValue({
                value,
                dataElementId: String(dataElement),
                delimiter: dataSource.multiTextDataElementDelimiter,
                multiTextLookup,
            });
            await this.excelRepository.writeCell(template.id, dataSource.ref, writeValue);
        }
    }

    private async readCellValue(
        template: Template,
        ref?: CellRef | ValueRef,
        options: { isFormula: boolean } = { isFormula: false }
    ): Promise<ExcelValue> {
        if (options.isFormula || !ref || ref.type === "value") {
            return removeCharacters(
                await this.excelRepository.readCell(template.id, ref, { formula: options.isFormula })
            );
        }

        return removeCharacters(await readCellResolvingDefinedNames(this.excelRepository, template.id, ref));
    }

    private async fillTeiRows(template: Template, dataSource: TeiRowDataSource, payload: TemplateDataPackage) {
        if (payload.type !== "trackerPrograms") return;

        let { rowStart } = dataSource.attributes;
        const teisToProcess = this.buildTeisForCustomTemplates({ dataSource, payload, template });

        for (const tei of teisToProcess) {
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

            const allAttributeDetails = await Promise.all(
                cells.map(async cell => {
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
                    if (!attributeId || !cell) return undefined;

                    const attributeValue = tei.attributeValues.find(av => av.attribute.id === attributeId);
                    const isMultiText = attributeValue?.attribute.valueType === "MULTI_TEXT";
                    const value =
                        isMultiText && dataSource.multiTextDelimiter
                            ? this.getMultiTextValue(attributeValue, dataSource.multiTextDelimiter)
                            : this.getValueFromAttribute(attributeValue);

                    return value
                        ? {
                              id: attributeId,
                              cell,
                              value,
                          }
                        : undefined;
                })
            );

            const attributeDetails = DataProcessingService.applyRules({
                dataDetails: _.compact(allAttributeDetails),
                dataProcessingRules: dataSource.attributeDataProcessingRules?.filter(
                    rule => rule.condition === "onExport"
                ),
            });

            await Promise.all(
                attributeDetails.map(({ cell, value }) => this.excelRepository.writeCell(template.id, cell, value))
            );

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

    private formatDataElementValue(options: {
        value: TemplateDataValue["value"];
        dataElementId: Id;
        delimiter: Maybe<string>;
        multiTextLookup: MultiTextLookup;
    }): TemplateDataValue["value"] {
        const { value, dataElementId, delimiter, multiTextLookup } = options;
        const isMultiText = multiTextLookup.dataElementById[dataElementId]?.valueType === "MULTI_TEXT";
        if (!isMultiText || !delimiter) return value;

        const codes = String(value).split(MULTI_TEXT_OPTION_DELIMITER);
        const optionByCode = multiTextLookup.optionByCodeByDe[dataElementId] ?? {};
        return codes.map(code => optionByCode[code]?.name ?? code).join(delimiter);
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
        payload: TemplateDataPackage,
        metadata: BuilderMetadata,
        settings: Settings,
        multiTextLookup: MultiTextLookup
    ) {
        if (payload.type !== "trackerPrograms") return;

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

        const dataEntriesToProcess = this.buildTeiEventsForCustomTemplates({ template, dataSource, payload });

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

            const dataElementsToProcess = _.compact(
                _.zip(dataElementIds, cells).map(([dataElementId, cell]): Maybe<DataToProcess> => {
                    if (!dataElementId || !cell) return undefined;
                    const { value } = dataValues.find(dv => dv.dataElement === dataElementId) ?? {};
                    if (value) {
                        const optionId = metadata.options[value.toString()]?.id;
                        return {
                            id: dataElementId,
                            cell,
                            value,
                            optionId,
                        };
                    } else {
                        return undefined;
                    }
                })
            );

            const dataElementDetails = DataProcessingService.applyRules({
                dataDetails: dataElementsToProcess,
                dataProcessingRules: dataSource.dataElementProcessingRules?.filter(
                    rule => rule.condition === "onExport"
                ),
            });

            //TODO extract "_<VALUE" as a helper since it's used multiple times in multiple files
            await Promise.all(
                dataElementDetails.map(({ cell, id, optionId, value }) => {
                    const writeValue = optionId
                        ? `_${optionId}`
                        : this.formatDataElementValue({
                              value,
                              dataElementId: id,
                              delimiter: dataSource.multiTextDataElementDelimiter,
                              multiTextLookup,
                          });
                    return this.excelRepository.writeCell(template.id, cell, writeValue);
                })
            );

            rowStart += 1;
        }

        if (settings.programStagePopulateEventsForEveryTei[String(dataSourceProgramStageId)]) {
            const allTEIs = this.buildTeisForCustomTemplates({ dataSource, payload, template }).map(
                trackedEntityInstances => trackedEntityInstances.id
            );
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

            const newTEIs = _.difference(allTEIs, existingTEIs);

            return await promiseMap(newTEIs, async (id, index) => {
                const teiRowStart = rowStart + index;
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

    private buildTeiEventsForCustomTemplates(options: {
        template: Template;
        dataSource: TrackerEventRowDataSource;
        payload: TemplateTrackerProgramPackage;
    }): TemplateDataPackageData[] {
        const { template, dataSource, payload } = options;

        if (template.type !== "custom") return payload.dataEntries;
        if (!dataSource.onlyLastEvent) return payload.dataEntries;

        const eventsByTei = _(payload.dataEntries)
            .sortBy(dataSource.sortBy ?? "")
            .groupBy(event => event.trackedEntityInstance)
            .value();

        return _(eventsByTei)
            .values()
            .map(event => {
                const sorted = _(event)
                    .sortBy(event => event.id)
                    .value();
                return _(sorted).last();
            })
            .compact()
            .value();
    }

    private buildTeisForCustomTemplates(options: {
        template: Template;
        dataSource: TeiRowDataSource | TrackerEventRowDataSource;
        payload: TemplateTrackerProgramPackage;
    }): TrackedEntityInstance[] {
        const { template, dataSource, payload } = options;

        if (template.type !== "custom") return payload.trackedEntityInstances;
        if (dataSource.type === "rowTei" && !dataSource.skipTeisWithoutEvents) return payload.trackedEntityInstances;

        const eventsByTei = _(payload.dataEntries)
            .groupBy(dataEntry => dataEntry.trackedEntityInstance)
            .value();

        const dataEntriesTeisWithEvents = _(payload.trackedEntityInstances)
            .filter(tei => {
                const events = eventsByTei[tei.id] || [];
                return events.length > 0;
            })
            .sortBy(dataSource.sortBy ?? "")
            .value();

        return dataEntriesTeisWithEvents;
    }

    private async fillRows(
        template: Template,
        dataSource: RowDataSource,
        payload: TemplateDataPackage,
        multiTextLookup: MultiTextLookup
    ) {
        const isFixedOrgUnitPeriod =
            template.type === "custom" && Boolean(template.fixedOrgUnit) && Boolean(template.fixedPeriod);

        if (isFixedOrgUnitPeriod) {
            return this.fillRowsByKeyLookup(template, dataSource, payload, multiTextLookup);
        }

        return this.fillRowsByDataEntry(template, dataSource, payload, multiTextLookup);
    }

    // For templates with fixedOrgUnit/fixedPeriod: one data entry with many data values,
    // each row may map to a different DE/COC. Uses exact key lookup.
    private async fillRowsByKeyLookup(
        template: Template,
        dataSource: RowDataSource,
        payload: TemplateDataPackage,
        multiTextLookup: MultiTextLookup
    ) {
        const { rowStart, rowEnd = rowStart } = dataSource.range;
        const allDataValues = payload.dataEntries.flatMap(e => e.dataValues);
        const dataValueByDECOC = _.keyBy(allDataValues, dv => `${dv.dataElement}:${dv.category ?? ""}`);

        for (let row = rowStart; row <= rowEnd; row++) {
            const cells = await this.excelRepository.getCellsInRange(template.id, {
                ...dataSource.range,
                rowStart: row,
                rowEnd: row,
            });

            const dataElementsToProcess: DataToProcess[] = [];
            for (const cell of cells) {
                const resolved = await this.resolveCellDataElement(template, dataSource, cell);
                if (!resolved) continue;

                const { dataElement, category } = resolved;
                const exactKey = `${dataElement}:${category ?? ""}`;
                const defaultKey = `${dataElement}:`;
                const value = dataValueByDECOC[exactKey]?.value ?? dataValueByDECOC[defaultKey]?.value;

                if (value !== undefined) {
                    dataElementsToProcess.push({ cell, id: dataElement, value });
                }
            }

            await this.applyRulesAndWrite(template, dataSource, dataElementsToProcess, multiTextLookup);
        }
    }

    // For templates where each row corresponds to a different data entry (orgUnit/period/event).
    private async fillRowsByDataEntry(
        template: Template,
        dataSource: RowDataSource,
        payload: TemplateDataPackage,
        multiTextLookup: MultiTextLookup
    ) {
        let { rowStart } = dataSource.range;
        for (const { id, orgUnit, period, attribute, dataValues, coordinate, geometry } of payload.dataEntries) {
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

            if (payload.type === "programs" && geometry?.type === "Polygon") {
                const geometryCell = await this.findRelative(template, dataSource.geometry, cells[0]);
                if (geometryCell && geometry.coordinates?.[0]) {
                    const coordinatesPairs = geometry.coordinates[0] || [];
                    const coordinatesList = coordinatesPairs.map(([longitude, latitude]) => ({ latitude, longitude }));

                    await this.excelRepository.writeCell(
                        template.id,
                        geometryCell,
                        getGeometryAsString({ type: "polygon", coordinatesList })
                    );
                }
            } else {
                const longitudeCell = await this.findRelative(template, dataSource.coordinates?.longitude, cells[0]);
                if (longitudeCell && coordinate) {
                    await this.excelRepository.writeCell(template.id, longitudeCell, coordinate.longitude);
                }

                const latitudeCell = await this.findRelative(template, dataSource.coordinates?.latitude, cells[0]);
                if (latitudeCell && coordinate) {
                    await this.excelRepository.writeCell(template.id, latitudeCell, coordinate.latitude);
                }
            }

            const dataElementsToProcess = await this.resolveDataElementValues(template, dataSource, cells, dataValues);

            await this.applyRulesAndWrite(template, dataSource, dataElementsToProcess, multiTextLookup);

            rowStart += 1;
        }
    }

    private async resolveCellDataElement(
        template: Template,
        dataSource: RowDataSource,
        cell: CellRef
    ): Promise<Maybe<{ dataElement: string; category: Maybe<string> }>> {
        const dataElementCell = await this.findRelative(template, dataSource.dataElement, cell);
        if (!dataElementCell) return undefined;

        const dataElement = await readCellResolvingDefinedNames(this.excelRepository, template.id, dataElementCell);
        if (!dataElement) return undefined;

        const categoryCell = await this.findRelative(template, dataSource.categoryOption, cell);
        const category = categoryCell
            ? await readCellResolvingDefinedNames(this.excelRepository, template.id, categoryCell)
            : undefined;

        return { dataElement: String(dataElement), category: category ? String(category) : undefined };
    }

    private async resolveDataElementValues(
        template: Template,
        dataSource: RowDataSource,
        cells: CellRef[],
        dataValues: TemplateDataPackageData["dataValues"]
    ): Promise<DataToProcess[]> {
        const results = await promiseMap(cells, async (cell): Promise<Maybe<DataToProcess>> => {
            const resolved = await this.resolveCellDataElement(template, dataSource, cell);
            if (!resolved) return undefined;

            const { dataElement, category } = resolved;
            const { value } =
                dataValues.find(dv => dv.dataElement === dataElement && (!dv.category || dv.category === category)) ??
                {};

            return value ? { cell, id: dataElement, value } : undefined;
        });

        return _.compact(results);
    }

    private async applyRulesAndWrite(
        template: Template,
        dataSource: RowDataSource,
        dataElementsToProcess: DataToProcess[],
        multiTextLookup: MultiTextLookup
    ): Promise<void> {
        const dataElementDetails = DataProcessingService.applyRules({
            dataDetails: dataElementsToProcess,
            dataProcessingRules: dataSource.dataElementProcessingRules?.filter(rule => rule.condition === "onExport"),
        });

        await Promise.all(
            dataElementDetails.map(({ cell, id, value }) => {
                const writeValue = this.formatDataElementValue({
                    value,
                    dataElementId: id,
                    delimiter: dataSource.multiTextDataElementDelimiter,
                    multiTextLookup,
                });
                return this.excelRepository.writeCell(template.id, cell, writeValue);
            })
        );
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
                {
                    excelRepository: this.excelRepository,
                    instanceRepository: this.instanceRepository,
                    modulesRepositories: this.modulesRepositories,
                    dataElementDisaggregationsMappingRepository: this.dataElementDisaggregationsMappingRepository,
                },
                options
            );
        }
    }
}

type MultiTextLookup = {
    dataElementById: Record<Id, DataElement>;
    optionByCodeByDe: Record<Id, Record<string, { name: string }>>;
};

export const MULTI_TEXT_OPTION_DELIMITER = ",";
