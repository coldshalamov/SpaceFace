# Report — combat-prephysics-quiet-latch (#154)

## Mechanism

`actions.update` → `kernel.prePhysics` on quiet open flight still walked every
living combatant for ensureCombatant, empty status/pending advances, cool, and
bounds sync even when heat/statuses/actions were idle. The quiet latch arms
after a quiet census and short-circuits that walk until membership changes,
action/status/damage/repair wake, or a 0.5 s rescan.

## Evidence

- Primary microbench (11-pair @ 60k, isolated `--expose-gc`): median **26.40×**,
  min **17.10×**, abs before **~33.3 µs/call**, dirtyWakeOk.
- Package floor (5×11-pair): medians **24.76–25.41×**, floorMin **21.265×**,
  abs before **~32.5–33.2 µs/call**, dirtyWakeOk all rounds.
- Focused latch **5/5**; combat review suites **32/32**. Soft-GPU fps not
  claimed. Picture unchanged.

## Artifacts

See `artifacts/` for microbench JSON/logs, floor summary, and focused logs.
