import { DataSource, GeneratedTemplate, StyleSource } from "../../../domain/entities/Template";

export class DataSetGenerated03 implements GeneratedTemplate {
    public readonly type = "generated";
    public readonly id = "DATASET_GENERATED_v3";
    public readonly name = "Auto-generated dataSet template";
    public readonly dataFormId = { type: "cell" as const, sheet: 0, ref: "A4" };
    public readonly dataFormType = { type: "value" as const, id: "dataSets" as const };

    public readonly rowOffset = 3;
    public readonly colOffset = 0;

    public readonly dataSources: DataSource[] = [
        {
            type: "row",
            orgUnit: {
                sheet: "Data Entry",
                type: "column",
                ref: "A",
            },
            period: {
                sheet: "Data Entry",
                type: "column",
                ref: "B",
            },
            attribute: {
                sheet: "Data Entry",
                type: "column",
                ref: "C",
            },
            completed: {
                sheet: "Data Entry",
                type: "column",
                ref: "D",
            },
            range: {
                sheet: "Data Entry",
                rowStart: 6,
                columnStart: "E",
            },
            dataElement: {
                sheet: "Data Entry",
                type: "row",
                ref: 4,
            },
            categoryOption: {
                sheet: "Data Entry",
                type: "row",
                ref: 5,
            },
        },
    ];

    public readonly styleSources: StyleSource[] = [
        {
            section: "title",
            source: {
                type: "range",
                ref: "D2:I2",
                sheet: "Data Entry",
            },
        },
        {
            section: "subtitle",
            source: {
                type: "range",
                ref: "D3:I3",
                sheet: "Data Entry",
            },
        },
        {
            section: "logo",
            source: {
                type: "range",
                ref: "A2:C3",
                sheet: "Data Entry",
            },
        },
    ];
}
