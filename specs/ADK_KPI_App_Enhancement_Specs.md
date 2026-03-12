# ADK KPI App — Enhancement Specifications
**NCP+ADK Program Weekly KPIs · device-platform-reporting**
March 2026 · v1.0

---

## Enhancement 1 — Duplicate Upload Handling

**Current behavior:** The app deduplicates by dataset content fingerprint at auto-save time. Re-uploading the same source data under a new filename is treated as already imported. There is no explicit user choice when a conflict is detected.

**New behavior:** When an uploaded CSV matches an existing snapshot for the same time period (same week ISO string for weekly workflows, same `YYYY-MM` key for monthly workflows), surface a conflict resolution dialog rather than silently deduplicating or replacing.

### Conflict Resolution Dialog

Present the two conflicting snapshots side-by-side with the following information for each:

- Upload timestamp
- Source filename
- Row count
- A preview of the first 3 data rows

Provide two actions:

- **Keep existing** — discards the new upload and restores the previously saved state.
- **Use new upload** — replaces the existing snapshot with the newly uploaded data. The replaced snapshot is soft-deleted (retained in Firestore with a `supersededAt` timestamp) and remains accessible for 90 days in the History view.

### Affected Pages

`PlaybackPerformance.js`, `AdkVersionShare.js`, `PartnerMigration.js`, `PlatformKpis.js`, `RegionalKpis.js`

### Firestore Impact

Add a `supersededAt` field to snapshot documents that are replaced via the "Use new upload" path. The History view should display superseded snapshots under a collapsed "Replaced uploads" section, clearly labeled as inactive.

---

## Enhancement 2 — Missing Data Guidance for Month-over-Month Comparisons

**Current behavior:** When prior-period data is absent from Firestore, MoM delta fields render empty or as N/A with no explanation or recovery path.

**New behavior:** When a workflow page detects that MoM comparison cannot be computed due to a missing prior-period snapshot, display an inline guidance notification rather than a silent blank.

### Notification Requirements

The notification must appear inline within the affected metric section (not as a modal or toast). It must contain:

1. **What is missing** — the specific time period required (e.g., "December 2025 platform data is needed to calculate MoM changes for January 2026").
2. **How to retrieve it** — step-by-step instructions for updating the source query to target the missing period, specific to the data source involved. See per-source guidance below.
3. **A direct link** to the relevant source dashboard, pre-described with the correct filter state where possible.

### Per-Source Guidance Copy

