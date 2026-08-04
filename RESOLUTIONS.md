# Dependency resolutions

Why each entry in the `resolutions` block of `package.json` exists, and when it can be removed.
`package.json` can record _what_ is constrained but not _why_, so without this file the block grows
into a set of constraints nobody knows how to maintain.

Each entry states:

-   **Why** — which dependency path requires it, and why a normal upgrade is not currently possible.
-   **Fixes** — the advisory or compatibility problem addressed.
-   **Drop when** — an observable condition under which the resolution can be removed.

Add, update or remove a resolution and its entry here in the same change.

> **Ranges, not exact versions.** Almost every entry below is a _floor_ — "never below this" — so it
> takes a compatible range. An exact version is a _fixture_, used only when something binds to that
> specific release, and it should say what binds it.
>
> A floor written as an exact version stops working over time: it cannot select a patch, so it holds
> the tree on the version it was written against. `axios`, `lodash` and `qs` were all previously
> constrained to exact versions here and had to be reopened into ranges. Two entries below show the
> mechanism working: `minimatch` resolves to 3.1.5 and `brace-expansion` to 1.1.18, both above the
> version their advisories name as patched, because backports published later were picked up by the
> range without anyone touching it.

---

## Security floors

### `axios: ^1.18.0`

-   **Why:** `@eyeseetea/d2-api@1.21.0` requests `axios@1.6.4` as an exact version, so removing this
    resolution resolves `axios` _downwards_ to 1.6.4 rather than upwards. The floor is required for as
    long as a parent requests an exact version below it.
-   **Fixes:** GHSA-35jp-ww65-95wh, GHSA-p92q-9vqr-4j8v, GHSA-62hf-57xw-28j9, GHSA-j5f8-grm9-p9fc,
    GHSA-777c-7fjr-54vf, GHSA-6chq-wfr3-2hj9, GHSA-pf86-5x62-jrwf, GHSA-q8qp-cvcw-x6jj,
    GHSA-pmwg-cvhr-8vh7, GHSA-3g43-6gmg-66jw.
-   **Drop when:** every parent that requests `axios` requests a range admitting 1.18.0 or later —
    currently blocked by `@eyeseetea/d2-api`'s exact `1.6.4`.

### `lodash: ^4.18.0`, `lodash-es: ^4.18.0`

-   **Why:** `@eyeseetea/d2-api@1.21.0` and `@eyeseetea/d2-ui-components@2.12.0` both request
    `lodash@4.17.21` as an exact version. Removing the resolution resolves _downwards_ to 4.17.21,
    which is inside the affected range.
-   **Fixes:** GHSA-r5fr-rjxr-66jc, which affects `>= 4.0.0, <= 4.17.23` and is patched in 4.18.0.
-   **Drop when:** `@eyeseetea/d2-api` and `@eyeseetea/d2-ui-components` request a `lodash` range that
    admits 4.18.0 or later.

### `qs: ^6.15.3`

-   **Why:** `@eyeseetea/d2-api@1.21.0` requests `qs@6.9.7` as an exact version, so the constraint
    cannot be removed without resolving downwards.
-   **Fixes:** GHSA-q8mj-m7cp-5q26, which affects `>= 6.11.1, <= 6.15.1`.
-   **Drop when:** `@eyeseetea/d2-api` requests a `qs` range admitting 6.15.2 or later.

### `form-data: ^4.0.6`

-   **Why:** requested transitively, including by `@eyeseetea/d2-api@1.21.0` at `^4.0.0`, which admits
    affected 4.0.x releases.
-   **Fixes:** GHSA-hmw2-7cc7-3qxx. The advisory carries three ranges; the 4.x line is patched in
    4.0.6.
-   **Drop when:** no parent requests a `form-data` range whose lowest satisfying version is below
    4.0.6.

### `jszip: ^3.8.0`

-   **Why:** `@eyeseetea/xlsx-populate@4.3.2-beta.1` requests `jszip@^3.2.2`, which admits versions
    below the patch line.
-   **Fixes:** GHSA-36fh-84j7-cv5h, patched in 3.8.0.
-   **Drop when:** `@eyeseetea/xlsx-populate` requests a range admitting 3.8.0 or later.

### `minimatch: ^3.1.4`

-   **Why:** an unscoped constraint that collapses every `minimatch` request in the tree onto the 3.x
    line.
