# Player-truth verdict: INCOMPLETE — gauntlet-ricochet-foundry-active

- Mode: gauntlet · arena Ricochet Foundry · seed 4242 · build 07c1e928b5 (dirty)
- Source at start: 07c1e928b5 · scripts/player-truth/browser.mjs, scripts/player-truth/driver.mjs, scripts/player-truth/run.mjs, src/audio/roomTone.js, src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/systems/aftermathWrecks.js, src/ui/dockArrival.js, src/ui/hud.js, src/ui/orrery/text.js, src/ui/screens/mainMenu.js, src/ui/screens/missionLog.js, src/ui/screens/pause.js, src/ui/screens/techTree.js, src/ui/station/screens/shipworks.js, styles/kit.css
- Source at end: 784f2894a0 · scripts/check-reusable-asset-bank.mjs, scripts/player-truth/browser.mjs, scripts/player-truth/driver.mjs, scripts/player-truth/run.mjs, src/audio/roomTone.js, src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/systems/aftermathWrecks.js, src/ui/dockArrival.js, src/ui/hud.js, src/ui/orrery/text.js, src/ui/screens/mainMenu.js, src/ui/screens/missionLog.js, src/ui/screens/pause.js, src/ui/screens/techTree.js, src/ui/station/screens/shipworks.js, styles/kit.css
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-14T05:00:53.672Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 441 s wall, 233.6 s of play sim time, 7792 frames sampled, 249 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: 3 rounds played
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- readability — not enough on-screen samples per class (enemy 4, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 1716 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes hull and backdrop; radius-square contrast and affected class separation remain diagnostic
- frame_time — 6315 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 67.1 s | finite quota materialized and resolved, and ≥1 input (src/systems/survivalWave.js _checkCleared and survivalWavePlanner.js: scheduled Gauntlet cohort resolves before native cleanup; no duration floor) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/6 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/6315) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.08/s total · 6 real LOD · 12 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | no item shelf ("Ricochet RunnerHornet · 4/8 fitted · Hornet — Bank a stream of bullets around cover. Shove the pack into the rocks, then boost through.") · 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 42 ms · p99 188 ms · 11 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/2 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **PASS** | round 3 | ≥ round 3 |
| crucible_realm | **PASS** | 0/247 Adventure frames · armory 0 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +231.717 s / 345 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 163 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 4, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 1716 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes hull and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — 6315 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 1080 ms at sim 86.8 s (frame 3569)
  - long task 661 ms at sim 60.8 s (frame 2769)
  - long task 399 ms at sim 86.9 s (frame 3571)

## Files
- verdict: `.devshots\remaining-prs-gauntlet-window-repaired\verdict.md`
- contactSheet: `.devshots\remaining-prs-gauntlet-window-repaired\contact-sheet.jpg`
- json: `.devshots\remaining-prs-gauntlet-window-repaired\verdict.json`
- trace: `.devshots\remaining-prs-gauntlet-window-repaired\trace.json.gz`
- frames: `.devshots\remaining-prs-gauntlet-window-repaired\frames`
