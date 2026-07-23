import { Maybe } from "../types/utils";

type ApiError = { response: { data: { message?: string } } };

function isApiError(error: unknown): error is ApiError {
    if (typeof error !== "object" || error === null) return false;

    const { response } = error as { response?: unknown };
    if (typeof response !== "object" || response === null) return false;

    const { data } = response as { data?: unknown };
    if (typeof data !== "object" || data === null) return false;

    const { message } = data as { message?: unknown };
    return message === undefined || typeof message === "string";
}

export function getApiErrorMessage(error: unknown): Maybe<string> {
    return isApiError(error) ? error.response.data.message : undefined;
}
