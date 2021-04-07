import _ from "lodash";
import { CompositionRoot } from "../../CompositionRoot";
import {
    AppSettings,
    DataSetDataElementsFilter,
    DuplicateExclusion,
    DuplicateToleranceUnit,
    Model,
    Models,
    OrgUnitSelectionSetting,
} from "../../domain/entities/AppSettings";
import {
    DataElementDisaggregated,
    DataElementDisaggregatedId,
    getDataElementDisaggregatedById,
    getDataElementDisaggregatedId,
} from "../../domain/entities/DataElementDisaggregated";
import { DataForm } from "../../domain/entities/DataForm";
import { Id } from "../../domain/entities/ReferenceObject";
import i18n from "../../locales";
import { D2Api, Ref } from "../../types/d2-api";
import { GetArrayInnerType } from "../../types/utils";

const privateFields = ["currentUser"] as const;

const publicFields = [
    "models",
    "userPermissionsForGeneration",
    "userGroupPermissionsForGeneration",
    "allUserPermissionsForGeneration",
    "userPermissionsForImport",
    "userGroupPermissionsForImport",
    "allUserPermissionsForImport",
    "userPermissionsForSettings",
    "userGroupPermissionsForSettings",
    "allUserPermissionsForSettings",
    "orgUnitSelection",
    "duplicateEnabled",
    "duplicateExclusion",
    "duplicateTolerance",
    "duplicateToleranceUnit",
    "dataSetDataElementsFilter",
] as const;

const allFields = [...privateFields, ...publicFields];

type Options = Pick<Settings, GetArrayInnerType<typeof allFields>>;
type PublicOption = Pick<Options, GetArrayInnerType<typeof publicFields>>;

export type PermissionSetting = "generation" | "settings" | "import";
export type PermissionType = "user" | "userGroup" | "allUsers";

interface NamedObject {
    id: string;
    displayName: string;
}

interface CurrentUser extends Ref {
    userGroups: Ref[];
    authorities: Set<string>;
}

type OkOrError = { status: true } | { status: false; error: string };

export default class Settings {
    public currentUser: CurrentUser;
    public models: Models;
    public userPermissionsForGeneration: NamedObject[];
    public userGroupPermissionsForGeneration: NamedObject[];
    public allUserPermissionsForGeneration: NamedObject[];
    public userPermissionsForImport: NamedObject[];
    public userGroupPermissionsForImport: NamedObject[];
    public allUserPermissionsForImport: NamedObject[];
    public userPermissionsForSettings: NamedObject[];
    public userGroupPermissionsForSettings: NamedObject[];
    public allUserPermissionsForSettings: NamedObject[];
    public orgUnitSelection: OrgUnitSelectionSetting;
    public duplicateEnabled: boolean;
    public duplicateExclusion: DuplicateExclusion;
    public duplicateTolerance: number;
    public duplicateToleranceUnit: DuplicateToleranceUnit;
    public dataSetDataElementsFilter: DataSetDataElementsFilter;

    static constantCode = "BULK_LOAD_SETTINGS";

    constructor(options: Options) {
        this.currentUser = options.currentUser;
        this.models = options.models;
        this.userPermissionsForGeneration = options.userPermissionsForGeneration;
        this.userGroupPermissionsForGeneration = options.userGroupPermissionsForGeneration;
        this.allUserPermissionsForGeneration = options.allUserPermissionsForGeneration;
        this.userPermissionsForImport = options.userPermissionsForImport;
        this.userGroupPermissionsForImport = options.userGroupPermissionsForImport;
        this.allUserPermissionsForImport = options.allUserPermissionsForImport;
        this.userPermissionsForSettings = options.userPermissionsForSettings;
        this.userGroupPermissionsForSettings = options.userGroupPermissionsForSettings;
        this.allUserPermissionsForSettings = options.allUserPermissionsForSettings;
        this.orgUnitSelection = options.orgUnitSelection;
        this.duplicateEnabled = options.duplicateEnabled;
        this.duplicateExclusion = options.duplicateExclusion;
        this.duplicateTolerance = options.duplicateTolerance;
        this.duplicateToleranceUnit = options.duplicateToleranceUnit;
        this.dataSetDataElementsFilter = options.dataSetDataElementsFilter;
    }

