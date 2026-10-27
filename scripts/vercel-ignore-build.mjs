// Vercel ignoreCommand. Exit 0 skips the deployment, exit 1 builds.
//
// DEPLOY POLICY (2026-10-19): git pushes no longer trigger Vercel builds at all —
// vercel.json sets git.deploymentEnabled=false and the project's git link is
// disconnected. Deploys are manual: `vercel build --prod && vercel deploy --prebuilt --prod`
// (see docs/VERCEL_DEPLOYMENT.md). This script stays wired as a second gate: if
// someone reconnects the repo or re-enables deploymentEnabled, only the allowlist
// below may build — every other branch is skipped before consuming build minutes.
//
// History: agent lanes were each triggering a full retail bundle; on the Hobby
// plan one build runs at a time, previews sat until killed at 45 minutes, and the
// project hit the daily deployment cap.
const ref = process.env.VERCEL_GIT_COMMIT_REF || '';
const allow = new Set([
  'master',
  'main',
  'codex/iphone-oct26-launch',
  'codex/iphone14-mobile',
  'codex/oct15-maturity-checkpoint',
  'codex/mobile-release-pinning',
  'codex/mobile-startup-cause',
  'codex/phone-startup-recovery',
  'devin/1791331347-gyre-snare',
  'devin/1791416174-gyre-snare-polish',
]);

if (allow.has(ref)) {
  console.log(`[vercel] building ${ref}`);
  process.exit(1);
}

console.log(`[vercel] skipping ${ref}; not an allowlisted branch`);
process.exit(0);
