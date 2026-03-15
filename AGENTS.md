# AGENTS.md

## 1. Repository Overview

Device Platform Reporting is an internal Disney Streaming web app for NCP+ADK KPI reporting workflows. It helps authenticated users upload CSV exports from Conviva, Sentry, and Looker, review charts/tables, save snapshots to Firestore, copy Confluence-ready output, and round-trip legacy Excel workbooks that other teams still use.

**Project type:** React SPA (webpack 5 + Babel) + Firebase Hosting/Auth/Firestore/Storage. No backend server, no Cloud Functions, no API routes. The client writes directly to Firestore.

**Stack:**
- React 19, React Router 7, functional components and hooks
- Recharts (charts), Papa Parse (CSV parsing), SheetJS/XLSX (legacy workbook import/export)
- Firebase Web SDK (auth, Firestore, storage, analytics)
- Webpack 5 + Babel

**Common commands:**
- `npm install` — install dependencies
- `npm start` — start dev server
- `npm run build` — production build to `dist/`
- `npm test` — Jest suite + tracked-file secret scan
- `npm run deploy` — deploy hosting + Firestore rules via `op-firebase-deploy`
- `npm run deploy:hosting` — hosting only

### Repo Map

| File / Directory | Purpose |
|-----------------|---------|
| `src/index.js` | React entrypoint |
| `src/App.js` | Auth gate, router, shell, page title mapping |
| `src/firebase.js` | Firebase setup and email-domain helper |
| `src/hooks/useAuth.js` | Google sign-in, sign-out, denied-domain handling |
| `src/components/Sidebar.js` | Left navigation |
| `src/components/UploadZone.js` | Shared CSV dropzone — reuse for all CSV ingestion |
| `src/pages/Dashboard.js` | Landing page and source links |
| `src/pages/Login.js` | Restricted Google sign-in page |
| `src/pages/PlaybackPerformance.js` | Weekly Conviva upload, line chart preview, Firestore save to `weeklySnapshots` |
| `src/pages/AdkVersionShare.js` | Weekly Conviva upload, ADK mapping, pie chart, history trend, save to `adkVersionShare` |
| `src/pages/PartnerMigration.js` | Weekly Sentry upload, partner legacy analysis, save to `partnerMigration` |
| `src/pages/PlatformKpis.js` | Monthly Looker upload for platform KPIs, save to `monthlySnapshots` |
| `src/pages/RegionalKpis.js` | Monthly Looker upload for regional KPIs, save to `monthlySnapshots` |
| `src/pages/AdkVersionManager.js` | Editable ADK version reference table in Firestore |
| `src/pages/LegacyWorkbookSync.js` | Imports historical `.xlsx` workbooks and exports merged replacements |
| `src/pages/History.js` | Recent snapshot browser across Firestore collections |
| `src/utils/legacyWorkbooks.js` | Workbook parsing, legacy sheet normalization, export builders |
| `src/styles.css` | All global styles |
| `firebase.json` | Firebase hosting + deploy config |
| `firestore.rules` | Firestore security rules |
| `storage.rules` | Firebase Storage security rules |
| `specs/` | Product brief and feature specs |
| `rules/` | Repository-level invariants (`repo_rules.md`) |
| `plans/` | Feature rollout and migration plans |
| `scripts/ci/` | CI enforcement scripts |
| `docs/` | Extended documentation |
| `dist/` | Webpack build output — never edit manually |

### Route Inventory

- `/` — dashboard
- `/playback-performance`
- `/adk-version-share`
- `/partner-migration`
- `/platform-kpis`
- `/regional-kpis`
- `/adk-versions`
- `/legacy-sync`
- `/history`

### Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `adkVersions` | Reference table for `core_version` → human-readable ADK label. Fields: `adkVersion`, `coreVersions` (array), `releaseDate`, `features`, `notes`, `createdAt`, `updatedAt`. |
| `weeklySnapshots` | Playback Performance weekly data. Fields: `type`, `rows`, `weekOf`, `uploadedAt`. |
| `adkVersionShare` | Weekly ADK share history. Fields: `weekOf`, `shares`, `uploadedAt`. |
| `partnerMigration` | Weekly partner migration snapshots. Fields: `weekOf`, `partners`, `uploadedAt`. Newer saves also store `rawRows`, `rawHeaders`, `sourceFileName`. |
| `monthlySnapshots` | Mixed monthly collection. `platformKpis` docs store `seriesByPlatform`, `summaryRows`. `regionalKpis` docs store `seriesByRegion`, `summaryRows`. |
| `legacyWorkbookImports` | One manifest doc per imported legacy workbook (source filename, sheet list, sheet count, import timestamp). |
| `legacyWorkbookSheets` | Sheet-level baseline for imported legacy workbooks — one doc per workbook/sheet pair with formatted CSV text. |

### Known Gaps Between Spec And Code

- The spec mentions Cloud Functions and Storage-backed upload handling. The code parses files in-browser and writes directly to Firestore.
- The spec describes stronger schema validation and richer Confluence output than the current implementation provides.
- The spec describes a broader historical data model; the app currently stores snapshot blobs, not a normalized analytics schema.

---

## 2. Agent Operating Rules

1. **Read before editing.** Read every file you will touch before proposing changes. Understand existing code first.
2. **Client-only architecture.** There are no Cloud Functions, backend services, or API routes. Do not propose backend additions unless the task explicitly requires them.
3. **Trust the source.** The product brief in `specs/NCP_ADK_KPI_Automation_Product_Brief.md` is partly aspirational. Treat source code as the real behavior.
4. **Prefer small, local changes.** Most business logic is page-local and intentionally simple. Keep changes aligned with this architecture.
5. **Reuse `UploadZone`.** Never create a separate CSV uploader — all CSV ingestion goes through `src/components/UploadZone.js`.
6. **Wire new pages in three places.** If you add a new workflow page, update `src/App.js`, `src/components/Sidebar.js`, and `src/pages/Dashboard.js`.
7. **Firestore writes use `addDoc` + `serverTimestamp()`.** No raw `setDoc` with manual timestamps.
8. **No secrets in tracked files.** `REACT_APP_FIREBASE_*` and all credentials stay in `.env` (gitignored). Run `npm test` before every commit — it includes the tracked-file secret scan.
9. **Never edit `dist/` directly.** Run `npm run build` to regenerate.
10. **Do not delete tests to make a build pass.**

### Data Flow Pattern

Most workflow pages follow the same pattern:
1. User uploads a CSV through `UploadZone`.
2. The page parses and transforms rows entirely in the browser.
3. The page renders preview UI with Recharts and/or HTML tables.
4. The page generates a Confluence-friendly text/HTML snippet with a local helper like `generateConfluence()` or `generateNotes()`.
5. Clicking "Save to History" writes a snapshot to Firestore with `addDoc(...)` and `serverTimestamp()`.

There is no shared data-processing layer. Each page owns its parsing and transformation logic locally.

### Workflow-Specific Notes

**Playback Performance:** Accepts a Conviva CSV and classifies series into Attempts, Unique Devices, VSF-T, and VPF-T from column names. Narrative generation is threshold-driven and configurable in the page UI.

**ADK Version Share:** Loads ADK mappings from `adkVersions` on mount. Maps `core_version` to ADK label. Saves computed share rows and trend data, not raw upload rows.

**Partner Migration:** Current GA is derived from the `adkVersions` entry marked current/GA. Unmapped `core_version` values are treated as legacy until the reference table is updated. Newer saves include `rawRows`, `rawHeaders`, and `sourceFileName` for legacy burn-down workbook.

**Platform KPIs:** Supports Looker ZIP upload or three manual CSV uploads. MAU, MAD, Playback Hours, and HPV merged into per-platform monthly series. Newer saves include a compact `legacyWorkbook.platform` payload for spreadsheet export.

**Regional KPIs:** Tracks four fixed regions: `DOMESTIC`, `EMEA`, `LATAM`, `APAC`. Per-region monthly series with MoM deltas and regional MAU share pie chart.

**ADK Version Manager:** Seed data defined inline as `SEED_VERSIONS`. Both ADK Version Share and Partner Migration depend on this for `core_version` mapping. Operationally important.

