# Automated Test Suite Plan

## Purpose

This repository currently relies on manual verification plus `npm run build`. The app is now large enough that the highest-risk workflows need automated coverage, but the suite should still match the repo's deliberately simple client-side architecture:

- browser-only React app
- Firebase Web SDK for auth and persistence
- source-data parsing in the browser
- workflow logic kept local to pages and `src/utils`

The goal is to add confidence without redesigning the app into a different architecture just to make it testable.

## Current State

- `npm test` is still a placeholder and no automated tests run in CI.
- The most failure-prone logic lives in pure data transforms, not in styling.
- Several workflows depend on provider exports that are easy to regress:
  - Conviva playback parsing
  - Conviva ADK version share parsing
  - Looker ZIP and CSV normalization
  - Regional estimate allocation
  - Legacy workbook import/export
  - duplicate-detection and rollback behavior in import history

## Principles

- Start with the code that transforms business data, because it has the highest leverage and lowest setup cost.
- Prefer narrow tests around existing seams over broad rewrites.
- Never hit production Firebase from tests.
- Keep fixtures small, sanitized, and checked into the repo.
- Gate pull requests on fast deterministic checks first; run heavier browser flows separately once the harness is stable.

## Recommended Stack

| Layer | Tooling | Why it fits this repo |
|---|---|---|
| Unit + component | Jest with `babel-jest` and `jest-environment-jsdom` | Reuses the existing Babel pipeline and does not require moving the app off webpack |
| React interaction | React Testing Library + `@testing-library/user-event` | Exercises page behavior the way the app is actually used |
| Browser/network doubles | Jest module mocks first; Firebase Emulator Suite where real SDK behavior matters | Keeps most tests fast while still allowing a realistic path for save/rollback coverage |
| End-to-end smoke | Playwright | Good fit for upload-heavy browser workflows and file-based assertions |
| Coverage reporting | Jest built-in coverage | Enough for staged adoption without adding more tooling |

## Coverage Layers

### 1. Pure utility tests

This is the first milestone and should become the base of the suite.

| File | Primary behaviors to cover |
|---|---|
| `src/utils/reporting.js` | date normalization, metric classification, percent/change math, HTML-to-text/markdown conversion |
| `src/utils/conviva.js` | playback CSV reshaping, version-share parsing, mixed daily/12-hour bucketing, fallback header parsing |
| `src/utils/playback.js` | metric grouping, anomaly detection, threshold messaging, markdown/text generation |
| `src/utils/looker.js` | ZIP file role detection, pivoted vs flat Looker parsing, dataset merge, trend generation |
| `src/utils/regionalEstimates.js` | partner snapshot parsing, device-distribution parsing, allocation math, fallback region mix logic |
| `src/utils/adk.js` | core version normalization and ADK label resolution |
| `src/utils/importHistory.js` | content hashing, rollback window math, duplicate detection helpers |
| `src/utils/legacyWorkbooks.js` | workbook validation, CSV round-trip helpers, legacy snapshot generation, merged export builders |

Minimum useful first pass:

- happy-path fixtures for each file
- malformed-input tests for each parser
- one regression test for each current edge case already called out in code comments or README notes

### 2. Component and hook tests

These tests should stay focused on behavior, not snapshot churn.

| Target | Assertions |
|---|---|
| `src/components/UploadZone.js` | expected-column validation, file-selected success/error states, drag/drop path |
| `src/components/ConflictDialog.js` | shows existing/new snapshot state and dispatches keep/replace callbacks |
| `src/components/RollbackButton.js` | enables/disables correctly across rollback window states |
| `src/components/AutoSaveStatus.js` | saving, duplicate, conflict, error, and rolled-back states render correctly |
| `src/hooks/useAutoImport.js` | saved/duplicate/conflict/rollback transitions using mocked import-history functions |
| `src/hooks/useAuth.js` | allowed-domain acceptance, denied-domain sign-out path, loading fallback |

### 3. Page workflow tests

These should mount real page components with `MemoryRouter`, mocked Firebase modules, and representative fixtures.

| Route/page | Key scenarios |
|---|---|
| `PlaybackPerformance` | upload valid Conviva CSV, render metric cards, generate narrative, trigger auto-save request |
| `AdkVersionShare` | parse Conviva export, resolve ADK labels, show pie/trend outputs, handle missing mappings warning |
| `PartnerMigration` | derive current GA, treat unmapped versions as legacy, apply device and alert thresholds |
| `PlatformKpis` | load platform rows from ZIP/manual CSVs, merge with saved history, surface missing prior month guidance |
| `PartnerRegionMapping` | import mapping CSV, reject malformed rows, surface active mapping metadata |
| `LegacyWorkbookSync` | reject wrong workbook family, show import counts, surface export/rollback state |
| `History` and `SnapshotDetail` | render saved snapshots, route to details, expose rollback action only when allowed |
| `App` auth gate | unauthenticated user sees login, authenticated user sees shell and route title mapping |

