# G_GT1_CONTINUOUS — Tier-A continuous goldenthread marks path

**Date:** 2026-07-17  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Rev at run:** `2226e908` (dirty tree: candle POI data + continuous harness; no commit)  
**Owner task:** GT1 continuous marks after H1c Candle POI land  
**Fence:** no commit  

---

## 1) Scope

| In | Out |
|---|---|
| Tier-A continuous marks path on `naturalRoute` goldenthread spine | Full unassisted Tier-B continuous (Playwright, screenshots each beat) |
| Multi-seed CI pair ≥2 (held-out via `GT1_CONTINUOUS_SEED_MODE=held-out`) | Claiming Electron dual-platform primaryAcceptance DONE |
| Production `world.enterSector` → live `poi_memorial` Candle Fleet | Landmark entity inject / fake candle stamp |
| Stamp `candle-fleet` when live entity present | DONE stamp in `design/program/**` |
| `supporting:false` when full spine greens | Claiming product-ready unassisted first-hour continuous |

**Honesty bar:** Tier-A continuous **full goldenthread marks** now green when Candle Fleet is embodied via production sector entry. **Electron dual-platform / Tier-B unassisted continuous** remains an honest product residual — never claim dual-platform golden-thread primaryAcceptance DONE from this gate alone.

---

## 2) Paths

| Kind | Path |
|---|---|
| Continuous harness | `scripts/check-depth-program-gt1-continuous.mjs` |
| Shared driver | `scripts/lib/naturalRoute.mjs` (`CONTENT_CLASSES.goldenthread`, `REQUIRED_MARKS_BY_CLASS.goldenthread`) |
| Candle POI data | `src/data/sectors.js` + `src/data/sectorAnchors.js` (`poi_memorial`, `flavorTargetRef=landmark_c3_candle_fleet`) |
| World materialization | `src/systems/world.js` `_spawnPOIs` / `enterSector` |
| D10 primary reused (sequence) | `scripts/check-depth-program-r2-natural-d10-primary.mjs` production path |
| Package script | `check:depth-program:gt1:continuous` |
| Aggregate evidence | `.devshots/depth-program/gt1-continuous.json` |
| Per-seed evidence | `.devshots/depth-program/routes/gt1-continuous-goldenthread/A-<seed>.json` |
| This return | `docs/evidence/orchestration/returns/G_GT1_CONTINUOUS.md` |
| Electron residual owner | `docs/evidence/orchestration/packets/ELECTRON_RESIDUAL_ONLY.md` |

---

## 3) Mark contracts

### Full goldenthread spine (F1 §6) — **greens today**

`new-game` → `candle-fleet` → `ticker` → `bearing` → `unique-wreck` → `band`

### Partial contract (fallback if candle missing)

`new-game` → `ticker` → `bearing` → `unique-wreck` → `band`

| Mark | How it is earned (continuous session) |
|---|---|
| `new-game` | Tier-A Helios flight bootstrap + production `world.enterSector` |
| `candle-fleet` | Observe-only probe of live entity with `flavorTargetRef=landmark_c3_candle_fleet` (stamped after Helios enter) |
| `ticker` | `game:started` → native D10 news rumor (same as D10 primary carrier) |
| `bearing` | D10 rumored bearing record (fuzzy radius, Helios, news channel) |
| `unique-wreck` | Flight → `scanHere` → mining `fireGroup=2` salvage → `resolvePlayerChoice` claim |
| `band` | Same session: `band:cycle` (KeyO/HUD equivalent) + `bandRadio` soak post-claim |

---

## 4) Production path (no mid-chain wreck / landmark inject)

```
Tier-A boot flight mode
  → spawn player
  → world.enterSector(sector_helios_prime)  // production; materializes poi_memorial
  → candle probe (observe-only; stamp if live)
  → game:started (run-start only)
  → native D10 news rumor (ticker + bearing marks)
  → fly velocity + physics.integrate to bearingCenter
  → session.scanHere → scanner scan:pulse from player pos
  → fly to live wreck → mining beam salvage → claim via resolvePlayerChoice
  → unique-wreck mark
  → band:cycle + bandRadio.update soak → band mark
```

Reuses D10 primary semantics; adds continuous band soak, Helios POI materialization, and goldenthread mark mapping. Does **not** invent a second inject path for scan/salvage/claim/landmark.

