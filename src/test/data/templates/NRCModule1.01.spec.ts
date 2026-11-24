import { vi, type Mocked } from "vitest";
import XLSX from "@eyeseetea/xlsx-populate";
import { ExcelPopulateRepository } from "../../../data/ExcelPopulateRepository";
import { NRCModule101 } from "../../../data/templates/nrc/NRCModule1.01";
import {
    DownloadCustomizationOptions,
    DownloadCustomizationRepositories,
    ImportCustomizationRepositories,
    TemplateDataPackage,
    TemplateDataPackageData,
    TemplateDataValue,
} from "../../../domain/entities/Template";
import { NRCModuleMetadata } from "../../../domain/entities/templates/NRCModuleMetadata";
import { ExcelRepository } from "../../../domain/repositories/ExcelRepository";
import { NRCModuleMetadataRepository } from "../../../domain/repositories/templates/NRCModuleMetadataRepository";

const templateId = "NRCmodule_v1";
const dataEntrySheet = "Data Entry";
const matchingSheet = "MatchingIndicators";
const grey = "#F2F2F2";
const deA = "aNLLiL1DvRY";
const deB = "EPeQxNB4dfZ";
const deC = "p4JoDpKlMOC";

describe("NRCModule101", () => {
    describe("importCustomization", () => {
        it("adds a paired data value copying the entry when L has a data element id", async () => {
            const excelRepository = await loadWorkbook({ L4: deB });
            const entry = buildEntry({ group: "4", dataElement: deA });

            const result = await runImport(excelRepository, [entry]);

            expect(result.dataEntries).toEqual([
                { ...entry, dataValues: [entry.dataValues[0], { ...entry.dataValues[0], dataElement: deB }] },
            ]);
        });

        it("leaves the entry unchanged when L is empty", async () => {
            const excelRepository = await loadWorkbook({ L4: "" });
            const entry = buildEntry({ group: "4", dataElement: deA });

            const result = await runImport(excelRepository, [entry]);

            expect(result.dataEntries).toEqual([entry]);
        });

        it("leaves the entry unchanged when L equals the entry data element", async () => {
            const excelRepository = await loadWorkbook({ L4: deA });
            const entry = buildEntry({ group: "4", dataElement: deA });

            const result = await runImport(excelRepository, [entry]);

            expect(result.dataEntries).toEqual([entry]);
        });

        it("leaves the entry unchanged when L resolves to #N/A (indicator without a pair)", async () => {
            const excelRepository = await loadWorkbook({ L4: "#N/A" });
            const entry = buildEntry({ group: "4", dataElement: deA });

            const result = await runImport(excelRepository, [entry]);

            expect(result.dataEntries).toEqual([entry]);
        });

        it("leaves the entry unchanged when L holds raw formula text (file not recalculated)", async () => {
            const excelRepository = await loadWorkbook({ L4: '=IF(K4="", NA(), INDEX(Metadata!$A$4:$A$1000, 1))' });
            const entry = buildEntry({ group: "4", dataElement: deA });

            const result = await runImport(excelRepository, [entry]);

            expect(result.dataEntries).toEqual([entry]);
        });

        it("does not duplicate a data element already present in the entry", async () => {
            const excelRepository = await loadWorkbook({ L4: deB });
            const entry = buildEntry({ group: "4", dataElement: deA });
            const withPaired: TemplateDataPackageData = {
                ...entry,
                dataValues: [...entry.dataValues, ...buildEntry({ group: "4", dataElement: deB }).dataValues],
            };

            const result = await runImport(excelRepository, [withPaired]);

            expect(result.dataEntries).toEqual([withPaired]);
        });

        it("leaves a package from the old layout unchanged (grey row 5, no L content)", async () => {
            const excelRepository = await loadWorkbook({ A5: "OU", C5: "Indicator B", F5: 10, H5: "COC" });
            const entries = [
                buildEntry({ group: "4", dataElement: deA }),
                buildEntry({ group: "6", dataElement: deC }),
            ];

            const result = await runImport(excelRepository, entries);

            expect(result.dataEntries).toEqual(entries);
        });

        it("pairs only the entries whose row has an L value", async () => {
            const excelRepository = await loadWorkbook({ L4: deB });
            const paired = buildEntry({ group: "4", dataElement: deA });
            const unpaired = buildEntry({ group: "5", dataElement: deC });

            const result = await runImport(excelRepository, [paired, unpaired]);

            expect(result.dataEntries.map(entry => entry.dataValues.map(dv => dv.dataElement))).toEqual([
                [deA, deB],
                [deC],
            ]);
        });
    });

    describe("downloadCustomization", () => {
        const matchingCount = 2; // A->B and B->A
        const sourcesRange = `${matchingSheet}!$A$1:$A$${matchingCount}`;
        const lookupRange = `${matchingSheet}!$A$1:$B$${matchingCount}`;

        const expectedK = (row: number) =>
            `=IF(ISNUMBER(MATCH(C${row}, ${sourcesRange}, 0)), VLOOKUP(C${row}, ${lookupRange}, 2, FALSE), "")`;
        const expectedL = (row: number) =>
            `=IF(K${row}="", NA(), INDEX(Metadata!$A$4:$A$1000, MATCH("dataElements-"&K${row}, Metadata!$D$4:$D$1000, 0), 1))`;

        it("writes the K header and K/L formulas on consecutive rows", async () => {
            const { excelRepository, writes } = await runDownload(buildMetadata({ withMatching: true }));

            expect(writes[`${dataEntrySheet}!K3`]).toEqual("Matched indicator");
            expect(writes[`${dataEntrySheet}!K4`]).toEqual(expectedK(4));
            expect(writes[`${dataEntrySheet}!L4`]).toEqual(expectedL(4));
            expect(writes[`${dataEntrySheet}!K5`]).toEqual(expectedK(5));
            expect(writes[`${dataEntrySheet}!L5`]).toEqual(expectedL(5));
            expect(writes[`${dataEntrySheet}!K999`]).toEqual(expectedK(999));
            expect(writes[`${dataEntrySheet}!K1000`]).toEqual(undefined);
            expect(excelRepository.hideCells).toHaveBeenCalledWith(
                templateId,
                { sheet: dataEntrySheet, type: "column", ref: "L" },
                true
            );
        });

        it("writes no mirror cells for the old paired-row pattern", async () => {
            const { writes } = await runDownload(buildMetadata({ withMatching: true }));

            const mirrorRefs = ["A", "B", "C", "D", "E", "F", "G", "H"].map(column => `${dataEntrySheet}!${column}5`);
            expect(mirrorRefs.map(ref => writes[ref])).toEqual(mirrorRefs.map(() => undefined));
        });

        it("unlocks A-F on every entry row and locks K with grey fill and a readable width", async () => {
            const { excelRepository } = await runDownload(buildMetadata({ withMatching: true }));

            expect(excelRepository.styleCell).toHaveBeenCalledWith(
                templateId,
                { type: "range", sheet: dataEntrySheet, ref: "A4:F999" },
                { locked: false }
            );
            expect(excelRepository.styleCell).toHaveBeenCalledWith(
                templateId,
                { type: "range", sheet: dataEntrySheet, ref: "K4:K999" },
                { locked: true, fillColor: grey, columnSize: 45 }
            );
        });

        it("writes only the K header when there are no matching pairs", async () => {
            const { writes } = await runDownload(buildMetadata({ withMatching: false }));

            expect(writes[`${dataEntrySheet}!K3`]).toEqual("Matched indicator");
            expect([writes[`${dataEntrySheet}!K4`], writes[`${dataEntrySheet}!L4`]]).toEqual([undefined, undefined]);
        });
    });
});

