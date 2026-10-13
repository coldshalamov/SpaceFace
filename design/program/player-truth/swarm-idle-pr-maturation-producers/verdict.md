# Player-truth verdict: FAIL — swarm-idle-pr-maturation-producers

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 8fa91b1e7 (dirty)
- Source at start: 8fa91b1e7 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: 8fa91b1e7 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T21:13:31.233Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 114 s wall, 46 s of play sim time, 2253 frames sampled, 43 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate idle pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
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
| player_ship | **PASS** | 0% frames bad (0/1138) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.2/s total · 1 real LOD · 8 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 4% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **FAIL** | backdrop lights median 5% / p95 6% of screen · threats on bright backdrop p95 100% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 41 ms · p99 106 ms · 0 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 2, asteroid 148, projectile 0, pickup 0; need 5); capture coherence: 412 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval
- **backdrop_coverage** (FAIL) — 47 per-pixel splits with backdrop layers hidden vs shown
  - 100% of on-screen threats sit on bright backdrop pixels at sim 20.3 s (backdrop lights 5% of the screen)
- **frame_time** (UNKNOWN) — 1138 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - frame 1154: 1235 ms at sim 3.3 s (122 entities, 0 draws)
  - frame 1310: 276 ms at sim 10.7 s (122 entities, 0 draws)
  - frame 1925: 165 ms at sim 35 s (126 entities, 0 draws)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `design\program\player-truth\swarm-idle-pr-maturation-producers\verdict.md`
- contactSheet: `design\program\player-truth\swarm-idle-pr-maturation-producers\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-idle-pr-maturation-producers\verdict.json`
