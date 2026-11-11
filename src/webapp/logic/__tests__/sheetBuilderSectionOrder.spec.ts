import { getDataElementsForSectionDataSet } from "../sheetBuilder";

describe("getDataElementsForSectionDataSet", () => {
    it("keeps the section order and does not group category combos across sections", () => {
        const dataElements = ["de1", "de2", "de3", "de4"].map(id => ({ id, categoryCombo: { id: `cc-${id}` } }));
        const metadata = new Map(dataElements.map(de => [de.id, de]));

        // Alternating category combos: grouping across sections would reorder these.
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

    describe("grouping by category combo inside a section, as in the DHIS2 Data Entry app", () => {
        // Section 1 = A (default), B (gender), C (default). Section 2 = D (default).
        const categoryComboByDataElement: Record<string, string> = {
            A: "ccDefault",
            B: "ccGender",
            C: "ccDefault",
            D: "ccDefault",
        };
        const dataElements = Object.keys(categoryComboByDataElement).map(id => ({
            id,
            categoryCombo: { id: categoryComboByDataElement[id] },
        }));
        const metadata = new Map(dataElements.map(de => [de.id, de]));
        const cocsByCatComboId = { ccDefault: [{ id: "cocDefault" }], ccGender: [{ id: "cocGender" }] };

        function buildDataSet(disableDataElementAutoGroup: boolean) {
            return {
                dataSetElements: dataElements.map(de => ({
                    dataElement: { id: de.id },
                    categoryCombo: { id: categoryComboByDataElement[de.id] },
                })),
                sections: [
                    {
                        sortOrder: 1,
                        disableDataElementAutoGroup,
                        dataElements: [{ id: "A" }, { id: "B" }, { id: "C" }],
                    },
                    { sortOrder: 2, disableDataElementAutoGroup: false, dataElements: [{ id: "D" }] },
                ],
            };
        }

        it("groups the data elements of a section by category combo when auto group is on (default)", () => {
            const result = getDataElementsForSectionDataSet(buildDataSet(false), metadata, cocsByCatComboId);

            expect(result.map(item => item.dataElement.id)).toEqual(["A", "C", "B", "D"]);
        });

        it("keeps the order defined in the section when Disable data element auto group is on", () => {
            const result = getDataElementsForSectionDataSet(buildDataSet(true), metadata, cocsByCatComboId);

            expect(result.map(item => item.dataElement.id)).toEqual(["A", "B", "C", "D"]);
        });
    });

    it("puts data elements that are not in any section after the section data elements", () => {
        const categoryComboByDataElement: Record<string, string> = {
            outside: "ccDefault",
            A: "ccDefault",
            B: "ccDefault",
        };
        const dataElements = Object.keys(categoryComboByDataElement).map(id => ({
            id,
            categoryCombo: { id: categoryComboByDataElement[id] },
        }));
        const metadata = new Map(dataElements.map(de => [de.id, de]));
        const cocsByCatComboId = { ccDefault: [{ id: "cocDefault" }] };

        const dataSet = {
            dataSetElements: dataElements.map(de => ({
                dataElement: { id: de.id },
                categoryCombo: { id: categoryComboByDataElement[de.id] },
            })),
            sections: [{ sortOrder: 1, dataElements: [{ id: "B" }, { id: "A" }] }],
        };

        const result = getDataElementsForSectionDataSet(dataSet, metadata, cocsByCatComboId);

        expect(result.map(item => item.dataElement.id)).toEqual(["B", "A", "outside"]);
    });
});