type WorkbookCells = Record<string, string | number>;

async function loadWorkbook(cells: WorkbookCells): Promise<ExcelPopulateRepository> {
    const workbook = await XLSX.fromBlankAsync();
    const sheet = workbook.sheet(0).name(dataEntrySheet);
    workbook.definedName(`Version_${templateId}`, sheet.cell("A1"));
    Object.entries(cells).forEach(([ref, value]) => {
        if (value !== "") sheet.cell(ref).value(value);
    });

    const repository = new ExcelPopulateRepository();
    // Reason: xlsx-populate's Blob detection fails under jsdom, but the "file" loader passes data straight through and it accepts buffers.
    const file = (await workbook.outputAsync()) as unknown as Blob;
    await repository.loadTemplate({ type: "file", file });
    return repository;
}

async function runImport(
    excelRepository: ExcelRepository,
    dataEntries: TemplateDataPackageData[]
): Promise<TemplateDataPackage> {
    const dataPackage: TemplateDataPackage = { type: "dataSets", dataEntries };
    const repositories = { excelRepository } as ImportCustomizationRepositories;

    return new NRCModule101().importCustomization(repositories, { dataPackage });
}

function buildEntry(options: { group: string; dataElement: string }): TemplateDataPackageData {
    const dataValue: TemplateDataValue = {
        dataElement: options.dataElement,
        category: "COC_1",
        value: 10,
        optionId: undefined,
        contentType: undefined,
    };

    return {
        group: options.group,
        dataForm: "DS_1",
        id: undefined,
        orgUnit: "OU_1",
        period: "2024",
        attribute: "AOC_1",
        coordinate: undefined,
        trackedEntityInstance: undefined,
        programStage: undefined,
        geometry: undefined,
        completed: undefined,
        dataValues: [dataValue],
    };
}

function buildMetadata(options: { withMatching: boolean }): NRCModuleMetadata {
    const categoryCombo = { id: "CC_1", name: "CC", categoryOptionCombos: [{ id: "COC_1", name: "COC" }] };
    const dataElement = (id: string) => ({ id, name: `Indicator ${id}`, categoryCombo });

    return {
        dataSet: { id: "DS_1", name: "Data set" },
        dataElements: [dataElement(deA), dataElement(deB), dataElement(deC)],
        organisationUnits: [{ id: "OU_1", name: "Org unit" }],
        periods: [{ id: "2024", name: "2024" }],
        indicatorMatchings: options.withMatching ? [{ source: deA, target: deB }] : [],
        categoryCombo: {
            categories: {},
            categoryOptionCombos: [{ id: "COC_1", name: "COC", categoryOptions: [] }],
        },
    };
}

async function runDownload(metadata: NRCModuleMetadata) {
    const writes: Record<string, unknown> = {};
    const excelRepository = {
        getOrCreateSheet: vi.fn(),
        writeCell: vi.fn(async (_id: string, cell: { sheet: string; ref: string }, value: unknown) => {
            writes[`${cell.sheet}!${cell.ref}`] = value;
        }),
        defineName: vi.fn(),
        styleCell: vi.fn(),
        hideCells: vi.fn(),
        protectSheet: vi.fn(),
    } as unknown as Mocked<ExcelRepository>;
    const nrcRepository: Mocked<NRCModuleMetadataRepository> = { get: vi.fn().mockResolvedValue(metadata) };
    const repositories = {
        excelRepository,
        modulesRepositories: { nrc: nrcRepository },
    } as unknown as DownloadCustomizationRepositories;
    const options = { id: "DS_1", currentUser: {} } as unknown as DownloadCustomizationOptions;

    await new NRCModule101().downloadCustomization(repositories, options);

    return { excelRepository, writes };
}
