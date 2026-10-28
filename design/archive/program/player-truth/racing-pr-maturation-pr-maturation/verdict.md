# Player-truth verdict: FAIL — racing-pr-maturation-pr-maturation

- Mode: racing · seed 4242 · build bef0a2a43 (dirty)
- Source at start: bef0a2a43 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: bef0a2a43 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T17:48:47.312Z
- Run: 661 s wall, 97.5 s of play sim time, 5465 frames sampled, 75 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: wall-clock cap

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/4363) | ≤0.5% |
| lod_churn | **PASS** | max 3/10s per entity · 0.07/s total · 1 real LOD · 6 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0.6/min · worst entity 1 toggle · 1 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 0% · threats hidden p95 n/a · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 10% / p95 12% of screen · threats on bright backdrop p95 n/a | threats on bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **FAIL** | p50 76 ms · p99 700 ms · 349 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 2, projectile 0, pickup 0; need 5)
- **frame_time** (FAIL) — 4363 play frames
  - long task 1040 ms at sim 89 s (frame 4950)
  - long task 994 ms at sim 90 s (frame 5015)
  - long task 957 ms at sim 89.6 s (frame 4987)

## Files
- verdict: `design\program\player-truth\racing-pr-maturation-pr-maturation\verdict.md`
- contactSheet: `design\program\player-truth\racing-pr-maturation-pr-maturation\contact-sheet.jpg`
- json: `design\program\player-truth\racing-pr-maturation-pr-maturation\verdict.json`
