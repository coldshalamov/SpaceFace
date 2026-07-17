# G_GT1_GALLERY — GT1 / literacy closeout gallery + gates

**Date:** 2026-07-17  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Rev at capture:** `108f139d` (dirty tree may contain concurrent work)  
**Owner task:** GT1 literacy closeout — gallery + loot floor + literacy surfaces + dual-platform note  
**Fence:** no commit; graphics/assets lanes untouched  

---

## 1) Scope

| In | Out |
|---|---|
| Inventory existing depth/first-hour capture scripts | Full unassisted goldenthread natural route (Tier B continuous) |
| New supporting gallery harness + ≥15 durable shots | Stretch ~40-shot “every landmark / ship line / postcard” archive |
| Literacy gates: unique-loot, GT1 loot-audit, A1 Band, A2 ledger, R1, validators | Archive full `npm run check` (still residual) |
| Browser primary capture; Electron boot attempt | Electron dual-platform gallery parity |
| Manifest under `.devshots` + `docs/evidence/depth-actualization/` | DONE stamp in `design/program/**` |

**Honesty bar:** gallery is **PARTIAL** vs stretch 40; **meets minimum 15** (29 shots). Candle Fleet is **not embodied** as a live landmark entity (H1c residual). Claim/salvage frames are **staged** (supporting), not unassisted natural-route proof.

---

## 2) Existing capture / gallery inventory (found)

No dedicated pre-existing **GT1 gallery** script. Closest durable harnesses:

| Script | Role | Typical shot count |
|---|---|---|
| `scripts/capture-depth-program-a1.mjs` | Band listening tour + priority yield + numbers bearing | ~10 |
| `scripts/capture-depth-program-r2.mjs` | 12 wreck claims + rumor surfaces | ~15 |
| `scripts/capture-depth-program-v1.mjs` | 15 contact voice registers | 15 |
| `scripts/capture-depth-program-sp1.mjs` | Set-piece route frames | ≥29 asserted |
| `scripts/capture-depth-program-e1.mjs` / `k1.mjs` | Encounter / faction map | few |
| `scripts/capture-station-tabs.mjs` | Station tab matrix | ~7 |
| `scripts/lib/naturalRoute.mjs` | Shared driver; goldenthread marks defined; **Tier-B continuous GT1 not implemented** | evidence JSON |
| **NEW** `scripts/capture-depth-program-gt1-gallery.mjs` | First-hour literacy surfaces in one headed browser pass | **29** |

At run start, `.devshots/depth-program/**` held route JSON only (0 PNGs under depth-program). Gallery shots are newly produced.

---

## 3) Gallery harness

| Path | Role |
|---|---|
| `scripts/capture-depth-program-gt1-gallery.mjs` | Headed Playwright Chrome, visual probe server, seed `48200` (D10 CI) |
| `.devshots/depth-program/gt1-gallery/*.png` | Machine screenshots |
| `.devshots/depth-program/gt1-gallery/manifest.json` | Shot index + beat tags + candle probe |
| `docs/evidence/depth-actualization/gt1-gallery-manifest.json` | Promoted manifest copy |

### Classification

- **supporting: true** — travel/content may use `window.SF` / registry staging (same family as A1/R2 capture harnesses).
- **Not** primary unassisted goldenthread acceptance (F1 §6 Tier B continuous marks).
- Time frozen via `timeEffects` for stable frames; onboarding suppressed after boot.

### Run result

```
node scripts/capture-depth-program-gt1-gallery.mjs
→ exit 0
→ shots=29 failures=0
```

| Metric | Value |
|---|---|
| Shots | **29** |
| Minimum (≥15) | **MET** |
| Stretch (~40) | **PARTIAL** (29/40) |
| Platform | browser (Chrome headed) |
| Seed | 48200 |
| Capture failures | 0 |

### Goldenthread beat coverage (supporting frames)

| Beat | Shots | Notes |
|---|---|---|
| new-game | 2 | Main menu + New Game screen |
| candle-fleet | 2 | Helios spawn / overview only — **no Candle Fleet entity** (`entityCount: 0`) |
| ticker | 3 | D10 rumor surface + station hub/bar |
| bearing | 3 | Map + Helios search + fuzzy search-area map |
| unique-wreck | 3 | Region / post-scan / claim-or-receipt (**staged**; phase reached `fixed`, not full natural salvage UI proof) |
| band | 9 | 7 tuner channels + numbers reprise + HUD chip |
| misc | 7 | Station market/factions/shipworks/contracts, pause, help, close |

### Shot list

