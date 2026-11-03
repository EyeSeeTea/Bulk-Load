import { D2Api } from "../../../types/d2-api";
import Settings from "../../../webapp/logic/settings";
import { OrgUnitRepository } from "../../repositories/OrgUnitRepository";
import { getElementMetadata } from "../DownloadTemplateUseCase";
import { RegenerateTemplateMetadataUseCase } from "../RegenerateTemplateMetadataUseCase";

vi.mock("../DownloadTemplateUseCase", () => ({
    getElement: vi.fn(async () => ({ id: "ds1", type: "dataSets", organisationUnits: [{ id: "ou1" }] })),
    getElementMetadata: vi.fn(async () => ({ element: {}, metadata: {}, elementMetadata: new Map() })),
}));

vi.mock("../../../webapp/logic/sheetBuilder", () => ({
    SheetBuilder: class {
        generateMetadataOnly = async () => ({ writeToBase64: () => "base64" });
    },
}));

function buildSettings(categoryOptionOrgUnitFilter: "assigned" | "assignedAndDescendants"): Settings {
    return Object.assign(Object.create(Settings.prototype), { categoryOptionOrgUnitFilter });
}

describe("RegenerateTemplateMetadataUseCase", () => {
    it.each(["assigned", "assignedAndDescendants"] as const)(
        "uses the %s setting and the org unit repository when getting the metadata",
        async filter => {
            const orgUnitRepository: OrgUnitRepository = { getByIds: vi.fn() };

            await new RegenerateTemplateMetadataUseCase(orgUnitRepository).execute(
                new D2Api({ baseUrl: "http://localhost" }),
                {
                    type: "dataSets",
                    id: "ds1",
                    fileContents: "",
                    settings: buildSettings(filter),
                    language: "en",
                    includeMetadataCodes: false,
                    useCodesForMetadata: false,
                    orgUnitShortName: false,
                }
            );

            expect(getElementMetadata).toHaveBeenLastCalledWith(
                expect.objectContaining({ categoryOptionOrgUnitFilter: filter, orgUnitRepository })
            );
        }
    );
});
