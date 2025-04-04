import _ from "lodash";
import { EventsPackage } from "../../domain/entities/DhisDataPackage";
import i18n from "../../utils/i18n";
import { D2Api, DataValueSetsDataValue, Id, DataValueSetsPostResponse } from "../../types/d2-api";

interface SheetImportDataSet {
    dataSet: Id;
    dataValues: Array<{
        dataElement: Id;
        categoryOptionCombo: Id;
        attributeOptionCombo?: Id;
        value: string;
        period: string | number;
        orgUnit: string;
    }>;
}

interface SheetImportProgram extends EventsPackage {
    program: Id;
}

export type SheetImportResponse = Partial<SheetImportDataSet & SheetImportProgram>;

export async function deleteDataValues(
    api: D2Api,
    dataValues: DataValueSetsDataValue[]
): Promise<DataValueSetsPostResponse | undefined> {
    if (_.isEmpty(dataValues)) return undefined;

    const response = await api.dataValues.postSet({ importStrategy: "DELETE" }, { dataValues }).getData();

    if (response.status === "ERROR") {
        const details = JSON.stringify(response.conflicts, null, 2);
        throw new Error(i18n.t("Error deleting data values") + ": " + details);
    } else if (response.status === "WARNING") {
        const details = JSON.stringify(response.conflicts, null, 2);
        console.error("Warning deleting data values: " + details);
    }

    return response;
}
