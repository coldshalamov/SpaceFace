# Baseline after (scratch with patches)

- Scratch: `vm-work/shader-admission-slice` @ `c5de6ab2c` (local only; not pushed)
- Base master: `0612d2b9fc994557dd35cb00d0df21b791722c23`
- Command: `npm run check:baseline -- --json`
- Soft-GPU VM; fps is owner-verify.

- **ok=false** wallMs=35651 budgetMs=90000 failed=4
- Failed ids: save-schema, sim-compare, sim-v3, sim

**Same four** as baseline-before (save-schema, sim-compare, sim-v3, sim). No new reds from this series.
