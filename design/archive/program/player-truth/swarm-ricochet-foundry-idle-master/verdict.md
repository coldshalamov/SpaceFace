# Player-truth verdict: FAIL — swarm-ricochet-foundry-idle-master

- Mode: swarm · arena Ricochet Foundry · seed 73311 (requested 4242; field not settable on this route) · build 5e1f24156
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T05:55:14.211Z
- Run: 363 s wall, 46 s of play sim time, 1912 frames sampled, 52 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate idle pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: duration 45 sim s reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | ≥20 s and player input |
| kills_before_input | **FAIL** | 12 kills | 0 |
| reward_before_input | **FAIL** | +2839 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/1528) | ≤0.5% |
| lod_churn | **FAIL** | max 6/10s per entity · 1.8/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 115.8/min · worst entity 2 toggles | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.93 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 7% screen · player hidden 0% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **FAIL** | backdrop lights median 4% / p95 10% of screen · threats on bright backdrop p95 100% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 26 ms · p99 3133 ms · 49 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **kills_before_input** (FAIL) — non-player kills between round start and first flight input · whole run: 13 hostile deaths, 12 not credited to the player (info)
  - round 1: 12 kills in the first 40.3 s before input — by ship×8, asteroid×4
- **reward_before_input** (FAIL) — HUD score credited between round start and the first flight input — the player is rewarded for doing nothing
  - round 1: +2839 score in the first 40.3 s with zero flight input (first credit at sim 23.5 s)
- **lod_churn** (FAIL) — 83 on-screen swaps over 46.1 sim s across 54 entities (108 more off screen, not graded)
  - entity 430 (asteroid) 6 swaps in 10 s (6 total) — last DIRECT_AUTHORED_ADMISSION@-/loading → Asteroid_430@lod1 at sim 25.5 s
  - entity 405 (enemy) 3 swaps in 10 s (3 total) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_154ae0bc@lod1 at sim 20.6 s
  - entity 377 (enemy) 3 swaps in 10 s (3 total) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_2712dbc0@lod1 at sim 23.6 s
- **popping** (FAIL) — 89 pops inside the inner 80% of the view; 9 non-projectile bodies born on screen (info)
  - entity 367 (asteroid) appeared on screen 2× — first sim 12.2 s
  - entity 377 (asteroid) appeared on screen 2× — first sim 15.1 s
  - entity 378 (asteroid) appeared on screen 2× — first sim 15.1 s
- **readability** (FAIL) — samples: enemy 76, asteroid 520, projectile 7, pickup 23
  - enemy vs asteroid: separation 0.93 (colour Δ 7.6, size ratio 2.05) over 76/520 samples
  - enemy: 70% of samples barely differ from the background (ΔL < 8)
  - projectile: 100% of samples barely differ from the background (ΔL < 8)
- **vfx_coverage** (FAIL) — 63 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - peak combat-VFX pixels 14% of screen at sim 22.1 s (39 combat layers lit)
- **backdrop_coverage** (FAIL) — 63 per-pixel splits with backdrop layers hidden vs shown
  - 100% of on-screen threats sit on bright backdrop pixels at sim 1.9 s (backdrop lights 10% of the screen)
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 7517 ms at sim 24.9 s (frame 1369)
  - long task 5946 ms at sim 25.9 s (frame 1392)
  - long task 5226 ms at sim 23.6 s (frame 1321)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `design/program/player-truth/swarm-ricochet-foundry-idle-master/verdict.md`
- contactSheet: `design/program/player-truth/swarm-ricochet-foundry-idle-master/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-ricochet-foundry-idle-master/verdict.json`
