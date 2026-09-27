<!-- LIFETIME: PROGRAM_RECORD -->
# PQ-208 receipt — build-identity drift guard and unwired verb keys

Accepted 2026-09-27. Both leaves were implemented by prior sittings; this sitting
closed the packet's remaining acceptance items: the chain wiring and the behavior
proof for the two keys.

## PQ-208.00 — drift guard (wiring)

`scripts/check-progression-verb-audit.mjs` existed and passed (18 verb keys verified
against live source, 0 declared-only) but was reachable by no chain: no
`check:progression-verb-audit` script existed and neither the `check` chain nor
`SMOKE_COMMANDS` named it. Wired in commit `43187e532`:

- `package.json`: new `check:progression-verb-audit` script; appended to the `check`
  chain tail (pure append, JSON validated).
- `scripts/check-ci-report.mjs`: `progression-verb-audit` entry in `SMOKE_COMMANDS`.
- Verified: `npm run check:progression-verb-audit` exits 0 with the 18/0 verdict.

## PQ-208.01 — the two keys (behavior proof)

`microJumpBlink` and `reactiveMissileKnockback` were declared in `src/data/modules.js`
and consumed in `src/systems/uniqueLootAbilities.js`, but no test proved the verbs
do anything. `test/pq-208-verb-keys.test.mjs` (4 tests, green) pins:

- A fitted Pale-Coil dash teleports the ship exactly `PALE_COIL_BLINK_DISTANCE`
  (240 WU) along its heading with velocity untouched, once per encounter; unfitted
  dashes do nothing.
- An incoming player-targeted missile is deflected (homing killed, target cleared,
  outward impulse at knockback speed or more), once per encounter; missiles hunting
  anyone else are untouched.

## Pointers

- Integrated: `43187e532` (package.json, scripts/check-ci-report.mjs,
  test/pq-208-verb-keys.test.mjs). Prior leaf work: `scripts/check-progression-verb-audit.mjs`,
  `src/systems/uniqueLootAbilities.js` + leaf reports `PQ-208.00-REPORT.md` / `PQ-208.01-REPORT.md`.
- Queue: leaves `.00`/`.01` carry `integratedCommit: 43187e532` and this receipt as
  `acceptanceRef`. Parent packets never flip in this queue; the leaves at `done`
  with pointers are the acceptance.
