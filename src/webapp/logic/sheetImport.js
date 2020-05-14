import dateFormat from "dateformat";
import ExcelJS from "exceljs/dist/es5/exceljs.browser";
import _ from "lodash";
import i18n from "../../locales";
import { stringEquals } from "../utils/strings";
import { getObjectVersion } from "./utils";

/**
 * Return basic information from sheet.
 * @param file: xlsx file to be imported.
 * @param objectsByType: Object {dataSet, program} containing all D2 objects.
 * @returns {Promise<{id, type, name}>}
 */
export async function getBasicInfoFromSheet(file) {
    const initialRow = 3;
    const workbook = await getWorkbook(file);

    const dataEntrySheet = workbook.getWorksheet("Data Entry");
    const metadataSheet = workbook.getWorksheet("Metadata");

    if (!dataEntrySheet) throw new Error(i18n.t("Cannot get data entry sheet"));
    if (!metadataSheet) throw new Error(i18n.t("Cannot get metadata sheet"));

    return (
        _(initialRow)
            .range(metadataSheet.rowCount + 1)
            .map(nRow => metadataSheet.getRow(nRow).values)
            .map(values => ({ id: values[1], type: values[2], name: values[3] }))
            .find(item => item.type === "program" || item.type === "dataSet") ?? {}
    );
}

export async function getDataValues(file, object, rowOffset, colOffset) {
    const workbook = await getWorkbook(file);
    const dataEntrySheet = workbook.getWorksheet("Data Entry");
    if (!dataEntrySheet) throw new Error(i18n.t("Cannot get data entry sheet"));

    return _(rowOffset + 3)
        .range(dataEntrySheet.rowCount + 1)
        .map(nRow => dataEntrySheet.getRow(nRow))
        .map(row => getDataValuesFromRow(row, object, colOffset))
        .compact()
        .sortBy("period")
        .value();
}

function getDataValuesFromRow(row, object, colOffset) {
    const infoByType = {
        dataSet: { periodCol: 2, initialValuesCol: 4 },
        program: { periodCol: 4, initialValuesCol: 5 },
    };
    const info = infoByType[object.type];
    if (!info) return;

    const values = row.values;
    const period = values[info.periodCol + colOffset];
    if (!period) return;

    const count = _(values)
        .drop(info.initialValuesCol + colOffset)
        .reject(_.isNil)
        .size();

    const id = object.type === "program" && colOffset > 1 ? values[5] : undefined;

    return { period, count, id };
}

async function getWorkbook(file) {
    const workbook = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);
    return workbook;
}

/**
 * Import sheet information
 * @param builder:
 *      - d2: DHIS2 Library
 *      - element: Element to be parsed
 *      - file: File to be imported
 * @returns {Promise<>}
 */
