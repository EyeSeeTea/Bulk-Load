import {
    CellRef,
    ColumnRef,
    DataProcessingRuleCoalesce,
    DataProcessingRuleOverride,
    isDataProcessingRuleCoalesce,
    isDataProcessingRuleOverride,
    RowRef,
    TemplateDataValue,
} from "../entities/Template";
import { Id } from "../entities/ReferenceObject";
import _ from "lodash";

export type DataToProcess = {
    cell: CellRef;
    id: Id; //data element or attribute id
    value: TemplateDataValue["value"];
    optionId?: TemplateDataValue["optionId"];
};

type DataProcessingRule = DataProcessingRuleCoalesce | DataProcessingRuleOverride;

export class DataProcessingService {
    static applyRules(props: {
        dataDetails: DataToProcess[];
        dataProcessingRules?: DataProcessingRule[];
    }): DataToProcess[] {
        const { dataDetails, dataProcessingRules } = props;

        const coalesceRules = dataProcessingRules?.filter(isDataProcessingRuleCoalesce);
        const overrideRules = dataProcessingRules?.filter(isDataProcessingRuleOverride);

        const coalesced = this.coalesceValues({ dataDetails, dataProcessingRules: coalesceRules });
        return this.overrideValues({ dataDetails: coalesced, dataProcessingRules: overrideRules });
    }

    private static coalesceValues(props: {
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
                cell: this.replaceRef(firstValidDetail.cell, rule.destination),
            };
        });

        return [...otherDataElements, ..._.compact(coalescedEntries)];
    }

    private static overrideValues(props: {
        dataDetails: DataToProcess[];
        dataProcessingRules?: DataProcessingRuleOverride[];
    }): DataToProcess[] {
        const { dataProcessingRules, dataDetails } = props;

        if (!dataProcessingRules || dataProcessingRules.length < 1) return dataDetails;

        return dataDetails.map(detail => {
            const matchingRule = dataProcessingRules.find(rule => this.cellMatchesRef(detail.cell, rule.target));

            if (!matchingRule) return detail;

            return {
                ...detail,
                cell: this.replaceRef(detail.cell, matchingRule.destination),
            };
        });
    }

    private static cellMatchesRef(targetCell: CellRef, targetRef: ColumnRef | RowRef): boolean {
        switch (targetRef.type) {
            case "column":
                return targetCell.ref.replace(/[0-9]+/, "") === targetRef.ref;
            case "row":
                return targetCell.ref.replace(/[A-Z]+/, "") === String(targetRef.ref);
        }
    }

    private static replaceRef(cellRef: CellRef, destinationRef: ColumnRef | RowRef): CellRef {
        const colLetter = cellRef.ref.replace(/[0-9]+/, "");
        const rowNumber = cellRef.ref.replace(/[A-Z]+/, "");

        switch (destinationRef.type) {
            case "column":
                return {
                    ...cellRef,
                    ref: `${destinationRef.ref}${rowNumber}`,
                };
            case "row":
                return {
                    ...cellRef,
                    ref: `${colLetter}${destinationRef.ref}`,
                };
        }
    }
}