| File | Beat | Caption |
|---|---|---|
| `01-main-menu.png` | new-game | Main menu |
| `02-new-game.png` | new-game | New Game setup |
| `03-flight-helios-boot.png` | candle-fleet | Helios flight after New Game |
| `04-flight-hud-band-chip.png` | band | Flight HUD + Band chip |
| `05-flight-overview.png` | candle-fleet | Spawn overview |
| `06-galaxy-map.png` | bearing | Galaxy/sector map (N) |
| `07-map-search-helios.png` | bearing | Map search Helios |
| `08-d10-ticker-rumor.png` | ticker | D10 Choir-Tender rumor (`hasBearing=true`) |
| `09-map-bearing-search-area.png` | bearing | Map with wreck bearing |
| `10-wreck-region-approach.png` | unique-wreck | Near D10 region (staged pos) |
| `11-wreck-scan-or-materialized.png` | unique-wreck | Post-scan frame |
| `12-unique-claim-or-receipt.png` | unique-wreck | Claim/receipt attempt (staged) |
| `13`–`19` band-*.png | band | Concord → Numbers Station tour |
| `20`–`25` station-*.png | mixed | Hub, Bar, Contracts, Market, Factions, Shipworks |
| `26-pause-menu.png` | misc | Pause / save literacy |
| `27-help.png` | misc | Help overlay |
| `29-band-numbers-station.png` | band | Numbers Station reprise |
| `30-flight-close.png` | misc | Closing flight frame |

*(28-codex skipped: hotkey did not open a visible codex screen.)*

---

## 4) Literacy checks

Logs under  
`C:\Users\93rob\AppData\Local\Temp\grok-goal-696b88462e5d\implementer\`

### loot-floor.log

| Gate | Exit | Result |
|---|---|---|
| `npm run check:unique-loot` | **0** | 12 wrecks, 13 rumor sources, 7 channels, 0 station-stocked uniques |
| `npm run check:depth-program:gt1:loot-audit` | **0** | 9/9 tests; 1000 seeds × 13 tables; 14 reserved uniques; 0 normal/station leaks |

Pinned live combat tables: **13** (historical 8 remains obsolete).  
`definitionHash:8670b597…` · `rollHash:9ebceed4…`

### literacy-surfaces.log

| Gate | Exit | Result |
|---|---|---|
| `check:depth-program:a1` | **0** | 29/29 Band / Quiessence / Hush / numbers bearing |
| `check:depth-program:a2` | **0** | Ledger projector + panel contracts green |
| `check:depth-program:r1` | **0** | Unique wreck map/save/D10 ticker literacy + unique-loot |
| `check:doctrine-distinct` | **0** | 14 factions, 91 pairs |
| `check:depth-program:validators` | **0** | faction-kit + unique-loot + blurb-voice |

**Literacy surface subset: all green.**

---

## 5) Dual platform

| Path | Result |
|---|---|
| Browser primary gallery | **PASS** — 29 shots |
| `npm run check:electron:new-game` | **RED** exit 1 (~43 s) |

Electron **did** launch and reach New Game → flight. Assertion failed: four NPC ships (`ship_kestrel` NPC, `ship_wasp`, `ship_pelican`, `ship_mule`) reported `authoredAssetState: procedural-fallback` while the player Kestrel was `authored`.

| Log | Role |
|---|---|
| `implementer/browser-electron-routes.log` | Full dual-platform attempt stdout |
| `implementer/platform-limit.log` | Residual classification |

**Classification (honest split):**

1. **HARNESS / scope** — full Electron GT1 *gallery* capture was not executed; browser is F1 §5 primary for content-class evidence.
2. **REAL residual (Electron asset completeness)** — New Game Electron gate red on NPC procedural fallbacks; not used to claim dual-platform gallery green.

**Dual-platform gallery quota: NOT MET.** Browser partial gallery stands alone.

---

## 6) Residuals (do not claim closed)

1. Stretch gallery to ~40 (landmarks, ship lines, planet states, postcard row, storied hulls, full R2 claim matrix frames).
2. **Candle Fleet embodiment (H1c)** — flavor/data + memorial zone exist; no live `landmark_c3_candle_fleet` entity at Helios capture.
3. Unassisted continuous goldenthread route on `naturalRoute` Tier B (New Game → Candle Fleet → ticker → bearing → unique → Band without SF staging).
4. Electron dual-platform gallery + authored NPC asset floor on Electron New Game.
5. Full archive `npm run check` (explicitly out of this slice’s runtime).
6. Codex literacy frame (help opened; codex hotkey miss).

---

## 7) Files touched (this slice)

| Path | Change |
|---|---|
| `scripts/capture-depth-program-gt1-gallery.mjs` | **New** gallery harness |
| `.devshots/depth-program/gt1-gallery/*` | 29 PNGs + manifest + README (local residue) |
| `docs/evidence/depth-actualization/gt1-gallery-manifest.json` | Promoted manifest |
| `docs/evidence/orchestration/returns/G_GT1_GALLERY.md` | This return |
| Implementer logs | `loot-floor.log`, `literacy-surfaces.log`, `browser-electron-routes.log`, `platform-limit.log`, `gt1-gallery-capture.log` |

**Not committed** (fence).

---

## 8) Exit summary

| Deliverable | Status |
|---|---|
| Find capture scripts | Done |
| Gallery ≥15 | **29 shots — MET minimum, PARTIAL vs 40** |
| Manifest | `.devshots/.../manifest.json` + `docs/evidence/depth-actualization/gt1-gallery-manifest.json` |
| Literacy logs | loot-floor + literacy-surfaces **all green** |
| Dual platform | Browser green; Electron boot RED / gallery not dual — **platform-limit.log** |
| `G_GT1_GALLERY.md` | This file |

**Status line for board:** GT1 literacy gates green; supporting browser gallery 29/40 partial; Candle Fleet not embodied; dual-platform gallery residual; unassisted goldenthread still open.
