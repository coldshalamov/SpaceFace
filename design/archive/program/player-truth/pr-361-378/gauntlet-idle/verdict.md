# Player-truth verdict: INCOMPLETE — gauntlet-ricochet-foundry-idle

- Mode: gauntlet · arena Ricochet Foundry · seed 4242 · build f8ea114709 (dirty)
- Source at start: f8ea114709 · scripts/player-truth/run.mjs, src/audio/roomTone.js, src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/systems/aftermathWrecks.js, src/ui/dockArrival.js, src/ui/hud.js, src/ui/orrery/text.js, src/ui/screens/mainMenu.js, src/ui/screens/missionLog.js, src/ui/screens/pause.js, src/ui/screens/techTree.js, src/ui/station/screens/shipworks.js, styles/kit.css
- Source at end: f8ea114709 · scripts/player-truth/run.mjs, src/audio/roomTone.js, src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/systems/aftermathWrecks.js, src/ui/dockArrival.js, src/ui/hud.js, src/ui/orrery/text.js, src/ui/screens/mainMenu.js, src/ui/screens/missionLog.js, src/ui/screens/pause.js, src/ui/screens/techTree.js, src/ui/station/screens/shipworks.js, styles/kit.css
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-14T04:01:43.712Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 208 s wall, 45.9 s of play sim time, 2769 frames sampled, 67 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate idle pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 45 sim s reached
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- round_resolution — no round was won inside the run
- readability — samples: enemy 8, asteroid 0, projectile 0, pickup 0; capture coherence: 451 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; not graded (under 5): asteroid, projectile; hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes hull and backdrop; radius-square contrast and affected class separation remain diagnostic
- frame_time — 1854 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
- round_transitions — no round after round 1 was reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | finite quota materialized and resolved, and ≥1 input (src/systems/survivalWave.js _checkCleared and survivalWavePlanner.js: scheduled Gauntlet cohort resolves before native cleanup; no duration floor) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/1854) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.06/s total · 3 real LOD · 0 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | enemy 38% low-contrast (radius-square diagnostic) | separation ≥1; ≤50% low-contrast per measured class |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | no item shelf ("Ricochet RunnerHornet · 4/8 fitted · Hornet — Bank a stream of bullets around cover. Shove the pack into the rocks, then boost through.") · 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 22 ms · p99 1021 ms · 0 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **PASS** | 0/65 Adventure frames · armory 0 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +45.733 s / 143 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 45 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **readability** (UNKNOWN) — samples: enemy 8, asteroid 0, projectile 0, pickup 0; capture coherence: 451 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; not graded (under 5): asteroid, projectile; hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes hull and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — 1854 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - frame 2713: 1073 ms at sim 43.9 s (113 entities, 0 draws)
  - frame 2710: 1054 ms at sim 43.8 s (113 entities, 0 draws)
  - frame 2630: 1052 ms at sim 41.2 s (112 entities, 0 draws)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `.devshots\remaining-prs-gauntlet-unoccluded\gauntlet-ricochet-foundry-idle\verdict.md`
- contactSheet: `.devshots\remaining-prs-gauntlet-unoccluded\gauntlet-ricochet-foundry-idle\contact-sheet.jpg`
- json: `.devshots\remaining-prs-gauntlet-unoccluded\gauntlet-ricochet-foundry-idle\verdict.json`
- trace: `.devshots\remaining-prs-gauntlet-unoccluded\gauntlet-ricochet-foundry-idle\trace.json.gz`
- frames: `.devshots\remaining-prs-gauntlet-unoccluded\gauntlet-ricochet-foundry-idle\frames`
