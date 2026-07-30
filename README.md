# DHIS2 Bulk Load

The Bulk Load application generates templates (an Excel sheet) and imports multiple data values for DHIS2 v2.30 instances. Some notes:

-   Settings are only visible for superusers (`ALL` authority) or users that belong to the settings groups.
-   The generation box is only visible for users that belong to the configurable `Template Generation` groups (initial value: `HMIS Officers`).

## Setup

Install dependencies:

```
$ yarn install
```

## Development

Start the development server:

```
$ PORT=8081 VITE_DHIS2_BASE_URL="http://localhost:8080" VITE_DHIS2_AUTH="" yarn start
```

Now in your browser, go to `http://localhost:8081`.

Notes:

-   Requests to DHIS2 will be transparently proxied from `http://localhost:8081/dhis2/path` to `http://localhost:8080/path` (see `vite.config.ts`) to avoid CORS and cross-domain problems.

-   The optional environment variable `VITE_DHIS2_AUTH=USERNAME:PASSWORD` forces some credentials to be used by the proxy. This variable is usually not set, so the app has the same user logged in at `VITE_DHIS2_BASE_URL`.

-   The optional environment variable `VITE_PROXY_LOG_LEVEL` can be helpful to debug the proxied requests (accepts: "warn" | "debug" | "info" | "error" | "silent")

-   Create a file `.env.local` (copy it from `.env`) to customize environment variables so you can simply run `yarn start`.

-   [why-did-you-render](https://github.com/welldone-software/why-did-you-render) is loaded in development to help debug re-renders.

## Tests

### Unit tests

```
$ yarn test
```

## Build app ZIP

```
$ yarn build
```

## i18n

```
$ yarn localize
```

### App context

The file `src/webapp/contexts/app-context.ts` holds some general context so typical infrastructure objects (`api`, `d2`, ...) are readily available. Add your own global objects if necessary.

### Import XLSX files (from filled templates)

You can use the script `import-multiple-files.ts` to import multiple xlsx files:

```bash
#!/bin/bash

npx ts-node src/scripts/import-multiple-files.ts \
    --dhis2-url="http://admin:district@localhost:8080" \
    --results-path="/path/to/folder/for/json_results" \
    file1.xlsx file2.xlsx
```

### Regenerate template metadata (from DHIS2)

You can use the script `regenerate-metadata.ts` to refresh **only** the Metadata
sheet of an existing template from fresh DHIS2 metadata, leaving every other sheet
(custom form, dropdowns, VBA) untouched:

```bash
yarn regenerate-metadata \
    --dhis2-url="https://play.dhis2.org" \
    --auth="user:pass" \
    --input=template.xlsm \
    --output=template.regenerated.xlsm \
    --form-id=U6z7eJniNfL \
    --form-type=trackerPrograms \
    --include-codes
```

| Flag | Required | Description |
| ---- | -------- | ----------- |
| `--dhis2-url` / `-u` | yes | DHIS2 base URL (auth can be embedded here or via `--auth`). |
| `--auth` / `-a` | — | `"username:password"` (special characters are handled). |
| `--input` / `-i` | yes | Path to the input template (`.xlsm`/`.xlsx`). |
| `--output` / `-o` | yes | Path where the regenerated template is written. |
| `--form-id` | yes | DHIS2 program/dataSet id whose metadata is used. |
| `--form-type` | — | `trackerPrograms` \| `programs` \| `dataSets` (default `trackerPrograms`). |
| `--language` | — | Metadata name language (default `en`). |
| `--include-codes` | — | Write the Code column in the Metadata sheet (default off). |
| `--use-codes` | — | Use item codes instead of names for org units, data elements, options… (default off). |
| `--org-unit-short-name` | — | Use each org unit's short name instead of its regular name (default off). |

The same operation is available in the app, under Settings → Maintenance → Regenerate template metadata.
