# P1 Gate Matrix — after integrity fixes

**Branch:** `grok/depth-player-route-actualization`  
**HEAD base:** `f277c5e7` + local uncommitted integrity fixes  
**Date:** 2026-07-17

## Focused Depth gates

| Gate | Result | Notes |
|---|---|---|
| `check:depth-program:f2` | GREEN | Encounter index regenerated; soak global-coords + zone patrol; one-voice soak matched |
| `check:depth-program:gt1:loot-audit` | GREEN | Live 13 combat tables pinned (was stale 8) |
| `check:unique-loot` | GREEN | |
| `check:doctrine-distinct` | GREEN | |
| `check:alpha:evidence:contract` | GREEN | AGENTS/program authority wiring updated |
| `check:depth-program:r1` | GREEN | Focused only — natural routes still open |
| `check:depth-program:r2` | GREEN | Focused only — natural routes still open |
| `check:depth-program:v1` | GREEN | Natural contact still open |
| `check:depth-program:v2` | GREEN | Flavor index regenerated |
| `check:depth-program:e1` | GREEN | Natural routes still open |
| `check:depth-program:a1` | GREEN | Physical Quiessence/Hush actors still open |
| `check:depth-program:a2` | GREEN | Player reachability still open |
| `check:depth-program:sp1` | GREEN | investigation destStation fixed; 10/10 modeled routes |
| `check:depth-program:k1` | GREEN | EMP disruptor one-hit disable envelope; multi-hit fixtures |
| `check:depth-program:s3` | GREEN | Hull assets still residual |

## Product fixes (not mere test weakening)

1. **Encounter soaks** — M2 global coordinates left sector-local harness poses permanently outside proximity zones; zone patrol + global boot conversion.
2. **Investigation SP1 stage** — `recover_the_black_box` had no `destStationId`, so dock settlement could never complete the chain; set return station to `station_reach`.
3. **EMP Disruptor** — dmg 45 left residual drive HP after attenuation; raised to 96 so the disable verb can actually disable starter drive (health 45).
4. **Generated indexes** — encounter + flavor graphs regenerated for 43/10 modules.

## Explicitly still not DONE

- Unassisted / multi-seed / browser+Electron player routes for R1/R2/E1/SP1/V1/GT1
- A1 physical Band actors
- A2 Ship’s Ledger wiring into a player-reachable screen
- S4 titles registration
- D1 natural fleet carriers for Helix / original nine
- Alpha live evidence corpus migration (contract only is green)
- Three polish gallery sweeps

## Changed files (integrity batch)

- `scripts/check-encounter-director.mjs`
- `scripts/check-encounter-one-voice.mjs`
- `scripts/check-depth-program-k1-behavior.mjs`
- `src/data/encounters/index.generated.js`
- `src/data/flavor/index.generated.js` (if present)
- `src/data/missions.js`
- `src/data/weapons.js`
- `test/alpha-evidence-checker.test.mjs`
- `test/depth-program-gt1-loot-audit.test.mjs`
- `test/depth-program-k1-fulfillment.test.mjs`
- `test/depth-program-sp1-duration.test.mjs`
- `docs/evidence/depth-actualization/*`
