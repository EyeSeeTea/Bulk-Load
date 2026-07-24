import { TemplateDataPackageData, TemplateDataValue } from "../../domain/entities/Template";

/**
 * Builders for the template entities. Their fields are Maybe<T>, not optional, so a spec must set
 * every field. Keep the full skeleton here. Then a new field is added only once.
 */

export function templateDataValue(partial: Partial<TemplateDataValue> = {}): TemplateDataValue {
    return {
        dataElement: "de1",
        category: undefined,
        value: "10",
        optionId: undefined,
        contentType: undefined,
        ...partial,
    };
}

export function templateDataEntry(partial: Partial<TemplateDataPackageData> = {}): TemplateDataPackageData {
    return {
        group: 0,
        sheet: "Data Entry",
        dataForm: "dataForm1",
        id: undefined,
        orgUnit: "orgUnit1",
        period: "202401",
        attribute: undefined,
        coordinate: undefined,
        trackedEntityInstance: undefined,
        programStage: undefined,
        geometry: undefined,
        completed: undefined,
        dataValues: [],
        ...partial,
    };
}