    static async build(api: D2Api, compositionRoot: CompositionRoot): Promise<Settings> {
        const authorities = await api.get<string[]>("/me/authorization").getData();

        const d2CurrentUser = await api.currentUser.get({ fields: { id: true, userGroups: { id: true } } }).getData();

        const currentUser: CurrentUser = {
            ...d2CurrentUser,
            authorities: new Set(authorities),
        };

        const defaultSettings = compositionRoot.settings.getDefault();
        const data = await compositionRoot.settings.read<Partial<AppSettings>>(Settings.constantCode, defaultSettings);

        const query = (prop: "permissionsForGeneration" | "permissionsForSettings" | "permissionsForImport") => {
            const storedValues = data[prop] ?? [];
            const defaultValues = defaultSettings[prop] ?? [];

            return {
                fields: { id: true, displayName: true },
                filter: { id: { in: [...storedValues, ...defaultValues] } },
            };
        };

        const allUserPermissionsForImport: NamedObject[] = [
            {
                id: data["permissionsForImport"]?.find(element => element === "ALL") ?? "",
                displayName: "",
            },
        ];

        const { users: userPermissionsForImport, userGroups: userGroupPermissionsForImport } = await api.metadata
            .get({
                userGroups: query("permissionsForImport"),
                users: query("permissionsForImport"),
            })
            .getData();

        const {
            users: userPermissionsForGeneration,
            userGroups: userGroupPermissionsForGeneration,
        } = await api.metadata
            .get({
                userGroups: query("permissionsForGeneration"),
                users: query("permissionsForGeneration"),
            })
            .getData();

        const allUserPermissionsForGeneration: NamedObject[] = [
            {
                id: data["permissionsForGeneration"]?.find(element => element === "ALL") ?? "",
                displayName: "",
            },
        ];

        const { users: userPermissionsForSettings, userGroups: userGroupPermissionsForSettings } = await api.metadata
            .get({
                userGroups: query("permissionsForSettings"),
                users: query("permissionsForSettings"),
            })
            .getData();

        const allUserPermissionsForSettings: NamedObject[] = [
            {
                id: data["permissionsForSettings"]?.find(element => element === "ALL") ?? "",
                displayName: "",
            },
        ];

        return new Settings({
            currentUser,
            models: data.models ?? defaultSettings.models,
            userPermissionsForGeneration,
            userGroupPermissionsForGeneration,
            allUserPermissionsForGeneration,
            userPermissionsForImport,
            userGroupPermissionsForImport,
            allUserPermissionsForImport,
            userPermissionsForSettings,
            userGroupPermissionsForSettings,
            allUserPermissionsForSettings,
            orgUnitSelection: data.orgUnitSelection ?? defaultSettings.orgUnitSelection,
            duplicateEnabled: data.duplicateEnabled ?? true,
            duplicateExclusion: data.duplicateExclusion ?? defaultSettings.duplicateExclusion,
            duplicateTolerance: data.duplicateTolerance ?? defaultSettings.duplicateTolerance,
            duplicateToleranceUnit: data.duplicateToleranceUnit ?? defaultSettings.duplicateToleranceUnit,
            dataSetDataElementsFilter: data.dataSetDataElementsFilter ?? defaultSettings.dataSetDataElementsFilter,
        });
    }

    validate(): OkOrError {
        const isSomeModelEnabled = _(this.models).values().some();
        return isSomeModelEnabled ? { status: true } : { status: false, error: i18n.t("Select at least one model") };
    }

