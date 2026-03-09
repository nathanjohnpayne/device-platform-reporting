# NCP+ADK Program Weekly KPI Automation System

**Product Brief** · Partnerships & Devices — Native Client Platform / ADK · Disney Streaming  
March 2026 · v1.0 · Author: Nathan Payne

---

> **TL;DR:** A Firebase web application that accepts CSV exports from Conviva, Looker, and Sentry; processes them into charts, KPI tables, and narrative copy; maintains a historical data store; and generates ready-to-paste content for the weekly ADK Program meeting Confluence page — replacing 30–90 minutes of manual work every Monday morning.

---

## 1. Problem Statement

The NCP+ADK Program Weekly KPIs process is entirely manual. Each Monday morning before the 10:00 AM PT program meeting, a PM must:

- Pull CSV exports and screenshots from three separate systems (Conviva, Looker, Sentry).
- Transcribe data by hand into a Google Sheets workbook, building charts manually.
- Copy charts and narrative bullets into Confluence.
- Map raw Sentry "core_version" strings to human-readable ADK versions using a separate reference table.
- Perform a monthly superset of the same steps for Platform and Regional KPIs.

**Time cost:** 30–45 minutes weekly, 60+ minutes monthly. The work must be completed between ~9:00 AM and 10:00 AM PT, under deadline pressure, with no tolerance for transcription errors that would be visible to program leadership in the meeting.

**Risk profile:** Single point of failure (one person owns the process). No documented recovery path if that person is unavailable. All data dependencies are undocumented in the tooling itself — they live in a How-To document and tribal knowledge.

---

## 2. Goals

### Primary Goal (Phase 1)

Eliminate the manual weekly and monthly KPI preparation process by building a web application that:

- Accepts CSV exports dropped by the user from Conviva, Looker, and Sentry.
- Processes, validates, and stores data in a shared, persistent historical store.
- Generates all charts, KPI tables, ADK Version Share breakdowns, and narrative copy automatically.
- Outputs content formatted for direct insertion into the Confluence weekly report.
- Is accessible to any authenticated Disney Streaming team member, so coverage is never dependent on one person.

### Secondary Goal (Phase 2)

Replace manual CSV exports with direct API integrations from Conviva, Looker, and Sentry, enabling fully automated data ingestion on a schedule. Extend the data model to support additional platform data (PlayStation, Xbox, BBD) for executive deck generation.

### Success Metrics

| Metric | Target |
|---|---|
| Weekly prep time | < 5 minutes (upload CSVs, review outputs, copy to Confluence) |
| Monthly prep time | < 10 minutes |
| On-call coverage | Any authenticated @disney.com or @disneystreaming.com user can complete the workflow |
| Error rate | Zero manual transcription errors |
| Historical continuity | Jan 2024 data imported at launch; no gaps in the time series |

---

## 3. Users & Access Model

### Authentication

Firebase Authentication with Google Sign-In, restricted to @disney.com and @disneystreaming.com accounts. No public access.

### User Roles (Phase 1)

All authenticated users have identical access: read, write, and edit permissions across all data and workflows. There are no admin-only tiers in Phase 1. The ADK Version table is editable by any logged-in user.

### Firebase Project

| Field | Value |
|---|---|
| Project Name | NCP ADK Program Weekly KPIs |
| Project ID | device-platform-reporting |
| Project Number | 741928725277 |
| Auth Provider | Google Sign-In (enabled) |
| Analytics | Google Analytics (enabled) |
| Allowed Domains | @disney.com, @disneystreaming.com |

---

## 4. Data Sources

### Phase 1: Manual CSV Export (Upload to App)

All three data sources support CSV export. In Phase 1 the user exports CSVs from each system and uploads them via the application interface. The app validates the schema of each upload before processing.

