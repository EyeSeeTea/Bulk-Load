# Dependency resolutions

Why each entry in the `resolutions` block of `package.json` exists, and when it can be removed.
`package.json` can record _what_ is constrained but not _why_, so without this file the block grows
into a set of constraints nobody knows how to maintain.

Each entry states:

-   **Why** — which dependency path requires it, and why a normal upgrade is not currently possible.
-   **Fixes** — the advisory or compatibility problem addressed.
-   **Drop when** — an observable condition under which the resolution can be removed.

Add, update or remove a resolution and its entry here in the same change.

> **The install policy is part of this, even though it lives in another file.** `.yarnrc.yml` sets
> `npmMinimalAgeGate: 7d`, `enableScripts: false`, `enableHardenedMode: true` and
> `checksumBehavior: throw`, rather than falling back to yarn's defaults, which are looser on the
> first three.
>
> **The age gate is the one that will confuse you.** It refuses releases published within the last
> week, and `yarn up -R` reports success while silently selecting one patch below the patched release
> rather than failing. That reads as _"there is no fix on this line"_ and sends you up the remediation
> ladder for nothing. Compare the version you got against the version the advisory names, not against
> the version you had — and if the gate is the blocker, wait rather than lowering it.
>
> **`enableScripts: false` makes yarn report `YN0004`** for each package whose build script it skips —
> here `esbuild` and three `core-js` variants. None of them breaks: `esbuild` ships its binary as a
> platform-specific optional package rather than fetching it in a postinstall, and `core-js`'s script
> only prints a funding message. A package that genuinely needs its postinstall would fail, so treat a
> new `YN0004` as something to check rather than as noise.

