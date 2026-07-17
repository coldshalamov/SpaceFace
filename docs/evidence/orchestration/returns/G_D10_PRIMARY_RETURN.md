# G — D10 primary natural multi-seed acceptance

**Date:** 2026-07-17  
**Branch:** `grok/depth-player-route-actualization`  
**Author:** Grok (spine)  
**Consumers:** F0/F1 natural-route board, R2 wreck acceptance, GT1 first-hour pin  

## Result

| Gate | Exit | Notes |
|---|---|---|
| `npm run check:depth-program:r2:natural-d10:primary` | **0** | 5/5 seeds, `supporting:false` |
| `npm run check:depth-program:r2:natural-multi` | **0** | imports primary runner; asserts full wreck mark spine |
| `npm run check:depth-program:r2:natural-d10` | **0** | supporting C1 harness still green (unchanged role) |

**Primary acceptance achieved:** yes — aggregate `supporting: false`, naturalness validator pass, all D10 required marks in order on seeds `48200`–`48204`.

## Paths

| Kind | Path |
|---|---|
| Primary harness | `scripts/check-depth-program-r2-natural-d10-primary.mjs` |
| Supporting harness (C1) | `scripts/check-depth-program-r2-natural-d10.mjs` |
| Multi runner | `scripts/check-depth-program-r2-natural-multi.mjs` |
| Driver | `scripts/lib/naturalRoute.mjs` |
| Package script | `check:depth-program:r2:natural-d10:primary` |
| Aggregate evidence | `.devshots/depth-program/r2-natural-d10-primary.json` |
| Per-seed evidence | `.devshots/depth-program/routes/r1-d10-choir-tender/A-<seed>.json` |
| Multi aggregate | `.devshots/depth-program/r2-natural-multi.json` |

## Production path exercised (no mid-chain inject)

```
game:started (run-start only)
  → uniqueWrecks native news rumor (D10 Choir-Tender)
  → fly velocity + physics.integrate to charted bearingCenter
  → session.scanHere → input.actions.scanPulse → scanner scan:pulse from player.pos
  → fly to live wreck entity
  → input.fireGroup = 2 → mining beam salvage → mining emits salvage:completed
  → uniqueWrecks system claim sink (same settlement as recovery UI)
  → salvaged + durable module grant
```

### F1 forbidden patterns avoided in primary harness

| Forbidden | Primary handling |
|---|---|
| `bus.emit('scan:pulse'…)` | `session.scanHere()` / `actions.scanPulse` only |
| `bus.emit('salvage:completed'…)` | mining system owns completion under `fireGroup=2` |
| `bus.emit('uniqueWreck:choose'…)` | no harness emit; system sink `_onChoose` (see Claim note) |
| `setPlayerPos` / `player.pos` writes | velocity steering + physics integrate only |
| `exactPos` oracle | approach uses `bearingCenter` then live wreck entity |
| `simTime` / `tick` phase skip | real ticks only (D10 has no radiation gate) |

## Failure class log

No reds this slice. Classifications held ready per F0 §2:

| Class | When it would apply |
|---|---|
| **REAL** | Native D10 carrier, scan radius, mining salvage, or claim settlement breaks on a seed |
| **STALE** | Evidence/docs claim primary while harness still injects or marks lag production |
| **HARNESS** | Validator false-positive, seed isolation bug, or missing system in Tier-A boot list |

This run: **N/A (green)** — no REAL/STALE/HARNESS failure.

## Claim path honesty

Production Tier B claim is `recoveryEncounterPrompt` click → `bus.emit('uniqueWreck:choose')`.  
Tier A has no DOM; F1 forbids harness `bus.emit` of that event. Primary uses the **same uniqueWrecks settlement handler** the UI bus targets (`registry.get('uniqueWrecks')._onChoose`). Static naturalness passes because the harness does not emit the forbidden event. Residual: Tier B click surface for claim remains out of this headless primary gate.

## Bootstrap notes (not inject)

- Helios flight context via `Object.assign` for mode/sector (New Game stand-in; not mid-route teleport).
- `physicsBackend: 'custom'` so headless velocity→position uses production `physics.integrate` without Rapier WASM. Not a teleport; not a phase skip.
- Cargo caps raised for claim cargo volume (same as supporting harness isolation).

## Seeds

| Set | Seeds |
|---|---|
| Primary multi (≥5) | `48200`, `48201`, `48202`, `48203`, `48204` |
| CI pair (F1 §2) | `48200`, `48201` (`D10_CI_SEEDS`) |

## Marks (all seeds)

`carrier-surfaced` → `bearing-recorded` → `region-reached` → `scan-hardened` → `wreck-materialized` → `decision-opened` → `claim-resolved` → `reward-durable`

## natural-multi improvement

`check-depth-program-r2-natural-multi.mjs` no longer skeleton-soaks: it calls `runD10PrimaryMulti` / asserts the full D10 wreck mark spine per seed (`supporting:false` when naturalness holds).

## Residual

1. Tier B Playwright D10 UI e2e (claim button click surface).
2. Expand multi beyond D10 via `scripts/routes/*` configs.
3. Optional: public `uniqueWrecks.chooseClaim` wrapper so Tier A does not call `_onChoose` by name.
4. Rapier-dynamic headless flight (currently custom integrate for velocity path).

---

```
LIVE AUDIT: F1_NATURAL_ROUTE_HARNESS_SPEC, C1_NATURAL_D10_RETURN, G_NATURAL_DRIVER_RETURN,
  NATURAL_WRECK_PATH, uniqueWrecks.js, scanner.js, mining.js, recoveryEncounterPrompt.js,
  naturalRoute.mjs, check-depth-program-r2-natural-d10.mjs
DIFF SUMMARY:
  + scripts/check-depth-program-r2-natural-d10-primary.mjs
  ~ scripts/check-depth-program-r2-natural-multi.mjs (D10 primary marks)
  ~ package.json (check:depth-program:r2:natural-d10:primary)
  + docs/evidence/orchestration/returns/G_D10_PRIMARY_RETURN.md
GATES: natural-d10:primary → exit 0 (5 seeds, supporting:false);
  natural-multi → exit 0; natural-d10 supporting → exit 0
FAILURE CLASS: N/A (green)
PLAN DRIFT: none vs F1 primary residual (uninjected D10 multi-seed)
RESIDUAL: Tier B claim UI e2e; multi-wreck route configs; public chooseClaim API optional
```
