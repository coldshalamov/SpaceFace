# Lab known gaps (honest coverage)

## N1 — Weapon heat vent (CLOSED for host divergence)

`weapons.js` forced heat vent (lockout + heat dump) is **authoritative combat behavior**.
It is gated on the profile feature `combat.weaponHeatVent` via `combatFlag(...)`, **not**
`typeof window`.

| Profile | `weaponHeatVent` |
|---|---|
| production | true |
| legacy47a | false (47-A combat cadence golden) |

Node and browser with the **same runtime profile** execute the same vent math.
Historical host-gated divergence is closed.

## H9 — RNG continuation coverage

Save envelopes serialize and restore:

- `core` mulberry32 continuation (`seed0` + internal `state` + `draws`)
- `weaponsEntropy` (`seed0` + `draws`)
- `traffic.rngSeed`

**Uncovered** streams (not restored; do not claim full multi-stream identity):

- `automation.meta.rngSeed`
- `claims.meta.rngSeed`
- `sectorSim.meta.rngSeed`
- `interventionMeta.rngSeed`
- other system-private RNGs

Save/load equivalence under the lab contract compares the **deterministic-covered surface**
(including covered entropy fields). It does **not** claim full RNG identity across uncovered
streams.

## N2 — `performance.now` in input.js

| Site | Classification |
|---|---|
| `updateAutoTargetPathDrawing` / path idle | **Gameplay** — uses `state.simTime` (`simClockMs`) |
| `recordAutoTargetPath` idle continuity | **Gameplay** — prefers `gesture.lastSimMs` |
| `_lastKbmMs` DOM stamps | **Diagnostic / device arbitration** only (real keyboard vs gamepad priority) |
| `flightV3` `nowMs()` | **Diagnostic** (`_diag.tickMs` only) |

## H12/H13 — Comparison policy hashing

`saveLoadEquivalence` is lifted into the compiled canonical artifact and included in
`scenarioDigest`. Two documents that differ only in comparison policy produce different digests.
