import _ from "lodash";
import i18n from "../../utils/i18n";
import { Id } from "./ReferenceObject";
import { TemplateDataPackage } from "./Template";

export interface RowLocation {
    sheet?: string;
    row: number;
}

const MAX_LINES_PER_SHEET = 5;

/**
 * Maps every metadata/object id present in an imported template to the Excel
 * row(s) it came from, so import errors (which only reference raw ids) can be
 * annotated with "Found in sheet 'X', line Y".
 */
export class ImportRowLookup {
    constructor(private readonly locationsById: Map<Id, RowLocation[]>) {}

    static fromTemplateDataPackage(dataPackage: TemplateDataPackage): ImportRowLookup {
        const locationsById = new Map<Id, RowLocation[]>();

        const add = (id: string | undefined | null, location: RowLocation): void => {
            if (!id) return;
            locationsById.set(id, [...(locationsById.get(id) ?? []), location]);
        };

        dataPackage.dataEntries.forEach(entry => {
            const rawRow = typeof entry.group === "number" ? entry.group : parseInt(String(entry.group), 10);
            const row = Number.isFinite(rawRow) ? rawRow : undefined;
            if (row === undefined) return;

            const location: RowLocation = { sheet: entry.sheet, row };
            add(entry.id, location);
            add(entry.orgUnit, location);
            add(entry.attribute, location);
            add(entry.programStage, location);
            add(entry.trackedEntityInstance, location);
            entry.dataValues.forEach(dataValue => {
                add(dataValue.dataElement, location);
                add(dataValue.category, location);
                add(dataValue.optionId, location);
            });
        });

        if (dataPackage.type === "trackerPrograms") {
            dataPackage.trackedEntityInstances.forEach(tei => {
                if (tei.row === undefined) return;
                const location: RowLocation = { sheet: tei.sheet, row: tei.row };
                add(tei.id, location);
                add(tei.orgUnit.id, location);
                tei.attributeValues.forEach(attributeValue => {
                    add(attributeValue.attribute.id, location);
                    add(attributeValue.optionId, location);
                });
            });
        }

        return new ImportRowLookup(locationsById);
    }

    getLocations(ids: Id[]): RowLocation[] {
        const locations = _.compact(ids).flatMap(id => this.locationsById.get(id) ?? []);
        return _.uniqWith(locations, _.isEqual);
    }

    formatLocations(locations: RowLocation[]): string {
        if (locations.length === 0) return "";

        const bySheet = _(locations)
            .groupBy(location => location.sheet ?? "")
            .map((sheetLocations, sheet) => {
                const rows = _.sortBy(_.uniq(sheetLocations.map(location => location.row)));
                const shown = rows.slice(0, MAX_LINES_PER_SHEET);
                const remaining = rows.length - shown.length;
                const linesLabel =
                    shown.length === 1
                        ? i18n.t("row {{lines}}", { lines: String(shown[0]) })
                        : i18n.t("rows {{lines}}", { lines: shown.join(", ") });
                const moreLabel = remaining > 0 ? ` ${i18n.t("and {{count}} more", { count: remaining })}` : "";
                const lines = `${linesLabel}${moreLabel}`;
                return sheet ? i18n.t("sheet {{sheet}}, {{lines}}", { sheet, lines }) : lines;
            })
            .value();

        return i18n.t("Found in {{locations}} of the Excel file", { locations: bySheet.join("; ") });
    }
}
