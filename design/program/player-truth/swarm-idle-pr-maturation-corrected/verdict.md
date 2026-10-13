# Player-truth verdict: FAIL — swarm-idle-pr-maturation-corrected

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build d020a7184 (dirty)
- Source at start: d020a7184 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: d020a7184 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T19:41:40.498Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 102 s wall, 46.2 s of play sim time, 2230 frames sampled, 47 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate idle pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
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
| player_ship | **PASS** | 0% frames bad (0/1587) | ≤0.5% |
| lod_churn | **FAIL** | max 3/10s per entity · 1.3/s total · 18 real LOD · 42 loading | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 13/min · worst entity 0 toggles · 10 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **FAIL** | p95 1% screen · player hidden 2% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 4% / p95 5% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 26 ms · p99 81 ms · 0 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **lod_churn** (FAIL) — 18 real LOD/model swaps · 42 visible loading-state swaps (awaiting/loading/compiling, still counted) over 46.2 sim s across 36 entities (6 more off screen, not graded)
  - entity 372 (other) 3 swaps in 10 s (0 real LOD, 3 loading-state) — last @-/compiling-pipelines → @- at sim 4.4 s
  - entity 413 (enemy) 3 swaps in 10 s (0 real LOD, 3 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_ac34e9af@lod1 at sim 47 s
  - entity 414 (enemy) 3 swaps in 10 s (0 real LOD, 3 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_6db473d2@lod1 at sim 47 s
- **popping** (FAIL) — 10 visibility pops · 0 visible loading-state pops (awaiting/loading/compiling, still counted) inside the inner 80% of the view; 32 non-projectile bodies born on screen (info)
  - entity 391 (asteroid) removed without death on screen 1× (1 visibility, 0 loading-state) — first sim 42.9 s
  - entity 374 (asteroid) removed without death on screen 1× (1 visibility, 0 loading-state) — first sim 43.8 s
  - entity 349 (asteroid) removed without death on screen 1× (1 visibility, 0 loading-state) — first sim 43.9 s
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 3, asteroid 320, projectile 0, pickup 0; need 5); capture coherence: 496 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval
- **vfx_coverage** (FAIL) — 66 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - player ship ≥50% under combat VFX pixels in 2% of splits (first sim 45.5 s)
  - peak combat-VFX pixels 4% of screen at sim 8.6 s (18 combat layers lit)
- **frame_time** (UNKNOWN) — 1587 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - frame 682: 598 ms at sim 3.5 s (128 entities, 0 draws)
  - frame 697: 110 ms at sim 4.2 s (128 entities, 0 draws)
  - frame 2218: 101 ms at sim 47.7 s (162 entities, 0 draws)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `design\program\player-truth\swarm-idle-pr-maturation-corrected\verdict.md`
- contactSheet: `design\program\player-truth\swarm-idle-pr-maturation-corrected\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-idle-pr-maturation-corrected\verdict.json`
