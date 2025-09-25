import _ from "lodash";

export function buildClassName(classNames: (string | null | undefined)[]): string {
    return _.compact(classNames).join(" ");
}
