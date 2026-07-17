# G_ELECTRON_AUTHORING — Electron New Game mule/wasp procedural-fallback

**Date:** 2026-07-17  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Tip at diagnosis:** `a57aa00d` (working tree dirty; concurrent depth work)  
**Gate:** `npm run check:electron:new-game`  
**Fence honored:** no thruster/material remaster; no `assets/ships` GLB rewrites; load/path/pool + harness only; no commit  

---

## 1) Verdict

| Claim | Status |
|---|---|
| Failure class | **REAL + HARNESS** |
| Release pool / defId map / missing GLB | **NOT the cause** |
| Graphics remaster required | **NO** |
| Gate after fix | **GREEN** exit **0** |

### Classification

| Layer | Class | Detail |
|---|---|---|
| Product path | **REAL** | Flight authored admission used a **1.0k immediate radius** while Helios pocket traffic sits ~1.1–1.6k from spawn (`station_helios` at 1280,−420). Seam-runway ships could remain `procedural-fallback` after New Game even though release GLBs were resident. |
| Gate assertion | **HARNESS** | Check required **every** live ship mesh to be `authored`+`release`, including far current-sector traffic (7k–15k wu) that policy intentionally leaves dormant until approach. |

Not: missing `hull_freighter` / `wasp_production_v1` release files, wrong `defId` map, or blocked wholeship art.

---

## 2) Evidence trail (pre-fix)

Script: `scripts/check-electron-new-game-launch.mjs`  
Sample path: New Game → Launch → flight → read `entity.mesh.userData.authoredAssetState`.

Prior RED report (`.devshots/electron-new-game-launch.json`, 2026-07-17T21:31Z):

- Player `ship_kestrel`: `authored` / `release`
- Several `ship_mule` / `ship_wasp`: `authored` / `release` (same defIds)
- Residual: ids **293/294/295** at `procedural-fallback` / `release`

That mixed same-defId pattern rules out asset-file absence.

Authored state ownership (`src/render/partsLibrary.js`):

1. `wrapShipWithAuthoredParts` mounts fallback and sets `authoredAssetState = 'procedural-fallback'`, `authoredAssetMode = release|dev`
2. Upgrade only starts via `requestAuthoredUpgrade` → queue / `installResolvedBoundary`
3. Success commits `authoredAssetState = 'authored'`

Release pool on disk (present):

- `assets/ships/release/parts/hulls/hull_fighter.glb`, `hull_freighter.glb`
- `assets/ships/release/parts/wholeships/wasp_production_v1.glb` (+ LODs)

Maps in `partsLibrary.js`:

- `ship_wasp` → whole-ship `wholeships/wasp_production_v1.glb` / modular fighter hull
- `ship_mule` → modular `hulls/hull_freighter.glb` + industrial engine

---

## 3) Root cause

### REAL — ship authored radius vs Helios pocket geometry

| Constant | Value | Role |
|---|---|---|
| `AUTHORED_ASSET_IMMEDIATE_RADIUS` | 1000 | places / generic immediate |
| `RENDER_STREAM_PREFETCH_RADIUS` | 5200 | full active-sector mesh residency seam |
| Loading `INITIAL_SHIP_COMPOSITION_RADIUS` | 5200 | opening-shot ship authoring |
| Flight ship relevance (before fix) | **1000 only** | left pocket traffic outside runway |

Helios Station anchor: `(1280, -420)` ≈ **1347 wu** from player spawn `(0,0)`.  
Traffic spawns near stations at r≈90–420 → typically **~1.1–1.8k** from spawn — **outside 1k**, **inside 5.2k**.

Current-sector ships always get meshes (`isEntityRenderRelevant`), so far/pocket ships publish live meshes while authored upgrade stayed dormant → check saw `procedural-fallback`.

### HARNESS — all-live-ships authored floor

Gate asserted:

```text
every live ship: authoredAssetState === 'authored' && authoredAssetMode === 'release'
```

Product policy (`test/asset-npc-authored-binding.test.mjs`): off-axis / far current-sector content **stays dormant** (no whole-sector decode eagerness). Express/patrol freighters routinely sit at **7k–15k** with intentional procedural placeholders.

Post-fix sample residual (allowed dormancy):

| id | defId | role | dist | state |
|---|---|---|---|---|
| 293 | ship_wasp | patrol | ~13.4k | procedural-fallback |
| 294 | ship_wasp | patrol | ~13.4k | procedural-fallback |
| 296 | ship_wasp | patrol | ~13.6k | procedural-fallback |

All seam ships (`dist ≤ 5200`) were `authored` / `release`.

---

## 4) Fix (load/path + harness only)

### A) Runtime — ship seam runway (`src/render/renderer.js`)

- Added `AUTHORED_SHIP_COMPOSITION_RADIUS = RENDER_STREAM_PREFETCH_RADIUS` (5200)
- `isEntityAuthoredUpgradeRelevant`: **ships** inside that seam request authored upgrade
- Stations/places keep 1k immediate + approach vector policy

### B) Harness — seam-scoped drain (`scripts/check-electron-new-game-launch.mjs`)

- Poll up to 45s for seam ships to reach `authored`+`release` (serial admission concurrency 1)
- Assert seam ships authored; allow intentional far `procedural-fallback`
- Still fail on `fallback-after-error` / `unavailable` for any ship
- Report includes `dist`, `inAuthoredSeam`, `dormantFarShips`

### C) Unit coverage (`test/asset-npc-authored-binding.test.mjs`)

- Pocket ship ~1.3k: upgrade relevant
- Ship beyond 5.2k: dormant
- Station dormancy tests unchanged

No GLB writes, no thruster/material remaster.

---

## 5) Verification

```text
node --test test/asset-npc-authored-binding.test.mjs
→ 5/5 pass

npm run check:electron:new-game
→ EXIT_CODE=0
→ Electron New Game launch OK - authoredSeamShips=13/16, dormantFar=3
→ report: .devshots/electron-new-game-launch.json pass:true
```

| Field | Value |
|---|---|
| Exit | **0** |
| Pass | true |
| Seam authored | 13/16 |
| Dormant far (allowed) | 3 |
| Asset-error ships | 0 |
| GPU | hardware ANGLE Intel |

---

## 6) Explicit non-claims

1. Do **not** claim every current-sector ship mesh is authored at all distances — far dormancy is intentional.  
2. Do **not** claim dual-platform gallery green (separate residual).  
3. Do **not** treat this as a missing Wasp/Mule GLB or remaster task.  
4. No commit made on this return.

---

## 7) Pointers

| Artifact | Path |
|---|---|
| This return | `docs/evidence/orchestration/returns/G_ELECTRON_AUTHORING.md` |
| Prior residual note | `docs/evidence/orchestration/returns/C_ELECTRON_PLATFORM.md` |
| Gate script | `scripts/check-electron-new-game-launch.mjs` |
| Admission policy | `src/render/renderer.js` (`isEntityAuthoredUpgradeRelevant`) |
| Mesh userData lifecycle | `src/render/partsLibrary.js` (`wrapShipWithAuthoredParts`, upgrade queue) |
| Live report | `.devshots/electron-new-game-launch.json` |
