import path from "path";
import { command, run, string, option } from "cmd-ts";
import { resolve, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { D2Api } from "./../types/d2-api";
import appConfig from "../../public/app-config.json";
import { getCompositionRoot } from "../CompositionRoot";
import { JsonConfig } from "../data/ConfigWebRepository";
import { getD2APiFromInstance } from "../utils/d2-api";
import Settings from "../webapp/logic/settings";

function main() {
    const cmd = command({
        name: path.basename(__filename),
        description: "Import data from multiples excel files",
        args: {
            url: option({
                type: string,
                short: "u",
                long: "dhis2-url",
                description: "DHIS2 base URL. Example: http://USERNAME:PASSWORD@localhost:8080",
            }),
            folderPath: option({
                type: string,
                short: "fp",
                long: "folder-path",
                description: "folder path with excel files to import data",
            }),
            resultsPath: option({
                type: string,
                short: "rp",
                long: "results-path",
                description: "folder where import results will be saved",
            }),
        },
        handler: async args => {
            const api: D2Api = getD2APiFromInstance({ type: "local", url: args.url });

            const excelFile = await readFile(args.folderPath);
            const compositionRoot = getCompositionRoot({
                appConfig: appConfig as unknown as JsonConfig,
                dhisInstance: { type: "local", url: args.url },
                importSource: "node",
            });
            const settings = await Settings.build(api, compositionRoot);
            console.debug(`Importing file ${args.folderPath}`);
            const results = await compositionRoot.templates.import({
                // @ts-ignore
                file: Buffer.from(excelFile),
                settings,
                duplicateStrategy: "ERROR",
                organisationUnitStrategy: "ERROR",
                selectedOrgUnits: [],
                useBuilderOrgUnits: false,
            });
            const resultPath = resolve(args.resultsPath, `${basename(args.folderPath)}.json`);
            results.match({
                success: async syncResults => {
                    const resultDetails = JSON.stringify(syncResults, null, 2);
                    await writeFile(resultPath, resultDetails);
                    console.debug(`Results saved to ${resultPath}`);
                },
                error: async errorResults => {
                    await writeFile(resultPath, errorResults.type);
                },
            });
        },
    });

    run(cmd, process.argv.slice(2));
}

main();
