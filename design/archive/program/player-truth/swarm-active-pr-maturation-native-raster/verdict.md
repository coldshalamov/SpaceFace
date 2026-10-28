# Player-truth verdict: FAIL — swarm-active-pr-maturation-native-raster

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 561a1121e (dirty)
- Source at start: 561a1121e · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: 561a1121e · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T21:50:15.469Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 551 s wall, 301 s of play sim time, 8213 frames sampled, 366 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: duration 300 sim s reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 46.3 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/4 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **FAIL** | longest 2.3 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **FAIL** | 7.4% frames bad (587/7905) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.34/s total · 73 real LOD · 30 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 1.4/min · worst entity 0 toggles · 7 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **FAIL** | p95 2% screen · player hidden 1% · threats hidden p95 33% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 56 ms · p99 157 ms · 6 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/1 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 2 | ≥ round 3 |

## Worst offenders
- **tumble** (FAIL) — 11.9 s total; limits pitch 0.35, bank 0.75 rad, |y| 4, spin 2.5 rad/s
  - spin -3.8 rad/s uncommanded for 2.3 s from sim 45.7 s
- **player_ship** (FAIL) — missing / hidden / off-frame / non-lod0 / placeholder (<300 tris) while alive in play
  - resolving marker: 587 frames, first at sim 3.4 s
  - asset compiling-pipelines: 587 frames, first at sim 3.4 s
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 3, asteroid 201, projectile 0, pickup 0; need 5); capture coherence: 7016 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval
- **vfx_coverage** (FAIL) — 330 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - player ship ≥50% under combat VFX pixels in 1% of splits (first sim 12.1 s)
  - peak combat-VFX pixels 10% of screen at sim 281 s (48 combat layers lit)
- **frame_time** (UNKNOWN) — 7905 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 1083 ms at sim 269.7 s (frame 8228)
  - long task 390 ms at sim 15.8 s (frame 1273)
  - long task 358 ms at sim 287 s (frame 8568)
- **rounds_reached** (FAIL) — stopped: duration 300 sim s reached
  - scripted fighter stopped at round 2: duration 300 sim s reached

## Files
- verdict: `design\program\player-truth\swarm-active-pr-maturation-native-raster\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-pr-maturation-native-raster\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-pr-maturation-native-raster\verdict.json`
