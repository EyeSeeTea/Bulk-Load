import _ from "lodash";
import { fromBase64 } from "../../utils/files";
import { removeCharacters } from "../../utils/string";
import { promiseMap } from "../../webapp/utils/common";
import { DataPackage } from "../entities/DataPackage";
import { CellRef, Range, RowDataSource, SheetRef, Template } from "../entities/Template";
import { Theme, ThemeStyle } from "../entities/Theme";

export type LoadOptions = WebLoadOptions | FileLoadOptions;

export interface BaseLoadOptions {
    type: "url" | "file";
    url?: string;
    file?: File | Blob;
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
    public abstract async loadTemplate(template: Template, options: LoadOptions): Promise<void>;
    public abstract async toBlob(template: Template): Promise<Blob>;
    public abstract async findRelativeCell(
        template: Template,
        location?: SheetRef,
        cell?: CellRef
    ): Promise<CellRef | undefined>;
    public abstract async writeCell(
        template: Template,
        cellRef: CellRef,
        value: string | number | boolean
    ): Promise<void>;
    public abstract async readCell(template: Template, cellRef: CellRef): Promise<string>;
    public abstract async getCellsInRange(template: Template, range: Range): Promise<CellRef[]>;
    public abstract async addPicture(
        template: Template,
        location: SheetRef,
        file: File
    ): Promise<void>;
    public abstract async styleCell(
        template: Template,
        source: SheetRef,
        style: ThemeStyle
    ): Promise<void>;

    public async populateTemplate(template: Template, payload: DataPackage[]): Promise<void> {
        const { dataSources = [] } = template;
        for (const dataSource of dataSources) {
            switch (dataSource.type) {
                case "row":
                    await this.fillRows(template, dataSource, payload);
                    break;
                default:
                    throw new Error(`Type ${dataSource.type} not supported`);
            }
        }
    }

    private async fillRows(template: Template, dataSource: RowDataSource, payload: DataPackage[]) {
        let { rowStart } = dataSource.range;

        for (const { id, orgUnit, period, attribute, dataValues } of payload) {
            const cells = await this.getCellsInRange(template, {
                ...dataSource.range,
                rowStart,
                rowEnd: rowStart,
            });

            const orgUnitCell = await this.findRelativeCell(template, dataSource.orgUnit, cells[0]);
            if (orgUnitCell && orgUnit) {
                await this.writeCell(template, orgUnitCell, orgUnit);
            }

            const eventIdCell = await this.findRelativeCell(template, dataSource.eventId, cells[0]);
            if (eventIdCell && id) {
                await this.writeCell(template, eventIdCell, id);
            }

            const periodCell = await this.findRelativeCell(template, dataSource.period, cells[0]);
            if (periodCell) await this.writeCell(template, periodCell, period);

            const attributeCell = await this.findRelativeCell(
                template,
                dataSource.attribute,
                cells[0]
            );
            if (attributeCell && attribute) {
                await this.writeCell(template, attributeCell, attribute);
            }

            for (const cell of cells) {
                const dataElementCell = await this.findRelativeCell(
                    template,
                    dataSource.dataElement,
                    cell
                );
                const categoryCell = await this.findRelativeCell(
                    template,
                    dataSource.categoryOption,
                    cell
                );

                const dataElement = dataElementCell
                    ? removeCharacters(await this.readCell(template, dataElementCell))
                    : undefined;
                const category = categoryCell
                    ? removeCharacters(await this.readCell(template, categoryCell))
                    : undefined;

                const { value } =
                    dataValues.find(
                        dv => dv.dataElement === dataElement && dv.category === category
                    ) ?? {};

                if (value) await this.writeCell(template, cell, value);
            }

            rowStart += 1;
        }
    }

    public async applyTheme(template: Template, theme: Theme): Promise<void> {
        _.forOwn(theme.sections, (style: ThemeStyle, section: string) => {
            const styleSource = template.styleSources.find(source => source.section === section);
            const { source } = styleSource ?? {};
            if (source) this.styleCell(template, source, style);
        });

        await promiseMap(_.toPairs(theme.pictures), async ([section, image]) => {
            const file = image ? await fromBase64(image.src) : undefined;
            const styleSource = template.styleSources.find(source => source.section === section);
            const { source } = styleSource ?? {};
            if (source && file) this.addPicture(template, source, file);
        });
    }
}
