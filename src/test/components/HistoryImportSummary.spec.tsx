import { SnackbarProvider } from "@eyeseetea/d2-ui-components";
import { fireEvent, render, screen } from "@testing-library/react";

import { HistoryEntrySummary } from "../../domain/entities/HistoryEntry";
import { OrgUnitReference } from "../../domain/entities/OrgUnit";
import { AppContext, AppContextI } from "../../webapp/contexts/app-context";
import { HistoryImportSummary } from "../../webapp/components/history/HistoryImportSummary";

const MAX_ORG_UNITS_SHOWN = 10;
const ORG_UNIT_LABEL = "Org. Unit:";

const summary: HistoryEntrySummary = {
    id: "aB3cD4eF5gH",
    name: "OCBA Monthly Data",
    timestamp: "2026-08-12T09:14:03.221Z",
    status: "SUCCESS",
    username: "ocba.user",
    fileName: "monthly-data-jul.xlsx",
    documentId: "Zx9YwV8uT7s",
};

// No download is triggered in these tests, the context only has to be readable
const appContext = { compositionRoot: { history: {} } } as AppContextI;

function buildOrgUnits(count: number): OrgUnitReference[] {
    return Array.from({ length: count }, (_value, index) => ({
        id: `orgUnit${index.toString().padStart(4, "0")}`,
        name: `Org Unit ${index}`,
    }));
}

function renderSummary(orgUnits: OrgUnitReference[]) {
    return render(
        <AppContext.Provider value={appContext}>
            <SnackbarProvider>
                <HistoryImportSummary summary={summary} orgUnits={orgUnits} />
            </SnackbarProvider>
        </AppContext.Provider>
    );
}

function getOrgUnitsValue(): string {
    const label = screen.getByText(ORG_UNIT_LABEL);
    return label.nextElementSibling?.textContent ?? "";
}

describe("HistoryImportSummary", () => {
    describe("org units row", () => {
        it("is not rendered when there are no org units", () => {
            renderSummary([]);

            expect(screen.queryByText(ORG_UNIT_LABEL)).toBeNull();
        });

        it("lists every org unit when they all fit", () => {
            renderSummary(buildOrgUnits(3));

            expect(getOrgUnitsValue()).toBe("Org Unit 0, Org Unit 1, Org Unit 2");
        });

        it("falls back to the id of org units whose name could not be resolved", () => {
            renderSummary([
                { id: "firstOrgUn", name: "First" },
                { id: "missingOrg", name: undefined },
            ]);

            expect(getOrgUnitsValue()).toBe("First, missingOrg");
        });

        it("lists the first ten and counts the rest when there are too many", () => {
            renderSummary(buildOrgUnits(MAX_ORG_UNITS_SHOWN + 2));

            const expectedNames = buildOrgUnits(MAX_ORG_UNITS_SHOWN)
                .map(orgUnit => orgUnit.name)
                .join(", ");
            expect(getOrgUnitsValue()).toBe(`${expectedNames} and 2 more`);
        });

        it("shows every org unit in a tooltip when the list is truncated", async () => {
            renderSummary(buildOrgUnits(MAX_ORG_UNITS_SHOWN + 2));

            fireEvent.mouseOver(screen.getByText(/and 2 more$/));

            const tooltip = await screen.findByRole("tooltip");
            expect(tooltip.textContent).toBe(
                buildOrgUnits(MAX_ORG_UNITS_SHOWN + 2)
                    .map(orgUnit => orgUnit.name)
                    .join("")
            );
        });
    });
});
