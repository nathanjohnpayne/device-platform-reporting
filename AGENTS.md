# AGENTS.md

## Purpose

This repository is a small, single-page React app for Disney Streaming's NCP+ADK KPI reporting workflow. It helps authenticated users upload CSV exports from Conviva, Sentry, and Looker, review charts/tables, save snapshots to Firestore, and copy Confluence-ready output.

The codebase is intentionally simple. Keep changes aligned with the existing client-side architecture unless the task explicitly asks for a larger redesign.

## Ground Truth

- The implemented app is client-only: React + webpack + Firebase Hosting/Auth/Firestore/Storage.
- There are no Cloud Functions, API routes, backend services, or server-side CSV processors in this repo.
- The product brief in [`specs/NCP_ADK_KPI_Automation_Product_Brief.md`](/Users/nathanpayne/GitHub/device-platform-reporting/specs/NCP_ADK_KPI_Automation_Product_Brief.md) is partly aspirational. Treat the source code as the real behavior.
- `npm test` is a placeholder that prints `no tests`. Do not assume test coverage exists.

## Stack

- React 19
- React Router 7
- Recharts for charting
- Papa Parse for CSV parsing
- Firebase Web SDK for auth, Firestore, storage, analytics
- Webpack 5 + Babel

## Common Commands

- Install deps: `npm install`
- Start dev server: `npm start`
- Production build: `npm run build`
- Deploy hosting + rules: `firebase deploy`

## Environment And Firebase

- Firebase initialization lives in [`src/firebase.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/firebase.js).
- The app expects `REACT_APP_FIREBASE_*` variables for at least `API_KEY`, `APP_ID`, and `MEASUREMENT_ID`.
- Use [`.env.example`](/Users/nathanpayne/GitHub/device-platform-reporting/.env.example) as the starting point for local Firebase config.
- Allowed login domains are enforced in both client code and Firebase rules:
  - `disney.com`
  - `disneystreaming.com`

## Repo Map

- [`src/index.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/index.js): React entrypoint.
- [`src/App.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/App.js): auth gate, router, shell, page title mapping.
- [`src/firebase.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/firebase.js): Firebase setup and email-domain helper.
- [`src/hooks/useAuth.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/hooks/useAuth.js): Google sign-in, sign-out, denied-domain handling.
- [`src/components/Sidebar.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/components/Sidebar.js): left navigation.
- [`src/components/UploadZone.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/components/UploadZone.js): shared CSV dropzone; parses with `Papa.parse({ header: true, skipEmptyLines: true })`.
- [`src/pages/Dashboard.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/Dashboard.js): landing page and source links.
- [`src/pages/Login.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/Login.js): restricted Google sign-in page.
- [`src/pages/PlaybackPerformance.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/PlaybackPerformance.js): weekly Conviva upload, line chart preview, Firestore save to `weeklySnapshots`.
- [`src/pages/AdkVersionShare.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/AdkVersionShare.js): weekly Conviva upload, ADK mapping, pie chart, history trend, save to `adkVersionShare`.
- [`src/pages/PartnerMigration.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/PartnerMigration.js): weekly Sentry upload, partner legacy analysis, save to `partnerMigration`.
- [`src/pages/PlatformKpis.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/PlatformKpis.js): monthly Looker upload flow for platform KPIs, save to `monthlySnapshots`.
- [`src/pages/RegionalKpis.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/RegionalKpis.js): monthly Looker upload flow for regional KPIs, save to `monthlySnapshots`.
- [`src/pages/AdkVersionManager.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/AdkVersionManager.js): editable ADK version reference table in Firestore.
- [`src/pages/History.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/History.js): recent snapshot browser across Firestore collections.
- [`src/styles.css`](/Users/nathanpayne/GitHub/device-platform-reporting/src/styles.css): all global styles.
- [`firebase.json`](/Users/nathanpayne/GitHub/device-platform-reporting/firebase.json), [`firestore.rules`](/Users/nathanpayne/GitHub/device-platform-reporting/firestore.rules), [`storage.rules`](/Users/nathanpayne/GitHub/device-platform-reporting/storage.rules): hosting and Firebase security config.

## Route Inventory

- `/`: dashboard
- `/playback-performance`
- `/adk-version-share`
- `/partner-migration`
- `/platform-kpis`
- `/regional-kpis`
- `/adk-versions`
- `/history`

## Data Flow Pattern

Most workflow pages follow the same pattern:

1. User uploads a CSV through `UploadZone`.
2. The page parses and transforms rows entirely in the browser.
3. The page renders preview UI with Recharts and/or HTML tables.
4. The page generates a Confluence-friendly text/HTML snippet with a local helper like `generateConfluence()` or `generateNotes()`.
5. Clicking "Save to History" writes a snapshot directly to Firestore with `addDoc(...)` and `serverTimestamp()`.

There is no shared data-processing layer. Each page owns its parsing and transformation logic locally.

## Firestore Collections

Current collection usage in code:

- `adkVersions`
  - Used as a reference table for `core_version` -> human-readable ADK label.
  - Typical fields: `adkVersion`, `coreVersions` (array), `releaseDate`, `features`, `notes`, `createdAt`, `updatedAt`.
- `weeklySnapshots`
  - Currently used by Playback Performance.
  - Typical fields: `type`, `rows`, `weekOf`, `uploadedAt`.
- `adkVersionShare`
  - Weekly ADK share history.
  - Typical fields: `weekOf`, `shares`, `uploadedAt`.
- `partnerMigration`
  - Weekly partner migration snapshots.
  - Typical fields: `weekOf`, `partners`, `uploadedAt`.
- `monthlySnapshots`
  - Mixed collection for monthly flows.
  - `platformKpis` docs store computed `seriesByPlatform`, `summaryRows`, and row counts.
  - `regionalKpis` docs store computed `seriesByRegion`, `summaryRows`, and row counts.

## Important Workflow Details

### Playback Performance

- Accepts a Conviva CSV and classifies series into Attempts, Unique Devices, VSF-T, and VPF-T from the column names.
- Narrative generation is threshold-driven and configurable in the page UI.
- Firestore saves raw parsed rows plus the generated narrative/threshold snapshot.

### ADK Version Share

- Loads ADK mappings from `adkVersions` on mount.
- Maps `core_version` values to the configured ADK label.
- Saves computed share rows and trend data, not raw upload rows.
- Historical trend reads a bounded set of saved entries and prefers numeric `pctValue` data when present.

### Partner Migration

- Current GA is derived from the `adkVersions` entry marked current/GA, with release date as fallback.
- Minimum-device and legacy alert thresholds are configurable in the page UI.
- Unmapped `core_version` values are intentionally treated as legacy until the reference table is updated.

### Platform KPIs

- Supports either a Looker ZIP upload or three manual CSV uploads.
- MAU, MAD, Playback Hours, and HPV are merged into a single per-platform monthly series with MoM output.
- Firestore stores computed monthly series, not the raw Looker uploads.

### Regional KPIs

- Tracks four fixed regions: `DOMESTIC`, `EMEA`, `LATAM`, `APAC`.
- Each uploaded CSV is normalized into a monthly per-region series.
- The page renders region totals, MoM deltas, and the regional MAU share pie chart.

### ADK Version Manager

- Seed data is defined inline as `SEED_VERSIONS`.
- The manager is operationally important because both ADK Version Share and Partner Migration depend on it for `core_version` mapping.
- Add/edit flow warns on duplicate `core_version` mappings and previews how the entry will be interpreted by downstream workflows.

## Known Gaps Between Spec And Code

- The spec mentions Cloud Functions and Storage-backed upload handling. The code parses files in-browser and writes directly to Firestore.
- The spec describes stronger schema validation and richer Confluence output than the current implementation provides.
- The spec describes a broader historical data model; the app currently stores snapshot blobs, not a normalized analytics schema.

## Editing Guidance

- Prefer small, local changes. Most business logic is page-local and simple.
- Reuse `UploadZone` for CSV ingestion instead of creating another uploader.
- Preserve the existing visual language unless a design task explicitly asks for a redesign.
- If you add a new workflow page, wire it in all of these places:
  - [`src/App.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/App.js)
  - [`src/components/Sidebar.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/components/Sidebar.js)
  - [`src/pages/Dashboard.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/Dashboard.js)
- If you change Firestore fields or collection names, update:
  - the writing page
  - [`src/pages/History.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/History.js)
  - README docs if user-facing behavior changed
- If you add a new ADK release, review:
  - `SEED_VERSIONS` in [`src/pages/AdkVersionManager.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/AdkVersionManager.js)
  - `CURRENT_GA` in [`src/pages/PartnerMigration.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/pages/PartnerMigration.js)
  - any README instructions that mention the current release

## Verification Expectations

- At minimum, run `npm run build` after code changes.
- If you modify parsing or chart logic, test the affected route manually with representative CSVs if available.
- Since there is no real automated test suite, leave clear notes in the final response about what you did and did not verify.

## Documentation Priority

When code and docs disagree, trust the implementation first, then update documentation to match or explicitly call out the gap.
