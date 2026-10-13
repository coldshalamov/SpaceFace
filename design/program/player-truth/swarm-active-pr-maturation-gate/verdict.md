# Player-truth verdict: FAIL — swarm-active-pr-maturation-gate

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build edcdc57cf (dirty)
- Source at start: edcdc57cf · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/render/bloom.js, src/render/packageCpuDetach.js, src/render/renderer.js
- Source at end: a147bc066 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-13T02:51:33.739Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 612 s wall, 12.2 s of play sim time, 424 frames sampled, 57 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: wall-clock cap

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **FAIL** | — | ≥20 s and player input |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/304) | ≤0.5% |
| lod_churn | **FAIL** | max 1/10s per entity · 1.14/s total · 1 real LOD · 13 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 4% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 2% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 996 ms · p99 1096 ms · 3 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **FAIL** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 1 | ≥ round 3 |

## Worst offenders
- **round_resolution** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round was won inside the run)
- **lod_churn** (FAIL) — 1 real LOD/model swaps · 13 visible loading-state swaps (awaiting/loading/compiling, still counted) over 12.3 sim s across 14 entities (11 more off screen, not graded); 21 metadata-only transitions with unchanged drawn contents (diagnostic)
  - entity 375 (enemy) 1 swaps in 10 s (0 real LOD, 1 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_fc9871da@lod1 at sim 1.9 s
  - entity 372 (other) 1 swaps in 10 s (0 real LOD, 1 loading-state) — last @-/awaiting-authored-admission → @- at sim 2.6 s
  - entity 364 (asteroid) 1 swaps in 10 s (1 real LOD, 0 loading-state) — last Asteroid_364@lod0 → Asteroid_364@lod1 at sim 3.3 s
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 1, asteroid 42, projectile 0, pickup 0; need 5); capture coherence: 904 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **frame_time** (UNKNOWN) — 304 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 386 ms at sim 5.9 s (frame 332)
  - long task 274 ms at sim 10.8 s (frame 456)
  - long task 260 ms at sim 13.7 s (frame 528)
- **round_transitions** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round after round 1 was reached)
- **rounds_reached** (FAIL) — stopped: wall-clock cap
  - scripted fighter stopped at round 1: wall-clock cap

## Files
- verdict: `design\program\player-truth\swarm-active-pr-maturation-gate\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-pr-maturation-gate\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-pr-maturation-gate\verdict.json`
