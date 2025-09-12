import { CellRef, DataProcessingRuleCoalesce, TemplateDataValue } from "../entities/Template";
import { Id } from "../entities/ReferenceObject";
import _ from "lodash";

export type DataToProcess = {
    cell: CellRef;
    id: Id; //data element or attribute id
    value: TemplateDataValue["value"];
    optionId?: TemplateDataValue["optionId"];
};

export class DataProcessingService {
    static coalesceValues(props: {
        dataDetails: DataToProcess[];
        dataProcessingRules?: DataProcessingRuleCoalesce[];
    }): DataToProcess[] {
        const { dataProcessingRules, dataDetails } = props;

        if (!dataProcessingRules || dataProcessingRules.length < 1) return dataDetails;

        const dataElementIdsToCoalesce = new Set(dataProcessingRules.flatMap(rule => rule.targetIds));
        const [dataElementToCoalesce, otherDataElements] = _.partition(dataDetails, details =>
            dataElementIdsToCoalesce.has(details.id)
        );

        const coalescedEntries = dataProcessingRules.map(rule => {
            const validDetails = _(rule.targetIds)
                .map(id => dataElementToCoalesce.find(detail => detail.id === id))
                .compact();

            const firstValidDetail = validDetails.find(detail => Boolean(detail.value) || Boolean(detail.optionId));

            if (!firstValidDetail) return undefined;
            return {
                ...firstValidDetail,
                cell: this.replaceColumn(firstValidDetail.cell, rule.destination.ref),
            };
        });

        return [...otherDataElements, ..._.compact(coalescedEntries)];
    }

    private static replaceColumn(cellRef: CellRef, newColumn: string): CellRef {
        const rowNumber = cellRef.ref.replace(/[A-Z]+/, "");
        return {
            ...cellRef,
            ref: `${newColumn}${rowNumber}`,
        };
    }
}
