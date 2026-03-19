### Requirement: Tracker API queries use orgUnitMode parameter

All calls to the DHIS2 `/tracker/trackedEntities` endpoint SHALL use the `orgUnitMode` query parameter instead of the deprecated `ouMode` parameter. This applies to TEI fetching for template population and relationship metadata retrieval.

#### Scenario: TEI population with "Only selected organisation units"
- **WHEN** user downloads a tracker template with populate enabled and "TEI and relationships enrollment by organisation unit" set to "Only selected organisation units"
- **THEN** the API call to `/tracker/trackedEntities` SHALL include `orgUnitMode=SELECTED` and `orgUnits=<comma-separated selected OU ids>` as query parameters
- **THEN** the returned TEIs SHALL only include those enrolled in the selected organisation units

#### Scenario: TEI population with "Current user organisation units"
- **WHEN** user downloads a tracker template with populate enabled and OU filter set to "Current user organisation units (data capture)"
- **THEN** the API call to `/tracker/trackedEntities` SHALL include `orgUnitMode=CAPTURE` as query parameter

#### Scenario: Relationship metadata fetching respects OU filter
- **WHEN** relationship metadata is fetched for TEI constraints during template population
- **THEN** the API call to `/tracker/trackedEntities` SHALL use `orgUnitMode` (not `ouMode`) with the user's selected OU filter mode
