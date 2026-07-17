# G_GT1_GALLERY — GT1 / literacy closeout gallery + gates

**Date:** 2026-07-17  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Rev at capture:** `55c04163` (dirty tree may contain concurrent work)  
**Owner task:** GT1 literacy closeout — gallery stretch toward ~40 + loot floor + literacy surfaces  
**Fence:** no commit unless green; no thrusters; graphics/assets lanes untouched  

---

## 1) Scope

| In | Out |
|---|---|
| Inventory existing depth/first-hour capture scripts | Full unassisted goldenthread natural route (Tier B continuous) |
| Supporting gallery harness + stretch toward ~40 durable shots | Full “every landmark / ship line / postcard / storied hull” archive |
| Extra station tabs, map focus frames, Band frames (no new assets) | Thrusters / graphics asset work |
| Literacy gates: unique-loot, GT1 loot-audit, A1 Band, A2 ledger, R1, validators | Archive full `npm run check` (still residual) |
| Browser primary capture; Electron boot attempt | Electron dual-platform gallery parity |
| Manifest under `.devshots` + `docs/evidence/depth-actualization/` | DONE stamp in `design/program/**` |

**Honesty bar:** gallery is **42 shots** — **meets preferred ≥35** and **meets stretch ~40** on shot *count*. Still **supporting** (staged travel/content), not unassisted continuous goldenthread. Candle Fleet remains **not embodied** as a live landmark entity (H1c residual). Outfit tab click missed at this berth (frame still captured). Cargo hotkey (I) did not open a visible panel (HARNESS residual).

---

## 2) Existing capture / gallery inventory (found)

No dedicated pre-existing **GT1 gallery** script before this slice. Closest durable harnesses:

| Script | Role | Typical shot count |
|---|---|---|
| `scripts/capture-depth-program-a1.mjs` | Band listening tour + priority yield + numbers bearing | ~10 |
| `scripts/capture-depth-program-r2.mjs` | 12 wreck claims + rumor surfaces | ~15 |
| `scripts/capture-depth-program-v1.mjs` | 15 contact voice registers | 15 |
| `scripts/capture-depth-program-sp1.mjs` | Set-piece route frames | ≥29 asserted |
| `scripts/capture-depth-program-e1.mjs` / `k1.mjs` | Encounter / faction map | few |
| `scripts/capture-station-tabs.mjs` | Station tab matrix | ~7 |
| `scripts/lib/naturalRoute.mjs` | Shared driver; goldenthread marks defined; **Tier-B continuous GT1 not implemented** | evidence JSON |
| **`scripts/capture-depth-program-gt1-gallery.mjs`** | First-hour literacy surfaces in one headed browser pass | **42** (was 29) |

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
- Stretch pass adds station rail tabs, map LOCAL/SYSTEM focus + Choir search, literacy screens, Band tuner/bleed — **no thruster or graphics assets**.

### Run result (stretch pass)

```
node scripts/capture-depth-program-gt1-gallery.mjs
→ exit 0
→ shots=42 preferred=35 stretch=40 failures=1
→ out=.devshots/depth-program/gt1-gallery
```

| Metric | Value |
|---|---|
| Shots | **42** |
| Minimum (≥15) | **MET** |
| Preferred (≥35) | **MET** |
| Stretch (~40) | **MET** (count; `partial: false`) |
| Platform | browser (Chrome headed) |
| Seed | 48200 |
| Capture failures | 1 HARNESS (`35-cargo.png` — KeyI / cargo screen not visible) |

### Goldenthread beat coverage (supporting frames)

| Beat | Shots | Notes |
|---|---|---|
| new-game | 2 | Main menu + New Game screen |
| candle-fleet | 3 | Helios spawn / overview / post-tour close — **no Candle Fleet entity** (`entityCount: 0`) |
| ticker | 3 | D10 rumor surface + station hub/bar |
| bearing | 6 | Galaxy map, Helios search, LOCAL, SYSTEM, Choir search, wreck bearing map |
| unique-wreck | 3 | Region / post-scan / claim-or-receipt (**staged**) |
| band | 11 | 7 tuner channels + HUD chip + tuner panel + numbers reprise + landmark bleed |
| misc | 14 | Station tabs, pause, settings, help, codex, mission log, close frames |

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
| `07b-map-local-focus.png` | bearing | Map LOCAL focus |
| `07c-map-system-focus.png` | bearing | Map SYSTEM focus |
| `07d-map-search-choir.png` | bearing | Map search Choir |
| `08-d10-ticker-rumor.png` | ticker | D10 Choir-Tender rumor (`hasBearing=true`) |
| `09-map-bearing-search-area.png` | bearing | Map with wreck bearing |
| `10-wreck-region-approach.png` | unique-wreck | Near D10 region (staged pos) |
| `11-wreck-scan-or-materialized.png` | unique-wreck | Post-scan frame |
| `12-unique-claim-or-receipt.png` | unique-wreck | Claim/receipt attempt (staged) |
| `13`–`19` band-*.png | band | Concord → Numbers Station tour |
| `20-station-hub.png` | ticker | Station hub |
| `21-station-bar.png` | ticker | Bar |
| `22-station-missions.png` | misc | Missions / contracts |
| `23-station-market.png` | misc | Market |
| `24-station-factions.png` | misc | Factions |
| `25-station-shipyard.png` | misc | Shipyard |
| `26-station-outfit-miss.png` | misc | Outfitting click miss (frame kept) |
| `27-station-manufacture.png` | misc | Manufacture |
| `28-station-services.png` | misc | Services |
| `29-station-hold.png` | misc | Hold / cargo manifest |
| `30-pause-menu.png` | misc | Pause |
| `31-settings.png` | misc | Settings from pause |
| `32-help.png` | misc | Help (F1) |
| `33-codex.png` | misc | Codex (K) |
| `34-mission-log.png` | misc | Mission Log (J) |
| `36-band-tuner-panel.png` | band | Band tuner panel |
| `37-band-numbers-station.png` | band | Numbers Station reprise |
| `38-band-landmark-bleed.png` | band | Landmark bleed (staged) |
| `39-flight-close.png` | misc | Closing flight frame |
| `40-flight-literacy-complete.png` | candle-fleet | Post-tour Helios frame |