| Source | Data | Export Format | Dashboard |
|---|---|---|---|
| Conviva | Playback Performance (VSF-T, VPF-T, Attempts, Unique Devices) | CSV export from dashboard | NCP+ADK: Playback Performance Comparisons |
| Conviva | ADK Version Share (Unique Devices by core_version) | CSV export from dashboard | NCP+ADK: ADK Version Comparisons (D+) |
| Looker | Platform KPIs (Active Accounts, Active Devices, Playback Hours) | CSV download (zip) | D+ Device Health & Status Dashboard V2.0 |
| Looker | Regional KPIs (APAC, Domestic, EMEA, LATAM) | CSV download (zip), one per region | D+ Device Health & Status Dashboard V2.0 |
| Sentry | ADK Partner-Device Combinations (partner, device, core_version, unique device count) | CSV export from tabular view | ADK Partner – Device Combinations |

### Phase 2: API Integrations

Replace CSV uploads with automated data pulls from the Conviva Pulse API, Looker API, and Sentry API. Enable scheduled ingestion (Sunday night) so the report is ready before 9:00 AM PT Monday. Expand the data model to include PlayStation, Xbox, and BBD platform data to support executive reporting.

### ADK Version Reference Table

A user-editable lookup table maps Sentry's raw "core_version" strings (e.g., "42.16") to human-readable ADK version labels (e.g., "ADK 3.1.1"). This table is stored in Firestore and editable in the app by any authenticated user. Initial data imported from the Confluence ADK Versions page.

| ADK Version | Core + NVE Version | Release Date | Features / Notes |
|---|---|---|---|
| 3.1.1 | m5 Core 42.16, NVE Plugin 4.3.13 | 03 Sep 2024 | nve_plugin crash fix, crash reporting fix, subtitle display, root cert update |
| 3.1.0 | 42.15 & NVE 4.3.12 | 29 Mar 2024 | Encrypted audio, CNS |
| 3.0.1 | 42.7.1 + NVE 4.2.13/14/15/21 | 27 Jul 2023 | Core patch: Background Mode segfault fix |
| 3.0 | 42.7.0 + NVE 4.2.15 | 28 Apr 2023 | See Confluence: ADK 3.0 Scope Overview |
| 2.1.2 | 1.2.6* | 13 Jun 2022 | QoE telemetry fixes |
| 2.1.1 | 1.2.5* | 18 Mar 2022 | Bug fixes, stability enhancements |
| 2.1 | 1.2.5 + nve.2.1.17 + crate-2.0.4 | 24 Jan 2022 | Live video support, Star+ support |
| 2.0 | v1.2.4, NVE v2.1.12 | 27 Oct 2021 | Star+ support including Live TV (not released) |

Rows are editable in the application. New ADK versions should be added when a GA release is declared.

---

## 5. Feature Specification

### 5.1 Weekly Workflow: Playback Performance

**Source:** Conviva — NCP+ADK: Playback Performance Comparisons dashboard, last 30 days.

**Current process:** Screenshot top 4 charts. Manually write narrative bullets. Paste image + bullets into Confluence.

**Automated process:**

- User exports CSV from Conviva and uploads to app.
- App ingests: Attempts, Unique Devices with Attempts, VSF-T (%), and VPF-T (%) — broken out by platform (PlayStation, Xbox, STB, Vega OS) and by ADK version (3.0.1, 3.1.0, 3.1.1).
- App renders four interactive charts matching the Conviva dashboard layout.
- App generates narrative copy using templated language flagging: highest VSF-T platform/version, highest VPF-T platform, any week-over-week anomalies exceeding a configurable threshold.
- User reviews, edits narrative if needed, and copies the formatted HTML block to Confluence.

### 5.2 Weekly Workflow: ADK Version Share

**Source:** Conviva — NCP+ADK: ADK Version Comparisons (D+) dashboard, last 30 days.

**Current process:** Screenshot "Unique Devices With Attempts" chart. Mouse over previous day's data point. Manually transcribe values into Google Sheets. Build pie chart. Download and paste into Confluence.

**Automated process:**

