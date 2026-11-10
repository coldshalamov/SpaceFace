# Player-truth verdict: FAIL — swarm-active-pr-maturation-final

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 2268b7ae7 (dirty)
- Source at start: 2268b7ae7 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: 2268b7ae7 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T19:12:45.094Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 261 s wall, 80.5 s of play sim time, 7010 frames sampled, 141 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: run ended (player dead)

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **FAIL** | — | ≥20 s and player input |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/2858) | ≤0.5% |
| lod_churn | **FAIL** | max 6/10s per entity · 2.48/s total · 82 real LOD · 118 loading | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 20.1/min · worst entity 1 toggle · 27 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.36 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 2% screen · player hidden 0% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 5% / p95 5% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 41 ms · p99 138 ms · 0 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **FAIL** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 1 | ≥ round 3 |

## Worst offenders
- **round_resolution** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round was won; round 1 ended (run over) after 80.5 s)
- **lod_churn** (FAIL) — 82 real LOD/model swaps · 118 visible loading-state swaps (awaiting/loading/compiling, still counted) over 80.7 sim s across 99 entities (150 more off screen, not graded)
  - entity 470 (other) 6 swaps in 10 s (0 real LOD, 6 loading-state) — last @-/compiling-pipelines → @- at sim 50.1 s
  - entity 473 (asteroid) 4 swaps in 10 s (1 real LOD, 6 loading-state) — last @- → Asteroid_473@lod1 at sim 78.8 s
  - entity 355 (enemy) 4 swaps in 10 s (1 real LOD, 4 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_a1a94758@lod1 at sim 54.3 s
- **popping** (FAIL) — 27 visibility pops · 0 visible loading-state pops (awaiting/loading/compiling, still counted) inside the inner 80% of the view; 64 non-projectile bodies born on screen (info)
  - entity 357 (asteroid) removed without death on screen 2× (2 visibility, 0 loading-state) — first sim 15.4 s
  - entity 353 (asteroid) removed without death on screen 2× (2 visibility, 0 loading-state) — first sim 20.7 s
  - entity 375 (asteroid) removed without death on screen 1× (1 visibility, 0 loading-state) — first sim 8.3 s
- **readability** (FAIL) — samples: enemy 268, asteroid 1755, projectile 0, pickup 25
  - enemy vs asteroid: separation 0.36 (colour Δ 6.6, size ratio 1.44) over 268/1755 samples
  - enemy: 78% of samples barely differ from the background (ΔL < 8)
  - wreck: (other, dark, r 32 px) sits over the player ship in 23% of 138 samples — a play-space body that reads as neither enemy nor asteroid
- **vfx_coverage** (FAIL) — 120 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - peak combat-VFX pixels 5% of screen at sim 6.2 s (21 combat layers lit)
- **frame_time** (UNKNOWN) — 2882 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - frame 581: 514 ms at sim 3.4 s (122 entities, 0 draws)
  - frame 2329: 253 ms at sim 54.1 s (203 entities, 0 draws)
  - frame 3025: 225 ms at sim 73.5 s (271 entities, 0 draws)
- **round_transitions** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round after round 1 was reached)
- **rounds_reached** (FAIL) — stopped: run ended (player dead)
  - scripted fighter stopped at round 1: run ended (player dead)

## Files
- verdict: `design\program\player-truth\swarm-active-pr-maturation-final\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-pr-maturation-final\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-pr-maturation-final\verdict.json`
