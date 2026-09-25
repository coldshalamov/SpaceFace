# Baseline before (untouched master)

- Commit: `0612d2b9fc994557dd35cb00d0df21b791722c23`
- Command: `npm run check:baseline -- --json`
- Result: **ok=false** wallMs=30642 budgetMs=90000 failed=4/16
- Failures already on master (do NOT fix by editing expected JSON):
  - `save-schema` exit 1 (376 ms)
  - `sim-compare` exit 1 (2142 ms)
  - `sim-v3` exit 1 (10985 ms)
  - `sim` exit 1 (2080 ms)

These four failures match the quiet-witness-baseline note (save-schema + sim/sim-compare/sim-v3 hash drifts). Guard-the-wins must leave baseline no worse.
