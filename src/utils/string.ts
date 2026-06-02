export function removeCharacters(value: unknown): string {
    return value === undefined ? "" : String(value).replace(/[^a-zA-Z0-9.]/g, "");
}

export function isString(value: unknown): value is string {
    return typeof value === "string";
}

// XML 1.0 forbids most C0 control characters. The xlsx format is XML, so any
// such character in a string cell breaks the file in MS Excel (LibreOffice
// silently strips them). Preserve \t (\x09), \n (\x0A) and \r (\x0D) — the
// only whitespace controls XML allows.
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function replaceInvalidXmlChars(text: string): string {
    return text.replace(INVALID_XML_CHARS_RE, " ");
}
