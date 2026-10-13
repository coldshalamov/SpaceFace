# Player-truth verdict: FAIL — swarm-active-pr-maturation-admission

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 3b6666762 (dirty)
- Source at start: 3b6666762 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: 3b6666762 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T23:08:54.702Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 605 s wall, 214 s of play sim time, 7765 frames sampled, 289 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: wall-clock cap

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 60.3 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **FAIL** | 113 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/6 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0.1 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/6855) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.55/s total · 67 real LOD · 51 loading | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 10.9/min · worst entity 1 toggle · 39 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 1.36 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 13% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 69 ms · p99 206 ms · 8 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/2 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **PASS** | round 3 | ≥ round 3 |

## Worst offenders
- **spawn_motion** (FAIL) — 3 spawn moment(s) checked
  - round 2: other 275000456 moving 56.1 u/s 127 u from the player before any input
  - round 2: other 619000475 moving 45.2 u/s 76 u from the player before any input
  - round 2: other 469000521 moving 44.5 u/s 244 u from the player before any input
- **popping** (FAIL) — 39 visibility pops · 0 visible loading-state pops (awaiting/loading/compiling, still counted) inside the inner 80% of the view; 170 non-projectile bodies born on screen (info)
  - entity 375 (asteroid) removed without death on screen 1× (1 visibility, 0 loading-state) — first sim 7.8 s
  - entity 368 (asteroid) removed without death on screen 1× (1 visibility, 0 loading-state) — first sim 24.4 s
  - entity 348 (station) removed without death on screen 1× (1 visibility, 0 loading-state) — first sim 62.8 s
- **readability** (FAIL) — samples: enemy 7, asteroid 69, projectile 0, pickup 0; capture coherence: 9933 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval
  - station:plate (station, dark, r 40 px) sits over the player ship in 27% of 11 samples — a play-space body that reads as neither enemy nor asteroid
- **frame_time** (UNKNOWN) — 6855 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 1572 ms at sim 56.6 s (frame 2422)
  - long task 311 ms at sim 139.8 s (frame 5232)
  - long task 300 ms at sim 69.4 s (frame 2904)

## Files
- verdict: `design\program\player-truth\swarm-active-pr-maturation-admission\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-pr-maturation-admission\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-pr-maturation-admission\verdict.json`
