import { RelationshipConstraint } from "../../domain/entities/RelationshipType";
import { TrackedEntitiesApiRequest, TrackerRelationship } from "../../domain/entities/TrackedEntity";
import {
    buildOrgUnitMode,
    fromApiRelationships,
    fromApiRelationshipsByType,
    RelationshipMetadata,
} from "../Dhis2RelationshipTypes";

const orgUnits = [{ id: "ou1" }, { id: "ou2" }];

const tei = (id: string) => ({ trackedEntity: { trackedEntity: id } });
const event = (id: string) => ({ event: { event: id } });

function relationship(type: string, from: TrackerRelationship["from"], to: TrackerRelationship["to"]) {
    return { relationship: `rel-${type}`, relationshipName: `${type} name`, relationshipType: type, from, to };
}

function silenceConsoleError() {
    return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

describe("buildOrgUnitMode", () => {
    describe("on versions before v42", () => {
        it("uses ouMode for non org-unit-requiring modes", () => {
            expect(buildOrgUnitMode("2.41.6", "CAPTURE")).toEqual({ ouMode: "CAPTURE" });
        });

        it("uses ouMode + orgUnit (singular, semicolon-separated) for selected org units", () => {
            expect(buildOrgUnitMode("2.41.6", "SELECTED", orgUnits)).toEqual({
                ouMode: "SELECTED",
                orgUnit: "ou1;ou2",
            });
        });
    });

    describe("on v42 and later", () => {
        it("uses orgUnitMode for non org-unit-requiring modes", () => {
            expect(buildOrgUnitMode("2.42.0", "CAPTURE")).toEqual({ orgUnitMode: "CAPTURE" });
        });

        it("uses orgUnitMode + orgUnits (plural, comma-separated) for selected org units", () => {
            expect(buildOrgUnitMode("2.42.0", "SELECTED", orgUnits)).toEqual({
                orgUnitMode: "SELECTED",
                orgUnits: "ou1,ou2",
            });
        });

        it("treats pre-release builds as their major version (regression for NaN parsing)", () => {
            expect(buildOrgUnitMode("2.44-SNAPSHOT", "SELECTED", orgUnits)).toEqual({
                orgUnitMode: "SELECTED",
                orgUnits: "ou1,ou2",
            });
        });
    });

    it("throws when an org-unit-requiring mode has no org units", () => {
        expect(() => buildOrgUnitMode("2.42.0", "SELECTED", [])).toThrow();
    });
});

describe("fromApiRelationshipsByType", () => {
    type RelationshipTypesById = Parameters<typeof fromApiRelationshipsByType>[1];

    const teiConstraint = { relationshipEntity: "TRACKED_ENTITY_INSTANCE", trackedEntityType: { id: "person" } };
    const eventConstraint = { relationshipEntity: "PROGRAM_STAGE_INSTANCE", program: { id: "malaria" } };

    const focusConstraint = { relationshipEntity: "TRACKED_ENTITY_INSTANCE", trackedEntityType: { id: "focus" } };

    const relationshipTypesById = {
        motherChild: { id: "motherChild", fromConstraint: teiConstraint, toConstraint: teiConstraint },
        caseToPerson: { id: "caseToPerson", fromConstraint: eventConstraint, toConstraint: teiConstraint },
        personToFocus: { id: "personToFocus", fromConstraint: teiConstraint, toConstraint: focusConstraint },
    } as unknown as RelationshipTypesById;

    it("keeps a relationship whose items match its type, as stored", () => {
        const apiRelationships = [relationship("motherChild", tei("mother"), tei("child"))];

        expect(fromApiRelationshipsByType(apiRelationships, relationshipTypesById)).toEqual([
            {
                id: "rel-motherChild",
                typeId: "motherChild",
                typeName: "motherChild name",
                fromId: "mother",
                toId: "child",
            },
        ]);
    });

    it("swaps from/to when the items only match the type the other way around", () => {
        const apiRelationships = [relationship("caseToPerson", tei("person1"), event("case1"))];

        expect(fromApiRelationshipsByType(apiRelationships, relationshipTypesById)).toMatchObject([
            { typeId: "caseToPerson", fromId: "case1", toId: "person1" },
        ]);
    });

    describe("with the owning TEI and its type", () => {
        const ownTei = { id: "person1", trackedEntityTypeId: "person" };

        it("swaps from/to when the owning TEI is stored on the end that expects another TEI type", () => {
            const apiRelationships = [relationship("personToFocus", tei("focus1"), tei("person1"))];

            expect(fromApiRelationshipsByType(apiRelationships, relationshipTypesById, ownTei)).toMatchObject([
                { typeId: "personToFocus", fromId: "person1", toId: "focus1" },
            ]);
        });

        it("keeps from/to as stored when both ends expect the owning TEI's type", () => {
            const apiRelationships = [relationship("motherChild", tei("mother"), tei("person1"))];

            expect(fromApiRelationshipsByType(apiRelationships, relationshipTypesById, ownTei)).toMatchObject([
                { typeId: "motherChild", fromId: "mother", toId: "person1" },
            ]);
        });
    });

    it("drops and logs relationships of unknown types or whose items don't match the type", () => {
        const consoleError = silenceConsoleError();
        const apiRelationships = [
            relationship("unknownType", tei("a"), tei("b")),
            relationship("motherChild", event("e1"), tei("b")),
        ];

        expect(fromApiRelationshipsByType(apiRelationships, relationshipTypesById)).toEqual([]);
        expect(consoleError).toHaveBeenCalledTimes(2);
        consoleError.mockRestore();
    });
});

describe("fromApiRelationships", () => {
    const teisConstraint = (teiIds: string[]): RelationshipConstraint => ({
        type: "tei",
        name: "Person",
        teis: teiIds.map(id => ({ id })),
    });

    const metadata: RelationshipMetadata = {
        relationshipTypes: [
            {
                id: "motherChild",
                name: "Mother-Child",
                constraints: { from: teisConstraint(["mother"]), to: teisConstraint(["child"]) },
            },
        ],
    };

    function teiWithRelationships(relationships: TrackerRelationship[]): TrackedEntitiesApiRequest {
        return {
            trackedEntity: "child",
            orgUnit: "ou1",
            inactive: false,
            attributes: [],
            enrollments: [],
            relationships,
        };
    }

    it("keeps a relationship whose TEI ends are in the constraint lists, as stored", () => {
        const teiApi = teiWithRelationships([relationship("motherChild", tei("mother"), tei("child"))]);

        expect(fromApiRelationships(metadata, teiApi)).toEqual([
            {
                id: "rel-motherChild",
                typeId: "motherChild",
                typeName: "motherChild name",
                fromId: "mother",
                toId: "child",
            },
        ]);
    });

    it("swaps from/to when the TEI ends are only in the lists the other way around", () => {
        const teiApi = teiWithRelationships([relationship("motherChild", tei("child"), tei("mother"))]);

        expect(fromApiRelationships(metadata, teiApi)).toMatchObject([
            { typeId: "motherChild", fromId: "mother", toId: "child" },
        ]);
    });

    it("drops and logs relationships of types not in the metadata or with a TEI end not in the lists", () => {
        const consoleError = silenceConsoleError();
        const teiApi = teiWithRelationships([
            relationship("unknownType", tei("mother"), tei("child")),
            relationship("motherChild", tei("stranger"), tei("child")),
        ]);

        expect(fromApiRelationships(metadata, teiApi)).toEqual([]);
        expect(consoleError).toHaveBeenCalledTimes(2);
        consoleError.mockRestore();
    });
});
