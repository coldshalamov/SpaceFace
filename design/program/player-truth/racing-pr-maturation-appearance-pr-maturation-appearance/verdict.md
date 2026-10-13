# Player-truth verdict: INCOMPLETE — racing-pr-maturation-appearance-pr-maturation-appearance

- Mode: racing · seed 4242 · build 0ca4dae5a (dirty)
- Source at start: 0ca4dae5a · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: 0ca4dae5a · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T22:39:52.368Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 608 s wall, 83.8 s of play sim time, 4539 frames sampled, 102 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
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
| player_ship | **PASS** | 0% frames bad (0/4419) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.05/s total · 1 real LOD · 3 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 0% · threats hidden p95 n/a · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 2% / p95 2% of screen · threats on bright backdrop p95 n/a | threats on bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 71 ms · p99 747 ms · 219 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 286 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval
- **frame_time** (UNKNOWN) — 4419 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 1161 ms at sim 82.6 s (frame 5460)
  - long task 872 ms at sim 80.1 s (frame 5314)
  - long task 862 ms at sim 80.6 s (frame 5339)

## Files
- verdict: `design\program\player-truth\racing-pr-maturation-appearance-pr-maturation-appearance\verdict.md`
- contactSheet: `design\program\player-truth\racing-pr-maturation-appearance-pr-maturation-appearance\contact-sheet.jpg`
- json: `design\program\player-truth\racing-pr-maturation-appearance-pr-maturation-appearance\verdict.json`
