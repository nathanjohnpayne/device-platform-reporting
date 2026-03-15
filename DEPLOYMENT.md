# Deployment

> This guide covers deploying the existing project. For **new project setup** (create Firebase project, `firebase init`, first-time auth bootstrap), see `ai_agent_repo_template/DEPLOYMENT.md` in the sibling directory.

## Prerequisites

- [Firebase CLI](https://firebase.google.com/docs/cli) (`firebase-tools`) installed globally
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud`) installed
- Local `gcloud` wrapper installed on PATH (see First-Time Setup below)
- `op-firebase-deploy` and `op-firebase-setup` on PATH
- Application Default Credentials (ADC) initialized via `gcloud auth application-default login`
- Permission to impersonate `firebase-deployer@device-platform-reporting.iam.gserviceaccount.com`

## Environments

| Environment | Firebase Project | URL |
|-------------|-----------------|-----|
| Production | `device-platform-reporting` | https://device-platform-reporting.web.app |

There is no staging environment. All deploys go directly to production.

## Build Process

This is a React app built with webpack. The build must complete before deploy.

```bash
# Source environment variables first
source .env  # or export REACT_APP_FIREBASE_* vars

# Production build
npm run build
```

Build output goes to `dist/`. Never edit `dist/` directly.

## Deployment Steps

All deploys use `op-firebase-deploy` for keyless, non-interactive service account impersonation. The deploy commands do not run the build automatically, so run `npm run build` first.

```bash
# Full deploy (hosting + Firestore rules)
npm run deploy

# Hosting only
npm run deploy:hosting
```

The script:
1. Auto-detects the Firebase project from `.firebaserc`
2. Reads source credentials from `GOOGLE_APPLICATION_CREDENTIALS` or `~/.config/gcloud/application_default_credentials.json`
3. Generates a temporary `impersonated_service_account` credential file for `firebase-deployer@device-platform-reporting.iam.gserviceaccount.com`
4. Sets `GOOGLE_APPLICATION_CREDENTIALS` to that temp file and runs `firebase deploy --non-interactive`
5. Cleans up credentials on exit

No long-lived deploy key is stored locally or in 1Password. The only interactive step is refreshing local ADC if it has expired or been revoked:

```bash
gcloud auth application-default login
```

The local `gcloud` wrapper uses the same ADC source so normal `gcloud` commands work without an interactive `gcloud auth login`.

## First-Time Setup

Install the canonical helper scripts from the sibling template repo once per machine:

```bash
mkdir -p ~/.local/bin
cp ../ai_agent_repo_template/scripts/gcloud/gcloud ~/.local/bin/gcloud
cp ../ai_agent_repo_template/scripts/firebase/op-firebase-deploy ~/.local/bin/
cp ../ai_agent_repo_template/scripts/firebase/op-firebase-setup ~/.local/bin/
chmod +x ~/.local/bin/gcloud ~/.local/bin/op-firebase-deploy ~/.local/bin/op-firebase-setup
hash -r
```

Then bootstrap machine auth and project impersonation:

```bash
gcloud auth application-default login
op-firebase-setup device-platform-reporting
```

`op-firebase-setup` is the legacy script name, but it now performs keyless setup. For this project it:
1. Enables the IAM Credentials API
2. Creates `firebase-deployer@device-platform-reporting.iam.gserviceaccount.com` if needed
3. Grants deploy roles to that service account
4. Grants your current principal `roles/iam.serviceAccountTokenCreator` on the deployer
5. Creates or updates a dedicated `gcloud` configuration named `device-platform-reporting`

## Rollback Procedure

Firebase Hosting supports instant rollback:

```bash
# List recent releases
firebase hosting:releases:list

# Roll back via CLI
firebase hosting:channel:deploy live --release-id <VERSION_ID>
```

Or use the Firebase Console → Hosting → Release History → Roll back.

## Post-Deployment Verification

1. Open https://device-platform-reporting.web.app in an incognito window
2. Sign in with a Disney Streaming Google account — confirm authentication works
3. Navigate to each workflow page — confirm they load without errors
4. Test a CSV upload on one workflow page — confirm parsing and chart rendering
5. Check browser DevTools → Console for any errors
6. Verify the Firestore rules are applied: confirm a viewer-only user cannot write

## CI/CD Integration

No CI/CD pipeline is currently configured. Deploys are manual via `npm run deploy`.

When connecting CI, prefer Workload Identity Federation or another `external_account` credential as the source ADC. If CI already exposes `GOOGLE_APPLICATION_CREDENTIALS` pointing at an `external_account` file, `op-firebase-deploy` can reuse it to impersonate the deployer service account.

## Secrets Management

- Real Firebase web config (`REACT_APP_FIREBASE_*`) is stored only in local `.env` files (gitignored). Never hardcode live values in `src/firebase.js`, documentation, or generated bundles.
- `REACT_APP_FIREBASE_API_KEY` is a browser key — not the auth boundary, but committing it triggers Google abuse alerts and creates quota exposure.
- Deploy auth uses short-lived impersonated credentials derived from local ADC or CI-provided external-account credentials.

### Credential Rotation

If a browser API key is exposed:
1. Remove from tracked files and build artifacts
2. If it was public, rewrite git history and force-push before making the repo public again
3. Create a replacement browser key in Google Cloud Credentials with the same restrictions (HTTP referrers: approved Hosting/local domains + Firebase API allowlist)
4. Update local `.env`, source it, rebuild and redeploy
5. Verify the live bundle serves the new key only, then delete the old key

For future services requiring secrets, commit only template files with `op://` references and resolve them with `op inject` into a gitignored runtime file at deploy time. Never commit the resolved output.

## Auth Maintenance

If local ADC has expired, been revoked, or is missing:

```bash
gcloud auth application-default login
```

If deploy impersonation breaks because IAM bindings or `gcloud` config drifted, rerun:

```bash
op-firebase-setup device-platform-reporting
```
