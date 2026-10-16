# Player-truth verdict: INCOMPLETE — gauntlet-active-release-oct16

- Mode: gauntlet · arena Ricochet Foundry · seed 4242 · build 545c8b68a7 (dirty)
- Source at start: 545c8b68a7 · src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/localization/catalogs/en-US.generated.js, src/ui/galaxyMap.js, src/ui/orrery/chartLayouts.js
- Source at end: f235562d22 · src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/localization/catalogs/en-US.generated.js, src/ui/galaxyMap.js, src/ui/orrery/chartLayouts.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-16T14:17:25.712Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 381 s wall, 302.2 s of play sim time, 15158 frames sampled, 311 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 300 sim s reached
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- readability — not enough on-screen samples per class (enemy 2, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 545 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- frame_time — 13528 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 27.8 s | finite quota materialized and resolved, and ≥1 input (src/systems/survivalWave.js _checkCleared and survivalWavePlanner.js: scheduled Gauntlet cohort resolves before native cleanup; no duration floor) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/6 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/13528) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.04/s total · 3 real LOD · 9 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | no item shelf ("Ricochet RunnerHornet · 4/8 fitted · Hornet — Bank a stream of bullets around cover. Shove the pack into the rocks, then boost through.") · 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 16 ms · p99 60 ms · 0 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/2 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **PASS** | round 3 | ≥ round 3 |
| crucible_realm | **PASS** | 0/307 Adventure frames · armory 0 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +302.1 s / 311 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 193 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 2, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 545 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — 13528 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - frame 13395: 176 ms at sim 255.3 s (145 entities, 0 draws)
  - frame 1114: 173 ms at sim 0 s (104 entities, 0 draws)
  - frame 1312: 161 ms at sim 8.8 s (107 entities, 0 draws)

## Files
- verdict: `design\program\player-truth\gauntlet-active-release-oct16\verdict.md`
- contactSheet: `design\program\player-truth\gauntlet-active-release-oct16\contact-sheet.jpg`
- json: `design\program\player-truth\gauntlet-active-release-oct16\verdict.json`
