import { D2Api, D2ApiDefault } from "d2-api";
import _ from "lodash";
import moment from "moment";
import { DataForm, DataFormType } from "../domain/entities/DataForm";
import { DataPackage } from "../domain/entities/DataPackage";
import { DhisInstance } from "../domain/entities/DhisInstance";
import { Locale } from "../domain/entities/Locale";
import { OrgUnit } from "../domain/entities/OrgUnit";
import {
    GetDataPackageParams,
    InstanceRepository,
} from "../domain/repositories/InstanceRepository";
import i18n from "../locales";
import { promiseMap } from "../webapp/utils/common";

export class InstanceDhisRepository implements InstanceRepository {
    private api: D2Api;

    constructor({ url }: DhisInstance) {
        this.api = new D2ApiDefault({ baseUrl: url });
    }

    public async getDataForms(type: DataFormType, ids?: string[]): Promise<DataForm[]> {
        if (type === "tracker") throw new Error(i18n.t("Tracker programs are not supported"));

        const params = {
            paging: false,
            fields: {
                id: true,
                displayName: true,
                name: true,
                attributeValues: { value: true, attribute: { code: true } },
            },
            filter: {
                id: ids ? { in: ids } : undefined,
                programType: type === "program" ? { eq: "WITHOUT_REGISTRATION" } : undefined,
            },
        } as const;

        const { objects } = await (type === "dataSet"
            ? this.api.models.dataSets.get(params).getData()
            : this.api.models.programs.get(params).getData());

        return objects.map(({ displayName, name, ...rest }) => ({
            ...rest,
            type,
            name: displayName ?? name,
        }));
    }

    public async getDataFormOrgUnits(type: DataFormType, id: string): Promise<OrgUnit[]> {
        const params = {
            paging: false,
            fields: {
                organisationUnits: { id: true, name: true, level: true, path: true },
            },
            filter: {
                id: { eq: id },
            },
        } as const;

        const { objects } = await (type === "dataSet"
            ? this.api.models.dataSets.get(params).getData()
            : this.api.models.programs.get(params).getData());

        return _(objects)
            .map(({ organisationUnits }) => organisationUnits)
            .flatten()
            .value();
    }

    public async getUserOrgUnits(): Promise<OrgUnit[]> {
        const { objects } = await this.api.models.organisationUnits
            .get({
                userOnly: true,
                fields: { id: true, displayName: true, level: true, path: true },
            })
            .getData();
        return objects.map(({ displayName, ...rest }) => ({ ...rest, name: displayName }));
    }

    public async getDataPackage(params: GetDataPackageParams): Promise<DataPackage[]> {
        switch (params.type) {
            case "dataSet":
                return this.getDataSetPackage(params);
            case "program":
                return this.getProgramPackage(params);
            default:
                throw new Error(`Unsupported type ${params.type} for data package`);
        }
    }

    public async getLocales(): Promise<Locale[]> {
        const locales = await this.api.get<Locale[]>("/locales/dbLocales").getData();
        return locales;
    }

    private async getDataSetPackage({
        id,
        orgUnits,
        startDate,
        endDate,
    }: GetDataPackageParams): Promise<DataPackage[]> {
        const metadata = await this.api.get<MetadataPackage>(`/dataSets/${id}/metadata`).getData();
        const { dataValues } = await this.api
            .get<AggregatedPackage>("/dataValueSets", {
                dataSet: id,
                startDate: startDate?.format("YYYY-MM-DD"),
                endDate: endDate?.format("YYYY-MM-DD"),
                orgUnit: orgUnits,
            })
            .getData();

        return _(dataValues)
            .groupBy(({ period, orgUnit, attributeOptionCombo }) =>
                [period, orgUnit, attributeOptionCombo].join("-")
            )
            .map((dataValues, key) => {
                const [period, orgUnit, attribute] = key.split("-");
                return {
                    orgUnit,
                    period,
                    attribute,
                    dataValues: dataValues.map(
                        ({ dataElement, categoryOptionCombo, value, comment }) => ({
                            dataElement,
                            category: categoryOptionCombo,
                            value: this.formatDataValue(value, metadata),
                            comment,
                        })
                    ),
                };
            })
            .value();
    }

    private async getProgramPackage({
        id,
        orgUnits,
    }: GetDataPackageParams): Promise<DataPackage[]> {
        const metadata = await this.api.get<MetadataPackage>(`/programs/${id}/metadata`).getData();
        const response = await promiseMap(orgUnits, orgUnit =>
            this.api
                .get<EventsPackage>("/events", {
                    program: id,
                    orgUnit,
                    paging: false,
                })
                .getData()
        );

        return _(response)
            .map(({ events }) => events)
            .flatten()
            .map(({ event, orgUnit, eventDate, attributeOptionCombo, coordinate, dataValues }) => ({
                id: event,
                orgUnit,
                period: moment(eventDate).format("YYYY-MM-DD"),
                attribute: attributeOptionCombo,
                coordinate,
                dataValues: dataValues.map(({ dataElement, value }) => ({
                    dataElement,
                    value: this.formatDataValue(value, metadata),
                })),
            }))
            .value();
    }

    private formatDataValue(value: string | number, metadata: MetadataPackage): string | number {
        // Format options from CODE to UID
        const optionValue = metadata.options?.find(({ code }) => code === value);
        if (optionValue) return optionValue.id;

        // Return default case
        return value;
    }
}

interface EventsPackage {
    events: Array<{
        event?: string;
        orgUnit: string;
        program: string;
        status: string;
        eventDate: string;
        coordinate?: {
            latitude: string;
            longitude: string;
        };
        attributeOptionCombo?: string;
        dataValues: Array<{
            dataElement: string;
            value: string | number;
        }>;
    }>;
}

interface AggregatedPackage {
    dataValues: Array<{
        dataElement: string;
        period: string;
        orgUnit: string;
        value: string;
        comment?: string;
        categoryOptionCombo?: string;
        attributeOptionCombo?: string;
    }>;
}

type MetadataPackage = Record<
    string,
    Array<{ id: string; code: string; [key: string]: unknown }> | undefined
>;
