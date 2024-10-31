import { Maybe } from "../../types/utils";

const defaultCellDataValidation = {
    allowBlank: true,
    type: "",
    formula1: "",
    formula2: "",
    operator: "",
    showErrorMessage: true,
    error: "",
    errorTitle: "",
};

export function getValidationFromValueType(
    valueType: string,
    ref: string,
    options: CellDataValidationOptions
): Maybe<CellDataValidation> {
    switch (valueType) {
        case "INTEGER_POSITIVE": {
            return buildDataValidation({ type: "whole", formula1: "1", operator: "greaterThanOrEqual" });
        }
        case "INTEGER_ZERO_OR_POSITIVE":
            return buildDataValidation({ type: "whole", formula1: "0", operator: "greaterThanOrEqual" });
        case "NUMBER":
            return buildDataValidation({ type: "custom", formula1: `=ISNUMBER(${ref})` });
        case "INTEGER": {
            return buildDataValidation({
                type: "custom",
                formula1: `=AND(ISNUMBER(${ref}), TRUNC(${ref}) = ${ref})`,
            });
        }
        case "PERCENTAGE":
            return buildDataValidation({
                type: "decimal",
                formula1: "0",
                formula2: "100",
                operator: "between",
            });
        case "BOOLEAN":
            return options.booleanFormula
                ? buildDataValidation({
                      type: "list",
                      formula1: options.booleanFormula,
                  })
                : undefined;
        case "TRUE_ONLY":
            return options.trueOnlyFormula
                ? buildDataValidation({
                      type: "list",
                      formula1: options.trueOnlyFormula,
                  })
                : undefined;
    }
    console.warn(`data validation not implemented for valueType: ${valueType}`);
    return undefined;
}

function buildDataValidation(options: Partial<CellDataValidation>): CellDataValidation {
    return { ...defaultCellDataValidation, ...options };
}

type CellDataValidationOptions = {
    booleanFormula: Maybe<string>;
    trueOnlyFormula: Maybe<string>;
};

export type CellDataValidation = {
    allowBlank: boolean;
    type: string;
    formula1: string;
    formula2: string;
    operator: string;
    showErrorMessage: boolean;
    error: string;
    errorTitle: string;
};
