## Why

DHIS2 v42 deprecated the `ouMode` and `orgUnit` (semicolon-delimited) query parameters on the `/tracker/trackedEntities` endpoint, replacing them with `orgUnitMode` and `orgUnits` (comma-delimited). The Bulk Load app currently bypasses d2-api's typed tracker methods and constructs raw `api.get()` calls with manually assembled parameters. This causes TEI population to silently return all accessible TEIs instead of only those in selected org units on v42 instances. The fix in d2-api PR #184 already addresses the parameter naming at the library level — this change refactors Bulk Load to use that typed API instead of duplicating the fix locally.

## What Changes

- Upgrade `@eyeseetea/d2-api` to the version that includes v42 tracker parameter support (PR #184)
- Update d2-api import path from `2.41` to `2.42`
- Replace all raw `api.get("/tracker/trackedEntities", ...)` calls with d2-api's typed `api.tracker.trackedEntities.get()` method
- Remove custom `TrackedEntityGetRequest` interface and `TrackerParams` type — d2-api's types handle parameter validation
- Remove `getTrackedEntities()` raw API wrapper function and `TrackedEntitiesD2ApiResponse` compat type
- Update response handling from `instances` / `pageCount` to `pager.pageCount` / `trackedEntities` (v42 response shape)
- Replace string-based field selectors (`"trackedEntity,inactive,orgUnit,..."`) with typed object selectors (`{ trackedEntity: true, ... }`)
- Rename `buildOrgUnitMode` → `buildOrgUnitParams` to reflect the v42 parameter naming

## Capabilities

### New Capabilities

_(none — this is a refactor of existing functionality)_

### Modified Capabilities

- `tracker-ou-filtering`: Implementation changes from raw API calls to d2-api typed methods. The behavioral requirements remain the same (orgUnitMode, comma-delimited orgUnits), but the mechanism shifts from manual parameter construction to leveraging d2-api's typed tracker API.

## Impact

- **Dependencies**: `@eyeseetea/d2-api` upgraded from `1.20.0` to the version including PR #184 (v42 tracker support). This is a **prerequisite** — the d2-api PR must be merged and released first.
- **Code**: `src/data/Dhis2TrackedEntityInstances.ts`, `src/data/Dhis2RelationshipTypes.ts`, `src/domain/entities/TrackedEntity.ts`, `src/types/d2-api.ts`
- **Removed exports**: `getTrackedEntities`, `TrackedEntityGetRequest`, `TrackedEntitiesD2ApiResponse` from `Dhis2TrackedEntityInstances.ts`; `buildOrgUnitMode` renamed to `buildOrgUnitParams` in `Dhis2RelationshipTypes.ts`; `TrackedEntitiesResponse` and `TrackedEntitiesAPIResponse` removed from `TrackedEntity.ts`
- **No behavioral changes**: The API calls produce identical HTTP requests; only the mechanism for constructing them changes.
