import { removeCharacters } from "../../utils/string";
import { CellRef } from "../entities/Template";
import { ExcelRepository, ExcelValue } from "../repositories/ExcelRepository";

/**
 * Read a cell's value, resolving defined-name formulas to their IDs.
 *
 * Some templates store data-element / category-option IDs as Excel defined-name
 * references (e.g. `=_aP6qePO2WG6`). When the workbook has been saved in Excel
 * the cached text value of the formula (a human-readable label) takes precedence
 * over the formula itself in a plain `readCell` call.
 *
 * This helper detects that case: if the cell's formula matches a defined name,
 * it returns the cleaned formula (the ID) instead of the cached display value.
 */
export async function readCellResolvingDefinedNames(
    excelRepository: ExcelRepository,
    templateId: string,
    cell: CellRef
): Promise<ExcelValue | undefined> {
    const value = await excelRepository.readCell(templateId, cell);
    const formula = await excelRepository.readCell(templateId, cell, { formula: true });

    const definedNames = await excelRepository.listDefinedNames(templateId);
    if (typeof formula === "string" && definedNames.includes(formula.replace(/^=/, ""))) {
        return removeCharacters(formula);
    }

    return value;
}
