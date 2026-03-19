## 1. Upgrade d2-api dependency

- [x] 1.1 [BE] Upgrade `@eyeseetea/d2-api` to the version including PR #184 (v42 tracker params)
- [x] 1.2 [BE] Update `src/types/d2-api.ts` imports from `@eyeseetea/d2-api/2.41` to `@eyeseetea/d2-api/2.42`

## 2. Refactor tracker API calls to use d2-api typed methods

- [x] 2.1 [BE] Replace `buildOrgUnitMode` with `buildOrgUnitParams` in `Dhis2RelationshipTypes.ts` — use `OrgUnitMode` from d2-api instead of the removed `TeiOuRequest`
- [x] 2.2 [BE] Refactor `getTeisFromApi` in `Dhis2TrackedEntityInstances.ts` to use `api.tracker.trackedEntities.get()` with typed field selectors instead of raw `api.get()`
- [x] 2.3 [BE] Refactor `getExistingTeis` in `Dhis2TrackedEntityInstances.ts` to use `api.tracker.trackedEntities.get()` with `orgUnitMode: "CAPTURE"`
- [x] 2.4 [BE] Refactor `getAllTrackedEntities` in `Dhis2RelationshipTypes.ts` to use `api.tracker.trackedEntities.get()` and handle the v42 response shape

## 3. Remove obsolete types and compat code

- [x] 3.1 [BE] Remove `TrackedEntityGetRequest` interface, `TrackerParams` type, and `getTrackedEntities` raw API wrapper from `Dhis2TrackedEntityInstances.ts`
- [x] 3.2 [BE] Remove `TrackedEntitiesD2ApiResponse` compat type from `Dhis2TrackedEntityInstances.ts`
- [x] 3.3 [BE] Remove `TrackedEntitiesResponse` and `TrackedEntitiesAPIResponse` backward-compat types from `TrackedEntity.ts`
- [x] 3.4 [BE] Define `TrackedEntityGeometryAttributes` locally (replaces import from removed `trackedEntityInstances` module)

## 4. Verification

- [x] 4.1 [BE] Verify TypeScript compilation passes (`npx tsc --noEmit`) with no new errors in modified files
- [x] 4.2 [BE] Verify all unit tests pass (`yarn test`)
