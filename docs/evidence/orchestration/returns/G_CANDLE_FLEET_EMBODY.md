# G_CANDLE_FLEET_EMBODY — H1c Candle Fleet physical carrier

**Date:** 2026-07-17  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Rev at run:** `2226e908` (dirty tree — candle data + harness + unit test uncommitted)  
**Owner task:** Verify `poi_memorial` stamps `flavorTargetRef=landmark_c3_candle_fleet`; GT1 continuous probe finds it  
**Fence:** no commit  

---

## 1) Verdict

| Claim | Class | Status |
|---|---|---|
| `poi_memorial` authored with `flavorTargetRef: landmark_c3_candle_fleet` | **REAL** (closed) | Live in `sectors.js` + `sectorAnchors.js` |
| **No new GLB** | **design intent** | Reuses existing `place_station_billboard` memorial mesh only |
| `world.js` stamps `flavorTargetRef` onto spawned POI entities | **REAL** (closed) | Spread at spawn time; no new world.js edit required |
| GT1 `probeCandleFleet` finds live Helios entity | **REAL** (closed) | After production `world.enterSector` in continuous harness |
| Full goldenthread spine mark `candle-fleet` stamps | **REAL** (closed) | `fullSpinePass=true` on CI seeds `48200`, `48201` |
| Prior residual “no live landmark entity” | **STALE** | Superseded by stamped memorial POI materialization |
| Electron dual-platform / Tier-B unassisted continuous | **REAL** (open product residual) | Not closed by this Tier-A mark path |

**Bottom line:** H1c Candle Fleet embodiment is **REAL and green** on the Tier-A continuous path via **flavorTargetRef on `poi_memorial`** (no new GLB). The historical `candle-fleet:REAL` residual from `G_GT1_CONTINUOUS.md` is now **STALE**. Product residual that remains is dual-platform / unassisted Tier-B only.

---

## 2) What was verified

### 2.1 Data → entity stamp

| Layer | Path | Fact |
|---|---|---|
| Sector def | `src/data/sectors.js` | `poi_memorial` on Helios: name `Candle Fleet Memorial`, `flavorTargetRef: 'landmark_c3_candle_fleet'`, `bandProximityRadius: 1400` |
| Anchors | `src/data/sectorAnchors.js` | Same `flavorTargetRef` + `landmarkGlb: place_station_billboard` merge overlay |
| Flavor pack | `src/data/flavor/080-landmark-lore.js` | `candle_fleet` / `targetRef: landmark_c3_candle_fleet` / Helios memorial zone |
| World spawn | `src/systems/world.js` (~1244) | `...(poi.flavorTargetRef ? { flavorTargetRef: String(poi.flavorTargetRef) } : {})` |

`applySectorAnchors` merges `{ ...poiDef, ...anchor }` so both def and anchor stamps survive materialization.

### 2.2 Live materialization (unit + ad-hoc)

`world.enterSector('sector_helios_prime')` yields one live `fx` entity:

- `poiId: poi_memorial`
- `flavorTargetRef: landmark_c3_candle_fleet`
- `name: Candle Fleet Memorial`
- `landmark: true`
- `bandProximityRadius: 1400`
- galactic-global pos from authored local `(1680, -820)`

### 2.3 GT1 continuous probe

`probeCandleFleet` (observe-only) matches:

- `data.flavorTargetRef === 'landmark_c3_candle_fleet'`, or
- blob/name contains `candle` / `landmark_c3`

**Root cause of prior REAL residual:** continuous harness set `currentSectorId` only and never ran `world.enterSector`, so POIs never spawned. That was a **HARNESS** gap relative to product world boot — not a missing flavor authoring seam once data stamps landed.

**Fix (honest production path):** continuous systems include `spawnBudget` + `world`; after player spawn, `enterHeliosForCandle` calls `world.enterSector(HELIOS_SECTOR)` (same entry main.js uses). No landmark entity inject.

---

## 3) Gate results

```
node --test test/depth-program-a1-physical-actors.test.mjs
→ 6 pass / 0 fail
→ includes: Helios Prime materializes stamped Candle Fleet memorial (H1c carrier)

npm run check:depth-program:gt1:continuous
→ exit 0
→ GT1 continuous FULL SPINE OK: 2 seeds (supporting:false)
→ Full spine: pass=true
→ Residuals: electron-dual-platform:REAL
→ Naturalness: pass=true
```

