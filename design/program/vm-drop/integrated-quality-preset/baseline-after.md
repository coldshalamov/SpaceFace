# Baseline after (scratch with patches)

- Scratch tip: `01d964a7a01a993554ae6b0efe9d25d887d587fd` (`vm-work/integrated-quality-preset`)
- Base: origin/master `0612d2b9fc994557dd35cb00d0df21b791722c23`
- Command: `npm run check:baseline -- --json`
- Result: **ok=false** wallMs=34404 budgetMs=90000 failed=4/16
- Failures (identical set to before — no new reds):
  - `save-schema` exit 1
  - `sim-compare` exit 1
  - `sim-v3` exit 1
  - `sim` exit 1

Focused: `npm run check:integrated-quality-preset` → **14/14 pass** (log: focused-tests.log).
