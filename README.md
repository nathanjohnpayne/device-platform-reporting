# NCP+ADK Program Weekly KPIs

Disney Streaming · Partnerships & Devices  
Firebase web app for generating weekly and monthly KPI reports for the ADK Program meeting.

---

## What it does

Replaces 30–45 minutes of manual Monday-morning work with a 5-minute upload-and-copy workflow.

| Workflow | Frequency | Source | What it generates |
|---|---|---|---|
| Playback Performance | Weekly | Conviva CSV | VSF-T, VPF-T, Attempts, Unique Devices charts + narrative |
| ADK Version Share | Weekly | Conviva CSV | Latest-snapshot pie chart, 30-day trend, % breakdown per ADK version |
| Partner Migration | Weekly | Sentry CSV | Partner migration table, configurable legacy threshold, notes block |
| Platform & Regional KPIs | Monthly | Looker ZIP / CSV | Platform MAU, MAD, Playback Hours, HPV plus estimated regional MAU, MAD, and Playback Hours |
| ADK Version Manager | Admin | Firestore | Add/edit ADK version → core_version mappings |
| Partner Region Mapping | Admin | Google Sheet CSV + Firestore | Import Sheet 1 partner/country/region mapping used by the regional estimation model |
| Legacy Workbook Sync | Admin | Excel + Firestore | Import historical Google Sheets workbooks and export merged replacement `.xlsx` files |

---

## Firebase project

| Field | Value |
|---|---|
| Project name | NCP ADK Program Weekly KPIs |
| Project ID | device-platform-reporting |
| Project number | 741928725277 |
| Auth | Google Sign-In — @disney.com and @disneystreaming.com only |
| Analytics | Google Analytics (enabled) |

---

## First-time setup

### 1. Prerequisites

```
Node.js 18+
npm 9+
Firebase CLI: npm install -g firebase-tools
Google Cloud SDK (`gcloud`) for deploy auth bootstrap / ADC refresh
1Password desktop app + 1Password CLI (`op`) for deployers
```

### 2. Clone / unzip the project

```
cd adk-kpi-app
npm install
```

### 3. Add Firebase config

```
cp .env.example .env
```

Open `.env` and fill in your values from:
**Firebase Console → Project Settings → General → Your apps → SDK setup → Config**

Required values:
- `REACT_APP_FIREBASE_API_KEY`
- `REACT_APP_FIREBASE_APP_ID`
- `REACT_APP_FIREBASE_MEASUREMENT_ID`

The other values (auth domain, project ID, etc.) are pre-filled for `device-platform-reporting`.
`.env` is gitignored. Keep real values there, not in tracked source files.

### 4. Enable Firestore

Firebase Console → Firestore Database → Create database → **Production mode** → choose a region (us-central1 recommended).

### 5. Enable Storage (optional — for future file uploads)

Firebase Console → Storage → Get started → Production mode.

### 6. Build and deploy

```bash
# One-time per project for deploy maintainers
op-firebase-setup device-platform-reporting

set -a
source .env
set +a
npm run build
npm run deploy
```

The app will be live at: `https://device-platform-reporting.web.app`

`npm run deploy` uses `op-firebase-deploy`, which reads deploy auth from 1Password instead of requiring `firebase login`.

---

## Local development

```bash
set -a
source .env
set +a
npm start
# → http://localhost:3000
```

Note: Google Sign-In requires the domain to be in the authorized list.  
Add `localhost` in Firebase Console → Authentication → Settings → Authorized domains.

## 1Password deploy and secret flow

- Deploy maintainers should install `op`, sign into 1Password, and have access to the `Private` vault.
- `op-firebase-setup device-platform-reporting` creates the deployer service account and stores its JSON key in `Private/Firebase Deploy - device-platform-reporting`.
- `npm run deploy` / `npm run deploy:hosting` call `op-firebase-deploy`, which uses that per-project item first and falls back to `Private/GCP ADC`.
- If `Private/GCP ADC` is used and expires, refresh it with `gcloud auth application-default login --project=device-platform-reporting` and update the item with `op item edit "GCP ADC" --vault Private "credential=$(cat ~/.config/gcloud/application_default_credentials.json)"`.
- For future APIs or services, keep committed templates only, for example `.env.tpl` or `config.runtime.tpl`, with `op://Private/<item>/<field>` references. Resolve them at deploy time with `op inject -i <template> -o <gitignored-file> -f`.

