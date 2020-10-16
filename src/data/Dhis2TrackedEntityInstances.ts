import _ from "lodash";
import { Relationship } from "../domain/entities/Relationship";
import {
    AttributeValue,
    Enrollment,
    Program,
    TrackedEntityInstance,
} from "../domain/entities/TrackedEntityInstance";
import { D2Api, Id, Ref } from "../types/d2-api";
import { runPromises } from "../utils/promises";

export interface GetOptions {
    api: D2Api;
    program: Ref;
    orgUnits: Ref[];
    pageSize?: number;
}

export async function getTrackedEntityInstances(
    options: GetOptions
): Promise<TrackedEntityInstance[]> {
    const { api, orgUnits, pageSize = 500 } = options;
    if (_.isEmpty(orgUnits)) return [];

    const {
        objects: [apiProgram],
    } = await api.models.programs
        .get({
            fields: {
                id: true,
                programTrackedEntityAttributes: {
                    trackedEntityAttribute: {
                        id: true,
                        name: true,
                        valueType: true,
                        optionSet: { id: true, options: { id: true, code: true } },
                    },
                },
            },
            filter: { id: { eq: options.program.id } },
        })
        .getData();

    if (!apiProgram) return [];

    const program: Program = {
        id: apiProgram.id,
        attributes: apiProgram.programTrackedEntityAttributes.map(
            ({ trackedEntityAttribute }) => trackedEntityAttribute
        ),
    };

    // Get TEIs for first page on every org unit
    const teisFirstPageData = await runPromises(
        orgUnits.map(orgUnit => async () => {
            const apiOptions = { api, program, orgUnit, page: 1, pageSize };
            const { pager, trackedEntityInstances } = await getTeisFromApi(apiOptions);
            return { orgUnit, trackedEntityInstances, total: pager.total };
        })
    );

    // Get TEIs in other pages using the pager information from the previous requests
    const teisInOtherPages$ = _.flatMap(teisFirstPageData, ({ orgUnit, total }) => {
        const lastPage = Math.ceil(total / pageSize);
        const pages = _.range(2, lastPage + 1);
        return pages.map(page => async () => {
            const res = await getTeisFromApi({ api, program, orgUnit, page, pageSize });
            return res.trackedEntityInstances;
        });
    });

    // Join all TEIs
    const teisInFirstPages = _.flatMap(teisFirstPageData, data => data.trackedEntityInstances);
    const teisInOtherPages = _.flatten(await runPromises(teisInOtherPages$));

    return _(teisInFirstPages)
        .concat(teisInOtherPages)
        .map(tei => buildTei(program, tei))
        .value();
}

// Private

type TrackedEntityInstancesRequest = {
    program: Id;
    ou: Id;
    ouMode?: "SELECTED" | "CHILDREN" | "DESCENDANTS" | "ACCESSIBLE" | "CAPTURE" | "ALL";
    order?: string;
    pageSize?: number;
    page?: number;
    totalPages: true;
    fields: string;
};

interface TrackedEntityInstancesResponse {
    pager: {
        page: number;
        total: number;
        pageSize: number;
        pageCount: number;
    };
    trackedEntityInstances: TrackedEntityInstanceApi[];
}

interface TrackedEntityInstanceApi {
    trackedEntityInstance: Id;
    inactive: boolean;
    orgUnit: Id;
    attributes: AttributeApi[];
    enrollments: EnrollmentApi[];
    relationships: RelationshipApi[];
}

interface RelationshipApi {
    relationshipType: Id;
    relationshipName: string;
    from: RelationshipItemApi;
    to: RelationshipItemApi;
}

interface RelationshipItemApi {
    trackedEntityInstance?: {
        trackedEntityInstance: Id;
    };
}

interface AttributeApi {
    attribute: Id;
    valueType: string;
    value: string;
}

interface EnrollmentApi {
    program: Id;
    orgUnit: Id;
    enrollmentDate: string;
    incidentDate: string;
}

async function getTeisFromApi(options: {
    api: D2Api;
    program: Program;
    orgUnit: Ref;
    page: number;
    pageSize: number;
}): Promise<TrackedEntityInstancesResponse> {
    const { api, program, orgUnit, page, pageSize } = options;
    const fields: Array<keyof TrackedEntityInstanceApi> = [
        "trackedEntityInstance",
        "inactive",
        "orgUnit",
        "attributes",
        "enrollments",
        "relationships",
    ];
    const query: TrackedEntityInstancesRequest = {
        ou: orgUnit.id,
        ouMode: "SELECTED",
        order: "created:asc",
        program: program.id,
        pageSize,
        page,
        totalPages: true,
        fields: fields.join(","),
    };

    /*
    console.debug(
        "GET /trackedEntityInstances",
        _.pick(query, ["program", "ou", "pageSize", "page"])
    );
    */
    const teiResponse = await api.get("/trackedEntityInstances", query).getData();
    return teiResponse as TrackedEntityInstancesResponse;
}

function buildTei(program: Program, teiApi: TrackedEntityInstanceApi): TrackedEntityInstance {
    const orgUnit = { id: teiApi.orgUnit };
    const attributesById = _.keyBy(program.attributes, attribute => attribute.id);

    const enrollment: Enrollment | undefined = _(teiApi.enrollments)
        .filter(e => e.program === program.id && orgUnit.id === e.orgUnit)
        .map(enrollmentApi => ({
            enrollmentDate: enrollmentApi.enrollmentDate,
            incidentDate: enrollmentApi.incidentDate,
        }))
        .first();

    const attributeValues: AttributeValue[] = teiApi.attributes.map(attrApi => {
        const optionSet = attributesById[attrApi.attribute]?.optionSet;
        const option = optionSet && optionSet.options.find(option => option.code === attrApi.value);
        return {
            attribute: { id: attrApi.attribute, valueType: attrApi.valueType, optionSet },
            value: attrApi.value,
            optionIdOrValue: option ? option.id : attrApi.value,
        };
    });

    const relationships: Relationship[] = _(teiApi.relationships)
        .map(relApi =>
            relApi.from.trackedEntityInstance && relApi.to.trackedEntityInstance
                ? {
                      typeId: relApi.relationshipType,
                      typeName: relApi.relationshipName,
                      fromId: relApi.from.trackedEntityInstance.trackedEntityInstance,
                      toId: relApi.to.trackedEntityInstance.trackedEntityInstance,
                  }
                : null
        )
        .compact()
        .value();

    return {
        program,
        id: teiApi.trackedEntityInstance,
        orgUnit: { id: teiApi.orgUnit },
        disabled: teiApi.inactive,
        enrollment,
        attributeValues,
        relationships,
    };
}