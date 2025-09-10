import { ConfirmationDialog, MultiSelector } from "@eyeseetea/d2-ui-components";
import { makeStyles } from "@material-ui/core";
import _ from "lodash";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    DataElementDisaggregated,
    DataElementDisaggregatedId,
    getDataElementDisaggregatedId,
} from "../../../domain/entities/DataElementDisaggregated";
import { DataElementDisaggregationsMapping } from "../../../domain/entities/DataElementDisaggregationsMapping";
import { DataForm } from "../../../domain/entities/DataForm";
import { NamedRef } from "../../../domain/entities/ReferenceObject";
import i18n from "../../../utils/i18n";
import { useAppContext } from "../../contexts/app-context";
import Settings from "../../logic/settings";
import { getSelectOptionsFromNamedRefs } from "../../utils/refs";
import { Select, SelectOption } from "../select/Select";
import { SettingsFieldsProps } from "./SettingsFields";

export interface DataSetDataElementsFilterDialogProps extends SettingsFieldsProps {
    title: string;
    onClose: () => void;
}

export function DataSetDataElementsFilterDialog(props: DataSetDataElementsFilterDialogProps): React.ReactElement {
    const { title, onClose, settings, onChange } = props;
    const { d2, compositionRoot } = useAppContext();
    const classes = useStyles();

    const [dataSets, setDataSets] = useState<DataForm[]>([]);
    const [dataSet, setDataSet] = useState<DataForm>();

    useEffect(() => {
        compositionRoot.templates.list().then(({ dataSets }) => {
            setDataSets(dataSets);
        });
    }, [compositionRoot]);

    const selectDataSet = useCallback(
        ({ value }: SelectOption) => {
            setDataSet(dataSets.find(dataSet => dataSet.id === value));
        },
        [dataSets]
    );

    const dataSetsOptions = useMemo(() => getSelectOptionsFromNamedRefs(dataSets), [dataSets]);

    const dataElementItems = useDataElementItems(dataSet);

    const dataElementsOptions = useMemo(() => getMultiSelectorDataElementOptions(dataElementItems), [dataElementItems]);
    const selectedIds = getSelectedIds(settings, dataSet, dataElementsOptions);

    const updateSelection = React.useCallback(
        (newSelectedIds: DataElementDisaggregatedId[]) => {
            if (!dataSet || !dataElementItems) return;

            onChange(
                settings.setDataSetDataElementsFilterFromSelection({
                    dataSet: dataSet.id,
                    dataElementsDisaggregated: dataElementItems.map(getDataElementDisaggregatedFromItem),
                    prevSelectedIds: selectedIds,
                    newSelectedIds,
                })
            );
        },
        [selectedIds, dataSet, settings, dataElementItems, onChange]
    );

    return (
        <ConfirmationDialog
            isOpen={true}
            title={title}
            maxWidth="lg"
            fullWidth={true}
            onCancel={onClose}
            cancelText={i18n.t("Close")}
        >
            <div className={classes.row}>
                <Select
                    placeholder={i18n.t("Data set")}
                    options={dataSetsOptions}
                    onChange={selectDataSet}
                    value={dataSet?.id ?? ""}
                />
            </div>

            <div className={classes.row}>
                {dataElementsOptions && (
                    <MultiSelector
                        d2={d2 as object}
                        searchFilterLabel={i18n.t("Search data elements")}
                        height={300}
                        onChange={updateSelection}
                        options={dataElementsOptions}
                        selected={selectedIds}
                        ordered={false}
                    />
                )}
            </div>
        </ConfirmationDialog>
    );
}

const useStyles = makeStyles({
    row: { width: "100%", marginBottom: "2em" },
});

function useDataElementItems(dataSet: DataForm | undefined) {
    const [mapping, setMapping] = useState<DataElementDisaggregationsMapping>();
    const { compositionRoot } = useAppContext();

    useEffect(() => {
        if (!dataSet) return;
        compositionRoot.form.getDataElementMapping({ dataSetId: dataSet.id }).then(setMapping);
    }, [compositionRoot, dataSet]);

    const dataElementItems = useMemo(() => {
        return mapping ? getDataElementItems(dataSet, mapping) : undefined;
    }, [dataSet, mapping]);

    return dataElementItems;
}

function getSelectedIds(
    settings: Settings,
    dataSet: DataForm | undefined,
    dataElementsOptions: DataElementOption[] | undefined
) {
    if (!dataSet || !dataElementsOptions) return [];

    const allOptionIds = dataElementsOptions.map(option => option.value);

    const excludedIds: string[] = dataSet
        ? (settings.dataSetDataElementsFilter[dataSet.id] || []).map(getDataElementDisaggregatedId)
        : [];

    return _.difference(allOptionIds, excludedIds);
}

interface DataElementItem {
    id: string;
    name: string;
    categoryOptionCombo?: NamedRef;
}

interface DataElementOption {
    value: DataElementDisaggregatedId;
    text: string;
}

function getDataElementItems(
    dataSet: DataForm | undefined,
    mapping: DataElementDisaggregationsMapping
): DataElementItem[] {
    const dataElements = dataSet ? dataSet.dataElements : [];

    return _.flatMap(dataElements, dataElement => {
        const categoryOptionCombos = mapping.get(dataElement.id)?.categoryOptionCombos || [];
        const mainDataElement: DataElementItem = dataElement;
        const disaggregatedDataElements: DataElementItem[] = _(categoryOptionCombos)
            .map(coc => ({ ...dataElement, categoryOptionCombo: coc }))
            .sortBy(de => de.categoryOptionCombo.name)
            .value();

        return _.compact([disaggregatedDataElements.length > 1 ? mainDataElement : null, ...disaggregatedDataElements]);
    });
}

function getDataElementDisaggregatedFromItem(de: DataElementItem): DataElementDisaggregated {
    const categoryOptionCombo = de.categoryOptionCombo;
    return categoryOptionCombo ? { id: de.id, categoryOptionComboId: categoryOptionCombo.id } : { id: de.id };
}

function getMultiSelectorDataElementOptions(
    dataElements: DataElementItem[] | undefined
): DataElementOption[] | undefined {
    if (!dataElements) return undefined;

    const sortedDataElements = _(dataElements)
        .orderBy([item => item.name, item => (item.categoryOptionCombo ? 1 : 0)], ["asc", "asc"])
        .value();

    return sortedDataElements.map((item): DataElementOption => {
        const dataElementDis = getDataElementDisaggregatedFromItem(item);
        const coc = item.categoryOptionCombo;
        const text = coc
            ? item.name + (coc.name === "default" ? "" : ` (${coc.name})`)
            : item.name + ` (${i18n.t("All")})`;

        return { value: getDataElementDisaggregatedId(dataElementDis), text };
    });
}