| Metric | Value |
|---|---|
| Seeds | `48200`, `48201` |
| Partial marks | **pass** |
| Full spine | **pass** |
| `candle-fleet` mark | **stamped** (embodied) |
| Aggregate `supporting` | **false** (Tier-A marks complete) |
| Aggregate `primary` | **false** (dual-platform not claimed) |
| `productReadyUnassisted` | **false** |
| Mark residual | **none** |
| Product residual | **electron-dual-platform : REAL** |

Machine evidence: `.devshots/depth-program/gt1-continuous.json`

---

## 4) Failure class log (this residual)

| Item | Prior (`G_GT1_CONTINUOUS`) | Now | Class |
|---|---|---|---|
| Live `landmark_c3_candle_fleet` / memorial stamp | Missing entity → full spine withheld | Entity present after enterSector | **STALE** (was REAL H1c gap; closed) |
| Continuous harness omitting `world.enterSector` | Implicit (probe empty) | Fixed to production enter | **STALE HARNESS** (closed) |
| `flavorTargetRef` stamping in `world.js` | Already present | Confirmed | **REAL closed** (no code gap) |
| Tier-B Playwright continuous / Electron dual-platform | Open | Still open | **REAL** product residual |
| Authored GLB unique to Candle Fleet | N/A (reuses memorial billboard) | Intentional reuse | Not a failure — design choice |

---

## 5) Diff summary (uncommitted)

| Path | Change |
|---|---|
| `src/data/sectors.js` | `poi_memorial` Candle Fleet carrier fields + `flavorTargetRef` |
| `src/data/sectorAnchors.js` | `flavorTargetRef` on memorial anchor |
| `src/systems/world.js` | **no edit** — stamp path already present |
| `scripts/check-depth-program-gt1-continuous.mjs` | Register `world`/`spawnBudget`; `enterHeliosForCandle`; accept embodied full spine; product residual electron dual-platform |
| `test/depth-program-a1-physical-actors.test.mjs` | Helios Candle Fleet stamp + probe contract test |
| This return | `docs/evidence/orchestration/returns/G_CANDLE_FLEET_EMBODY.md` |

---

## 6) Residual (do not claim DONE)

1. **Electron dual-platform / Tier-B unassisted continuous** — REAL product residual. Tier-A full spine green is not primaryAcceptance dual-platform.
2. **Optional presentation depth** — scanPulse / Band proximity soak at memorial is not required for the `candle-fleet` mark; Quiessence-style census fleet hulls are not used for H1c (single memorial carrier by design).
3. Do **not** update `design/program/**` DONE stamps from this return alone. Orchestration stamps live in `returns/DONE_STAMPS.md` (H1c + GT1 continuous Tier-A only).

---

## 7) Relationship to other returns

| Artifact | Relationship |
|---|---|
| `G_GT1_CONTINUOUS.md` | Prior partial green + `candle-fleet:REAL` — **STALE** for candle residual; re-run is full spine `supporting:false` |
| `G_GT1_GALLERY.md` | Supporting gallery; not continuous marks proof |
| `DONE_STAMPS.md` | H1c Candle DONE Tier-A + GT1 continuous DONE primary Tier-A; Electron dual-platform remains non-DONE |
| `packets/RESIDUAL_FREEZE.md` | Candle mark residual removed from freeze; Electron dual-platform kept open |

---

```
LIVE AUDIT: world.js flavorTargetRef stamp, sectors/sectorAnchors poi_memorial,
  probeCandleFleet, enterHeliosForCandle, G_GT1_CONTINUOUS residual claim
DIFF SUMMARY:
  ~ src/data/sectors.js, src/data/sectorAnchors.js (flavorTargetRef carrier)
  ~ scripts/check-depth-program-gt1-continuous.mjs (world materialize + full spine)
  ~ test/depth-program-a1-physical-actors.test.mjs (Helios candle unit)
  + docs/evidence/orchestration/returns/G_CANDLE_FLEET_EMBODY.md
GATES: node --test depth-program-a1-physical-actors → 6/6;
  check:depth-program:gt1:continuous → exit 0, fullSpinePass=true, supporting:false
FAILURE CLASS: prior candle-fleet REAL → STALE; open REAL = electron-dual-platform only
PLAN DRIFT: none — no dual-platform primaryAcceptance claim; productReadyUnassisted=false
RESIDUAL: Electron dual-platform / Tier-B unassisted continuous
```
