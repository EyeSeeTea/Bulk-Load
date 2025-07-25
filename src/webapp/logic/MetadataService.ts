import { TranslatableItem } from "./sheetBuilder";

export class MetadataService {
    private metadata: Map<any, any>;
    private translate: (item: TranslatableItem) => { name: string };

    constructor(metadata: Map<any, any>, translateFn: (item: TranslatableItem) => { name: string }) {
        this.metadata = metadata;
        this.translate = translateFn;
    }

    sort(): TranslatableItem[] {
        return Array.from(this.metadata.values()).sort((a, b) => {
            const groupA = this.getGroupingKey(a);
            const groupB = this.getGroupingKey(b);

            if (groupA !== groupB) {
                return groupA.localeCompare(groupB);
            }

            const nameA = this.translate(a).name || "";
            const nameB = this.translate(b).name || "";
            return nameA.localeCompare(nameB);
        });
    }

    private getGroupingKey(item: TranslatableItem): string {
        switch (item.type) {
            case "categoryOptionCombos":
            case "dataElements":
                return `${item.type}_${item.categoryCombo?.id || "unknown"}`;
            default:
                return item.type || "unknown";
        }
    }
}
