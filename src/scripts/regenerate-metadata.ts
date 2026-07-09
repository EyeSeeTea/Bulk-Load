import path from "path";
import { command, run, string, option } from "cmd-ts";
import { readFile, writeFile } from "node:fs/promises";

import { D2Api } from "./../types/d2-api";
import appConfig from "../../public/app-config.json";
import { getCompositionRoot } from "../CompositionRoot";
import { JsonConfig } from "../data/ConfigWebRepository";
import { getD2APiFromInstance } from "../utils/d2-api";
import Settings from "../webapp/logic/settings";
import { DataFormType } from "../domain/entities/DataForm";

// Embed --auth into the URL, matching how the rest of the app builds its DHIS2 instance.
function buildDhis2Url(baseUrl: string, auth: string): string {
    if (!auth) return baseUrl;
    const separatorIndex = auth.indexOf(":");
    const url = new URL(baseUrl);
    url.username = separatorIndex === -1 ? auth : auth.slice(0, separatorIndex);
    url.password = separatorIndex === -1 ? "" : auth.slice(separatorIndex + 1);
    return url.href;
}

function main() {
    const cmd = command({
        name: path.basename(__filename),
        description: "Regenerate the Metadata sheet of a custom template from fresh DHIS2 metadata",
        args: {
            url: option({
                type: string,
                short: "u",
                long: "dhis2-url",
                description: "DHIS2 base URL. Example: https://play.dhis2.org (auth via --auth, or embedded here)",
            }),
            auth: option({
                type: string,
                short: "a",
                long: "auth",
                defaultValue: () => "",
                description: 'DHIS2 auth as "username:password" (special characters are handled)',
            }),
            input: option({
                type: string,
                short: "i",
                long: "input",
                description: "Path to the input template (.xlsm/.xlsx)",
            }),
            output: option({
                type: string,
                short: "o",
                long: "output",
                description: "Path where the regenerated template will be written",
            }),
            formId: option({
                type: string,
                long: "form-id",
                description: "DHIS2 program/dataSet id whose metadata is used (e.g. U6z7eJniNfL)",
            }),
            formType: option({
                type: string,
                long: "form-type",
                defaultValue: () => "trackerPrograms",
                description: "Data form type: trackerPrograms | programs | dataSets (default: trackerPrograms)",
            }),
            language: option({
                type: string,
                long: "language",
                defaultValue: () => "en",
                description: "Language for metadata names (default: en)",
            }),
        },
        handler: async args => {
            const url = buildDhis2Url(args.url, args.auth);
            const api: D2Api = getD2APiFromInstance({ type: "local", url });
            const compositionRoot = getCompositionRoot({
                appConfig: appConfig as unknown as JsonConfig,
                dhisInstance: { type: "local", url },
                importSource: "node",
            });
            const [settings, fileBuffer] = await Promise.all([
                Settings.build(api, compositionRoot),
                readFile(args.input),
            ]);
            const fileContents = fileBuffer.toString("base64");
            console.debug(`Regenerating Metadata for ${args.input} (form ${args.formId})`);

            const outputBase64 = await compositionRoot.templates.regenerateMetadata(api, {
                type: args.formType as DataFormType,
                id: args.formId,
                fileContents,
                settings,
                language: args.language,
            });

            await writeFile(args.output, Buffer.from(outputBase64, "base64"));
            console.debug(`Wrote regenerated template to ${args.output}`);
        },
    });

    run(cmd, process.argv.slice(2));
}

main();
