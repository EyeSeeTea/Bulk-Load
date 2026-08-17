import { Maybe } from "../types/utils";

const trueValues = ["y", "yes", "true", "1"];
const falseValues = ["n", "no", "false", "0"];

// Unrecognised input returns undefined rather than false, so callers can fall back to a default.
export function parseBooleanCell(value: unknown, optionId?: Maybe<string>): Maybe<boolean> {
    if (optionId === "true") return true;
    if (optionId === "false") return false;

    const strValue = String(value).toLowerCase();
    if (trueValues.includes(strValue)) return true;
    if (falseValues.includes(strValue)) return false;

    return undefined;
}

export function resolveAnyYesWins(flags: Maybe<boolean>[]): Maybe<boolean> {
    if (flags.some(flag => flag === true)) return true;
    if (flags.some(flag => flag === false)) return false;
    return undefined;
}
