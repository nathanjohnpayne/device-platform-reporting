# NCP+ADK Program Weekly KPIs

Disney Streaming · Partnerships & Devices  
Firebase web app for generating weekly and monthly KPI reports for the ADK Program meeting.

---

## What it does

Replaces 30–45 minutes of manual Monday-morning work with a 5-minute upload-and-copy workflow.

| Workflow | Frequency | Source | What it generates |
|---|---|---|---|
| Playback Performance | Weekly | Conviva CSV | VSF-T, VPF-T, Attempts, Unique Devices charts + narrative |
| ADK Version Share | Weekly | Conviva CSV | Pie chart, % breakdown per ADK version |
| Partner Migration | Weekly | Sentry CSV | Partner migration table, legacy % per partner |
| Platform KPIs | Monthly | Looker CSV | MAU, MAD, HPV by platform (PS, Xbox, ADK) with MoM % |
| Regional KPIs | Monthly | Looker CSV | MAU, MAD, Playback Hours by region with MoM % |
| ADK Version Manager | Admin | Firestore | Add/edit ADK version → core_version mappings |

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
```

### 2. Clone / unzip the project

```
cd adk-kpi-app
npm install
```

### 3. Add Firebase config

```
cp .env.example .env.local
```

Open `.env.local` and fill in your values from:  
**Firebase Console → Project Settings → General → Your apps → SDK setup → Config**

Required values:
- `REACT_APP_FIREBASE_API_KEY`
- `REACT_APP_FIREBASE_APP_ID`
- `REACT_APP_FIREBASE_MEASUREMENT_ID`

The other values (auth domain, project ID, etc.) are pre-filled for `device-platform-reporting`.

### 4. Enable Firestore

Firebase Console → Firestore Database → Create database → **Production mode** → choose a region (us-central1 recommended).

### 5. Enable Storage (optional — for future file uploads)

Firebase Console → Storage → Get started → Production mode.

### 6. Build and deploy

```bash
npm run build
firebase login
firebase deploy
```

The app will be live at: `https://device-platform-reporting.web.app`

---

## Local development

```bash
npm start
# → http://localhost:3000
```

Note: Google Sign-In requires the domain to be in the authorized list.  
Add `localhost` in Firebase Console → Authentication → Settings → Authorized domains.

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

1. **Playback Performance** — Export CSV from [Conviva Playback Performance](https://pulse.conviva.com/app/custom-dashboards/dashboard/48643?data-source=ei) (last 30 days) → upload → copy to Confluence.
2. **ADK Version Share** — Export CSV from [Conviva ADK Version Comparisons](https://pulse.conviva.com/app/custom-dashboards/dashboard/28764?data-source=ei) (last 30 days) → upload → copy pie chart + text to Confluence.
3. **Partner Migration** — Export CSV from [Sentry ADK Partner–Device Combinations](https://disney.my.sentry.io/organizations/disney/explore/discover/results/?field=partner&field=device&field=core_version&field=count_unique%28device_id%29&field=count%28%29&sort=-count_unique_device_id&statsPeriod=24h) (last 24h, tabular view) → upload → copy notes to Confluence.

---

## Monthly workflow

**Run at the end of each month**

1. **Platform KPIs** — Download zip from [Looker D+ Device Health Dashboard](https://looker.disneystreaming.com/dashboards/11169?Date+Granularity=monthly&Date+Range=1+month+ago+for+1+month&Device+Family=rust) (Device Family=rust, last complete month) → upload 3 CSVs → copy table to Confluence.
2. **Regional KPIs** — Same Looker dashboard, filtered by each region (APAC, DOMESTIC, EMEA, LATAM) → upload one CSV per region → copy table + pie chart to Confluence.

---

## Firestore data structure

```
adkVersions/          — ADK version reference table (editable in app)
weeklySnapshots/      — Playback Performance weekly uploads
adkVersionShare/      — ADK Version Share weekly time series
partnerMigration/     — Partner migration weekly snapshots
monthlySnapshots/     — Platform and Regional KPI monthly uploads
```

---

## Security

- Firestore and Storage rules restrict all access to authenticated @disney.com and @disneystreaming.com users.
- Domain enforcement happens both in the Firebase Auth layer (client-side) and in Firestore security rules (server-side).
- No data is publicly readable.

---

## Phase 2 (future)

- API integrations with Conviva Pulse, Looker, and Sentry — replacing CSV uploads with automated ingestion.
- Scheduled Sunday-night data pull so the report is ready before 9:00 AM PT Monday.
- Executive deck data (PlayStation, Xbox, BBD, Roku) for P&D quarterly decks.
- Confluence API write-back.
