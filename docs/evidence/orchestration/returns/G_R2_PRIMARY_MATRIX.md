# G — R2 natural primary matrix (12 wrecks)

**Date:** 2026-07-17  
**Branch:** `grok/depth-player-route-actualization`  
**Author:** Grok (spine)  
**Consumers:** Fable F0 task 6, R2 natural acceptance board, multi-seed literacy  

## Result

| Gate | Exit | Notes |
|---|---|---|
| `npm run check:depth-program:r2:natural-primary-matrix` | **0** | **12/12** wrecks fully green, 24/24 seed runs |
| `npm run check:depth-program:r2:natural-d10:primary` | **0** | claim path uses `resolvePlayerChoice` (not `_onChoose`) |
| Static naturalness validator | **pass** | no harness inject of scan/salvage/choose; no exactPos oracle |

**Primary acceptance:** yes — aggregate `supporting: false`, `primary: true`, shared seed matrix `[48200, 48201]`.

**Score:** **12/12 green**

## Paths

| Kind | Path |
|---|---|
| Matrix harness | `scripts/check-depth-program-r2-natural-primary-matrix.mjs` |
| D10 primary (shared pattern) | `scripts/check-depth-program-r2-natural-d10-primary.mjs` |
| Driver | `scripts/lib/naturalRoute.mjs` |
| Public carrier APIs | `src/systems/uniqueWrecks.js` → `surfaceAuthoredPrimaryCarrier`, `surfaceSectorCarriers`, `resolvePlayerChoice`, `completePlayerSalvage` |
| Package script | `check:depth-program:r2:natural-primary-matrix` |
| Aggregate evidence | `.devshots/depth-program/r2-natural-primary-matrix.json` |
| Per-wreck evidence | `.devshots/depth-program/routes/r2-primary-d{1..12}/A-{seed}.json` |
| Seed matrix (scratch) | `%TEMP%/grok-goal-696b88462e5d/implementer/wreck-seed-matrix.json` |
| Route log (scratch) | `%TEMP%/grok-goal-696b88462e5d/implementer/wreck-routes.log` |

## Production path exercised (per wreck)

```
carrier surface
  D10: game:started → native Helios news rumor
  others: uniqueWrecks.surfaceAuthoredPrimaryCarrier(wreckId)
          (+ surfaceSectorCarriers for sector-native D2/D6)
  → fly velocity + physics.integrate to charted bearingCenter
  → session.scanHere → input.actions.scanPulse (player.pos origin)
  → fly to live wreck entity
  → input.fireGroup = 2 → mining beam salvage
  → uniqueWrecks.resolvePlayerChoice (public claim API)
  → salvaged + durable reward receipt
```

### F1 forbidden patterns avoided

| Forbidden | Matrix handling |
|---|---|
| `bus.emit('scan:pulse'…)` | `session.scanHere()` only |
| `bus.emit('salvage:completed'…)` | mining system owns completion |
| `bus.emit('uniqueWreck:choose'…)` | `resolvePlayerChoice` public API |
| `player.pos` / teleport | velocity + physics.integrate only |
| `exactPos` oracle | approach uses `bearingCenter` then live wreck |
| `simTime` / tick skip | real ticks; radiation waits via `runTicks` |

## Carrier matrix (all 12)

| Slot | Wreck | Channel | Carrier surface | Seeds | Result |
|---|---|---|---|---|---|
| D1 | `wreck_isc_vigilant` | loss_investigation | `surfaceAuthoredPrimaryCarrier` | 48200, 48201 | GREEN |
| D2 | `wreck_dmc_ironsong` | comms_intercept | surface API + `surfaceSectorCarriers` | 48200, 48201 | GREEN |
| D3 | `wreck_isc_lighthouse` | campaign | `surfaceAuthoredPrimaryCarrier` (+ radiation window ticks) | 48200, 48201 | GREEN |
| D4 | `wreck_lanebreaker_pale_coil` | mission | `surfaceAuthoredPrimaryCarrier` (+ survey suite equip) | 48200, 48201 | GREEN |
| D5 | `wreck_choir_bell_aegis` | bark | `surfaceAuthoredPrimaryCarrier` | 48200, 48201 | GREEN |
| D6 | `wreck_gravhand_tideline` | news | surface API + `surfaceSectorCarriers` | 48200, 48201 | GREEN |
| D7 | `wreck_nestbreaker` | bar | `surfaceAuthoredPrimaryCarrier` | 48200, 48201 | GREEN |
| D8 | `wreck_deepsurvey` | bar | `surfaceAuthoredPrimaryCarrier` | 48200, 48201 | GREEN |
| D9 | `wreck_smokesong` | bar | `surfaceAuthoredPrimaryCarrier` | 48200, 48201 | GREEN |
| D10 | `wreck_choir_tender` | news | `game:started` | 48200, 48201 | GREEN |
| D11 | `wreck_mts_silver_draft` | bar | `surfaceAuthoredPrimaryCarrier` | 48200, 48201 | GREEN |
| D12 | `wreck_choir_cassandra` | campaign | `surfaceAuthoredPrimaryCarrier` | 48200, 48201 | GREEN |

## Seed policy

Shared seed matrix (documented, not per-wreck overfit):

| Set | Seeds |
|---|---|
| Matrix CI pair | `48200`, `48201` (`D10_CI_SEEDS`) |
| Seeds per wreck | 2 |
| Total runs | 24 (12 × 2) |

Scratch artifact: `wreck-seed-matrix.json` lists every wreck → seeds → pass.

## Marks (all green wrecks)

`carrier-surfaced` → `bearing-recorded` → `region-reached` → `scan-hardened` → `wreck-materialized` → `decision-opened` → `claim-resolved` → `reward-durable`

## D10 primary claim fix

`settleClaimChoice` now calls public `uniqueWrecks.resolvePlayerChoice` (not private `_onChoose`). Evidence stamps and aggregate notes updated to match.

## Failure class log

| Class | This run |
|---|---|
| **REAL** | none — all 12 primary carriers + salvage/claim paths green under multi-seed |
| **STALE** | none |
| **HARNESS** | none — naturalness validator pass; supporting:false |

## REAL residual honesty

**None for Tier-A primary matrix acceptance.** All 12 wrecks surface via production-public carrier APIs (or D10 `game:started`), harden under player-origin scan, salvage via mining beam, and settle via `resolvePlayerChoice`.

### Remaining out-of-scope residuals (not matrix reds)

1. **Tier B UI e2e** — bar click / campaign beat UI / loss-investigation panel / claim button DOM still not proven in browser Playwright (headless Tier A only).
2. **Earned campaign/mission progress** — matrix uses `surfaceAuthoredPrimaryCarrier` as the production `_surfaceCanonicalRumor` body (same as sector/dock/campaign handlers), not a full campaign playthrough to beat 6/7 or mission-board accept UI.
3. **Rapier-dynamic headless flight** — still uses `physicsBackend: 'custom'` integrate for velocity→position without WASM.
4. **Held-out seed expansion** — CI pair only; held-out ≥5 seeds remain optional soak.

## Exit codes

| Command | Exit |
|---|---|
| `check:depth-program:r2:natural-primary-matrix` | **0** |
| `check:depth-program:r2:natural-d10:primary` | **0** |

## Summary line

**12/12 green · exit 0 · REAL residuals: none (Tier A) · supporting:false · multi-seed shared [48200, 48201]**
