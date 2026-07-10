import _ from "lodash";
import i18n from "../../utils/i18n";
import { Maybe } from "../../types/utils";
import { Id } from "./ReferenceObject";
import { TemplateDataPackage, TemplateDataPackageData } from "./Template";
import { TrackedEntityInstance } from "./TrackedEntityInstance";

export interface RowLocation {
    sheet?: string;
    row: number;
    column?: string;
}

type IdLocation = { id: Maybe<string>; location: RowLocation };

const MAX_LINES_PER_SHEET = 5;
const ID_PAIR_SEPARATOR = "␟";

function pairId(entityId: Maybe<string>, columnId: Maybe<string>): Maybe<string> {
    return entityId && columnId ? `${entityId}${ID_PAIR_SEPARATOR}${columnId}` : undefined;
}

/**
 * Maps every metadata/object id present in an imported template to the Excel
 * row(s) it came from, so import errors (which only reference raw ids) can be
 * annotated with "Found in sheet 'X', line Y".
 */
export class ImportRowLookup {
    constructor(private readonly locationsById: Record<Id, RowLocation[]>) {}

    static fromTemplateDataPackage(dataPackage: TemplateDataPackage): ImportRowLookup {
        const teis = dataPackage.type === "trackerPrograms" ? dataPackage.trackedEntityInstances : [];

        const pairs: IdLocation[] = [
            ...dataPackage.dataEntries.flatMap(dataEntryLocations),
            ...teis.flatMap(trackedEntityLocations),
        ];

        const locationsById = _(pairs)
            .filter(({ id }) => Boolean(id))
            .groupBy(({ id }) => id)
            .mapValues(idLocations => idLocations.map(({ location }) => location))
            .value();

        return new ImportRowLookup(locationsById);
    }

    getLocations(ids: Id[]): RowLocation[] {
        const cleanIds = _.compact(ids);
        const pairIds = _.compact(cleanIds.flatMap(entityId => cleanIds.map(columnId => pairId(entityId, columnId))));
        const locations = [...cleanIds, ...pairIds].flatMap(id => this.locationsById[id] ?? []);

        return _.uniqBy(locations, loc => `${loc.sheet ?? ""}|${loc.row}|${loc.column ?? ""}`);
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
                const refs = shown.join(", ");
                const refsLabel = allHaveColumn
                    ? shown.length === 1
                        ? i18n.t("cell {{ref}}", { ref: refs })
                        : i18n.t("cells {{refs}}", { refs })
                    : shown.length === 1
                    ? i18n.t("row {{ref}}", { ref: refs })
                    : i18n.t("rows {{refs}}", { refs });
                const label =
                    remaining > 0 ? `${refsLabel} ${i18n.t("and {{count}} more", { count: remaining })}` : refsLabel;

                return sheet ? i18n.t("sheet {{sheet}}, {{lines}}", { sheet, lines: label }) : label;
            })
            .value();

        return i18n.t("Found in {{locations}} of the Excel file", { locations: bySheet.join("; ") });
    }
}

function dataEntryLocations(entry: TemplateDataPackageData): IdLocation[] {
    const rawRow = typeof entry.group === "number" ? entry.group : parseInt(String(entry.group), 10);
    const entryRow = Number.isFinite(rawRow) ? rawRow : undefined;

    const entryPairs: IdLocation[] =
        entryRow !== undefined
            ? locationPairs({ sheet: entry.sheet, row: entryRow }, [
                  entry.id,
                  entry.orgUnit,
                  entry.attribute,
                  entry.programStage,
                  entry.trackedEntityInstance,
              ])
            : [];

    const dataValuePairs: IdLocation[] = entry.dataValues.flatMap(dataValue => {
        const row = dataValue.row ?? entryRow;
        if (row === undefined) return [];
        const location: RowLocation = { sheet: entry.sheet, row, column: dataValue.column };
        return locationPairs(location, [dataValue.dataElement, dataValue.category, dataValue.optionId]);
    });

    return [...entryPairs, ...dataValuePairs];
}

function trackedEntityLocations(tei: TrackedEntityInstance): IdLocation[] {
    if (tei.row === undefined) return [];

    const location: RowLocation = { sheet: tei.sheet, row: tei.row };
    const teiPairs = locationPairs(location, [tei.id, tei.orgUnit.id]);
    const attributePairs = tei.attributeValues.flatMap(attributeValue => {
        const cell: RowLocation = { ...location, column: attributeValue.column };
        return locationPairs(cell, [
            pairId(tei.id, attributeValue.attribute.id),
            pairId(tei.id, attributeValue.optionId),
        ]);
    });

    return [...teiPairs, ...attributePairs];
}

function locationPairs(location: RowLocation, ids: Maybe<string>[]): IdLocation[] {
    return ids.map(id => ({ id, location }));
}
