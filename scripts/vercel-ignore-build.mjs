// Vercel ignoreCommand. Exit 0 skips the deployment, exit 1 builds.
// Agent lanes were each triggering a full retail bundle. On the Hobby plan only
// one build runs at a time, so previews sat until Vercel killed them at 45 minutes
// and the project hit the daily deployment cap. Production and the live gyre
// preview branches and the iPhone repair candidate still build; everything else is skipped.
const ref = process.env.VERCEL_GIT_COMMIT_REF || '';
const allow = new Set([
  'master',
  'main',
  'codex/iphone14-mobile',
  'codex/oct15-maturity-checkpoint',
  'devin/1791331347-gyre-snare',
  'devin/1791416174-gyre-snare-polish',
]);

if (allow.has(ref)) {
  console.log(`[vercel] building ${ref}`);
  process.exit(1);
}

console.log(`[vercel] skipping ${ref}; not an allowlisted branch`);
process.exit(0);