-   **Fixes:** GHSA-23c5-xmqv-rm74. The advisory patches each major line separately and the 3.x line is
    patched in place at 3.1.4, so no parent bump is required. Resolves to 3.1.5.
-   **Drop when:** the constraint is shown to be unnecessary — that is, every consumer resolves to a
    patched `minimatch` on its own line without it. Verify by removing it, running `yarn install` and
    re-running `yarn lint`, which is the tool that consumes it here.

### `brace-expansion: ^1.1.17`

-   **Why:** requested by `minimatch`, which this repository constrains to the 3.x line (above). The
    1.x line is the one `minimatch@3.x` requests.
-   **Fixes:** GHSA-mh99-v99m-4gvg. All four affected lines were patched by backport; the 1.x line is
    patched at 1.1.17. Resolves to 1.1.18.
-   **Drop when:** the `minimatch` constraint above is dropped, or every consumer requests a patched
    `brace-expansion` line unaided.

### `i18next-conv/node-gettext: ^3.0.1`

-   **Why:** `i18next-conv@6.1.1` requests `node-gettext@^2.0.0`, which cannot reach the fix. Scoped to
    that parent because it is the only consumer. `i18next-conv` is reached through
    `@dhis2/d2-i18n-extract` and `@dhis2/d2-i18n-generate`.
-   **Fixes:** GHSA-g974-hxvm-x689 (prototype pollution). The advisory records no patched version, but
    its affected range is `<= 3.0.0` and 3.0.1 is published and outside it — "no patched version
    recorded" is not the same as "no fix exists".
-   **Drop when:** `i18next-conv` requests `node-gettext@^3` or later, or the `@dhis2/d2-i18n-*` pair is
    replaced (see _Dependency decisions with no trace in the manifest_).

### `react-linkify/linkify-it: ^5.0.2`

-   **Why:** `react-linkify@1.0.0-alpha` requests `linkify-it@^2.0.3`, and the fix is on the 5.x line,
    so the range cannot reach it. `react-linkify` is requested at exactly `1.0.0-alpha` by
    `@eyeseetea/d2-ui-components@2.12.0`, so the parent cannot be moved either. Scoped to that parent
    rather than applied globally.
-   **Fixes:** GHSA-22p9-wv53-3rq4 (patched 5.0.1) and GHSA-v245-v573-v5vm (patched 5.0.2).
-   **Drop when:** `@eyeseetea/d2-ui-components` drops `react-linkify` or moves to a release requesting
    a patched `linkify-it`.

---

## Compatibility fixtures with no recorded rationale

These exact-version entries predate this file and were added without an explanation. Each still binds
something in the tree, so they were left in place rather than removed speculatively — as the `lodash`
entry above shows, removing a resolution can resolve a package _downwards_.

