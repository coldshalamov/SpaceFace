# Player-truth verdict: FAIL — swarm-idle-pr-maturation-native-raster

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 561a1121e (dirty)
- Source at start: 561a1121e · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: 561a1121e · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T21:41:00.248Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 103 s wall, 46 s of play sim time, 1793 frames sampled, 52 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate idle pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: duration 45 sim s reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | ≥20 s and player input |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **FAIL** | 43.3% frames bad (718/1658) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.35/s total · 3 real LOD · 13 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 1.3/min · worst entity 0 toggles · 1 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **PASS** | min separation 2.43 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 3% screen · player hidden 1% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 26 ms · p99 96 ms · 1 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **player_ship** (FAIL) — missing / hidden / off-frame / non-lod0 / placeholder (<300 tris) while alive in play
  - resolving marker: 718 frames, first at sim 2.8 s
  - asset compiling-pipelines: 718 frames, first at sim 2.8 s
- **vfx_coverage** (FAIL) — 70 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - player ship ≥50% under combat VFX pixels in 1% of splits (first sim 44.6 s)
  - peak combat-VFX pixels 4% of screen at sim 7.1 s (22 combat layers lit)
- **frame_time** (UNKNOWN) — 1658 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 641 ms at sim 2.8 s (frame 840)
  - frame 841: 674 ms at sim 2.8 s (127 entities, 64 draws)
  - frame 889: 224 ms at sim 4.3 s (128 entities, 0 draws)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `design\program\player-truth\swarm-idle-pr-maturation-native-raster\verdict.md`
- contactSheet: `design\program\player-truth\swarm-idle-pr-maturation-native-raster\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-idle-pr-maturation-native-raster\verdict.json`
