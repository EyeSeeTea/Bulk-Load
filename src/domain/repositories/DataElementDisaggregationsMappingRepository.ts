import { DataElementDisaggregationsMapping } from "../entities/DataElementDisaggregationsMapping";
import { Id } from "../entities/ReferenceObject";

export interface DataElementDisaggregationsMappingRepository {
    getByDataSet(options: { id: Id }): Promise<DataElementDisaggregationsMapping>;
}