- User exports CSV from Conviva and uploads to app.
- App maps core_version values to ADK version labels using the ADK Version Reference Table.
- App calculates share percentages: unique device count per ADK version ÷ total unique device count.
- App renders a pie chart (ADK 3.0.1 / 3.1.0 / 3.1.1) and a line chart of Unique Devices with Attempts over time.
- App appends a new row to the ADK Version Share historical time series.
- User copies formatted output (chart image + percentage summary) to Confluence.

### 5.3 Weekly Workflow: Partners Not Fully Migrated

**Source:** Sentry — ADK Partner–Device Combinations, last 24 hours.

**Current process:** Export CSV. Add ADK Version column. Filter by count_unique_device_id ≥ 100. Build pivot table. Identify partners with legacy versions. Calculate legacy percentage. Enter into Confluence notes.

**Automated process:**

- User exports CSV from Sentry and uploads to app.
- App joins core_version against the ADK Version Reference Table.
- App filters to count_unique_device_id ≥ 100, then groups by partner and ADK version.
- App identifies any partners with devices on versions older than the current GA.
- For each lagging partner, app calculates legacy device percentage and flags it with a configurable threshold (default: any legacy share > 0%).
- App renders a partner migration table and generates a pre-written notes block for Confluence.

### 5.4 Monthly Workflow: Platform KPIs

**Source:** Looker — D+ Device Health & Status Dashboard V2.0, Device Family = rust, last complete month.

**Metrics tracked:** Monthly Active Users (MAU), Monthly Active Devices (MAD), Total Playback Hours, Hours per Viewer (HPV) — by platform (PlayStation, Xbox, ADK).

**Automated process:**

- User downloads CSV zip from Looker and uploads to app.
- App extracts and validates CSVs: active_accounts, active_devices, playback_hours, average_daily_* series.
- App appends new month row to each historical time series.
- App computes MoM % change for each metric and platform.
- App renders KPI summary table (matching format in the Confluence report) and trend charts.
- User copies formatted table block to Confluence — Business KPIs / Program KPIs (D+) sections.

### 5.5 Monthly Workflow: Regional KPIs

**Source:** Looker — same dashboard as Platform KPIs, filtered by Region (APAC, Domestic, EMEA, LATAM).

**Metrics tracked:** MAU, MAD, Playback Hours per region, with MoM %.

**Automated process:**

- User downloads one CSV per region from Looker and uploads to app.
- App builds Regional KPIs table: four regions × three metrics × MoM % — matching the existing format.
- App updates the regional pie chart showing distribution of MAU by region.
- App appends to the Regional KPIs historical sheet.
- User copies output to the Regional KPIs section of the Confluence page.

### 5.6 ADK Version Manager

A dedicated management screen in the application allows any authenticated user to:

- View all ADK versions with their core_version strings, release dates, and features.
- Add a new ADK version (required when a GA release is declared).
- Edit existing version entries (e.g., correct a core_version mapping or update feature notes).
- See a preview of how a new version will appear in the automated partner migration analysis.

Changes are persisted to Firestore immediately and reflected in all subsequent processing runs.

### 5.7 Historical Data Store

All processed data is stored in Firestore and organized by metric and date. The following time series are maintained:

- Active Users (MAU) by platform and partner — monthly, from January 2024
- Active Devices (MAD) by platform and partner — monthly, from January 2024
- Total Playback Hours by platform and partner — monthly, from January 2024
- Hours per Active (HPA/HPV) by platform — monthly, from January 2024
- ADK Version Share (% of unique devices per ADK version) — weekly, from January 2025
- Regional KPIs (MAU, MAD, Playback Hours by region) — monthly, from July 2024

**Data migration:** Historical data from the existing Google Sheets workbook (NCP+ADK: 2025 Program Weekly KPIs) will be imported at launch. The workbook contains approximately 25 months of monthly data and 60+ weeks of ADK Version Share data.

### 5.8 Confluence Output Generation

The app produces formatted output blocks for the four Confluence sections owned by this workflow:

