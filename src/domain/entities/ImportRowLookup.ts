import _ from "lodash";
import i18n from "../../utils/i18n";
import { Id } from "./ReferenceObject";
import { TemplateDataPackage } from "./Template";

export interface RowLocation {
    sheet?: string;
    row: number;
    column?: string;
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
                const dvLocation: RowLocation = { ...location, column: dataValue.column };
                add(dataValue.dataElement, dvLocation);
                add(dataValue.category, dvLocation);
                add(dataValue.optionId, dvLocation);
            });
        });

        if (dataPackage.type === "trackerPrograms") {
            dataPackage.trackedEntityInstances.forEach(tei => {
                if (tei.row === undefined) return;
                const location: RowLocation = { sheet: tei.sheet, row: tei.row };
                add(tei.id, location);
                add(tei.orgUnit.id, location);
                tei.attributeValues.forEach(attributeValue => {
                    const avLocation: RowLocation = { ...location, column: attributeValue.column };
                    add(attributeValue.attribute.id, avLocation);
                    add(attributeValue.optionId, avLocation);
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
                // Per row: prefer cell-level locations over row-only ones
                const byRow = _.groupBy(sheetLocations, loc => loc.row);
                const refined = _.flatMap(byRow, rowLocs => {
                    const withColumn = rowLocs.filter(l => l.column);
                    return withColumn.length > 0 ? withColumn : rowLocs;
                });

                const sortedLocs = _(refined)
                    .uniqBy(loc => `${loc.sheet ?? ""}|${loc.row}|${loc.column ?? ""}`)
                    .sortBy([loc => loc.row, loc => loc.column])
                    .value();
                const shownLocs = sortedLocs.slice(0, MAX_LINES_PER_SHEET);
                const remaining = sortedLocs.length - shownLocs.length;
                const allHaveColumn = shownLocs.every(l => l.column);
                const shown = shownLocs.map(loc => (loc.column ? `${loc.column}${loc.row}` : String(loc.row)));
                const refs = shown.length === 1 ? shown[0] : shown.join(", ");
                const refsLabel = allHaveColumn
                    ? shown.length === 1
                        ? i18n.t("cell {{ref}}", { ref: refs })
                        : i18n.t("cells {{refs}}", { refs })
                    : shown.length === 1
                    ? i18n.t("row {{ref}}", { ref: refs })
                    : i18n.t("rows {{refs}}", { refs });
                const label =
                    remaining > 0
                        ? `${refsLabel} ${i18n.t("and {{count}} more", { count: remaining })}`
                        : refsLabel;
                return sheet ? i18n.t("sheet {{sheet}}, {{lines}}", { sheet, lines: label }) : label;
            })
            .value();

        return i18n.t("Found in {{locations}} of the Excel file", { locations: bySheet.join("; ") });
    }
}