*(Cargo `35-cargo.png` skipped: KeyI / screenManager path did not open a visible cargo surface — recorded as HARNESS failure.)*

### Stretch delta (vs prior 29-shot pass)

| Added class | Examples |
|---|---|
| Map frames | LOCAL focus, SYSTEM focus, Choir search |
| Station tabs | missions, shipyard, manufacture, services, hold (+ outfit miss frame) |
| Literacy screens | settings, help, codex (fixed K), mission log |
| Band frames | tuner panel, landmark bleed, numbers reprise |

---

## 4) Literacy checks

Logs under  
`C:\Users\93rob\AppData\Local\Temp\grok-goal-696b88462e5d\implementer\`  
(prior implementer pass; not re-run in this stretch slice)

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

**Literacy surface subset: all green (prior pass).** This stretch slice re-ran gallery capture only.

---

## 5) Dual platform

| Path | Result |
|---|---|
| Browser primary gallery | **PASS** — **42 shots** |
| `npm run check:electron:new-game` | **RED** exit 1 (~43 s) — prior pass |

Electron **did** launch and reach New Game → flight. Assertion failed: four NPC ships (`ship_kestrel` NPC, `ship_wasp`, `ship_pelican`, `ship_mule`) reported `authoredAssetState: procedural-fallback` while the player Kestrel was `authored`.

**Dual-platform gallery quota: NOT MET.** Browser stretch gallery stands alone.

---

## 6) Residuals (do not claim closed)

1. Stretch *count* met at 42; full BUILD_PLAN “every landmark / ship line / planet state / postcard row / storied hull” still not claimed as content completeness.
2. **Candle Fleet embodiment (H1c)** — flavor/data + memorial zone exist; no live `landmark_c3_candle_fleet` entity at Helios capture.
3. Unassisted continuous goldenthread route on `naturalRoute` Tier B (New Game → Candle Fleet → ticker → bearing → unique → Band without SF staging).
4. Electron dual-platform gallery + authored NPC asset floor on Electron New Game.
5. Full archive `npm run check` (explicitly out of this slice’s runtime).
6. Cargo literacy frame (KeyI miss) + station outfitting tab click miss at this berth.
7. Fence: **no thrusters** — thruster VFX not touched.

---

## 7) Files touched (this slice)

| Path | Change |
|---|---|
| `scripts/capture-depth-program-gt1-gallery.mjs` | Extended toward ~40 (map frames, station tabs, literacy, Band) |
| `.devshots/depth-program/gt1-gallery/*` | **42** PNGs + manifest + README (local residue) |
| `docs/evidence/depth-actualization/gt1-gallery-manifest.json` | Promoted manifest (`shotCount: 42`) |
| `docs/evidence/orchestration/returns/G_GT1_GALLERY.md` | This return (shot count update) |
| `docs/evidence/orchestration/returns/gt1-gallery-capture-stretch.log` | Stretch capture log |

**Not committed** (fence: no commit unless green — gallery capture green; dual-platform + full check residuals remain).

---

## 8) Exit summary

| Deliverable | Status |
|---|---|
| Extend gallery harness | Done — station tabs + map frames + Band/literacy |
| Gallery ≥35 preferred | **42 shots — MET preferred and stretch count** |
| Manifest | `.devshots/.../manifest.json` + `docs/evidence/depth-actualization/gt1-gallery-manifest.json` |
| `G_GT1_GALLERY.md` shot count | **Updated → 42** |
| Thrusters / graphics assets | **Untouched** |
| Commit | **Not committed** (fence) |

**Status line for board:** GT1 supporting browser gallery **42/40 stretch count met** (≥35 preferred); Candle Fleet not embodied; cargo/outfit harness misses residual; dual-platform gallery residual; unassisted goldenthread still open; no thrusters.
