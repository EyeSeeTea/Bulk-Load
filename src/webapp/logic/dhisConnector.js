import _ from "lodash";
import { getTrackerProgramMetadata } from "../../data/Dhis2RelationshipTypes";
import { promiseMap } from "../../utils/promises";

export async function getElement(api, type, id) {
    const endpoint = type === "dataSets" ? "dataSets" : "programs";
    const fields = [
        "id",
        "displayName",
        "organisationUnits[id,path]",
        "attributeValues[attribute[code],value]",
        "categoryCombo",
        "dataSetElements",
        "formType",
        "sections[id,sortOrder,dataElements[id]]",
        "periodType",
        "programStages[id,access]",
        "programType",
        "enrollmentDateLabel",
        "incidentDateLabel",
        "trackedEntityType",
        "captureCoordinates",
        "programTrackedEntityAttributes[trackedEntityAttribute[id,name,valueType,confidential,optionSet[id,name,options[id]]]],",
    ].join(",");
    const response = await api.get(`/${endpoint}/${id}`, { fields }).getData();
    return { ...response, type };
}

export async function getElementMetadata({ element, api, orgUnitIds, startDate, endDate }) {
    const elementMetadata = new Map();
    const endpoint = element.type === "dataSets" ? "dataSets" : "programs";
    const rawMetadata = await api.get(`/${endpoint}/${element.id}/metadata.json`).getData();
    _.forOwn(rawMetadata, (value, type) => {
        if (Array.isArray(value)) {
            _.forEach(value, object => {
                if (object.id) elementMetadata.set(object.id, { ...object, type });
            });
        }
    });

    const responses = await promiseMap(_.chunk(orgUnitIds, 400), orgUnits =>
        api
            .get("/metadata", {
                fields: "id,displayName,translations",
                filter: `id:in:[${orgUnits}]`,
            })
            .getData()
    );

    const organisationUnits = _.flatMap(responses, ({ organisationUnits }) => organisationUnits);
    const metadata =
        element.type === "trackerPrograms"
            ? await getTrackerProgramMetadata(element, api, { organisationUnits, startDate, endDate })
            : {};

    return { element, metadata, elementMetadata, organisationUnits, rawMetadata };
}

export function importOrgUnitByUID(api, uid) {
    return api.get("/organisationUnits/" + uid).getData();
}
