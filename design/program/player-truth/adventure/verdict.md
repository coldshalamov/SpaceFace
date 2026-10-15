# Player-truth verdict: FAIL — adventure

- Mode: adventure · seed 4242 · build c264e27d4e (dirty)
- Source at start: c264e27d4e · src/ai/reflexes.js, src/audio/audioSystem.js, src/audio/roomTone.js, src/core/flight/saucerControl.js, src/core/presentationFreeze.js, src/core/registry.js, src/data/barks.js, src/data/encounters/index.generated.js, src/data/landmarkMissions.js, src/data/newGameDefaults.js, src/data/sectorAnchors.js, src/data/sectors.js, src/render/imageSourceDedupe.js, src/render/openingGpuAdmission.js, src/render/packageCpuDetach.js, src/render/renderer.js, src/render/vfx.js, src/render/visualFactory.js, src/save/saveSystem.js, src/save/sharedPlayerStore.js, src/systems/aftermathWrecks.js, src/systems/barkDirector.js, src/systems/cargo.js, src/systems/countermeasures.js, src/systems/economy.js, src/systems/impulseCharges.js, src/systems/input.js, src/systems/lawSecurity.js, src/systems/machineWork.js, src/systems/missions.js, src/systems/onboarding.js, src/systems/precursorMachines.js, src/systems/runSession.js, src/systems/ships.js, src/systems/stationServices.js, src/systems/survivalRewards.js, src/systems/swarmSupply.js, src/ui/dockArrival.js, src/ui/hud.js, src/ui/orrery/text.js, src/ui/screens/crucible.js, src/ui/screens/mainMenu.js, src/ui/screens/missionLog.js, src/ui/screens/newGame.js, src/ui/screens/pause.js, src/ui/screens/techTree.js, src/ui/ship/loadoutPresets.js, src/ui/station/screens/shipworks.js, src/ui/survivalHud.js, styles/kit.css, src/data/encounters/585-candle-relighting.js
- Source at end: c8f43e53ee · src/audio/roomTone.js, src/data/encounters/index.generated.js, src/data/landmarkMissions.js, src/data/newGameDefaults.js, src/data/sectorAnchors.js, src/data/sectors.js, src/render/vfx.js, src/render/visualFactory.js, src/systems/aftermathWrecks.js, src/systems/runSession.js, src/systems/survivalRewards.js, src/ui/dockArrival.js, src/ui/hud.js, src/ui/orrery/text.js, src/ui/screens/crucible.js, src/ui/screens/mainMenu.js, src/ui/screens/missionLog.js, src/ui/screens/newGame.js, src/ui/screens/pause.js, src/ui/screens/techTree.js, src/ui/station/screens/shipworks.js, src/ui/survivalHud.js, styles/kit.css, src/data/encounters/585-candle-relighting.js
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): absolute frame times are software-renderer evidence, graded only against --baseline
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-13T06:43:09.429Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 3000 ms, included in measured wall time
- Run: 1384 s wall, 301.2 s of play sim time, 7895 frames sampled, 363 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: duration 300 sim s reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/7775) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.01/s total · 0 real LOD · 2 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 2.8/min · worst entity 2 toggles · 14 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **UNKNOWN** | — | p95 ≤0.25 |
| backdrop_coverage | **UNKNOWN** | — | threats over bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **FAIL** | software-renderer evidence · p50 142 ms · p99 606 ms · 527 long tasks ≥250 ms | no regression vs c8f43e53ee: p99 ≤612 ms · long tasks ≤404 |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **n/a** | — | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | no active span | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **n/a** | no off-screen hostile | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 66 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **vfx_coverage** (UNKNOWN) — too few VFX scans · skipped 329
- **backdrop_coverage** (UNKNOWN) — no per-pixel splits sampled · skipped 329
- **frame_time** (FAIL) — 7775 play frames · baseline p99 490 ms · 323 long tasks · load 1m mean head 0 vs baseline 0 (rel 0%)
  - long task 5449 ms at sim 0.1 s (frame 146)
  - long task 4274 ms at sim 7.4 s (frame 385)
  - long task 3537 ms at sim 9.4 s (frame 449)

## Files
- verdict: `design\program\player-truth\adventure\verdict.md`
- contactSheet: `design\program\player-truth\adventure\contact-sheet.jpg`
- json: `design\program\player-truth\adventure\verdict.json`
