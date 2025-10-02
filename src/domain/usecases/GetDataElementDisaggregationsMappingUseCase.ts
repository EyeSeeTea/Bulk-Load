import { DataElementDisaggregationsMapping } from "../entities/DataElementDisaggregationsMapping";
import { Id } from "../entities/ReferenceObject";
import { DataElementDisaggregationsMappingRepository } from "../repositories/DataElementDisaggregationsMappingRepository";

export class GetDataElementDisaggregationsMappingUseCase {
    constructor(private dataElementDisaggregationsMappingRepository: DataElementDisaggregationsMappingRepository) {}

    execute(options: { dataSetId: Id }): Promise<DataElementDisaggregationsMapping> {
        return this.dataElementDisaggregationsMappingRepository.getByDataSet({ id: options.dataSetId });
    }
}
