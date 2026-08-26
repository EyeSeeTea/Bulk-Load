import { DataSource, GeneratedTemplate, StyleSource } from "../../../domain/entities/Template";

export class TrackerProgramGenerated04 implements GeneratedTemplate {
    public readonly type = "generated";
    public readonly id = "TRACKER_PROGRAM_GENERATED_v4";
    public readonly name = "Auto-generated Tracker Program template";
    public readonly dataFormId = { type: "cell" as const, sheet: "Validation", ref: "A1" };
    public readonly dataFormType = { type: "value" as const, id: "trackerPrograms" as const };

    public readonly rowOffset = 3;
    public readonly colOffset = 0;

    public readonly dataSources: DataSource[] = [
        {
            type: "rowTei",
            teiId: {
                sheet: "TEI Instances",
                type: "column",
                ref: "A",
            },
            orgUnit: {
                sheet: "TEI Instances",
                type: "column",
                ref: "B",
            },
            geometry: {
                sheet: "TEI Instances",
                type: "column",
                ref: "C",
            },
            enrollmentDate: {
                sheet: "TEI Instances",
                type: "column",
                ref: "D",
            },
            incidentDate: {
                sheet: "TEI Instances",
                type: "column",
                ref: "E",
            },
            attributes: {
                sheet: "TEI Instances",
                rowStart: 6,
                columnStart: "F",
            },
            attributeId: {
                sheet: "TEI Instances",
                type: "row",
                ref: 5,
            },
        },
        {
            type: "rowTeiRelationship",
            sheetsMatch: "^Rel",
            range: {
                sheet: "",
                rowStart: 3,
                columnStart: "A",
            },
            relationshipType: {
                sheet: "",
                type: "cell",
                ref: "A1",
            },
            from: {
                sheet: "",
                type: "column",
                ref: "A",
            },
            to: {
                sheet: "",
                type: "column",
                ref: "B",
            },
        },
        {
            type: "rowTrackedEvent",
            sheetsMatch: "^(Stage|\\()",
            eventId: {
                sheet: "",
                type: "column",
                ref: "A",
            },
            teiId: {
                sheet: "",
                type: "column",
                ref: "B",
            },
            categoryOptionCombo: {
                sheet: "",
                type: "column",
                ref: "C",
            },
            date: {
                sheet: "",
                type: "column",
                ref: "D",
            },
            completed: {
                sheet: "",
                type: "column",
                ref: "E",
            },
            programStage: {
                sheet: "",
                type: "cell",
                ref: "A1",
            },
            dataElements: {
                sheet: "",
                rowStart: 2,
                rowEnd: 2,
                columnStart: "F",
            },
            dataValues: {
                sheet: "",
                rowStart: 3,
                columnStart: "F",
            },
        },
    ];

    public readonly styleSources: StyleSource[] = [
        {
            section: "title",
            source: {
                type: "range",
                ref: "D2:I2",
                sheet: "TEI Instances",
            },
        },
        {
            section: "subtitle",
            source: {
                type: "range",
                ref: "D3:I3",
                sheet: "TEI Instances",
            },
        },
        {
            section: "logo",
            source: {
                type: "range",
                ref: "A2:C3",
                sheet: "TEI Instances",
            },
        },
    ];
}
