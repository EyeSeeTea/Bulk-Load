import { getMockApi } from "../../types/d2-api";

export function initializeMockServer() {
    const { api, mock } = getMockApi();

    // User settings
    mock.onGet("me").reply(200, {
        id: "user1",
        name: "Name",
        userCredentials: { username: "user" },
        userGroups: [{ id: "BwyMfDBLih9" }],
        authorities: [],
        dataViewOrganisationUnits: [],
        organisationUnits: [],
    });
    mock.onGet("/me/authorization").reply(200, ["USER_GROUP_TEST"]);
    mock.onGet("/metadata", { params: { "userGroups:fields": "displayName,id,name" } }).reply(200, {
        userGroups: [{ name: "USER_GROUP_TEST", id: "BwyMfDBLih9", displayName: "USER_GROUP_TEST" }],
    });

    // App Storage
    mock.onGet("/dataStore/bulk-load/BULK_LOAD_SETTINGS").reply(200, {
        models: { dataSet: true, program: true },
        permissionsForGeneration: ["BwyMfDBLih9"],
        permissionsForSettings: ["BwyMfDBLih9"],
        permissionsForImport: ["BwyMfDBLih9"],
        orgUnitSelection: "both",
    });

    // Permissions
    mock.onGet("/metadata", {
        params: {
            "userGroups:fields": "displayName,id",
            "userGroups:filter": ["id:in:[BwyMfDBLih9]"],
            "users:fields": "displayName,id",
            "users:filter": ["id:in:[BwyMfDBLih9]"],
        },
    }).reply(200, {});

    // Locales
    mock.onGet("/locales/dbLocales").reply(200, [
        {
            name: "English",
            created: "2017-05-10T17:54:02.496",
            lastUpdated: "2017-05-10T17:54:02.497",
            externalAccess: false,
            displayName: "English",
            locale: "en",
            favorite: false,
            id: "DASlb5apVru",
        },
    ]);

    // Organisation units
    mock.onGet("/organisationUnits", {
        params: { userOnly: true, fields: "displayName,id,level,path" },
    }).reply(200, {
        organisationUnits: [{ level: 1, id: "H8RixfF8ugH", path: "/H8RixfF8ugH", displayName: "Global" }],
    });

    // Organisation unit Global
    mock.onGet("/organisationUnits", {
        params: {
            fields: "children,displayName,id,level,path,shortName",
            paging: false,
            filter: ["id:in:[H8RixfF8ugH]"],
        },
    }).reply(200, {
        organisationUnits: [
            {
                level: 1,
                id: "H8RixfF8ugH",
                path: "/H8RixfF8ugH",
                displayName: "Global",
                children: [],
            },
        ],
    });

    // Organisation unit groups and levels
    mock.onGet("/organisationUnitGroups").reply(200, { organisationUnitGroups: [] });
    mock.onGet("/organisationUnitLevels").reply(200, { organisationUnitGroups: [] });

    // Data Sets
    mock.onGet("/dataSets", {
        params: {
            paging: false,
            fields: "access,attributeValues[attribute[code],value],dataSetElements[dataElement[categoryCombo[id],formName,id,name,optionSet[id,options[code,id,name]],valueType]],displayName,id,name,periodType,sections[dataElements[categoryCombo[id],formName,id,name,optionSet[id,options[code,id,name]],valueType],id,name]",
            filter: [],
        },
    }).reply(200, {
        dataSets: [
            {
                name: "ADMIN_Analytics_Check",
                id: "C47NApwU2kc",
                periodType: "Daily",
                displayName: "ADMIN_Analytics_Check",
                access: {
                    read: true,
                    update: true,
                    externalize: true,
                    delete: true,
                    write: true,
                    manage: true,
                    data: {
                        read: true,
                        write: true,
                    },
                },
                attributeValues: [],
                dataSetElements: [],
                organisationUnits: [],
                sections: [],
            },
        ],
    });

    // Programs
    mock.onGet("/programs", {
        params: {
            paging: false,
            fields: "access,attributeValues[attribute[code],value],displayName,id,name,programStages[featureType,id,name,programStageDataElements[dataElement[categoryCombo[categoryOptionCombos[id,name]],formName,id,name,optionSet[id,options[code,id,name]],valueType]],repeatable],programTrackedEntityAttributes[trackedEntityAttribute[id,name,optionSet[id,options[code,id,name]],valueType]],programType,trackedEntityType[featureType,id]",
            filter: [],
        },
    }).reply(200, {
        programs: [
            {
                name: "ENTO-  Discriminating concentration bioassay",
                id: "G9hvxFI8AYC",
                displayName: "ENTO-  Discriminating concentration bioassay",
                access: {
                    read: true,
                    update: true,
                    externalize: true,
                    delete: true,
                    write: true,
                    manage: true,
                    data: {
                        read: true,
                        write: true,
                    },
                },
                attributeValues: [],
                programStages: [],
                programTrackedEntityAttributes: [],
                trackedEntityType: { id: "ZhmIeRK6IfG", featureType: "NONE" },
            },
        ],
    });

    // Default fallback
    mock.onAny().reply(({ method, url, params }) => {
        console.error("Network error", { method, url, params });
        return [500, {}];
    });

    return { api, mock };
}
