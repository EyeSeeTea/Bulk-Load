import { getMajorVersion } from "../d2-api";

describe("getMajorVersion", () => {
    it("parses a stable release version", () => {
        expect(getMajorVersion("2.42.0")).toEqual(42);
    });

    it("parses a fork build (suffix on a later component)", () => {
        expect(getMajorVersion("2.41.6.1-eyeseetea-fork-1")).toEqual(41);
    });

    it("parses a pre-release build (suffix on the minor component)", () => {
        expect(getMajorVersion("2.44-SNAPSHOT")).toEqual(44);
    });

    it("parses a version with only major.minor", () => {
        expect(getMajorVersion("2.40")).toEqual(40);
    });

    it("throws on a version without a minor component", () => {
        expect(() => getMajorVersion("2")).toThrow();
    });

    it("throws on a non-numeric minor component", () => {
        expect(() => getMajorVersion("2.x")).toThrow();
    });
});
