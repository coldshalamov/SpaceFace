# Player-truth verdict: FAIL — swarm-active-pr-maturation-phase

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 0095eff79 (dirty)
- Source at start: 0095eff79 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: 0095eff79 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-13T00:15:55.157Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 602 s wall, 169.5 s of play sim time, 5675 frames sampled, 299 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: wall-clock cap

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **FAIL** | — | ≥20 s and player input |
| kills_before_input | **FAIL** | 1 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/5535) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.21/s total · 25 real LOD · 11 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 92 ms · p99 271 ms · 25 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **FAIL** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 1 | ≥ round 3 |

## Worst offenders
- **round_resolution** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round was won inside the run)
- **kills_before_input** (FAIL) — non-player kills between round start and first flight input · whole run: 14 hostile deaths, 11 not credited to the player (info)
  - round 1: 1 kill in the first 3.3 s before input — by wreck×1
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 9731, projectile 0, pickup 167; need 5); capture coherence: 14734 body samples rejected for capture-motion or identity/visibility changes; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **frame_time** (UNKNOWN) — 5535 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Observer readbacks and screenshots remain included in these measurements.
  - long task 508 ms at sim 22.2 s (frame 1709)
  - long task 323 ms at sim 51.8 s (frame 2712)
  - long task 317 ms at sim 101.5 s (frame 4376)
- **round_transitions** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round after round 1 was reached)
- **rounds_reached** (FAIL) — stopped: wall-clock cap
  - scripted fighter stopped at round 1: wall-clock cap

## Files
- verdict: `design\program\player-truth\swarm-active-pr-maturation-phase\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-pr-maturation-phase\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-pr-maturation-phase\verdict.json`
