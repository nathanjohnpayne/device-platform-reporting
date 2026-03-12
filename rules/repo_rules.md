# Repository Rules

## Structure Invariants

The following files must always exist at the repository root and must never be deleted or moved:

- `README.md`
- `AGENTS.md`
- `DEPLOYMENT.md`
- `CONTRIBUTING.md`
- `.ai_context.md`

The following directories must always exist:

- `rules/` — contains this file and other binding constraints
- `plans/` — execution and rollout plans
- `specs/` — product specifications
- `tests/` — test placeholder (Jest tests are co-located with src/)
- `scripts/ci/` — CI enforcement scripts
- `docs/` — extended documentation

The following tool config directory must contain only configuration:

- `.claude/` — Claude Code permissions config and internal state only; `.claude/worktrees/` is machine-generated Claude Code state (gitignored)

**Intentionally absent directories:**

- `functions/` — No Cloud Functions exist in this repo. The client-side app writes directly to Firestore.

## Forbidden Patterns

- **Never edit `dist/` directly.** It is a webpack build artifact. Always run `npm run build` to regenerate.
- **Never commit secrets.** Firebase web config (`REACT_APP_FIREBASE_*`), service account keys, and ADC credentials must never be committed. Use `.env` files (gitignored) for local config.
- **No instruction files in tool folders.** `.claude/` must not contain plain `.md` or `.txt` instruction files (machine-generated worktree state in `.claude/worktrees/` is permitted).
- **No duplicate documentation.** If a concept is documented in `AGENTS.md` or a canonical root file, it must not be redefined in a conflicting location.
- **No new top-level directories** without explicit justification documented in `AGENTS.md` or a `plans/` entry.
- **Tests must not be deleted to force a build to pass.**
- **Always use `UploadZone` for CSV ingestion.** Do not create additional CSV uploaders.

## CI Enforcement

The following checks are implemented in `scripts/ci/` and must pass before any commit is merged:

1. `check_required_root_files` — Verifies README.md, AGENTS.md, DEPLOYMENT.md, CONTRIBUTING.md, and .ai_context.md all exist at repository root
2. `check_no_tool_folder_instructions` — Verifies .claude/ contains no plain .md or .txt instruction files (worktrees/ is excluded as machine-generated state)
3. `check_no_forbidden_top_level_dirs` — Verifies no forbidden top-level directories exist
4. `check_dist_not_modified` — Verifies dist/ files were not directly modified
5. `check_spec_test_alignment` — Verifies every file in specs/ has a corresponding test file (advisory for this repo)
6. `check_duplicate_docs` — Verifies no documentation topic is duplicated between root files and tool folders

Additionally, `npm test` includes `scripts/check-no-public-secrets.mjs` which must pass on every commit.
