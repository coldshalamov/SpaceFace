# Player-truth verdict: FAIL — swarm-idle-pr-maturation-final

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 2268b7ae7 (dirty)
- Source at start: 2268b7ae7 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: 2268b7ae7 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T19:08:20.157Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 115 s wall, 46.4 s of play sim time, 1737 frames sampled, 48 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate idle pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
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
| player_ship | **PASS** | 0% frames bad (0/1111) | ≤0.5% |
| lod_churn | **FAIL** | max 10/10s per entity · 0.97/s total · 16 real LOD · 29 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 2.6/min · worst entity 0 toggles · 2 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 1.15 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 1% screen · player hidden 0% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 5% / p95 5% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 42 ms · p99 110 ms · 0 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **lod_churn** (FAIL) — 16 real LOD/model swaps · 29 visible loading-state swaps (awaiting/loading/compiling, still counted) over 46.5 sim s across 25 entities (21 more off screen, not graded)
  - entity 343 (asteroid) 10 swaps in 10 s (0 real LOD, 10 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/loading → DIRECT_AUTHORED_ADMISSION@-/unavailable at sim 41 s
  - entity 351 (enemy) 4 swaps in 10 s (1 real LOD, 3 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/loading → DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines at sim 48.1 s
  - entity 335 (enemy) 3 swaps in 10 s (1 real LOD, 3 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_8e10602e@lod1 at sim 3.5 s
- **readability** (FAIL) — samples: enemy 33, asteroid 453, projectile 0, pickup 2
  - enemy: 76% of samples barely differ from the background (ΔL < 8)
- **vfx_coverage** (FAIL) — 46 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - peak combat-VFX pixels 2% of screen at sim 11.1 s (21 combat layers lit)
- **frame_time** (UNKNOWN) — 1111 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - frame 666: 825 ms at sim 3.3 s (128 entities, 0 draws)
  - frame 747: 231 ms at sim 7.2 s (129 entities, 0 draws)
  - frame 1713: 136 ms at sim 46.8 s (168 entities, 0 draws)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `design\program\player-truth\swarm-idle-pr-maturation-final\verdict.md`
- contactSheet: `design\program\player-truth\swarm-idle-pr-maturation-final\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-idle-pr-maturation-final\verdict.json`
