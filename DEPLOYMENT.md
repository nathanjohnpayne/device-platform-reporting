# Deployment

## Prerequisites

- [Firebase CLI](https://firebase.google.com/docs/cli) (`firebase-tools`) installed globally
- [1Password CLI](https://developer.1password.com/docs/cli/) (`op`) installed and signed in
- Google Cloud SDK (`gcloud`) installed
- `op-firebase-deploy` script on PATH (see First-Time Setup below)
- Access to the `Private` vault in 1Password: `Private/Firebase Deploy - device-platform-reporting` and `Private/GCP ADC`

## Environments

| Environment | Firebase Project | URL |
|-------------|-----------------|-----|
| Production | `device-platform-reporting` | Firebase Hosting URL |

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

All deploys use `op-firebase-deploy` for non-interactive 1Password auth. The deploy commands run the build automatically.

```bash
# Full deploy (hosting + Firestore rules)
npm run deploy

# Hosting only
npm run deploy:hosting
```

The script:
1. Reads the service account key from 1Password (`Private/Firebase Deploy - device-platform-reporting`)
2. Auto-detects the Firebase project from `.firebaserc`
3. Runs `firebase deploy --non-interactive`
4. Cleans up credentials on exit

The only interactive step is the 1Password biometric prompt (Touch ID). No `firebase login` or browser prompts needed.

## First-Time Setup

```bash
op-firebase-setup device-platform-reporting
```

This creates a `firebase-deployer` service account, grants deploy roles, generates a key, and stores it in 1Password as `Firebase Deploy - device-platform-reporting`. Run once per machine.

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

1. Open the live app URL in an incognito window
2. Sign in with a Disney Streaming Google account — confirm authentication works
3. Navigate to each workflow page — confirm they load without errors
4. Test a CSV upload on one workflow page — confirm parsing and chart rendering
5. Check browser DevTools → Console for any errors
6. Verify the Firestore rules are applied: confirm a viewer-only user cannot write

## CI/CD Integration

No CI/CD pipeline is currently configured. Deploys are manual via `npm run deploy`.

## Secrets Management

- Real Firebase web config (`REACT_APP_FIREBASE_*`) is stored only in local `.env` files (gitignored). Never hardcode live values in `src/firebase.js`, documentation, or generated bundles.
- `REACT_APP_FIREBASE_API_KEY` is a browser key — not the auth boundary, but committing it triggers Google abuse alerts and creates quota exposure.
- Service account credentials are stored exclusively in 1Password.

### Credential Rotation

If a browser API key is exposed:
1. Remove from tracked files and build artifacts
2. If it was public, rewrite git history and force-push before making the repo public again
3. Create a replacement browser key in Google Cloud Credentials with the same restrictions (HTTP referrers: approved Hosting/local domains + Firebase API allowlist)
4. Update local `.env`, source it, rebuild and redeploy
5. Verify the live bundle serves the new key only, then delete the old key

If the deploy ADC credential (`Private/GCP ADC`) goes stale:
```bash
gcloud auth application-default login --project=device-platform-reporting
# Then update the 1Password item
```

For future services requiring secrets, commit only template files with `op://` references and resolve them with `op inject` into a gitignored runtime file at deploy time. Never commit the resolved output.
