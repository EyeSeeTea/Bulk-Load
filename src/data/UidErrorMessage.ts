import { Id } from "../domain/entities/ReferenceObject";

const uidBase = "[A-Za-z][A-Za-z0-9]{10}";

const uidWithBackTicksPattern = new RegExp(`\`(${uidBase})\``, "g");
const uidPattern = new RegExp(`\\b${uidBase}\\b`, "g");

export class UidErrorMessage {
    static uidPattern = uidPattern;
    static uidWithBackTicksPattern = uidWithBackTicksPattern;

    static extractUids(text: string): Id[] {
        const pattern = UidErrorMessage.uidPattern;
        const matches = text.match(pattern);
        return matches ? [...matches] : [];
    }

    static replaceUidsInMessage(message: string, metadataByIds: Map<Id, string>): string {
        const withBackticksReplaced = message.replace(UidErrorMessage.uidWithBackTicksPattern, (_, captured) => {
            const replacement = metadataByIds.get(captured);
            return replacement ? `\`${replacement}\`` : `\`${captured}\``;
        });

        const errorMessage = withBackticksReplaced.replace(UidErrorMessage.uidPattern, captured => {
            const replacement = metadataByIds.get(captured);
            return replacement ?? captured;
        });

        return errorMessage;
    }
}