---

## Current architecture

- Client-only React app hosted on Firebase Hosting
- CSV and ZIP processing happens in the browser
- Firebase Authentication + Firestore provide auth and persistence
- No Cloud Functions or backend ingestion pipeline in this repo

---

## ADK Version Manager — first run

1. Navigate to **ADK Version Manager** in the sidebar.
2. Click **Seed Initial Data** to load all known ADK versions (3.0 through 3.1.1).
3. When ADK 4.0 ships (GA: 23 Mar 2026), click **+ Add ADK Version**:
   - ADK Version: `ADK 4.0`
   - core_version strings: paste the exact string from the Sentry export (check Sentry after GA ships)
   - Release Date: `2026-03-23`
   - Notes: `Current GA`

---

## Monday morning workflow (weekly)

**Time: ~5 minutes, before the 10:00 AM PT meeting**

1. **Playback Performance** — Export CSV from [Conviva Playback Performance](https://pulse.conviva.com/app/custom-dashboards/dashboard/48643?data-source=ei) (last 30 days) → upload → review the four metric sections and generated narrative → copy to Confluence.
2. **ADK Version Share** — Export CSV from [Conviva ADK Version Comparisons](https://pulse.conviva.com/app/custom-dashboards/dashboard/28764?data-source=ei) (last 30 days) → upload → review latest pie chart and 30-day trend → copy to Confluence.
3. **Partner Migration** — Export CSV from [Sentry ADK Partner–Device Combinations](https://disney.my.sentry.io/organizations/disney/explore/discover/results/?field=partner&field=device&field=core_version&field=count_unique%28device_id%29&field=count%28%29&sort=-count_unique_device_id&statsPeriod=24h) (last 24h, tabular view) → upload → adjust thresholds if needed → copy notes to Confluence.

---

## Monthly workflow

**Run at the end of each month**

1. **Partner Region Mapping** — Open the shared [Partner Country + Region mapping sheet](https://docs.google.com/spreadsheets/d/1gla_k5-dERGc10XwS1R56E_69FAFreXRjVso_LEuYoU/edit?gid=0#gid=0), update **Sheet 1**, export Sheet 1 as CSV, and upload it in the app whenever the mapping changes. The optional `dashboard_aliases` column is the approved way to map non-1:1 Looker partner labels.
2. **Platform & Regional KPIs** — Download the zip from [Looker D+ Device Health Dashboard](https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust) (Device Family=rust, last complete month) and upload it directly. The page still supports manual upload of `active_accounts.csv`, `active_devices.csv`, and `playback_hours.csv` as a platform-only fallback.
3. The combined monthly page saves the platform KPI snapshot to `monthlySnapshots` and, when the zip also includes `active_accounts_(data).csv`/`active_accounts.csv`, `playback_hours_(data).csv`/`playback_hours.csv`, `regional_device_distribution.csv`, and `average_daily_active_devices.csv`, it also derives estimated regional MAU, MAD, and Playback Hours from the same import.
4. Regional output is an **estimation model, not a ground-truth geographic attribution model**. Directly region-coded partners stay assigned to those regions. Global or unmapped partners are redistributed proportionally from the observed mix of directly mapped partners, which can bias results if the unmapped/global partner base has a different regional footprint.
5. If the Looker export only contains one month, the page compares the current month against the most recent saved platform snapshot and the most recent saved regional estimate history available in Firestore.

---

## Legacy workbook round-trip

Use **Legacy Workbook Sync** in the sidebar when you need to keep the historical Google Sheets up to date for teams that still rely on them.

1. Import the current copies of:
   - `NCP+ADK Program Weekly KPIs.xlsx`
   - `ADK Adoption Burn Down 2025.xlsx`
2. Continue importing data through the normal app workflows. Weekly and monthly imports save automatically.
3. Export merged replacement workbooks whenever you need to refresh the legacy Google Sheets.

Notes:
- Imported workbook sheets are stored in Firestore as the historical baseline. New workbook imports are versioned so the latest baseline can be rolled back to the previous import within 90 days.
- Workflow auto-saves dedupe by dataset content, not filename, so re-exporting the same source data under a new filename is still treated as already imported.
- Import only trusted internal workbook exports. The app reads each spreadsheet locally in the browser and stores sheet contents in Firestore as the export baseline.
- New **Partner Migration** saves now retain the raw Sentry rows needed to recreate Discover tabs in the burn-down workbook.
- New **Platform & Regional KPI** saves retain the partner-level workbook row data needed to rebuild the legacy monthly tabs, and newer saves embed the regional estimation payload used to rebuild the legacy regional tab.
- Older platform snapshots saved before this feature do not contain that partner-level workbook payload, so import the legacy workbook first if you need complete monthly history.

---

## Firestore data structure

```
adkVersions/          — ADK version reference table (editable in app)
partnerRegionMappings/ — Imported Sheet 1 partner/country/region mapping rows keyed by normalized partner identity
partnerRegionMappingMeta/ — Metadata for the currently active mapping import
weeklySnapshots/      — Playback Performance uploads + generated narrative snapshot
adkVersionShare/      — Weekly ADK version share history and saved trend data
partnerMigration/     — Weekly partner migration snapshots + thresholds used
monthlySnapshots/     — Computed monthly platform KPI series plus embedded regional estimate payloads for newer combined saves
importBatches/        — Auto-save batch metadata used for duplicate detection and rollback
legacyWorkbookImports/ — Workbook import manifests (latest imported source file + sheet list)
legacyWorkbookImportBatches/ — Versioned legacy workbook import metadata used for rollback
legacyWorkbookSheets/  — Sheet-level historical workbook baseline used for export
```

---

## Verification

```bash
npm test
npm run build
```

Notes:
- `npm test` now runs Jest coverage for the core utility layer plus initial DOM tests for `UploadZone` and `PlatformKpis`.
- The broader rollout plan still lives in [`specs/Automated_Test_Suite_Plan.md`](./specs/Automated_Test_Suite_Plan.md).
- Production builds currently emit webpack bundle-size warnings, but they complete successfully.

---

## Automated testing roadmap

This repo now ships a small automated unit test harness, and the remaining rollout is documented in [`specs/Automated_Test_Suite_Plan.md`](./specs/Automated_Test_Suite_Plan.md).

Summary:
- Start with Jest because the app already uses Babel and webpack.
- The current suite covers the highest-risk pure utilities first (`importHistory`, `looker`, `partnerRegionMapping`, `regionalEstimates`) and now includes initial DOM behavior coverage for `UploadZone` and `PlatformKpis`.
- Add page-level workflow tests next with mocked Firebase modules.
- Add a small Playwright smoke suite only after the fast test layer is stable, ideally against Firebase emulators or a test-only auth seam instead of live Google Sign-In.

Planned pull-request gate once implemented:

```bash
npm run build
npm test
```

---

## Security

- Firestore and Storage rules restrict all access to authenticated @disney.com and @disneystreaming.com users.
- Domain enforcement happens both in the Firebase Auth layer (client-side) and in Firestore security rules (server-side).
- Auto-saved workflow imports, legacy workbook baselines, and rollback metadata are creator-owned for delete/rollback paths. The shared 90-day rollback window is enforced from Firestore server timestamps.
- No data is publicly readable.

### Firebase web config hygiene

- The Firebase Web API key is not the auth boundary, but it still should not live in tracked source or public bundles longer than necessary. Public exposure creates abuse and alerting risk.
- Keep live Firebase values in local `.env` only. [`src/firebase.js`](/Users/nathanpayne/GitHub/device-platform-reporting/src/firebase.js) should contain code paths and defaults, not real keys.
- Keep browser-key restrictions enabled in Google Cloud Credentials.
- If the key is exposed: remove it from source/history, create a replacement key with the same referrer/API restrictions, update `.env`, source the file, rebuild/redeploy, verify the live bundle, then delete the old key.
- `npm test` now includes a tracked-file secret scan so committed API keys, OAuth tokens, and private keys fail the normal test run.

---

## Phase 2 (future)

- API integrations with Conviva Pulse, Looker, and Sentry — replacing CSV uploads with automated ingestion.
- Scheduled Sunday-night data pull so the report is ready before 9:00 AM PT Monday.
- Executive deck data (PlayStation, Xbox, BBD, Roku) for P&D quarterly decks.
- Confluence API write-back.