    async save(compositionRoot: CompositionRoot): Promise<OkOrError> {
        const {
            models,
            userPermissionsForGeneration,
            userGroupPermissionsForGeneration,
            allUserPermissionsForGeneration,
            userPermissionsForImport,
            userGroupPermissionsForImport,
            allUserPermissionsForImport,
            userPermissionsForSettings,
            userGroupPermissionsForSettings,
            allUserPermissionsForSettings,
            orgUnitSelection,
            duplicateEnabled,
            duplicateExclusion,
            duplicateTolerance,
            duplicateToleranceUnit,
            dataSetDataElementsFilter,
        } = this;
        const validation = this.validate();
        if (!validation.status) return validation;

        const permissionsForGeneration = [
            ...userPermissionsForGeneration,
            ...userGroupPermissionsForGeneration,
            ...allUserPermissionsForGeneration,
        ].map(ug => ug.id);

        const permissionsForSettings = [
            ...userPermissionsForSettings,
            ...userGroupPermissionsForSettings,
            ...allUserPermissionsForSettings,
        ].map(ug => ug.id);
        const permissionsForImport = [
            ...userPermissionsForImport,
            ...userGroupPermissionsForImport,
            ...allUserPermissionsForImport,
        ].map(ug => ug.id);

        const data: AppSettings = {
            models,
            permissionsForGeneration,
            permissionsForSettings,
            permissionsForImport,
            orgUnitSelection,
            duplicateEnabled,
            duplicateExclusion,
            duplicateTolerance,
            duplicateToleranceUnit,
            dataSetDataElementsFilter,
        };

        try {
            await compositionRoot.settings.write<AppSettings>(Settings.constantCode, data);
            return { status: true };
        } catch (error) {
            return { status: false, error: error.message || "Unknown" };
        }
    }

    private updateOptions(newOptions: Partial<Options>): Settings {
        return new Settings({ ..._.pick(this, allFields), ...newOptions });
    }

    update(options: Partial<PublicOption>): Settings {
        const currentOptions = _.pick(this, allFields);
        return new Settings({ ...currentOptions, ...options });
    }

    setModel(model: Model, value: boolean) {
        return this.updateOptions({ models: { ...this.models, [model]: value } });
    }

    getPermissions(setting: PermissionSetting, type: PermissionType): NamedObject[] {
        return this[this.getPermissionField(setting, type)];
    }

    setPermissions(setting: PermissionSetting, type: PermissionType, collection: NamedObject[]): Settings {
        return this.updateOptions({
            [this.getPermissionField(setting, type)]: collection,
        });
    }

    setDuplicateEnabled(duplicateEnabled: boolean): Settings {
        return this.updateOptions({ duplicateEnabled });
    }

    setDuplicateExclusions(program: Id, exclusions: Id[]): Settings {
        const duplicateExclusion = _.transform(
            {
                ...this.duplicateExclusion,
                [program]: exclusions,
            },
            (result, value, key) => {
                // Clean-up empty arrays from exclusions
                if (value.length > 0) result[key] = value;
            },
            {} as DuplicateExclusion
        );

        return this.updateOptions({ duplicateExclusion });
    }

    setDataSetDataElementsFilter(dataSetDataElementsFilter: DataSetDataElementsFilter): Settings {
        return this.updateOptions({ dataSetDataElementsFilter });
    }

    setDataSetDataElementsFilterFromSelection(options: {
        dataSet: DataForm | undefined;
        dataElementsDisaggregated: DataElementDisaggregated[];
        prevSelectedIds: DataElementDisaggregatedId[];
        newSelectedIds: DataElementDisaggregatedId[];
    }): Settings {
        const { dataSet, dataElementsDisaggregated, prevSelectedIds, newSelectedIds } = options;
        if (!dataSet) return this;

        const newSelected = newSelectedIds.map(getDataElementDisaggregatedById);
        const prevSelected = prevSelectedIds.map(getDataElementDisaggregatedById);
        const disaggregatedById = _.groupBy(dataElementsDisaggregated, de => de.id);
        const added = _.differenceBy(newSelected, prevSelected, getDataElementDisaggregatedId);
        const removed = _.differenceBy(prevSelected, newSelected, getDataElementDisaggregatedId);

        const relatedDisaggregatedToAddForMainElements = _.flatMap(added, de =>
            de.categoryOptionComboId ? [] : _(disaggregatedById).get(de.id, [])
        );
        const relatedDisagregatedToRemove = _.flatMap(removed, de =>
            de.categoryOptionComboId
                ? (disaggregatedById[de.id] || []).filter(de => !de.categoryOptionComboId)
                : _.get(disaggregatedById, de.id, [])
        );

        const newSelectedWithAutomaticLogic = _(newSelected)
            .concat(relatedDisaggregatedToAddForMainElements)
            .differenceBy(relatedDisagregatedToRemove, getDataElementDisaggregatedId)
            .value();

        const newFilterValue = _(dataElementsDisaggregated)
            .differenceBy(newSelectedWithAutomaticLogic, getDataElementDisaggregatedId)
            .uniqBy(getDataElementDisaggregatedId)
            .value();

        const newFilter = { ...this.dataSetDataElementsFilter, [dataSet.id]: newFilterValue };

        return this.setDataSetDataElementsFilter(newFilter);
    }