export async function readSheet({
    api,
    file,
    element,
    elementMetadata,
    useBuilderOrgUnits,
    organisationUnits,
    rowOffset = 0,
    colOffset = 0,
}) {
    const { version } = await api.system.info.getData();
    const workbook = await getWorkbook(file);
    const dataEntrySheet = workbook.getWorksheet("Data Entry");
    const metadataSheet = workbook.getWorksheet("Metadata");
    const validationSheet = workbook.getWorksheet("Validation");

    const isProgram = element.type === "program";

    let columns;
    let stageColumns;
    let dataToImport = isProgram
        ? []
        : {
              dataSet: "",
              completeDate: "",
              orgUnit: "",
              dataValues: [],
          };

    // Iterate over all rows that have values in a worksheet
    dataEntrySheet.eachRow((row, rowNumber) => {
        if (rowNumber === rowOffset + 1) {
            stageColumns = row.values;
        } else if (rowNumber === rowOffset + 2) {
            columns = row.values;
        } else if (rowNumber > rowOffset) {
            const result = {
                dataValues: [],
            };

            if (isProgram) {
                result["program"] = element.id;
                result["status"] = "COMPLETED";
            } else {
                result["dataSet"] = element.id;
                result["completeDate"] = dateFormat(new Date(), "yyyy-mm-dd");
            }

            if (useBuilderOrgUnits) {
                result.orgUnit = organisationUnits[0].id;
            } else {
                if (row.values[1] !== undefined) {
                    result.orgUnit = parseMetadataId(
                        metadataSheet,
                        row.values[1].result ?? row.values[1]
                    );
                } else {
                    result.orgUnit = validationSheet.getCell("A3").formula.substr(1);
                }
            }

            // TODO: If latitude and longitude are empty or invalid remove prop
            if (isProgram && row.values[2] !== undefined && row.values[3] !== undefined)
                result.coordinate = {
                    latitude: row.values[2],
                    longitude: row.values[3],
                };

            if (isProgram && row.values[4 + colOffset] !== undefined) {
                result.eventDate = dateFormat(new Date(row.values[4 + colOffset]), "yyyy-mm-dd");
            } else if (isProgram) {
                throw new Error(i18n.t("Event date is empty"));
            }

            if (!isProgram && row.values[2] !== undefined) {
                result.period = row.values[2];
            }

            // Read attribute option combo
            if (isProgram && colOffset > 0 && row.values[4] !== undefined) {
                // There's a bug in some builds of 2.30 with property for attributeOptionCombo
                if (version === "2.30") {
                    result.attributeCategoryOptions = parseMetadataId(metadataSheet, row.values[4]);
                    result.attributeOptionCombo = parseMetadataId(metadataSheet, row.values[4]);
                } else {
                    result.attributeOptionCombo = parseMetadataId(metadataSheet, row.values[4]);
                }
            } else if (!isProgram && row.values[3] !== undefined) {
                result.attributeOptionCombo = parseMetadataId(metadataSheet, row.values[3]);
            }

            // Read event id
            if (isProgram && colOffset > 1 && row.values[5] !== undefined) {
                result.event = row.values[5];
            }

            row.eachCell((cell, colNumber) => {
                if (isProgram && colNumber > 4 + colOffset) {
                    // TODO: Do not hardcode previous entries
                    const id = columns[colNumber].formula.substr(1);
                    let cellValue =
                        cell.value?.text ?? cell.value?.result ?? cell.value?.toString();

                    // TODO: Check different data types
                    const dataValue = elementMetadata.get(id);
                    if (dataValue.optionSet !== undefined) {
                        const optionSet = elementMetadata.get(dataValue.optionSet.id);
                        optionSet.options.forEach(optionId => {
                            const option = elementMetadata.get(optionId.id);
                            if (stringEquals(cellValue, option.name)) cellValue = option.code;
                        });
                    } else if (dataValue.valueType === "DATE") {
                        cellValue = dateFormat(new Date(cellValue), "yyyy-mm-dd");
                    } else if (
                        dataValue.valueType === "BOOLEAN" ||
                        dataValue.valueType === "TRUE_ONLY"
                    ) {
                        cellValue = String(cellValue) === "true" || cellValue === "Yes";
                    }
                    result.dataValues.push({ dataElement: id, value: cellValue });
                } else if (!isProgram && colNumber > 3) {
                    // TODO: Do not hardcode previous entries
                    const column = columns[colNumber];
                    const id = column.formula
                        ? column.formula.substr(1)
                        : dataEntrySheet.getCell(column.sharedFormula).value.formula.substr(1);
                    const stageColumn = stageColumns[colNumber];
                    const dataElementId = stageColumn.formula
                        ? stageColumn.formula.substr(1)
                        : dataEntrySheet.getCell(stageColumn.sharedFormula).value.formula.substr(1);
                    let cellValue = cell.value?.toString();
                    const dataValue = elementMetadata.get(id);
                    const dataElement = elementMetadata.get(dataElementId);

                    if (
                        dataElement.valueType === "BOOLEAN" ||
                        dataElement.valueType === "TRUE_ONLY"
                    ) {
                        cellValue = String(cellValue) === "true" || cellValue === "Yes";
                    }

                    if (dataValue.type === "categoryOptionCombo") {
                        // TODO: OptionSets in categoryOptionCombos
                        result.dataValues.push({
                            dataElement: dataElementId,
                            categoryOptionCombo: id,
                            value: cellValue,
                            period: result.period,
                            orgUnit: result.orgUnit,
                        });
                    } else {
                        result.dataValues.push({
                            dataElement: id,
                            value: cellValue,
                            period: result.period,
                            orgUnit: result.orgUnit,
                        });
                    }
                }
            });

            if (isProgram) dataToImport.push(result);
            else {
                dataToImport = {
                    dataSet: result.dataSet,
                    // "completeDate": result.completeDate,
                    orgUnit: result.orgUnit,
                    dataValues: dataToImport.dataValues.concat(result.dataValues),
                };
            }
        }
    });

    return isProgram ? { events: dataToImport } : dataToImport;
}

function parseMetadataId(metadataSheet, metadataName) {
    let result = metadataName;
    metadataSheet.eachRow(row => {
        const name = metadataName.result ?? metadataName.formula ?? metadataName;
        if (row.values[3] && stringEquals(row.values[3], name)) result = row.values[1];
    });
    return result;
}

export async function getVersion(file) {
    const workbook = await getWorkbook(file);
    const dataEntrySheet = workbook.getWorksheet("Data Entry");

    const cellValue = dataEntrySheet.getCell("A1").value || "OLD_GENERATED_v1";
    return cellValue.replace(/^.*?:/, "").trim();
}

export async function checkVersion(file, dbObject, type) {
    if (!dbObject) return true;

    const sheetVersion = await getVersion(file, type);
    const dbVersion = getObjectVersion(dbObject);

    if (!dbVersion || sheetVersion === dbVersion) {
        return true;
    } else {
        const msg = i18n.t(
            "Cannot import: Versions do not match (database={{dbVersion}}, file={{sheetVersion}})",
            { dbVersion, sheetVersion, nsSeparator: false }
        );
        throw new Error(msg);
    }
}
