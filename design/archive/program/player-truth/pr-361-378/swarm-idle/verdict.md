# Player-truth verdict: INCOMPLETE — swarm-ricochet-foundry-idle

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 68ace4033d (dirty)
- Source at start: 68ace4033d · index.html, scripts/check-market-navigation.mjs, scripts/check-reusable-asset-bank.mjs, scripts/lib/reusableAssetContract.mjs, scripts/player-truth/browser.mjs, scripts/player-truth/checks.mjs, scripts/player-truth/freezeWatch.mjs, scripts/player-truth/playWatch.mjs, scripts/player-truth/run.mjs, scripts/player-truth/verdict.mjs, src/ai/counterplay/live.js, src/ai/counterplay/observe.js, src/ai/counterplay/policies.js, src/audio/roomTone.js, src/core/veiledFoundryEnvDrain.js, src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/main.js, src/presentation/momentMachine/index.js, src/presentation/momentMachine/ingest.js, src/presentation/momentMachine/posePlayback.js, src/presentation/momentMachine/shotPlan.js, src/render/lod.js, src/render/renderer.js, src/systems/aftermathWrecks.js, src/systems/ceresWorkfleet.js, src/systems/tacticalAI.js, src/ui/dockArrival.js, src/ui/hud.js, src/ui/orrery/archiveLayouts.js, src/ui/orrery/armoryPreviewMedia.js, src/ui/orrery/crestOrbit.js, src/ui/orrery/crucibleArmory.js, src/ui/orrery/cruciblePreparationLayouts.js, src/ui/orrery/crucibleResultsLayouts.js, src/ui/orrery/hullSchematic.js, src/ui/orrery/mobileScreenLayouts.js, src/ui/orrery/settingsLayouts.js, src/ui/orrery/shipworksLayouts.js, src/ui/orrery/stationTabsLayouts.js, src/ui/orrery/text.js, src/ui/screens/automationPanel.js, src/ui/screens/clips.js, src/ui/screens/mainMenu.js, src/ui/screens/missionLog.js, src/ui/screens/pause.js, src/ui/screens/techTree.js, src/ui/ship/calloutLayout.js, src/ui/station/screens/shipworks.js, styles/kit.css, styles/station.css, styles/ui.css
- Source at end: 68ace4033d · index.html, scripts/check-market-navigation.mjs, scripts/check-reusable-asset-bank.mjs, scripts/lib/reusableAssetContract.mjs, scripts/player-truth/browser.mjs, scripts/player-truth/checks.mjs, scripts/player-truth/freezeWatch.mjs, scripts/player-truth/playWatch.mjs, scripts/player-truth/run.mjs, scripts/player-truth/verdict.mjs, src/ai/counterplay/live.js, src/ai/counterplay/observe.js, src/ai/counterplay/policies.js, src/audio/roomTone.js, src/core/veiledFoundryEnvDrain.js, src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/main.js, src/presentation/momentMachine/index.js, src/presentation/momentMachine/ingest.js, src/presentation/momentMachine/posePlayback.js, src/presentation/momentMachine/shotPlan.js, src/render/lod.js, src/render/renderer.js, src/systems/aftermathWrecks.js, src/systems/ceresWorkfleet.js, src/systems/tacticalAI.js, src/ui/dockArrival.js, src/ui/hud.js, src/ui/orrery/archiveLayouts.js, src/ui/orrery/armoryPreviewMedia.js, src/ui/orrery/crestOrbit.js, src/ui/orrery/crucibleArmory.js, src/ui/orrery/cruciblePreparationLayouts.js, src/ui/orrery/crucibleResultsLayouts.js, src/ui/orrery/hullSchematic.js, src/ui/orrery/mobileScreenLayouts.js, src/ui/orrery/settingsLayouts.js, src/ui/orrery/shipworksLayouts.js, src/ui/orrery/stationTabsLayouts.js, src/ui/orrery/text.js, src/ui/screens/automationPanel.js, src/ui/screens/clips.js, src/ui/screens/mainMenu.js, src/ui/screens/missionLog.js, src/ui/screens/pause.js, src/ui/screens/techTree.js, src/ui/ship/calloutLayout.js, src/ui/station/screens/shipworks.js, styles/kit.css, styles/station.css, styles/ui.css
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-14T03:27:26.456Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 142 s wall, 46.3 s of play sim time, 1721 frames sampled, 54 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate idle pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 45 sim s reached
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- round_resolution — no round was won inside the run
- readability — samples: enemy 3, asteroid 166, projectile 0, pickup 0; capture coherence: 396 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; not graded (under 5): enemy, projectile; hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes hull and backdrop; radius-square contrast and affected class separation remain diagnostic
- frame_time — 1601 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
- round_transitions — no round after round 1 was reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | finite quota materialized and resolved, and ≥1 input (src/data/swarmMode.js rules 2–3: the finite cohort must arrive and resolve; no fixed time-to-death target) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/1601) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.25/s total · 1 real LOD · 11 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | asteroid 49% low-contrast | separation ≥1; ≤50% low-contrast per measured class |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 1% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps · row-on-select (inferred) | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 29 ms · p99 146 ms · 2 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **PASS** | 0/50 Adventure frames · armory 63 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +45.583 s / 56 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 15 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **readability** (UNKNOWN) — samples: enemy 3, asteroid 166, projectile 0, pickup 0; capture coherence: 396 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; not graded (under 5): enemy, projectile; hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes hull and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — 1601 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 327 ms at sim 48.1 s (frame 2952)
  - long task 275 ms at sim 3.9 s (frame 1441)
  - frame 2953: 364 ms at sim 48.1 s (151 entities, 0 draws)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `.devshots\remaining-prs-swarm\swarm-ricochet-foundry-idle\verdict.md`
- contactSheet: `.devshots\remaining-prs-swarm\swarm-ricochet-foundry-idle\contact-sheet.jpg`
- json: `.devshots\remaining-prs-swarm\swarm-ricochet-foundry-idle\verdict.json`
- trace: `.devshots\remaining-prs-swarm\swarm-ricochet-foundry-idle\trace.json.gz`
- frames: `.devshots\remaining-prs-swarm\swarm-ricochet-foundry-idle\frames`
