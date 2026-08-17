import { getApiErrorMessage } from "../ApiError";

describe("getApiErrorMessage", () => {
    it("returns the message reported by the API", () => {
        const error = { response: { data: { message: "Data set not found" } } };
        expect(getApiErrorMessage(error)).toEqual("Data set not found");
    });

    it.each([undefined, null, "boom", new Error("boom"), {}, { response: undefined }])(
        "returns undefined if the error has no API response: %s",
        error => {
            expect(getApiErrorMessage(error)).toBeUndefined();
        }
    );

    it("returns undefined if the API response has no message", () => {
        expect(getApiErrorMessage({ response: { data: {} } })).toBeUndefined();
    });

    it("returns undefined if the message is not a string", () => {
        expect(getApiErrorMessage({ response: { data: { message: { text: "boom" } } } })).toBeUndefined();
    });
});
