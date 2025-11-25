import { UidErrorMessage } from "../../data/UidErrorMessage";

describe("UidErrorMessage", () => {
    describe("extractUids", () => {
        it("should extract a single valid UID from text", () => {
            const text = "Error with object A1b2C3d4E5f";
            const result = UidErrorMessage.extractUids(text);

            expect(result).toEqual(["A1b2C3d4E5f"]);
        });

        it("should extract multiple valid UIDs from text", () => {
            const text = "Error with A1b2C3d4E5f and B2c3D4e5F6g";
            const result = UidErrorMessage.extractUids(text);

            expect(result).toEqual(["A1b2C3d4E5f", "B2c3D4e5F6g"]);
        });

        it("should return empty array when no UIDs are present", () => {
            const text = "No UIDs in this text";
            const result = UidErrorMessage.extractUids(text);

            expect(result).toEqual([]);
        });

        it("should return empty array for empty string", () => {
            const text = "";
            const result = UidErrorMessage.extractUids(text);

            expect(result).toEqual([]);
        });

        it("should not extract invalid UIDs (not starting with letter)", () => {
            const text = "Invalid UID: 11b2C3d4E5f";
            const result = UidErrorMessage.extractUids(text);

            expect(result).toEqual([]);
        });

        it("should not extract UIDs that are too short", () => {
            const text = "Too short: A1b2C3d4E5";
            const result = UidErrorMessage.extractUids(text);

            expect(result).toEqual([]);
        });

        it("should not extract UIDs that are too long", () => {
            const text = "Too long: A1b2C3d4E5f6g";
            const result = UidErrorMessage.extractUids(text);

            expect(result).toEqual([]);
        });

        it("should extract UIDs from complex error messages", () => {
            const text = "Object `A1b2C3d4E5f` references `B2c3D4e5F6g` which does not exist";
            const result = UidErrorMessage.extractUids(text);

            expect(result).toEqual(["A1b2C3d4E5f", "B2c3D4e5F6g"]);
        });

        it("should extract multiple UIDs separated by special characters", () => {
            const text = "UIDs: A1b2C3d4E5f, B2c3D4e5F6g";
            const result = UidErrorMessage.extractUids(text);

            expect(result).toEqual(["A1b2C3d4E5f", "B2c3D4e5F6g"]);
        });
    });

    describe("replaceUidsInMessage", () => {
        it("should replace a single UID with metadata name", () => {
            const message = "Error with object `A1b2C3d4E5f`";
            const metadataByIds = new Map([["A1b2C3d4E5f", "Organization Unit Name"]]);

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe("Error with object `Organization Unit Name`");
        });

        it("should replace multiple UIDs with metadata names", () => {
            const message = "Object `A1b2C3d4E5f` references `B2c3D4e5F6g`";
            const metadataByIds = new Map([
                ["A1b2C3d4E5f", "Data Element 1"],
                ["B2c3D4e5F6g", "Data Element 2"],
            ]);

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe("Object `Data Element 1` references `Data Element 2`");
        });

        it("should keep original UID if metadata not found", () => {
            const message = "Error with object `A1b2C3d4E5f`";
            const metadataByIds = new Map<string, string>();

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe("Error with object `A1b2C3d4E5f`");
        });
        it("should replace some UIDs and keep others unchanged", () => {
            const message = "Object `A1b2C3d4E5f` references `B2c3D4e5F6g`";
            const metadataByIds = new Map([["A1b2C3d4E5f", "Known Element"]]);

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe("Object `Known Element` references `B2c3D4e5F6g`");
        });

        it("should not modify message without UIDs", () => {
            const message = "Simple error message without UIDs";
            const metadataByIds = new Map<string, string>();

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe("Simple error message without UIDs");
        });

        it("should preserve backticks when present and not add them when absent", () => {
            const message = "Error with A1b2C3d4E5f and `B2c3D4e5F6g`";
            const metadataByIds = new Map([
                ["A1b2C3d4E5f", "Organization Unit 1"],
                ["B2c3D4e5F6g", "Organization Unit 2"],
            ]);

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe("Error with Organization Unit 1 and `Organization Unit 2`");
        });

        it("should handle empty message", () => {
            const message = "";
            const metadataByIds = new Map<string, string>();

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe("");
        });

        it("should replace same UID multiple times in message", () => {
            const message = "UID `A1b2C3d4E5f` appears twice: `A1b2C3d4E5f`";
            const metadataByIds = new Map([["A1b2C3d4E5f", "Repeated Element"]]);

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe("UID `Repeated Element` appears twice: `Repeated Element`");
        });

        it("should handle complex error messages with mixed replacements", () => {
            const message =
                "Cannot import `A1b2C3d4E5f` because it references `B2c3D4e5F6g` and `C3d4E5f6G7h` which are invalid";
            const metadataByIds = new Map([
                ["A1b2C3d4E5f", "Program Stage"],
                ["C3d4E5f6G7h", "Data Element"],
            ]);

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe(
                "Cannot import `Program Stage` because it references `B2c3D4e5F6g` and `Data Element` which are invalid"
            );
        });

        it("should preserve backticks in option set error message", () => {
            const message = "Value `123123` is not a valid option code in option set `A1b2C3d4E5f`";
            const metadataByIds = new Map([["A1b2C3d4E5f", "Other Medications"]]);

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe("Value `123123` is not a valid option code in option set `Other Medications`");
        });

        it("should replace UID without backticks when not present in original", () => {
            const message = "Value `123123` is not a valid option code in option set A1b2C3d4E5f";
            const metadataByIds = new Map([["A1b2C3d4E5f", "Other Medications"]]);

            const result = UidErrorMessage.replaceUidsInMessage(message, metadataByIds);

            expect(result).toBe("Value `123123` is not a valid option code in option set Other Medications");
        });
    });
});
