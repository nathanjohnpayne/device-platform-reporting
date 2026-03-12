# Contributing

## Overview

Device Platform Reporting is an internal Disney Streaming tool for KPI reporting workflows. The codebase is intentionally simple — client-side React with page-local logic. Keep changes aligned with this architecture. Prefer small, focused changes over refactoring.

## Branch Naming

| Type | Format | Example |
|------|--------|---------|
| New feature | `feature/<short-description>` | `feature/playback-performance-export` |
| Bug fix | `fix/<short-description>` | `fix/adk-share-mapping` |
| Maintenance | `chore/<short-description>` | `chore/update-firebase-sdk` |

## Commit Message Format

Use imperative present tense. Keep the subject line under 72 characters.

```
Add burn-down export to Legacy Workbook Sync
Fix core_version unmapped entries showing as current
Update Firestore rules for monthlySnapshots collection
```

## Pull Request Process

1. Branch from `main`
2. Run `npm run build` — build must succeed before opening a PR
3. Run `npm test` — includes the tracked-file secret scan; all tests must pass
4. Run `scripts/ci/` checks locally
5. Open a PR against `main` with a clear title and description
6. At least one human review required before merge

## Code Style

- **JavaScript:** React 19, functional components, hooks. No class components.
- **Routing:** React Router 7 — follow existing patterns in `src/App.js`.
- **CSV parsing:** Always use `UploadZone` + `Papa.parse({ header: true, skipEmptyLines: true })` for CSV ingestion. Do not create a separate uploader.
- **Firestore writes:** Use `addDoc(...)` with `serverTimestamp()`. No raw `setDoc` with manual timestamps.
- **Styling:** `src/styles.css` only. No CSS modules or styled-components.
- **Charts:** `recharts` only.

## Adding a New Workflow Page

When adding a new page, wire it in all three places:
1. `src/App.js` — route entry
2. `src/components/Sidebar.js` — navigation link
3. `src/pages/Dashboard.js` — dashboard card/link

## Testing

```bash
npm test
```

The test suite is selective, not comprehensive. It includes a tracked-file secret scan — a failing scan means credentials are present in tracked files.

When modifying parsing or chart logic, test the affected route manually with representative CSVs. Leave notes in your PR about what you tested manually and what you did not verify.

**Tests must not be deleted to force a build to pass.**

## Agent Contributions

AI agent contributions must follow `AGENTS.md`. All agent-proposed changes require human review before merge. Since there is no real automated test suite, agents must be explicit about what was and was not manually verified.

## Questions

Open an issue on GitHub or contact the repo owner directly.
