# Player-truth verdict: INCOMPLETE — racing

- Mode: racing · seed 4242 · build f5a75fc16c (dirty)
- Source at start: f5a75fc16c · scripts/AGENTS.md, scripts/agent-loop.mjs, scripts/lib/agentLoopPlan.mjs, scripts/lib/labExecution.mjs, scripts/lib/labTraceReport.mjs, scripts/lib/uiBenchBatch.mjs, scripts/player-truth/run.mjs, scripts/sf-lab.mjs, scripts/ui-bench.mjs, src/audio/roomTone.js, src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/systems/aftermathWrecks.js, src/ui/dockArrival.js, src/ui/hud.js, src/ui/orrery/text.js, src/ui/screens/mainMenu.js, src/ui/screens/missionLog.js, src/ui/screens/pause.js, src/ui/screens/techTree.js, src/ui/station/screens/shipworks.js, styles/kit.css
- Source at end: 841b447fe5 · scripts/player-truth/driver.mjs, scripts/player-truth/run.mjs, src/audio/roomTone.js, src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/systems/aftermathWrecks.js, src/ui/dockArrival.js, src/ui/hud.js, src/ui/orrery/text.js, src/ui/screens/mainMenu.js, src/ui/screens/missionLog.js, src/ui/screens/pause.js, src/ui/screens/techTree.js, src/ui/station/screens/shipworks.js, styles/kit.css
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-14T04:32:54.325Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 375 s wall, 15.6 s of play sim time, 593 frames sampled, 66 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: wall-clock cap
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- readability — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 279 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- vfx_coverage — too few VFX scans · skipped 25
- backdrop_coverage — no per-pixel splits sampled · skipped 25
- frame_time — 473 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
- offscreen_marker — edge markers were not read

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/473) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.19/s total · 0 real LOD · 3 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **UNKNOWN** | — | p95 ≤0.25 |
| backdrop_coverage | **UNKNOWN** | — | threats over bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 984 ms · p99 1209 ms · 20 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **n/a** | — | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | no active span | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **UNKNOWN** | — | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 279 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **vfx_coverage** (UNKNOWN) — too few VFX scans · skipped 25
- **backdrop_coverage** (UNKNOWN) — no per-pixel splits sampled · skipped 25
- **frame_time** (UNKNOWN) — 473 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 1065 ms at sim 3.5 s (frame 820)
  - long task 710 ms at sim 0.2 s (frame 724)
  - long task 477 ms at sim 10.1 s (frame 1016)
- **offscreen_marker** (UNKNOWN) — edge markers were not read

## Files
- verdict: `.devshots\remaining-prs-racing-memory-repaired\verdict.md`
- contactSheet: `.devshots\remaining-prs-racing-memory-repaired\contact-sheet.jpg`
- json: `.devshots\remaining-prs-racing-memory-repaired\verdict.json`
- trace: `.devshots\remaining-prs-racing-memory-repaired\trace.json.gz`
- frames: `.devshots\remaining-prs-racing-memory-repaired\frames`
