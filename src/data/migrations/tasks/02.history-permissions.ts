import { MigrationParams } from ".";
import { AppSettings } from "../../../domain/entities/AppSettings";
import { Debug } from "../../../domain/entities/Debug";
import { AppStorage, Migration } from "../client/types";

export async function migrate(storage: AppStorage, _debug: Debug, _params: MigrationParams): Promise<void> {
    const settings = await storage.getOrCreate<Partial<AppSettings>>("BULK_LOAD_SETTINGS", {});

    if (!Object.prototype.hasOwnProperty.call(settings, "permissionsForHistory")) {
        const updatedSettings = {
            ...settings,
            permissionsForHistory: [],
            allPermissionsForHistory: false,
        };

        await storage.save<Partial<AppSettings>>("BULK_LOAD_SETTINGS", updatedSettings);
    }
}

const migration: Migration<MigrationParams> = {
    name: "Add history permissions",
    migrate,
};

export default migration;