    allModelsEnabled() {
        return _.every(this.models, Boolean);
    }

    isModelEnabled(key: Model) {
        return this.models[key];
    }

    isBlankPageVisibleForCurrentUser() {
        return !this.isImportDataVisibleForCurrentUser() && !this.isTemplateGenerationVisible();
    }

    isTemplateGenerationVisible() {
        const hasGroupAccess = this.findCurrentUser(this.userGroupPermissionsForGeneration);
        const hasUserAccess = this.findCurrentUser(this.userPermissionsForGeneration);
        const haveAllUsersAccess = this.areAllUsersAllowed(this.allUserPermissionsForGeneration);

        return hasGroupAccess || hasUserAccess || haveAllUsersAccess;
    }

    areSettingsVisibleForCurrentUser(): boolean {
        const { authorities } = this.currentUser;
        const isUserAdmin = authorities.has("ALL");
        const hasGroupAccess = this.findCurrentUser(this.userGroupPermissionsForSettings);
        const hasUserAccess = this.findCurrentUser(this.userPermissionsForSettings);
        const haveAllUsersAccess = this.areAllUsersAllowed(this.allUserPermissionsForSettings);

        return isUserAdmin || hasGroupAccess || hasUserAccess || haveAllUsersAccess;
    }

    isImportDataVisibleForCurrentUser(): boolean {
        const hasGroupAccess = this.findCurrentUser(this.userGroupPermissionsForImport);
        const hasUserAccess = this.findCurrentUser(this.userPermissionsForImport);
        const haveAllUsersAccess = this.areAllUsersAllowed(this.allUserPermissionsForImport);

        return hasGroupAccess || hasUserAccess || haveAllUsersAccess;
    }

    getModelsInfo(): Array<{ key: Model; name: string; value: boolean }> {
        return [
            { key: "dataSet", name: i18n.t("Data set"), value: this.models.dataSet },
            { key: "program", name: i18n.t("Program"), value: this.models.program },
        ];
    }

    private getPermissionField(setting: PermissionSetting, kind: "user" | "userGroup" | "allUsers") {
        if (setting === "generation" && kind === "user") {
            return "userPermissionsForGeneration";
        } else if (setting === "generation" && kind === "userGroup") {
            return "userGroupPermissionsForGeneration";
        } else if (setting === "generation" && kind === "allUsers") {
            return "allUserPermissionsForGeneration";
        } else if (setting === "settings" && kind === "user") {
            return "userPermissionsForSettings";
        } else if (setting === "settings" && kind === "userGroup") {
            return "userGroupPermissionsForSettings";
        } else if (setting === "settings" && kind === "allUsers") {
            return "allUserPermissionsForSettings";
        } else if (setting === "import" && kind === "user") {
            return "userPermissionsForImport";
        } else if (setting === "import" && kind === "userGroup") {
            return "userGroupPermissionsForImport";
        } else if (setting === "import" && kind === "allUsers") {
            return "allUserPermissionsForImport";
        } else {
            throw new Error("Unsupported field");
        }
    }

    private findCurrentUser(collection: NamedObject[]): boolean {
        return !_([this.currentUser, ...this.currentUser.userGroups])
            .intersectionBy(collection, userGroup => userGroup.id)
            .isEmpty();
    }

    private areAllUsersAllowed(collection: NamedObject[]): boolean {
        return _(collection).some(item => item.id === "ALL");
    }
}
