# Player-truth verdict: FAIL — swarm-active-pr-maturation-receipts

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 79f3f36db (dirty)
- Source at start: 79f3f36db · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: b38882645 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T20:37:41.364Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 602 s wall, 275.1 s of play sim time, 8971 frames sampled, 323 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: wall-clock cap

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 48.2 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **FAIL** | 52 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/6 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0.1 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/7444) | ≤0.5% |
| lod_churn | **FAIL** | max 2/10s per entity · 1.28/s total · 48 real LOD · 303 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 5/min · worst entity 1 toggle · 23 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 3% screen · player hidden 2% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 5% / p95 6% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 64 ms · p99 168 ms · 5 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/2 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **PASS** | round 3 | ≥ round 3 |

## Worst offenders
- **spawn_motion** (FAIL) — 3 spawn moment(s) checked
  - round 3: other 2932000464 moving 52.8 u/s 260 u from the player before any input
  - round 2: asteroid 315000448 moving 45.5 u/s 44 u from the player before any input
  - round 3: asteroid 3038000591 moving 30.5 u/s 146 u from the player before any input
- **lod_churn** (FAIL) — 48 real LOD/model swaps · 303 visible loading-state swaps (awaiting/loading/compiling, still counted) over 275.1 sim s across 345 entities (586 more off screen, not graded); 417 metadata-only transitions with unchanged drawn contents (diagnostic)
  - entity 431 (enemy) 2 swaps in 10 s (1 real LOD, 1 loading-state) — last ship_wasp_455e18f3@lod1 → ship_wasp_455e18f3@lod2 at sim 30.2 s
  - entity 550 (other) 2 swaps in 10 s (0 real LOD, 2 loading-state) — last @-/compiling-pipelines → @- at sim 44.2 s
  - entity 79 (fx) 2 swaps in 10 s (0 real LOD, 2 loading-state) — last SF_PlaceFallback_place_debri@lod1/compiling-pipelines → place_debris_chunk@lod1 at sim 85.9 s
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 3, asteroid 190, projectile 0, pickup 0; need 5); capture coherence: 11618 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval
- **frame_time** (UNKNOWN) — 7444 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 1093 ms at sim 265.8 s (frame 8686)
  - long task 350 ms at sim 114.9 s (frame 4494)
  - long task 286 ms at sim 222.7 s (frame 7062)

## Files
- verdict: `design\program\player-truth\swarm-active-pr-maturation-receipts\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-pr-maturation-receipts\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-pr-maturation-receipts\verdict.json`