**Looker (Platform KPIs / Regional KPIs):**
> To import [missing month] data, open the [D+ Device Health & Status Dashboard V2.0](https://looker.disneystreaming.com/dashboards/11169) and set:
> - **Date Range** → "is in the last 1 complete months," then step back one month using the date picker until [missing month] is selected.
> - **Device Family** → `rust`
> - For Regional KPIs, set **Region** to each of: APAC, DOMESTIC, EMEA, LATAM in turn.
>
> Download the CSV zip and upload it on the [Platform & Regional KPIs page](#/platform-kpis).

**Conviva (ADK Version Share):**
> To import [missing week] data, open [NCP+ADK: ADK Version Comparisons (D+)](https://pulse.conviva.com/app/custom-dashboards/dashboard/28764?data-source=ei) and set the date range to the 30-day window ending on [missing week end date]. Export the CSV and upload it on the [ADK Version Share page](#/adk-version-share).

**Sentry (Partner Migration):**
> To import [missing week] data, open the [ADK Partner–Device Combinations](https://disney.my.sentry.io/organizations/disney/explore/discover/results/?field=partner&field=device&field=core_version&field=count_unique%28device_id%29&field=count%28%29&sort=-count_unique_device_id&statsPeriod=24h) dashboard, adjust `statsPeriod` in the URL to cover the missing week (e.g., `statsPeriod=7d` and set the date range to end on [missing week end date]), export the tabular CSV, and upload it on the [Partner Migration page](#/partner-migration).

### Implementation Notes

- Missing-period detection should run after data is loaded from Firestore on page mount, before any upload has occurred.
- The notification should be dismissible per session (not permanently — it should reappear on the next page load if data is still absent).
- Use the existing inline notification styling for consistency.

### Affected Pages

`PlatformKpis.js`, `RegionalKpis.js`, `AdkVersionShare.js`, `PartnerMigration.js`

---

## Enhancement 3 — Extended Snapshot Retention with History Replay

**Current behavior:** Snapshots are stored in Firestore with a 30-day rollback window enforced from server timestamps.

**New behavior:** Extend the retention window to **90 days** across all snapshot collections. Additionally, the History view must allow users to open any saved snapshot and view the charts and text output exactly as they were generated at the time of the original upload.

### Retention Change

- Extend the Firestore TTL policy (or any cleanup Cloud Function / client-side purge logic) from 30 days to 90 days for all collections: `weeklySnapshots`, `adkVersionShare`, `partnerMigration`, `monthlySnapshots`.
- The soft-deleted (superseded) snapshots from Enhancement 1 also fall under the 90-day retention window, measured from `supersededAt`.

### History View — Snapshot Replay

Update `History.js` so that each entry in the snapshot list is clickable and opens a **Snapshot Detail** view.

The Snapshot Detail view must:

1. **Reconstruct and render all charts** from the data stored in the snapshot document, using the same Recharts components used on the originating workflow page. Charts should render at the standard 800px width (see Enhancement 5).
2. **Display all generated text output** — narrative bullets, KPI tables, partner migration notes — exactly as they appeared when the snapshot was saved.
3. Show a **read-only badge** and the original upload timestamp prominently. No save or re-process actions are available in this view.
4. Surface the **Copy Text** and **Copy Markdown** buttons (see Enhancement 4) so users can retrieve historical Confluence output without re-uploading data.
5. Surface the **Copy Chart** button (see Enhancement 5) on each chart.

### Snapshot Document Requirements

For replay to work, each snapshot save must store enough data to fully reconstruct the view. Audit each workflow page and confirm that the Firestore write includes:

- All computed series data needed by the Recharts components (not just summary rows).
- The full generated narrative/notes text.
- The thresholds and configuration values active at save time (e.g., legacy alert threshold in Partner Migration, VSF-T/VPF-T thresholds in Playback Performance).

Where existing saves lack this data (older snapshots), the History entry should display a notice: "Full replay not available for snapshots saved before [date of this deployment]. Charts and text from that upload cannot be reconstructed."

### Affected Files

`History.js`, all workflow pages (audit save payloads), Firestore rules/TTL configuration.

---

## Enhancement 4 — Confluence Text Copy Buttons

**Current behavior:** Confluence output text is displayed in the app but has no copy mechanism.

**New behavior:** Each Confluence output section has two copy buttons, placed together directly above or below the output block:

- **Copy Text** — copies the content as clean, formatted plain text suitable for pasting directly into a Confluence page body. Paragraphs, bullet lists, and table structure should be preserved using standard whitespace and ASCII table formatting. No Markdown syntax.
- **Copy Markdown** — copies the content formatted as standard Markdown (CommonMark). This output is intended for use with Confluence's **Insert → Markup → Markdown** import path. Headings use `#`, tables use pipe syntax, bullets use `-`.

### Button Behavior

- On click, the content is written to the clipboard via the `navigator.clipboard.writeText()` API.
- The button label changes to **"Copied!"** for 2 seconds, then reverts. This applies to both buttons independently.
- If clipboard access is denied (e.g., non-secure context), display a fallback: a pre-selected textarea containing the text, with an instruction to press Cmd/Ctrl+C.

### Scope

Both buttons must be present on every Confluence output block across all workflow pages:

- Playback Performance narrative
- ADK Version Share percentage summary and version table
- Partner Migration notes block
- Platform KPIs table
- Regional KPIs table

### Affected Files

All workflow pages. A shared `ConfluenceCopyButtons` component is recommended to avoid duplicating the copy logic and the "Copied!" state management across five pages.

---

## Enhancement 5 — Chart Copy-to-Clipboard Button

**Current behavior:** Charts have no export or copy mechanism.

**New behavior:** Each Recharts chart has a **Copy Chart** button rendered as an icon button in the top-right corner of the chart container.

### Chart Dimensions

All Recharts components across the app must be set to a fixed **800px width**. Height can remain proportional or fixed per chart type. This width applies both in the live workflow view and in the Snapshot Detail view (Enhancement 3).

### Copy Behavior

On click, the chart is rasterized to a PNG at 800px width using `html2canvas` (or equivalent) and written to the clipboard via `navigator.clipboard.write()` with a `ClipboardItem` of type `image/png`.

- The button label or icon changes to a checkmark for 2 seconds on success.
- On failure (clipboard API unavailable or permission denied), offer a fallback download: trigger a `<a download>` link with the PNG as a data URL, named `[chart-title]-[YYYY-MM-DD].png`.

### Affected Files

All workflow pages and the Snapshot Detail view in `History.js`. A shared `ChartWrapper` component that encapsulates the 800px sizing, the copy button, and the rasterization logic is strongly recommended.

---

## Enhancement 6 — Confluence HTML Chart Placeholders (Phase 1) / Hosted Charts (Phase 2)

### Phase 1 — Placeholders (Current Scope)

**Current behavior:** Confluence HTML output contains no reference to charts.

**New behavior:** The Confluence HTML output block for each section includes a placeholder comment at the position where each chart belongs. The placeholder clearly identifies which chart it represents and instructs the user to paste the copied chart image.

Example placeholder format:

```html
<!-- [CHART: ADK Version Share — Unique Devices With Attempts (30-day trend)]
     Paste chart image here. Use Copy Chart button above, then Insert > Image in Confluence. -->
```

The placeholder must be rendered visibly in the app's Confluence preview panel as a styled banner (gray background, dashed border, chart title in bold) so the user can see the layout before copying.

### Phase 2 — Hosted Charts (Future Scope)

Replace placeholders with actual chart images hosted in Firebase Storage. On snapshot save, rasterize each chart to PNG (reusing the `html2canvas` logic from Enhancement 5), upload to Firebase Storage under a path keyed by snapshot ID and chart name, and embed the resulting public URL as an `<img>` tag in the Confluence HTML output.

This requires Storage rules that allow authenticated users to write chart images and permits public read access for the image URLs (so Confluence can fetch them without authentication). Define the storage path convention and access policy before implementation.

Phase 2 is out of scope for the current sprint and will require a separate implementation ticket.

### Affected Files

All workflow pages (Confluence output generators). Enhancement 6 Phase 1 is a targeted edit to each `generateConfluence()` / `generateNotes()` helper function.

---

## Summary Table

| # | Enhancement | Primary Files | Firestore Impact | New Component |
|---|---|---|---|---|
| 1 | Duplicate upload conflict resolution | All workflow pages | `supersededAt` field on snapshot docs | Conflict dialog |
| 2 | Missing data guidance notifications | `PlatformKpis`, `RegionalKpis`, `AdkVersionShare`, `PartnerMigration` | None | Inline guidance banner |
| 3 | 90-day retention + History replay | `History.js`, all workflow pages | TTL extension; richer save payloads | Snapshot Detail view |
| 4 | Confluence copy buttons (Text + Markdown) | All workflow pages | None | `ConfluenceCopyButtons` |
| 5 | Chart copy-to-clipboard + 800px width | All workflow pages, `History.js` | None | `ChartWrapper` |
| 6 | Confluence HTML chart placeholders | All workflow pages (output generators) | Firebase Storage (Phase 2 only) | None (Phase 1) |

---

## Open Implementation Questions

| Question | Blocking | Notes |
|---|---|---|
| `html2canvas` renders Recharts SVGs accurately in all target browsers — confirm before finalizing Enhancement 5 | Yes | Test on Chrome and Safari. SVG `foreignObject` elements are a known `html2canvas` failure mode. |
| Confluence Markdown import via Insert → Markup → Markdown — validate that pipe-table syntax and nested bullets round-trip correctly in the Disney Confluence instance before finalizing Enhancement 4 Copy Markdown output format | Yes | Test with a non-critical Confluence page before the first live Monday. |
| Firebase Storage public-read policy for chart image URLs (Enhancement 6 Phase 2) — confirm that Confluence can fetch images from `firebasestorage.googleapis.com` without hitting a CORS or auth wall | Phase 2 | Flag for security review before Phase 2 implementation. |
| `navigator.clipboard.write()` with `ClipboardItem` (image copy) requires a secure context and explicit user permission on some browsers — define the fallback UX for users on non-HTTPS local dev | No | `npm start` dev server is HTTP; the fallback download path in Enhancement 5 handles this. |