| Confluence Section | Frequency | Contents Generated |
|---|---|---|
| Playback Performance | Weekly | 4 charts (Attempts, Unique Devices, VSF-T, VPF-T) + narrative bullets |
| ADK Version Share | Weekly | Unique Devices line chart, pie chart (% by ADK version), version percentages |
| Business KPIs / Program KPIs (D+) | Monthly | MAU, MAD, HPV table by platform (PS, Xbox, ADK) with MoM % |
| Regional KPIs | Monthly | MAU, MAD, Playback Hours table by region with MoM %, regional pie chart |

Output is rendered as a formatted HTML preview in the app. A "Copy to Clipboard" button exports the section as Confluence-compatible markup. Chart images are downloadable separately for embedding.

### 5.9 Helpful Instructions & Source Links

Every workflow screen in the app includes:

- Step-by-step instructions for exporting data from the relevant source system.
- Direct links to the Conviva, Looker, and Sentry dashboards with the correct filters pre-described.
- Expected column schema for each CSV upload, with validation feedback if the upload does not match.
- A "How it works" drawer explaining the calculations and data flow for that section.

This ensures any authenticated team member can complete the workflow without prior context.

---

## 6. Technical Architecture

### Stack

| Layer | Technology |
|---|---|
| Frontend | React (single-page app), hosted on Firebase Hosting |
| Auth | Firebase Authentication — Google Sign-In, restricted to @disney.com / @disneystreaming.com |
| Database | Firestore — stores all historical time series, ADK version table, and processed weekly/monthly snapshots |
| File Processing | Firebase Cloud Functions — parse and validate CSV uploads, run calculations, write to Firestore |
| File Storage | Firebase Storage — stores raw CSV uploads and generated chart images |
| Analytics | Google Analytics (enabled on Firebase project) |
| Charts | Recharts — rendered client-side from Firestore data |

### Firestore Data Model (High Level)

| Collection | Contents |
|---|---|
| `adkVersions` | ADK version reference table. Document per version. Fields: adkVersion, coreVersions, releaseDate, features, notes. |
| `weeklySnapshots` | One document per week per metric type. Keyed by ISO week string (e.g., "2026-W10"). |
| `monthlySnapshots` | One document per month per metric type. Keyed by YYYY-MM. |
| `platformKpis` | Monthly time series for MAU, MAD, Playback Hours, HPV by platform. |
| `regionalKpis` | Monthly time series for MAU, MAD, Playback Hours by region. |
| `adkVersionShare` | Weekly time series of unique device counts and share % per ADK version. |
| `partnerMigration` | Weekly snapshot of partner/device/ADK version distribution from Sentry. |

### Security Rules

Firestore and Storage security rules restrict all reads and writes to authenticated users with a @disney.com or @disneystreaming.com email domain. No data is publicly readable.

---

## 7. Phase Plan

### Phase 1: CSV Upload & Automation (Current Scope)

| Feature Area | In Scope |
|---|---|
| Data ingestion | CSV upload from Conviva, Looker, Sentry — with schema validation and error feedback |
| ADK Version Manager | Full CRUD for ADK version → core_version mapping table |
| Weekly outputs | Playback Performance charts + narrative, ADK Version Share pie + table, Partner Migration analysis |
| Monthly outputs | Platform KPI table, Regional KPI table, trend charts |
| Historical store | Firestore time series for all metrics, data migration from existing Google Sheets |
| Confluence output | Formatted HTML blocks + chart images, Copy to Clipboard |
| Auth & access | Firebase Auth, Google Sign-In, @disney.com / @disneystreaming.com restriction |
| Instructions | Per-screen workflow guides with source links |

### Phase 2: API Integration & Executive Reporting

- Replace CSV uploads with Conviva Pulse API, Looker API, and Sentry API integrations.
- Schedule automated ingestion Sunday night (targeting 11:00 PM PT) so data is ready at 9:00 AM Monday.
- Expand data model to include PlayStation, Xbox, BBD, Roku, Android TV, Fire TV, and Apple TV.
- Auto-generate the Device Platform Overview slide data (P&D exec deck — Monthly Active Device share by platform).
- Auto-generate Program Snapshot: KPIs and Managed Platforms vs. ADK Partners tables (Quarterly deck).
- Push-notification or email alert when Monday's data is ready for review.
- Role-based access: read-only viewer tier for stakeholders who need visibility without edit rights.

