# Player-truth verdict: FAIL — swarm-active-pr-maturation-placement

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build c7ea4940d (dirty)
- Source at start: c7ea4940d · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: c7ea4940d · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T23:50:49.780Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 601 s wall, 284.3 s of play sim time, 8911 frames sampled, 357 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: wall-clock cap

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 39.4 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **FAIL** | 32 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/6 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0.1 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/8466) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.31/s total · 36 real LOD · 53 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0.6/min · worst entity 1 toggle · 3 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | min separation 1.34 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 1% · threats hidden p95 14% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 59 ms · p99 156 ms · 4 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/2 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **PASS** | round 3 | ≥ round 3 |

## Worst offenders
- **spawn_motion** (FAIL) — 3 spawn moment(s) checked
  - round 2: asteroid 353000556 moving 62.4 u/s 141 u from the player before any input
  - round 2: other 532000536 moving 61.8 u/s 89 u from the player before any input
  - round 2: asteroid 392000412 moving 55.6 u/s 143 u from the player before any input
- **readability** (UNKNOWN) — samples: enemy 10, asteroid 388, projectile 0, pickup 0; capture coherence: 7131 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; opaque body/player coverage UNKNOWN for wreck:: 0 measured/430 unknown (unsupported-player-silhouette); station:plate: 0 measured/185 unknown (unsupported-player-silhouette); wreck:wreck: 0 measured/1609 unknown (unsupported-player-silhouette); station:gate: 0 measured/238 unknown (unsupported-player-silhouette); station:furnace: 0 measured/21 unknown (unsupported-player-silhouette); station:shutter: 0 measured/57 unknown (unsupported-player-silhouette)
- **frame_time** (UNKNOWN) — 8466 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 1126 ms at sim 227.4 s (frame 8314)
  - long task 402 ms at sim 10.1 s (frame 1081)
  - long task 295 ms at sim 106.6 s (frame 4221)

## Files
- verdict: `design\program\player-truth\swarm-active-pr-maturation-placement\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-pr-maturation-placement\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-pr-maturation-placement\verdict.json`
