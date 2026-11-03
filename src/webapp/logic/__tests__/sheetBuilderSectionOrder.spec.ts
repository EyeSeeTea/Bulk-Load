import { getDataElementsForSectionDataSet } from "../sheetBuilder";

describe("getDataElementsForSectionDataSet", () => {
    it("keeps the section order and the data element order inside sections, even with mixed category combos", () => {
        const dataElements = ["de1", "de2", "de3", "de4"].map(id => ({ id, categoryCombo: { id: `cc-${id}` } }));
        const metadata = new Map(dataElements.map(de => [de.id, de]));

        // Alternating category combos: grouping by category combo would reorder these.
        const categoryComboByDataElement: Record<string, string> = {
            de1: "ccA",
            de2: "ccB",
            de3: "ccA",
            de4: "ccB",
        };

        const dataSet = {
            dataSetElements: dataElements.map(de => ({
                dataElement: { id: de.id },
                categoryCombo: { id: categoryComboByDataElement[de.id] },
            })),
            sections: [
                { sortOrder: 2, dataElements: [{ id: "de4" }, { id: "de1" }] },
                { sortOrder: 1, dataElements: [{ id: "de3" }, { id: "de2" }] },
            ],
        };

        const cocsByCatComboId = { ccA: [{ id: "cocA" }], ccB: [{ id: "cocB" }] };

        const result = getDataElementsForSectionDataSet(dataSet, metadata, cocsByCatComboId);

        expect(result.map(item => item.dataElement.id)).toEqual(["de3", "de2", "de4", "de1"]);
        expect(result.map(item => item.categoryOptionCombos[0]?.id)).toEqual(["cocA", "cocB", "cocB", "cocA"]);
    });
});