---

## 8. Out of Scope (Phase 1)

- **Confluence API write-back.** The app produces formatted content; the user pastes it. Confluence API integration is a Phase 2 consideration.
- **Automated scheduling / cron jobs.** All data ingestion is user-initiated in Phase 1.
- **PowerPoint / PPTX generation.** Charts and tables are output for Confluence only.
- **Data from non-ADK platforms** (PS, Xbox, BBD, Roku, etc.) beyond what is already present in the existing KPI sheets.
- **Hulu or ESPN KPIs.** Scope is Disney+ on NCP+ADK only.
- **TAM, Partner Certification, or ADK Engineering** status sections of the weekly report. Those sections are manually authored and not data-driven from these sources.

---

## 9. Open Questions & Risks

| Question / Risk | Priority | Notes |
|---|---|---|
| Conviva CSV export format stability: does column schema change with filter settings or dashboard updates? | High | Validate against current exports before launch. Build schema version detection into the upload parser. |
| Looker CSV download is a zip file containing multiple CSVs. Exact file naming convention needs confirmation. | High | Confirm zip structure with a test export before building the parser. |
| Confluence HTML copy format: the app must produce markup compatible with the Disney Confluence instance (Confluence Cloud storage format vs. wiki markup). | High | Test copy-paste fidelity with a non-critical page before the first live Monday. |
| Chart image export for Confluence: images must be downloadable as PNG or embedded via Confluence's native image upload. | Medium | Evaluate html2canvas or server-side chart rendering via Cloud Functions. |
| Narrative copy generation: automated bullets require thresholds (e.g., what VSF-T % triggers a "Needs investigation" flag). These need to be defined by the PM. | Medium | Define initial thresholds based on historical data. Make them configurable in the app. |
| ADK 4.0 version mapping: core_version strings for 4.0 are not yet in the reference table (GA date 23 Mar 2026). Table must be updated before 4.0 devices appear in Sentry data. | Medium | Add to ADK Version Manager before 23 Mar 2026 GA. |
| Firebase project billing: Cloud Functions and Firestore writes at weekly/monthly cadence are well within free tier limits, but confirm before launch. | Low | Estimate: < 10K Firestore writes/month, < 50 Cloud Function invocations/month. |

---

## 10. Reference: Source System Links

| System | Dashboard / Resource | URL |
|---|---|---|
| Conviva | Playback Performance Comparisons | https://pulse.conviva.com/app/custom-dashboards/dashboard/48643?data-source=ei |
| Conviva | ADK Version Comparisons (D+) | https://pulse.conviva.com/app/custom-dashboards/dashboard/28764?data-source=ei |
| Looker | D+ Device Health & Status Dashboard V2.0 | https://looker.disneystreaming.com/dashboards/11169 |
| Sentry | ADK Partner–Device Combinations | https://disney.my.sentry.io/organizations/disney/explore/discover/results/?field=partner&field=device&field=core_version&field=count_unique%28device_id%29&field=count%28%29&sort=-count_unique_device_id&statsPeriod=24h |
| Google Sheets | NCP+ADK: 2025 Program Weekly KPIs (historical data) | https://docs.google.com/spreadsheets/d/1Ic6Uicee5VJezKn9BSYiSyb9BBKZjN04PGNI5Eqrml0 |
| Google Sheets | ADK Adoption Burn Down 2025 | https://docs.google.com/spreadsheets/d/1dDRQ9Mj0A6HGr4uiM-FoPOIGs6GxF2BRgk1MsSavGu8 |
| Confluence | ADK Version Reference Table | https://confluence.disney.com (DDP space — see How-To doc for page link) |
| Firebase | Project Console | https://console.firebase.google.com/project/device-platform-reporting |

---

*This brief was produced from interview sessions and artifact review conducted on 09 March 2026. It covers Phase 1 scope only. Phase 2 scope requires a separate brief once Phase 1 is validated in production.*
