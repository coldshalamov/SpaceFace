# Player-truth verdict: FAIL — swarm-ricochet-foundry-idle-seed4242

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 9e647c306
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T07:01:38.273Z
- Run: 2059 s wall, 41.5 s of play sim time, 1634 frames sampled, 55 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate idle pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: 1 rounds played

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 41.1 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **FAIL** | 8.2% frames bad (105/1278) | ≤0.5% |
| lod_churn | **FAIL** | max 3/10s per entity · 2.61/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 275.1/min · worst entity 11 toggles | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.26 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 34% screen · player hidden 9% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **FAIL** | backdrop lights median 4% / p95 6% of screen · threats on bright backdrop p95 40% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 41 ms · p99 4830 ms · 55 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **player_ship** (FAIL) — missing / hidden / off-frame / non-lod0 / placeholder (<300 tris) while alive in play
  - resolving marker: 105 frames, first at sim 1.5 s
  - asset loading: 56 frames, first at sim 1.5 s
  - asset compiling-pipelines: 49 frames, first at sim 2.7 s
- **lod_churn** (FAIL) — 107 on-screen swaps over 41 sim s across 75 entities (119 more off screen, not graded)
  - player ship swapped model/LOD 2× (first sim 2.7 s: 68f3cc9a|DIRECT_AUTHORED_ADMISSION|null|loading → 68f3cc9a|DIRECT_AUTHORED_ADMISSION|null|compiling-pipelines)
  - entity 335 (enemy) 3 swaps in 10 s (3 total) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_8e10602e@lod1 at sim 3.5 s
  - entity 396 (enemy) 3 swaps in 10 s (3 total) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_55ef0399@lod1 at sim 19.4 s
- **popping** (FAIL) — 188 pops inside the inner 80% of the view; 9 non-projectile bodies born on screen (info)
  - entity 435 (asteroid) appeared on screen 11× — first sim 28.4 s
  - entity 443 (asteroid) appeared on screen 7× — first sim 29.9 s
  - entity 446 (asteroid) appeared on screen 4× — first sim 28.2 s
- **readability** (FAIL) — samples: enemy 33, asteroid 932, projectile 7, pickup 11
  - enemy vs asteroid: separation 0.26 (colour Δ 6, size ratio 1.29) over 33/932 samples
  - enemy: 76% of samples barely differ from the background (ΔL < 8)
  - station:plate (station, grey, r 40 px) sits over the player ship in 21% of 34 samples — a play-space body that reads as neither enemy nor asteroid
- **vfx_coverage** (FAIL) — 53 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - player ship ≥50% under combat VFX pixels in 9% of splits (first sim 29.6 s)
  - peak combat-VFX pixels 45% of screen at sim 30.8 s (83 combat layers lit)
- **backdrop_coverage** (FAIL) — 53 per-pixel splits with backdrop layers hidden vs shown
  - 100% of on-screen threats sit on bright backdrop pixels at sim 1.9 s (backdrop lights 10% of the screen)
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 15840 ms at sim 15.2 s (frame 841)
  - long task 6841 ms at sim 42.2 s (frame 1609)
  - long task 6280 ms at sim 41.1 s (frame 1585)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `design/program/player-truth/swarm-ricochet-foundry-idle-seed4242/verdict.md`
- contactSheet: `design/program/player-truth/swarm-ricochet-foundry-idle-seed4242/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-ricochet-foundry-idle-seed4242/verdict.json`