---

## 5) Gate result

```
npm run check:depth-program:gt1:continuous
→ exit 0
→ GT1 continuous FULL SPINE OK: 2 seeds (supporting:false)
→ Full spine: pass=true
→ Residuals: electron-dual-platform:REAL  (product residual only; no candle mark residual)
→ Naturalness: pass=true
```

| Metric | Value |
|---|---|
| Seeds (CI pair ≥2) | `48200`, `48201` (`D10_CI_SEEDS`) |
| Held-out option | `GT1_CONTINUOUS_SEED_MODE=held-out` → `naturalRouteSeeds.json` (≥5) |
| Partial pass | **true** |
| Full spine pass | **true** |
| `supporting` | **false** |
| `primary` (aggregate dual-platform) | **false** — dual-platform primaryAcceptance not claimed |
| Tier-A continuous marks | **primary for this gate** when `fullSpinePass` + `supporting:false` |
| Naturalness validator | **pass** |
| Mark residual | **none** (candle embodied and stamped) |
| Product residual | **electron-dual-platform : REAL** only |

---

## 6) Failure class log

| Class | This run |
|---|---|
| **REAL** | Product residual only: Electron dual-platform / Tier-B unassisted continuous not closed |
| **STALE** | N/A |
| **HARNESS** | N/A |

Candle Fleet is **embodied** as live `poi_memorial` after `world.enterSector`. Full Tier-A spine greens with `supporting:false`. Dual-platform gallery / unassisted Playwright continuous remains open product residual — do **not** stamp GT1 continuous dual-platform DONE.

---

## 7) Residual (do not claim DONE)

1. **Electron dual-platform / Tier-B unassisted continuous** — honest product residual when full spine greens. See `packets/ELECTRON_RESIDUAL_ONLY.md`. Browser gallery supporting; Electron parity not closed.
2. **Promote productReadyUnassisted** — only with Tier-B Playwright New Game → screenshots each beat, no SF staging, dual-platform as needed.
3. Optional: public band input action surface (today uses production `band:cycle` bus path matching UI KeyO/HUD).

**Closed vs prior return:** H1c Candle Fleet live-entity residual is **closed for Tier-A continuous marks** (stamp on live entity after production sector entry).

---

## 8) Relationship to other GT1 artifacts

| Artifact | Role vs this gate |
|---|---|
| `check:depth-program:gt1:loot-audit` | Isolated loot-leak floor (still required; separate) |
| `capture-depth-program-gt1-gallery.mjs` / `G_GT1_GALLERY.md` | Supporting visual gallery (staged); not continuous marks proof |
| `check:depth-program:r2:natural-d10:primary` | Wreck mark spine primary; this gate reuses its production sequence inside goldenthread |
| `test/depth-program-a1-physical-actors.test.mjs` | Unit proof Helios materializes stamped Candle memorial |
| This continuous harness | Tier-A continuous **full** goldenthread marks + honest Electron dual-platform product residual |

---

```
LIVE AUDIT: naturalRoute.mjs goldenthread marks, D10 primary, bandRadio, uniqueWrecks,
  world.enterSector + poi_memorial flavorTargetRef, A1 physical actors candle test,
  G_GT1_GALLERY, F1_NATURAL_ROUTE_HARNESS_SPEC, 03_STATUS_BOARD GT1 / Electron rows
DIFF SUMMARY:
  ~ scripts/check-depth-program-gt1-continuous.mjs
    (world+spawnBudget, enterHeliosForCandle, multi-seed CI/held-out ≥2,
     stamp candle-fleet when live, supporting:false on full spine,
     product residual electron-dual-platform only)
  ~ src/data/sectors.js / sectorAnchors.js (candle POI flavorTargetRef — concurrent land)
  ~ docs/evidence/orchestration/returns/G_GT1_CONTINUOUS.md
  ~ .devshots/depth-program/gt1-continuous.json (machine)
GATES: check:depth-program:gt1:continuous → exit 0
  (2 seeds, supporting:false, fullSpinePass=true; product residual electron-dual-platform:REAL)
FAILURE CLASS: REAL product residual only (Electron dual-platform) — candle mark residual closed
PLAN DRIFT: none — dual-platform primaryAcceptance / productReadyUnassisted not claimed
RESIDUAL: Electron dual-platform + Tier-B unassisted continuous screenshots
```