**Legacy Workbook Sync:** Imports two workbook families (Program Weekly KPIs, ADK Adoption Burn Down). Imported sheets stored in Firestore as historical baseline — not written into main analytics collections. Older platform snapshots saved before this feature do not contain workbook-ready partner rows.

---

## 3. Code Modification Rules

- **JavaScript style:** React 19, functional components, hooks only. No class components.
- **Routing:** React Router 7 — follow existing patterns in `src/App.js`.
- **CSV parsing:** Always `UploadZone` + `Papa.parse({ header: true, skipEmptyLines: true })`. Do not create a separate uploader.
- **Firestore writes:** `addDoc(...)` with `serverTimestamp()`. No raw `setDoc` with manual timestamps.
- **Styling:** `src/styles.css` only. No CSS modules or styled-components.
- **Charts:** `recharts` only.

### Firestore Change Checklist

If you change Firestore fields or collection names:
1. Update the writing page
2. Update `src/pages/History.js`
3. Update README docs if user-facing behavior changed

### ADK Release Checklist

If you add a new ADK release, review:
1. `SEED_VERSIONS` in `src/pages/AdkVersionManager.js`
2. `CURRENT_GA` in `src/pages/PartnerMigration.js`
3. Any README instructions that mention the current release

---

## 4. Documentation Rules

- **No duplicate documentation.** Do not redefine topics already covered in `AGENTS.md`, `DEPLOYMENT.md`, `CONTRIBUTING.md`, or `.ai_context.md` in conflicting locations.
- **Code vs. docs disagreement:** Trust the implementation first, then update documentation to match or explicitly call out the gap.
- **`rules/repo_rules.md`** is the authoritative list of structure invariants and CI checks. Do not duplicate these in other files.
- **`.claude/` must not contain instruction files.** Only machine-generated config and state (`.claude/worktrees/` is Claude Code internal state — do not edit).
- **New top-level directories** require explicit justification documented in `AGENTS.md` or a `plans/` entry.

---

## 5. Testing Requirements

- Run `npm run build` after code changes — build must succeed.
- Run `npm test` before every commit — includes tracked-file secret scan.
- The test suite is selective, not comprehensive. If you modify parsing or chart logic, test the affected route manually with representative CSVs.
- Since there is no comprehensive automated test suite, leave clear notes in your final response about what was and was not manually verified.
- **Tests must not be deleted to force a build to pass.**

### CI Scripts

Run these before opening a PR:

```bash
scripts/ci/check_required_root_files
scripts/ci/check_no_tool_folder_instructions
scripts/ci/check_no_forbidden_top_level_dirs
scripts/ci/check_dist_not_modified
scripts/ci/check_spec_test_alignment
scripts/ci/check_duplicate_docs
```

---

## 6. Deployment Process

Deploy requires `firebase-tools`, Google Cloud SDK (`gcloud`), the local `gcloud` wrapper, and access to impersonate `firebase-deployer@device-platform-reporting.iam.gserviceaccount.com`.

```bash
# Full deploy (hosting + Firestore rules)
npm run deploy

# Hosting only
npm run deploy:hosting
```

Both commands wrap `op-firebase-deploy` for non-interactive Firebase/GCloud auth via short-lived service account impersonation. No `firebase login` or routine browser prompts are required once the shared 1Password-backed `Private/GCP ADC` source credential is in place.

The 1Password-first deploy-auth model is a deliberate repository invariant. Do not switch this repo back to ADC-first, routine browser-login, `firebase login`, or long-lived deploy-key auth without explicit human approval.

**First-time setup:**
```bash
op-firebase-setup device-platform-reporting
```
Creates `firebase-deployer@device-platform-reporting.iam.gserviceaccount.com`, grants deploy roles, grants your user impersonation rights, and creates a dedicated `gcloud` config.

**Environment variables:** Firebase config lives in local `.env` (gitignored). Source it before build or deploy:
```bash
source .env
npm run build
```

See `DEPLOYMENT.md` for full rollback procedure and credential rotation playbook.