| Resolution                | Still binds | Note                                                                                                                                                                                  |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@babel/runtime: 7.26.10` | 7.26.10     | Exact; no recorded reason                                                                                                                                                             |
| `i18next: 19.8.5`         | 19.8.5      | Exact, and far below the current release line. A resolution on this package is capable of breaking application startup, so change it only deliberately and verify by starting the app |
| `glob-parent: 5.1.2`      | 5.1.2       | Exact; no recorded reason                                                                                                                                                             |
| `moment: 2.29.4`          | 2.29.4      | Exact; also a direct dependency at the same version                                                                                                                                   |
| `nanoid: 3.3.8`           | 3.3.8       | Exact; no recorded reason                                                                                                                                                             |
| `node-fetch: 2.6.7`       | 2.6.7       | Exact; no recorded reason                                                                                                                                                             |
| `diff: 5.2.2`             | 5.2.2       | Exact; no recorded reason                                                                                                                                                             |
| `debug: 4.3.4`            | 4.3.4       | Exact; no recorded reason                                                                                                                                                             |
| `ua-parser-js: 0.7.24`    | 0.7.24      | Exact; no recorded reason                                                                                                                                                             |

**Drop when:** for each, confirm no consumer requires the pinned release, then remove it and run
`yarn install`. Treat each individually — they were added as one batch but have nothing else in
common.

---

## Removed

### `path-to-regexp: 1.9.0` — removed 2026-08-04

No `path-to-regexp` entry existed in `yarn.lock`, so the constraint matched no descriptor and had no
effect. Removing it left the lockfile byte-identical, which is the evidence it was a no-op.

---

## Findings with no remediation available

Recorded so they are not investigated again from scratch. None of these is a resolution; they are
states of the upstream package, or of the line this repository is on.

### `react-router` and `react-router-dom` — GHSA-337j-9hxr-rhxg, GHSA-wrjc-x8rr-h8h6, GHSA-jjmj-jmhj-qwj2

**There is no fix on the 6.x line.** Two of the three advisories are patched in 7.18.0, and their
affected range (`< 7.18.0`) covers every 6.x release. The third affects `react-router-dom`
`>= 6.30.2, <= 6.30.4` and records no patched version at all — 6.30.4 is the final release of that
line and is still inside the range.

Upgrading to 6.30.4 was worth doing anyway: it cleared a fourth advisory, GHSA-2j2x-hqr9-3h42, which
_is_ patched at 6.30.4. That is as far as the 6.x line goes.

**The only remediation is migrating to `react-router` v7**, which is an API change on a direct
dependency used throughout the routing layer — a change with its own testing, not a dependency bump.
It is deliberately out of scope here so that a dependency pass does not become a routing refactor.

**Revisit when:** the v7 migration is scheduled. Anyone picking it up should go **straight to v7** —
stopping anywhere on 6.x lands back on these three.

### `elliptic` — GHSA-848j-6mx2-7j84

The advisory affects every published version (`<= 6.6.1`), and 6.6.1 is the latest release. There is
no version to upgrade to and no range that avoids it. Reached transitively through the crypto
polyfills used by the browser build.

**Revisit when:** a release above 6.6.1 is published, or the consumer that pulls it in stops needing
it.

### `eslint` — GHSA-p5wg-g6qr-c7cg

**This advisory was withdrawn on 2026-02-03.** It may still appear in scanner output, because
different databases pick up withdrawals at different times. It does not describe a real defect and
should be dismissed rather than remediated — do not upgrade `eslint` on account of it.

---

## Dependency decisions with no trace in the manifest

### Why `@dhis2/d2-i18n-extract` and `@dhis2/d2-i18n-generate` have not been replaced

Both are direct devDependencies, used by `yarn extract-pot` and `yarn localize`. Both are archived
upstream and no longer receive releases, so no fix can ever ship for them.
`@dhis2/cli-app-scripts` is the maintained equivalent.

The replacement was implemented and measured on this repository on 2026-08-04, then reverted. It is
recorded here because a remediation that was tried and rejected leaves no trace in the tree, so
without this entry the next person would repeat the work to reach the same result.

**Why it was not adopted.** `@dhis2/cli-app-scripts` cannot provide translation extraction without
the DHIS2 CLI framework underneath it, so adopting it for i18n alone pulls in a large amount of
additional build tooling. Part of that tooling is `request`, which has been deprecated since 2020 and
receives no releases. `request` depends on `uuid@^3.3.2`, and no published `uuid` version satisfies
both the advisory affecting that line and the `uuid/v4` subpath `request` imports, which was removed
in v7 — so that path cannot be resolved, scoped or upgraded.

The trade is therefore not _abandoned → maintained_. It is _two frozen packages that currently
require no constraint_ in exchange for _a maintained package that carries an abandoned chain with no
possible fix_, plus several scoped resolutions to offset the rest of what it brings in. Both
toolchains are build-time only — they run during `yarn localize` and never reach the browser bundle —
so the change in actual exposure is negligible either way, and the decision rests on maintainability
rather than risk.

Everything the archived packages currently contribute is already satisfied inside the ranges they
request: `handlebars` resolves to 4.7.9 within the `^4.0.11` that `@dhis2/d2-i18n-generate` asks for,
and `node-gettext` is scoped above. Being archived is not the same as being vulnerable — frozen code
introduces nothing new either. The exposure here is conditional, not current.

**Replace them when either becomes true:**

1. `@dhis2/cli-helpers-engine` stops depending on `request`, removing the unresolvable `uuid` path. At
   that point the replacement costs only scoped resolutions and the maintainability argument wins
   outright.
2. Either archived package requires a constraint that cannot be satisfied within the ranges it
   already requests — that is, both re-resolution and a scoped resolution fail. At that point staying
   costs more than moving.

Whoever revisits this should re-measure rather than trust the description above: it is a snapshot of
2026-08-04, and the replacement tooling moves.
