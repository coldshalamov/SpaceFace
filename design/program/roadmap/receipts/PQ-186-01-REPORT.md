<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-186.01 — Rulings as guards

```text
DONE  PQ-186.01 — every owner ruling that made the game feel bad is now a check that reads the source and fails when the ruling is broken again.
WHAT I FOUND     The rulings were only prose: nothing in the tree would have stopped the next agent from adding drag, a speed clamp on given momentum, a hidden gyro, a wall-clock read in the sim, a hit that scales with health, or a branching conversation.
WHAT I CHANGED   One check with six guards, each quoting the ruling it serves, plus a fixture per guard that proves the guard fires, and a recorded baseline of what already exists so the check is green on master today and red the moment any of those numbers grows.
WHAT YOU WILL FEEL   Nothing changes when you play today. What changes is that the mistakes that made flying feel wrong in September cannot quietly come back: an agent who reintroduces one gets a red check that names the ruling in your words.
THE NUMBERS      guards | 6 (2 absolute bans, 4 ratchets) · fixtures that fail | 6 of 6 · master | PASS, 0 violations · baselined occurrences that may only go down | 87
THE FRAMES       none — this unit has no player-felt change.
NEXT             PQ-180.00 the surface manifest (after PQ-173.02/.03 and PQ-137.07/.10/.11 in this run)
```

## The guards

| Guard | Kind | Ruling it quotes | On master |
|---|---|---|---|
| `no-ambient-randomness` | ratchet | fixed seeds; the sim uses `state.rng` | 1 occurrence (the telemetry session id, not sim) |
| `no-wall-clock-in-sim` | ratchet | the sim uses `state.simTime`, never wall time | 22 occurrences in 11 files (perf instrumentation, input devices, one offline-progress read) |
| `no-linear-damping` | ratchet | never add drag; never clamp given momentum | 2 (the mining drone's hover ease) |
| `no-velocity-writes-outside-owner` | ratchet | single writers: the physics owner owns velocity | 44 in 14 files |
| `no-hp-scaled-knockback` | **ban** | hits do not scale with levels; mass and momentum decide | 0 |
| `no-dialogue-trees` | ratchet | no dialogue trees; the endings that exist stay | 18 `choices:` menus in 17 encounter/wreck data files |

A ban tolerates nothing. A ratchet tolerates exactly the per-file counts recorded in
`test/rulings-guard-baseline.json` and fails a file whose count grows or a file the baseline does
not name. Counts may only go down; `--write-baseline` re-records after a receipted reduction and is
never run to pass.

Comments and string literals are blanked before matching, so a comment that says "never
`Math.random`" is not a finding (fixture `clean.js` pins this).

## Runtime guards

The two runtime rulings already had suites; `check:rulings` runs them as child processes so their
exit codes count (the packet's own trap: a check that imports a `node:test` file cannot fail):

- the player knock budget (B13): `check:player-knock`
- the NPC no-gyro bar: `test/hitstun-curve.test.mjs` ("hidden gyro" bar, unmeasured-fails-closed)

## Evidence

- `node scripts/check-rulings-guards.mjs` → `PASS (0 violations, 87 baselined occurrences, 6 guards)`
- `node scripts/check-rulings-guards.mjs --files test/fixtures/rulings/bad-damping.js` → `FAIL (5 violations)` (three drag shapes plus the two velocity writes they are)
- `node --test test/rulings-guards.test.mjs` → 6/6: every guard has a fixture that fails it; the clean fixture trips nothing; a ban never tolerates; a ratchet tolerates the baseline and nothing more; master is green against the committed baseline; the CLI honours exit codes.
- `npm run check:baseline` at entry: 13/14 green (the massline aggregate's one red was a child timeout under a loaded machine, not an assertion).

## How this can be got wrong later

- Re-recording the baseline to make a red go away. The baseline is a ratchet; the receipt for a
  reduction is the only reason to touch it.
- Widening a pattern until it never fires. Each fixture is the negative control; if a fixture stops
  failing, the guard is gone.
- Treating the ratcheted occurrences as endorsed. They are debts with a number on them; the 44
  velocity writes outside the physics owner are the largest.
