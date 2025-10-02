import { DataElementDisaggregationsMapping } from "../domain/entities/DataElementDisaggregationsMapping";
import { Id } from "../domain/entities/ReferenceObject";
import { DataElementDisaggregationsMappingRepository } from "../domain/repositories/DataElementDisaggregationsMappingRepository";
import { D2Api } from "../types/d2-api";

export class DataElementDisaggregationsMappingD2Repository implements DataElementDisaggregationsMappingRepository {
    constructor(private api: D2Api) {}

    async getByDataSet(options: { id: Id }): Promise<DataElementDisaggregationsMapping> {
        const dataSet = await this.getDataSet(options);
        const pairs = dataSet.dataSetElements.map((dse): PairOf<DataElementDisaggregationsMapping> => {
            return [dse.dataElement.id, dse.dataElement.categoryCombo];
        });
        return new Map(pairs);
    }

    private async getDataSet(options: { id: Id }): Promise<D2DataSet> {
        const request = this.api.metadata.get({
            dataSets: {
                fields: dataSetFields,
                filter: { id: { eq: options.id } },
            },
        });

        const metadata = await request.getData();
        const dataSet = metadata.dataSets.find(dataSet => dataSet.id === options.id);

        if (!dataSet) {
            throw new Error(`DataSet with id ${options.id} not found`);
        } else {
            return dataSet;
        }
    }
}

type D2DataSet = {
    id: string;
    dataSetElements: Array<{
        dataElement: {
            id: string;
            categoryCombo: {
                categoryOptionCombos: Array<{
                    id: string;
                    name: string;
                }>;
            };
        };
    }>;
};

const dataSetFields = {
    id: true,
    dataSetElements: {
        dataElement: {
            id: true,
            categoryCombo: {
                categoryOptionCombos: {
                    id: true,
                    name: true,
                },
            },
        },
    },
} as const;

type PairOf<M extends Map<any, any>> = M extends Map<infer K, infer V> ? [K, V] : never;
