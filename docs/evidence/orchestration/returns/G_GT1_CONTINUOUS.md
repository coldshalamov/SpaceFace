# G_GT1_CONTINUOUS — Tier-A continuous goldenthread marks path

**Date:** 2026-07-17  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Rev at run:** `6475e2ef` (dirty tree may contain concurrent work)  
**Owner task:** GT1 continuous marks scaffold (Candle→ticker→bearing→unique→Band)  
**Fence:** no commit  

---

## 1) Scope

| In | Out |
|---|---|
| Tier-A continuous marks path on `naturalRoute` goldenthread spine | Full unassisted Tier-B continuous (Playwright, screenshots each beat) |
| Reuse D10 primary production path (no invent inject) | Fake `supporting:false` full-spine green |
| Band soak in the **same** session after unique claim | New SF-teleport / scan inject harness |
| Honest Candle Fleet probe + REAL residual when not embodied | Claiming H1c Candle DONE |
| Partial green with `supporting:true` | DONE stamp in `design/program/**` |

**Honesty bar:** continuous **unassisted** first-hour is **not product-ready**. This gate greens a **partial** mark contract on a continuous Tier-A session and **fails closed** against fake full green. Missing Candle Fleet is documented as **REAL** residual (H1c), not stamped as a mark.

---

## 2) Paths

| Kind | Path |
|---|---|
| Continuous harness | `scripts/check-depth-program-gt1-continuous.mjs` |
| Shared driver | `scripts/lib/naturalRoute.mjs` (`CONTENT_CLASSES.goldenthread`, `REQUIRED_MARKS_BY_CLASS.goldenthread`) |
| D10 primary reused (sequence) | `scripts/check-depth-program-r2-natural-d10-primary.mjs` production path |
| Package script | `check:depth-program:gt1:continuous` |
| Aggregate evidence | `.devshots/depth-program/gt1-continuous.json` |
| Per-seed evidence | `.devshots/depth-program/routes/gt1-continuous-goldenthread/A-<seed>.json` |
| This return | `docs/evidence/orchestration/returns/G_GT1_CONTINUOUS.md` |

---

## 3) Mark contracts

### Full goldenthread spine (F1 §6)

`new-game` → `candle-fleet` → `ticker` → `bearing` → `unique-wreck` → `band`

### Partial supporting contract (what greens today)

`new-game` → `ticker` → `bearing` → `unique-wreck` → `band`

| Mark | How it is earned (continuous session) |
|---|---|
| `new-game` | Tier-A Helios flight bootstrap (New Game → launch stand-in) |
| `candle-fleet` | **Only** if live landmark entity observed — **not stamped** today |
| `ticker` | `game:started` → native D10 news rumor (same as D10 primary carrier) |
| `bearing` | D10 rumored bearing record (fuzzy radius, Helios, news channel) |
| `unique-wreck` | Flight → `scanHere` → mining `fireGroup=2` salvage → `resolvePlayerChoice` claim |
| `band` | Same session: `band:cycle` (KeyO/HUD equivalent) + `bandRadio` soak post-claim |

---

## 4) Production path (no mid-chain wreck inject)

```
Tier-A boot Helios flight
  → candle probe (observe-only; no landmark inject)
  → game:started (run-start only)
  → native D10 news rumor (ticker + bearing marks)
  → fly velocity + physics.integrate to bearingCenter
  → session.scanHere → scanner scan:pulse from player pos
  → fly to live wreck → mining beam salvage → claim via resolvePlayerChoice
  → unique-wreck mark
  → band:cycle + bandRadio.update soak → band mark
```

Reuses D10 primary semantics; adds continuous band soak and goldenthread mark mapping. Does **not** invent a second inject path for scan/salvage/claim.

---

## 5) Gate result

```
npm run check:depth-program:gt1:continuous
→ exit 0
→ GT1 continuous PARTIAL OK: 2 seeds (supporting:true)
→ Full spine: pass=false
→ Residuals: candle-fleet:REAL (×2 seeds)
→ Naturalness: pass=true
```

| Metric | Value |
|---|---|
| Seeds (CI pair) | `48200`, `48201` (`D10_CI_SEEDS`) |
| Partial pass | **true** |
| Full spine pass | **false** |
| `supporting` | **true** |
| `primary` | **false** |
| Naturalness validator | **pass** |
| Residual | **candle-fleet : REAL** (H1c not embodied) |

---

## 6) Failure class log

| Class | This run |
|---|---|
| **REAL** | Candle Fleet not present as live landmark entity in Helios — full spine withheld |
| **STALE** | N/A |
| **HARNESS** | N/A |

Partial path green is intentional supporting evidence. Full continuous unassisted remains open product residual, not a faked green.

---

## 7) Residual (do not claim DONE)

1. **H1c Candle Fleet embodiment** — flavor/data + memorial zone exist; no live `landmark_c3_candle_fleet` entity at Helios. Blocks full spine mark `candle-fleet`.
2. **Tier-B unassisted continuous** — Playwright New Game → screenshots each beat, no SF staging, dual-platform as needed.
3. **Promote off `supporting:true`** — only when full spine greens without REAL residuals on continuous product path.
4. Optional: public band input action surface (today uses production `band:cycle` bus path matching UI KeyO/HUD).

---

## 8) Relationship to other GT1 artifacts

| Artifact | Role vs this gate |
|---|---|
| `check:depth-program:gt1:loot-audit` | Isolated loot-leak floor (still required; separate) |
| `capture-depth-program-gt1-gallery.mjs` / `G_GT1_GALLERY.md` | Supporting visual gallery (staged); not continuous marks proof |
| `check:depth-program:r2:natural-d10:primary` | Wreck mark spine primary; this gate reuses its production sequence inside goldenthread |
| This continuous harness | Tier-A continuous **partial** marks + honest REAL residual |

---

```
LIVE AUDIT: naturalRoute.mjs goldenthread marks, D10 primary, bandRadio, uniqueWrecks,
  G_GT1_GALLERY, F1_NATURAL_ROUTE_HARNESS_SPEC, 03_STATUS_BOARD GT1 row
DIFF SUMMARY:
  + scripts/check-depth-program-gt1-continuous.mjs
  ~ package.json (check:depth-program:gt1:continuous)
  + docs/evidence/orchestration/returns/G_GT1_CONTINUOUS.md
  + .devshots/depth-program/gt1-continuous.json (machine)
GATES: check:depth-program:gt1:continuous → exit 0 (2 seeds, supporting:true, partial marks);
  fullSpinePass=false; residual candle-fleet:REAL
FAILURE CLASS: REAL (candle-fleet H1c) — partial green only
PLAN DRIFT: none — continuous unassisted not claimed product-ready
RESIDUAL: H1c Candle embodiment; Tier-B continuous screenshots; promote off supporting when full spine greens
```
