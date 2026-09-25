# Baseline after (scratch branch with guards)

- Commit: `0612d2b9fc994557dd35cb00d0df21b791722c23` (scratch tip before format-patch; see patches for the series)
- Command: `npm run check:baseline -- --json`
- Result: **ok=false** wallMs=34147 budgetMs=90000 failed=4/16
- Failures:
  - `save-schema` exit 1 (340 ms)
  - `sim-compare` exit 1 (2167 ms)
  - `sim-v3` exit 1 (11358 ms)
  - `sim` exit 1 (2233 ms)

Compared to baseline-before: same four master-preexisting failures (save-schema, sim-compare, sim-v3, sim). No new baseline reds from guard-the-wins.
