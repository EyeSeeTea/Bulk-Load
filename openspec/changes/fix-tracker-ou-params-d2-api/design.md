## Context

The Bulk Load app fetches tracked entity instances (TEIs) from DHIS2 via the `/tracker/trackedEntities` endpoint during template population and relationship metadata retrieval. Currently, it bypasses d2-api's typed tracker methods and uses raw `api.get()` calls with a custom `TrackedEntityGetRequest` interface that manually assembles query parameters. DHIS2 v42 renamed `ouMode` → `orgUnitMode` and `orgUnit` (semicolon-delimited) → `orgUnits` (comma-delimited), and also changed the response shape from `{ instances, pageCount }` to `{ pager: { pageCount }, trackedEntities }`.

The d2-api library is being updated (PR #184) to handle these v42 changes in its typed `api.tracker.trackedEntities.get()` method. Rather than duplicating the parameter fix in Bulk Load, we should leverage d2-api's typed API.

## Goals / Non-Goals

**Goals:**
- Use d2-api's typed `api.tracker.trackedEntities.get()` for all tracked entity queries
- Remove manual parameter construction and response normalization code
- Ensure type safety via d2-api's parameter types (compile-time validation of param names)
- Maintain identical runtime behavior (same HTTP requests, same data flow)

**Non-Goals:**
- Refactoring the events API calls (`/tracker/events`) — those remain as raw `api.get()` for now
- Adding backward compatibility with DHIS2 < v41 — the tracker API (`/tracker/trackedEntities`) is v38+ and the codebase already targets v41+
- Changing the domain layer entities or use cases

## Decisions

### 1. Use d2-api's typed tracker API instead of raw `api.get()`

**Decision**: Replace `api.get<TrackedEntitiesD2ApiResponse>("/tracker/trackedEntities", filterQuery)` with `api.tracker.trackedEntities.get({ ... })`.

**Rationale**: d2-api's typed method handles parameter serialization (field selectors, order params) and response mapping internally. This means Bulk Load doesn't need to maintain its own parameter types or response compat layer. When d2-api updates for future DHIS2 versions, the fix propagates automatically.

**Alternative considered**: Keep raw `api.get()` but update param names (PR #386 approach). Simpler short-term but leaves the app coupled to specific DHIS2 API parameter naming.

### 2. Derive parameter types from d2-api instead of maintaining custom interfaces

**Decision**: Use `Parameters<D2Api["tracker"]["trackedEntities"]["get"]>[0]` as the type for tracker query params. Remove `TrackedEntityGetRequest`, `TrackerParams`, and related types.

**Rationale**: Custom types drift from d2-api's actual API. Deriving types from the library ensures they stay in sync.

### 3. Use typed field selectors instead of comma-separated strings

**Decision**: Replace `fields: "trackedEntity,inactive,orgUnit,attributes,enrollments,relationships,geometry"` with `fields: { trackedEntity: true, inactive: true, ... }`.

**Rationale**: d2-api validates field selectors at compile time. String-based fields provide no type safety and can silently include invalid field names.

### 4. Cast d2-api response to domain type via `as unknown as TrackedEntitiesApiRequest[]`

**Decision**: In `getTeisFromApi`, the d2-api response is cast to the domain's `TrackedEntitiesApiRequest` type.

**Rationale**: The d2-api response type uses `SelectedPick` which produces structurally compatible but nominally different types. A cast is the pragmatic choice since the shapes are identical at runtime. Longer term, the domain type could be replaced with d2-api's type directly.

## Risks / Trade-offs

- **[Dependency on unreleased d2-api]** → The d2-api PR #184 must be merged and published before this can be released. `package.json` temporarily points to the git branch. Mitigation: track d2-api PR status; update to published version once available.
- **[Type cast in getTeisFromApi]** → The `as unknown as TrackedEntitiesApiRequest[]` cast bypasses type checking at one boundary. Mitigation: the types are structurally identical; this can be removed if domain types are aligned with d2-api types in a future refactor.
- **[Events API not updated]** → The `/tracker/events` calls in `Dhis2RelationshipTypes.ts` still use raw `api.get()`. These may need similar treatment when d2-api's event types are updated. Mitigation: tracked as a separate follow-up.
