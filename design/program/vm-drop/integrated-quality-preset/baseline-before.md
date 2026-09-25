# Baseline before (untouched master)

- Commit: `0612d2b9fc994557dd35cb00d0df21b791722c23`
- Command: `npm run check:baseline -- --json`
- Result: **ok=false** wallMs=37751 budgetMs=90000 failed=4/16
- Failures already on master (do NOT fix by editing expected JSON):
  - save-schema exit 1
  - sim-compare exit 1
  - sim-v3 exit 1
  - sim exit 1

These four failures match the quiet-witness / guard-the-wins note. This job must leave baseline no worse.
