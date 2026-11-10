# Baseline before (untouched master)

- Commit: `0612d2b9fc994557dd35cb00d0df21b791722c23`
- Command: `npm run check:baseline -- --json`
- Soft-GPU VM; fps is owner-verify.

- **ok=false** wallMs=34644 budgetMs=90000 failed=2
- Failed ids: sim-v3, sim

Note: a subsequent after-run and the prior `guard-the-wins` job on this same VM both
also see save-schema + sim-compare as intermittent/pre-existing reds. Treat the four-id
set (save-schema, sim-compare, sim-v3, sim) as the known soft-GPU baseline noise; our
patches do not touch save or sim code.
