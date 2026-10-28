# Player-truth verdict: FAIL — swarm-active-pr-maturation-appearance

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 0ca4dae5a (dirty)
- Source at start: 0ca4dae5a · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: 0ca4dae5a · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T22:18:51.120Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 602 s wall, 247.3 s of play sim time, 7870 frames sampled, 336 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: wall-clock cap

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 46.7 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **FAIL** | 4 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/6 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/7471) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.4/s total · 49 real LOD · 50 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 1.2/min · worst entity 0 toggles · 5 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **PASS** | min separation 2.48 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 56 ms · p99 211 ms · 33 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/2 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **PASS** | round 3 | ≥ round 3 |

## Worst offenders
- **spawn_motion** (FAIL) — 3 spawn moment(s) checked
  - round 3: asteroid 1349000666 moving 73.1 u/s 659 u from the player before any input
  - round 3: other 1353000664 moving 65.5 u/s 670 u from the player before any input
  - round 3: other 1002000504 moving 9.4 u/s 202 u from the player before any input
- **frame_time** (UNKNOWN) — 7471 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 1065 ms at sim 244.2 s (frame 8470)
  - long task 375 ms at sim 156.4 s (frame 6025)
  - long task 351 ms at sim 151.4 s (frame 5833)

## Files
- verdict: `design\program\player-truth\swarm-active-pr-maturation-appearance\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-pr-maturation-appearance\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-pr-maturation-appearance\verdict.json`
