# Player-truth verdict: FAIL — swarm-idle-pr-maturation-gate

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build edcdc57cf (dirty)
- Source at start: edcdc57cf · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js
- Source at end: edcdc57cf · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/render/bloom.js, src/render/packageCpuDetach.js, src/render/renderer.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-13T02:41:08.246Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 931 s wall, 31.9 s of play sim time, 1007 frames sampled, 129 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate idle pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: wall-clock cap

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | ≥20 s and player input |
| kills_before_input | **FAIL** | 7 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/887) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.66/s total · 6 real LOD · 15 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | min separation 2.42 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 806 ms · p99 3920 ms · 211 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **kills_before_input** (FAIL) — non-player kills between round start and first flight input · whole run: 8 hostile deaths, 8 not credited to the player (info)
  - round 1: 7 kills in the first 29.7 s before input — by entity 38000375×1, wreck×2, asteroid×3, entity 410×1
- **readability** (UNKNOWN) — samples: enemy 91, asteroid 581, projectile 0, pickup 0; capture coherence: 3140 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; opaque body/player coverage UNKNOWN for station:plate: 0 measured/89 unknown (unsupported-player-silhouette); wreck:: 0 measured/29 unknown (unsupported-player-silhouette); wreck:wreck: 0 measured/353 unknown (unsupported-player-silhouette); station:gate: 0 measured/10 unknown (unsupported-player-silhouette)
- **frame_time** (UNKNOWN) — 887 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 30117 ms at sim 29.2 s (frame 968)
  - long task 23710 ms at sim 29.3 s (frame 972)
  - long task 10401 ms at sim 30.2 s (frame 1003)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `design\program\player-truth\swarm-idle-pr-maturation-gate\verdict.md`
- contactSheet: `design\program\player-truth\swarm-idle-pr-maturation-gate\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-idle-pr-maturation-gate\verdict.json`