### 4. End-to-end smoke tests

Keep the first browser suite intentionally small. The point is deployment confidence, not exhaustive UI coverage.

Recommended smoke flows:

1. Authenticated user reaches the dashboard.
2. Playback Performance accepts a representative Conviva file and renders analysis.
3. ADK Version Share accepts a representative Conviva export and saves a snapshot.
4. Platform KPIs accepts a representative Looker ZIP and renders platform plus regional outputs.
5. Legacy Workbook Sync imports a trusted workbook fixture and allows export.

These should run against local app builds with production Firebase replaced by test doubles or emulators.

## Fixture Strategy

Add a small checked-in fixture set under `src/test/fixtures/`:

- `conviva/playback/*.csv`
- `conviva/version-share/*.csv`
- `looker/platform/*.csv`
- `looker/platform/*.zip`
- `sentry/partner-migration/*.csv`
- `workbooks/*.xlsx`

Fixture requirements:

- sanitize any internal data before commit
- preserve the real column names and structural quirks the parsers rely on
- keep one "golden" workbook pair for export round-trip assertions
- include explicit edge-case fixtures:
  - missing required columns
  - unknown `core_version`
  - mixed Conviva timestamp granularity
  - pivoted Looker platform table
  - regional estimates with no directly mapped partners
  - duplicate import payloads

## Firebase Test Strategy

The suite should use three levels of Firebase isolation:

1. Unit and most component tests:
   - mock `src/firebase.js`
   - mock Firestore/Auth functions directly
2. Page integration tests:
   - keep mocked Firebase modules, but assert request payloads and UI state transitions
3. Browser smoke tests:
   - prefer Firebase Emulator Suite for Auth and Firestore
   - do not use live Google Sign-In in CI

To make browser tests practical, add a small auth seam in a follow-up change. The cleanest option is a test-only provider path or emulator-backed sign-in flow so Playwright can enter the app without a real Google popup.

## Rollout Phases

### Phase 1: Foundation

- add Jest + RTL infrastructure
- add fixture directories
- cover `reporting`, `conviva`, `playback`, `adk`, and `importHistory`
- replace `npm test` placeholder with the real unit/component runner

Exit criteria:

- fast local run under a few minutes
- deterministic results on every machine
- pull requests can rely on utility coverage for parsing regressions

### Phase 2: Workflow integration

- add `useAutoImport` and `UploadZone` tests
- add page tests for Playback Performance, ADK Version Share, Partner Migration, and Platform KPIs
- mock Firestore reads/writes and verify payload shape

Exit criteria:

- major upload workflows have at least one happy path and one failure path
- duplicate/conflict handling is covered without touching production Firebase

### Phase 3: Browser smoke + emulator coverage

- add Playwright
- run against local dev server or preview build
- seed test data in emulated Firestore
- verify save, history, and rollback smoke paths

Exit criteria:

- one browser smoke path exists for each major weekly/monthly workflow
- CI never depends on live Disney Google auth

### Phase 4: CI hardening

- run `npm run build` plus fast Jest suite on every pull request
- run Playwright smoke tests on merges to the main integration branch or on a scheduled job until stability is proven
- publish coverage artifacts and test reports in GitHub Actions

## Proposed Scripts And CI Shape

Planned scripts once the harness is added:

```json
{
  "test": "jest --runInBand",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage",
  "test:e2e": "playwright test",
  "test:ci": "npm run build && npm run test:coverage"
}
```

Planned pull-request checks:

- install dependencies
- run `npm run build`
- run unit/component tests
- upload coverage and failed-test artifacts

Planned heavier checks:

- Playwright smoke suite on merge or nightly while the suite is new

## Priority Test Matrix

If time is constrained, cover these first:

1. `parseConvivaPlaybackRows`
2. `parseConvivaVersionShareRows`
3. `buildPlaybackAnalysis`
4. `parseLookerZip`
5. `parseLookerMetricRows`
6. `buildRegionalEstimate`
7. `buildImportBatchId`
8. `saveImportSnapshot` and `useAutoImport` state transitions
9. `readWorkbookFile` plus workbook family validation
10. one smoke test each for Playback Performance and Platform KPIs

## Documentation And Review Expectations

Each phase should update:

- `README.md` verification and testing sections
- any workflow docs whose verification steps change
- fixture notes so future contributors know which sample files are safe to use

Peer review should focus on:

- whether the proposed stack matches the current webpack + Babel app
- whether the phase order is realistic for the highest-risk workflows
- whether emulator/auth assumptions are acceptable for CI
- which fixtures can be safely sanitized and committed

## Non-Goals For The First Rollout

- visual snapshot testing of the full app
- exhaustive Recharts DOM assertions
- live integration tests against production Firebase, Google Sign-In, Conviva, Looker, or Sentry
- broad refactors only to satisfy a testing tool
