# Player-truth verdict: FAIL — swarm-active

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build a0b854c91
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T04:24:07.516Z
- Run: 883 s wall, 54.9 s of play sim time, 2598 frames sampled, 82 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: run ended (player dead)

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 41.6 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **FAIL** | +2339 score | 0 |
| spawn_motion | **FAIL** | 120 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **FAIL** | 1/4 probes dead · 3 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **FAIL** | 1.1% frames bad (13/1231) | ≤0.5% |
| lod_churn | **FAIL** | max 4/10s per entity · 2.33/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 315.4/min · worst entity 8 toggles | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.26 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 39% screen · player hidden 14% · threats hidden p95 100% · 2.3 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **FAIL** | backdrop lights median 5% / p95 6% of screen · threats on bright backdrop p95 50% | threats on bright backdrop p95 ≤30% |
| loadout | **FAIL** | 5 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 118 ms · p99 8785 ms · 61 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **FAIL** | 1/1 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 2 | ≥ round 3 |

## Worst offenders
- **reward_before_input** (FAIL) — HUD score credited between round start and the first flight input — the player is rewarded for doing nothing
  - round 1: +2339 score in the first 3.4 s with zero flight input (first credit at sim 1.8 s)
- **spawn_motion** (FAIL) — 2 spawn moment(s) checked
  - round 2: asteroid 490000454 moving 133.7 u/s 305 u from the player before any input
  - round 2: asteroid 384000434 moving 122.7 u/s 212 u from the player before any input
  - round 2: asteroid 485000457 moving 85.4 u/s 297 u from the player before any input
- **player_control** (FAIL) — round 1 thrust 165.46 · round 1 yaw -1.66 · round 2 thrust 140.47 · round 2 yaw -1.72
  - round 2 thrust: held W 1.4 s → velocity reads 141 u/s but the ship moved 1.2 u of 179 u (pinned)
  - pinned 45.5–47.6 s: velocity says 367 u of travel, ship moved 10 u — ship sits 1 u from station:furnace #539000521
  - pinned 48.5–49.9 s: velocity says 99 u of travel, ship moved 12 u — ship sits 2 u from station:furnace #539000521
- **player_ship** (FAIL) — missing / hidden / off-frame / non-lod0 / placeholder (<300 tris) while alive in play
  - resolving marker: 13 frames, first at sim 1.5 s
  - asset compiling-pipelines: 13 frames, first at sim 1.5 s
- **lod_churn** (FAIL) — 128 on-screen swaps over 55 sim s across 100 entities (325 more off screen, not graded)
  - player ship swapped model/LOD 1× (first sim 1.9 s: 6e121d47|DIRECT_AUTHORED_ADMISSION|null|compiling-pipelines → 6e121d47|GLTFKIT_ship_hornet_fd39bb46|lod0|authored)
  - entity 560 (enemy) 4 swaps in 10 s (4 total) — last ship_wasp_808cccd2@lod1 → ship_wasp_808cccd2@lod2 at sim 53.6 s
  - entity 416 (enemy) 3 swaps in 10 s (3 total) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_e6990798@lod1 at sim 20.2 s
- **popping** (FAIL) — 289 pops inside the inner 80% of the view; 11 non-projectile bodies born on screen (info)
  - entity 439 (asteroid) appeared on screen 8× — first sim 24.1 s
  - entity 438 (asteroid) appeared on screen 8× — first sim 24.1 s
  - entity 429 (asteroid) appeared on screen 8× — first sim 40.3 s
- **readability** (FAIL) — samples: enemy 198, asteroid 1998, projectile 111, pickup 23
  - enemy vs asteroid: separation 0.26 (colour Δ 5.5, size ratio 1.03) over 198/1998 samples
  - enemy: 71% of samples barely differ from the background (ΔL < 8)
  - projectile: 72% of samples barely differ from the background (ΔL < 8)
- **vfx_coverage** (FAIL) — 51 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - player ship ≥50% under combat VFX pixels in 14% of splits (first sim 13.5 s)
  - peak combat-VFX pixels 77% of screen at sim 18.2 s (74 combat layers lit)
- **backdrop_coverage** (FAIL) — 51 per-pixel splits with backdrop layers hidden vs shown
  - 100% of on-screen threats sit on bright backdrop pixels at sim 5.8 s (backdrop lights 4% of the screen)
- **loadout** (FAIL) — 79 offers read; swap probe: 3 installs, 2 announced swaps, 0 silent
  - irrelevant to swarm: Cargo Scanner S (Rigs) — cargo kit — Swarm has no cargo loop
  - irrelevant to swarm: Market Data Uplink S (Rigs) — market/trade kit — Swarm has no market
  - irrelevant to swarm: Bio-Spectral Pass Head (Rigs) — prospecting/mining kit — Swarm has no ore economy
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 24389 ms at sim 24.5 s (frame 937)
  - long task 20503 ms at sim 23.8 s (frame 914)
  - long task 14292 ms at sim 25.4 s (frame 961)
- **round_transitions** (FAIL) — round 2: 191 frames, hull 100%, 0 bad ship, 0 out of plane, 1/2 dead probes, 3 pinned
  - round 2 start (hull 100%): 1/2 control probes dead (held W 1.4 s → velocity reads 141 u/s but the ship moved 1.2 u of 179 u (pinned)); pinned 45.6–47.6 s (velocity 373 u, moved 10 u — ship sits 2 u from station:furnace #539000521)
- **rounds_reached** (FAIL) — stopped: run ended (player dead)
  - scripted fighter stopped at round 2: run ended (player dead)

## Files
- verdict: `design/program/player-truth/swarm-ricochet-foundry-gate-active/verdict.md`
- contactSheet: `design/program/player-truth/swarm-ricochet-foundry-gate-active/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-ricochet-foundry-gate-active/verdict.json`
- trace: `design/program/player-truth/swarm-ricochet-foundry-gate-active/trace.json.gz`
- frames: `design/program/player-truth/swarm-ricochet-foundry-gate-active/frames`
