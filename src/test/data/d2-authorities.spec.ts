import { canUploadDocuments } from "../../data/d2-authorities";

const OTHER_AUTHORITY = "F_DATAVALUE_ADD";

describe("canUploadDocuments", () => {
    it("is granted to superusers", () => {
        expect(canUploadDocuments(new Set(["ALL"]))).toBe(true);
    });

    it("is granted by the document authority alone", () => {
        expect(canUploadDocuments(new Set([OTHER_AUTHORITY, "F_DOCUMENT_PRIVATE_ADD"]))).toBe(true);
    });

    it("is denied when none of the required authorities is present", () => {
        expect(canUploadDocuments(new Set([OTHER_AUTHORITY]))).toBe(false);
    });

    it("is denied for users without authorities", () => {
        expect(canUploadDocuments(new Set())).toBe(false);
    });
});
