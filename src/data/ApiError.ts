import _ from "lodash";
import { Maybe } from "../types/utils";
import { isString } from "../utils/string";

export function getApiErrorMessage(error: unknown): Maybe<string> {
    const message = _.get(error, "response.data.message");
    return isString(message) ? message : undefined;
}
