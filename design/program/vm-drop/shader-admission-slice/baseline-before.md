# Baseline before (untouched master)

- Commit: `0612d2b9fc994557dd35cb00d0df21b791722c23`
- Command: `npm run check:baseline -- --json`
- Soft-GPU VM; fps is owner-verify.

- **ok=false** wallMs=39658 budgetMs=90000 failed=4
- Failed ids: save-schema, sim-compare, sim-v3, sim

Known soft-GPU baseline noise matches prior vm-drop jobs (save-schema / sim-compare / sim-v3 / sim).