> **Ranges, not exact versions.** Almost every entry below is a _floor_ — "never below this" — so it
> takes a compatible range. An exact version is a _fixture_, used only when something binds to that
> specific release, and it should say what binds it.
>
> A floor written as an exact version stops working over time: it cannot select a patch, so it holds
> the tree on the version it was written against. `axios`, `lodash` and `qs` were all previously
> constrained to exact versions here and had to be reopened into ranges. `axios` shows the mechanism
> working once corrected: the range resolves to 1.19.0, above the version its advisories name as
> patched, because releases published later were picked up without anyone touching the entry.
>
> The same reasoning retires entries as well as writing them. If every parent's declared range already
> reaches a patched release, the floor is not what is holding the tree up and can go — see
> [Removed](#removed), where four entries were retired on that basis.

## Conventions

-   **Prefer per-parent paths (`parent/child`) over standalone descriptors.** A standalone descriptor
    rewrites the request of every consumer in the tree, including ones that were already healthy.
    Yarn-berry matches a standalone descriptor on exact text — `picomatch@npm:^4` will _not_ match a
    child request of `^4.0.2`.
-   **The version in a versioned-parent path is the _descriptor_, not the resolved version.**
    `glob@npm:7.2.3/minimatch` reads correctly next to a lockfile entry saying `version: 7.2.3`, and
    matches nothing, because the descriptors consumers actually request are `^7.1.1` and friends.
    Take the key off the descriptor line, never off the `version:` line below it. An entry written
    this way is inert from the day it is created, and yarn does not warn.
-   **A versioned-parent path cannot select a version outside the range the parent declares; a
    parent-name path can.** `vite@4.5.14` declares `rollup: ^3.27.1` and `esbuild: ^0.18.10`. A pin of
    `vite@npm:^4.0.0/rollup: ^3.30.0` binds, because 3.30.0 is inside `^3.27.1`;
    `vite@npm:^4.0.0/esbuild: ^0.25.0` silently does nothing, because 0.25.0 is outside `^0.18.10`.
    To lift a child past what its parent declares you need the parent-name form — and then check what
    else shares that parent name before using it.
-   **Versioned-parent paths also go stale silently** when the parent patch-bumps. There is no entry
    of that shape in this file; if you add one, mark it as a decay risk.
-   **Prefer re-resolution to a new constraint.** Most transitive findings are a stale lockfile rather
    than a missing fix: the declared range already admits the patched release and `yarn up -R
    <package>` reaches it with no manifest change at all.
-   **Removing a constraint is not the same as upgrading it away.** For a package no direct dependency
    requests, deleting the entry hands version selection back to the parents, and a parent may be the
    reason the old version was there. Some packages resolve _downwards_ when their entry is removed.
-   **Test a constraint by removing it, re-installing and comparing the _resolved versions_** — not
    the lockfile bytes. A constraint can rewrite a descriptor, change the lockfile, and leave every
    installed version exactly where it was.
-   **When a returning version looks alarming, check the advisory's range before keeping the pin.** An
    older version coming back is not by itself a reason to keep a constraint — `glob-parent@3.1.0`
    returns when its entry is removed, and `GHSA-ww39-953v-wcq6` affects `>= 4.0.0, < 5.1.2`.
-   **Validate the control before trusting a zero from the advisories API.** A query returns nothing
    both for a clean version and for one that was never published. `glob-parent@5.0.0` looks like a
    known-vulnerable control and returns nothing because it does not exist; `glob-parent@5.1.1` is a
    valid one.
-   **A constraint that clears the scanner but breaks a consumer is not a fix.** Verify against the
    tool that actually uses the package, not just `yarn install`.

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
-   **Compatibility was checked, not assumed.** `react-linkify` is unmaintained and written against the
    linkify-it 2 API, so forcing a major is the whole risk here. `linkify-it@5.0.2` still exports a
    callable CJS function and keeps the same `.tlds()`, `.match()` and `.test()` surface, and rendering
    `<Linkify>` produces the expected `<a href>` for both URLs and `mailto:` addresses. Re-run those
    four checks rather than trusting this note if the pinned major ever moves again.
-   **Drop when:** `@eyeseetea/d2-ui-components` drops `react-linkify` or moves to a release requesting
    a patched `linkify-it`.

---

## Inherited constraints with no recorded rationale

These entries predate this file and were added in one batch without an explanation. Each still binds
something in the tree, so they were kept rather than removed speculatively — as the `lodash` entry
above shows, removing a resolution can resolve a package _downwards_.

**They were converted from exact versions to `^` ranges on 2026-08-05.** Several were, by their own
descriptions elsewhere, security floors written in fixture shape — the form that cannot receive a
patch and eventually becomes the finding it was added to prevent. None of them was inside a live
advisory range at the time, so this is not a remediation: it removes a decay path before it opens.
Converting is also strictly narrower than pruning, which is still open and has to be judged one entry
at a time.

A `^` range keeps every consumer on the same major the exact version already forced it onto — it only
allows newer releases within that line.

| Resolution                 | Now resolves to | Note                                                                                                                                                                                                     |
| -------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@babel/runtime: ^7.26.10` | 7.29.7          | Was exact `7.26.10`; no recorded reason                                                                                                                                                                  |
| `i18next: 19.8.5`          | 19.8.5          | ⚠️ **Deliberately still exact.** Far below the current release line, and a resolution on this package can break application startup, so it is changed only deliberately and verified by starting the app |
| `moment: ^2.29.4`          | 2.30.1          | Was exact; the direct dependency was reopened to the same range, which previously contradicted it                                                                                                        |
| `nanoid: ^3.3.8`           | 3.3.18          | Was exact `3.3.8`, which held `postcss` below the `^3.3.16` it declares. ✅ **The range has since paid for itself.** GHSA-2v37-7h3g-55p8 (high) landed on 2026-08-07 affecting `< 3.3.18`; `yarn up -R nanoid` reached the patch with no manifest change, which an exact pin could not have done |
| `node-fetch: ^2.6.7`       | 2.7.0           | Was exact `2.6.7`, below the `^2.7.0` one consumer declares. Load-bearing: the tree also has a consumer on `^1.0.1`, and this floor is what lifts it onto a patched line                                 |
| `diff: ^5.2.2`             | 5.2.2           | Was exact; already the newest 5.x                                                                                                                                                                        |
| `debug: ^4.4.3`            | 4.4.3           | ⚠️ **The floor value matters here.** GHSA-4x49-vf9v-38px reports `debug@4.4.2` as carrying malware after an npm account takeover, so `^4.4.3` is the meaningful lower bound. The previous `^4.3.4` resolved to 4.4.3 in practice but would have admitted 4.4.2 |
| `ua-parser-js: ^0.7.24`    | 0.7.41          | Was exact; `^0.7.x` stays inside the 0.7 line                                                                                                                                                            |

**Drop when:** for each, confirm no consumer requires the constrained line, then remove it and
re-install, comparing **resolved versions** rather than lockfile bytes. Treat each individually — they
were added as one batch but have nothing else in common. `glob-parent` was retired on that basis —
see [Removed](#removed).

---

## Removed

> **The test is whether a resolved version moves, not whether the lockfile changes.** A byte-identical
> lockfile proves a constraint did nothing, but the reverse does not hold: a constraint can rewrite a
> descriptor, change the lockfile, and still leave every installed version exactly where it was. It can
> also add a line to the tree that is already patched, which changes the lockfile and changes nothing
> about exposure. Compare versions.

### `glob-parent: ^5.1.2` — removed 2026-08-12

The entry's own note said the tree had consumers declaring `^3.1.0` and `^6.0.1` that it pulled onto
the 5.x line. Removing it lets all three coexist:

| Version | Reached by | In an advisory range? |
| ------- | ---------- | --------------------- |
| 3.1.0 | `glob-stream@6.1.0`, declaring `^3.1.0` | no |
| 5.1.2 | eslint, chokidar, fast-glob | no |
| 6.0.2 | the `^6.0.1` consumer | no |

**The advisory decides it.** `GHSA-ww39-953v-wcq6` affects `>= 4.0.0, < 5.1.2`, so 3.1.0 sits below
its lower bound and was never in range; `GHSA-cj88-88mr-972w` affects `= 6.0.0` only, and 6.0.2 is
past it. The entry was not keeping a vulnerable version out — it was holding two consumers off the
majors they declare.

`is-glob@3.1.0` and `path-dirname@1.0.2` come back as dependencies of glob-parent 3.x. Neither has
an advisory at any version.

Verified with `yarn lint` — eslint is a direct consumer — plus the unit suite, `yarn localize`,
which is the chain that reaches the 3.1.0 copy through `i18next-scanner` → `vinyl-fs` →
`glob-stream`, and a full build.

⚠️ **Pick the control carefully when re-checking this.** `glob-parent@5.0.0` looks like a
known-vulnerable control and returns nothing, because that version was never published.
`glob-parent@5.1.1` is a valid one.

**Restore it only if** a consumer appears on a glob-parent range whose lowest satisfying version
falls inside `>= 4.0.0, < 5.1.2`.

### `path-to-regexp: 1.9.0` — removed 2026-08-04

No `path-to-regexp` entry existed in `yarn.lock`, so the constraint matched no descriptor and had no
effect. Removing it left the lockfile byte-identical, which is the evidence it was a no-op.

### `form-data: ^4.0.6` and `jszip: ^3.8.0` — removed 2026-08-05

Both were inert. Removing them and re-installing left the resolved versions unchanged — `form-data` at
4.0.6 and `jszip` at 3.10.1 — because every parent's declared range already reaches those releases:

| Package     | Ranges the parents declare | Resolves to, with or without the constraint |
| ----------- | -------------------------- | ------------------------------------------- |
| `form-data` | `^4.0.0` (×2), `^4.0.6`    | 4.0.6                                       |
| `jszip`     | `^3.2.2`, `3.10.1`         | 3.10.1                                      |

The original reasoning for `form-data` was that `@eyeseetea/d2-api` requests `^4.0.0`, "which admits
affected 4.0.x releases". True, but incomplete: `^4.0.0` admits the patched 4.0.6 as well, so
re-resolution reaches it without a constraint. Same for `jszip`, where `^3.2.2` admits 3.10.1.

**Restore either only if** a parent appears whose range cannot reach the patched line.

### `minimatch: ^3.1.4` and `brace-expansion: ^1.1.17` — removed 2026-08-05

The `minimatch` entry's own drop-when condition — _"every consumer resolves to a patched `minimatch`
on its own line without it"_ — was tested and found to be already met.

| Package           | With the constraints | Without              |
| ----------------- | -------------------- | -------------------- |
| `minimatch`       | 3.1.5                | 10.2.6 **and** 3.1.5 |
| `brace-expansion` | 1.1.18               | 1.1.18 **and** 5.0.9 |

All four releases are outside every advisory affecting them, so the security outcome is identical.
Two things made the constraints unnecessary:

-   **The 3.x line reaches the patch unaided.** The seven parents that request `minimatch` declare
    `^3.0.4`, which already admits 3.1.5. The constraint was not what lifted them above 3.1.4.
-   **`brace-expansion` only existed on the 1.x line because `minimatch` was held at 3.x.** Its sole
    requester was `minimatch@3.x` at `^1.1.7`, which admits 1.1.18. The second constraint was holding up
    the first, not a finding.

What the `minimatch` constraint _did_ do, which was not recorded: `glob@13.0.6` (under `cacache`)
requests `minimatch@^10.2.2`, and the unscoped entry pulled it down seven majors to 3.1.5. Removing it
gives that consumer the major it declared.

**Worth knowing before re-investigating this:** forcing `glob@13` onto `minimatch@3.1.5` looks like it
should break it, because `glob@13` references `minimatch.escape` and `minimatch.unescape` and neither
exists in 3.1.5. It does not break, because `glob@13`'s default entry point is
`dist/commonjs/index.min.js`, a bundle with `minimatch` inlined that never requires it at runtime —
the external copy is reachable only through the `glob/raw` subpath, which nothing here imports. So the
constraint was neither helping nor breaking anything.

Verified after removal with `yarn lint` — the tool the original entry named as the consumer — plus
type-check, the unit suite, `yarn localize` and a production build.

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

-   **Advisories against these components:** `react-router@6.30.4` has **two** open — both listed above; eighteen others exist against the package and are patched at or below 6.30.4. `react-router-dom@6.30.4` has **one**, the one listed. The counts are stated rather than implied so that a missing row reads as a gap.

### `elliptic` — GHSA-848j-6mx2-7j84

The advisory affects every published version (`<= 6.6.1`), and 6.6.1 is the latest release. There is
no version to upgrade to and no range that avoids it. Reached transitively through the crypto
polyfills used by the browser build.

**Revisit when:** a release above 6.6.1 is published, or the consumer that pulls it in stops needing
it.

-   **Advisories against this component:** **one** open — the entry above. Eight others exist against `elliptic` and are all patched at or below 6.6.1, including the critical GHSA-vjh7-7g9h-fjfh, which 6.6.1 is itself the fix for.

### `eslint` — GHSA-p5wg-g6qr-c7cg

**This advisory was withdrawn on 2026-02-03.** It may still appear in scanner output, because
different databases pick up withdrawals at different times. It does not describe a real defect and
should be dismissed rather than remediated — do not upgrade `eslint` on account of it.

-   **Advisories against this component:** **none** live against `eslint@8.57.1`. The one above is withdrawn, and one other exists against the package, patched below this version.

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
