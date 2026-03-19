## MODIFIED Requirements

### Requirement: Tracker API queries use d2-api typed methods

All calls to the DHIS2 `/tracker/trackedEntities` endpoint SHALL use d2-api's typed `api.tracker.trackedEntities.get()` method instead of raw `api.get()` calls with manually constructed parameters. The d2-api library handles the v42 parameter naming (`orgUnitMode`, `orgUnits` comma-delimited) internally.

#### Scenario: TEI population uses typed tracker API
- **WHEN** `getTeisFromApi` fetches tracked entities for template population
- **THEN** it SHALL call `api.tracker.trackedEntities.get()` with typed field selectors and `orgUnitMode`/`orgUnits` parameters via `buildOrgUnitParams()`
- **THEN** it SHALL NOT use raw `api.get("/tracker/trackedEntities", ...)` with string-based parameters

#### Scenario: Existing TEI lookup uses typed tracker API
- **WHEN** `getExistingTeis` fetches all existing TEIs for relationship splitting
- **THEN** it SHALL call `api.tracker.trackedEntities.get()` with `orgUnitMode: "CAPTURE"` and typed field selectors
- **THEN** it SHALL NOT use the deprecated `ouMode` parameter name

#### Scenario: Relationship constraint TEI lookup uses typed tracker API
- **WHEN** `getAllTrackedEntities` fetches TEIs for relationship constraint resolution
- **THEN** it SHALL call `api.tracker.trackedEntities.get()` with typed parameters
- **THEN** it SHALL handle the v42 response shape (`{ pager, trackedEntities }`) directly from d2-api
