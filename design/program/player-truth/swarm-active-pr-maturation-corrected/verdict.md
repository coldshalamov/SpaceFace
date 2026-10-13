# Player-truth verdict: FAIL — swarm-active-pr-maturation-corrected

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build d020a7184 (dirty)
- Source at start: d020a7184 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: d020a7184 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T19:51:45.636Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 602 s wall, 218.6 s of play sim time, 17184 frames sampled, 351 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: wall-clock cap

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 42.6 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **FAIL** | 1 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/4 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0.1 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/6114) | ≤0.5% |
| lod_churn | **FAIL** | max 4/10s per entity · 2.38/s total · 93 real LOD · 427 loading | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 22.8/min · worst entity 0 toggles · 82 visibility · 1 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 3% screen · player hidden 1% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 5% / p95 6% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 55 ms · p99 141 ms · 1 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/1 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 2 | ≥ round 3 |

## Worst offenders
- **spawn_motion** (FAIL) — 2 spawn moment(s) checked
  - round 2: other 36000427 moving 12.9 u/s 316 u from the player before any input
- **lod_churn** (FAIL) — 93 real LOD/model swaps · 427 visible loading-state swaps (awaiting/loading/compiling, still counted) over 218.7 sim s across 279 entities (480 more off screen, not graded)
  - entity 373 (enemy) 4 swaps in 10 s (0 real LOD, 4 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_4037113c@lod1 at sim 20.6 s
  - entity 411 (enemy) 4 swaps in 10 s (0 real LOD, 4 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_3d535969@lod1 at sim 20.7 s
  - entity 399 (enemy) 4 swaps in 10 s (0 real LOD, 4 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_c4460040@lod1 at sim 20.7 s
- **popping** (FAIL) — 82 visibility pops · 1 visible loading-state pops (awaiting/loading/compiling, still counted) inside the inner 80% of the view; 117 non-projectile bodies born on screen (info)
  - entity 374 (asteroid) removed without death on screen 1× (1 visibility, 0 loading-state) — first sim 8.2 s
  - entity 371 (asteroid) removed without death on screen 1× (1 visibility, 0 loading-state) — first sim 8.6 s
  - entity 375 (enemy) removed without death on screen 1× (1 visibility, 0 loading-state) — first sim 13.9 s
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 496, projectile 0, pickup 0; need 5); capture coherence: 5596 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval
- **frame_time** (UNKNOWN) — 6114 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 288 ms at sim 97.9 s (frame 14306)
  - frame 728: 585 ms at sim 3.5 s (128 entities, 0 draws)
  - frame 14300: 293 ms at sim 97.9 s (426 entities, 0 draws)
- **rounds_reached** (FAIL) — stopped: wall-clock cap
  - scripted fighter stopped at round 2: wall-clock cap

## Files
- verdict: `design\program\player-truth\swarm-active-pr-maturation-corrected\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-pr-maturation-corrected\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-pr-maturation-corrected\verdict.json`
