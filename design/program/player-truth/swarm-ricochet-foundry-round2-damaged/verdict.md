# Player-truth verdict: FAIL — swarm-active-probe5

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 0ff374482
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T04:00:07.010Z
- Run: 551 s wall, 67.3 s of play sim time, 2540 frames sampled, 83 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: run ended (player dead)

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 58.4 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **FAIL** | +2271 score | 0 |
| spawn_motion | **FAIL** | 67 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **FAIL** | 1/4 probes dead · 2 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0.1 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0.4% frames bad (6/1535) | ≤0.5% |
| lod_churn | **FAIL** | max 3/10s per entity · 1.53/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 109.7/min · worst entity 1 toggle | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.75 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 16% screen · player hidden 3% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 5% / p95 6% of screen · threats on bright backdrop p95 18% | threats on bright backdrop p95 ≤30% |
| loadout | **FAIL** | 5 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 83 ms · p99 4583 ms · 76 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **FAIL** | 1/1 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **reward_before_input** (FAIL) — HUD score credited between round start and the first flight input — the player is rewarded for doing nothing
  - round 1: +2271 score in the first 3.1 s with zero flight input (first credit at sim 1.8 s)
- **spawn_motion** (FAIL) — 2 spawn moment(s) checked
  - round 2: other 677000406 moving 137.2 u/s 550 u from the player before any input
  - round 2: other 676000494 moving 100.2 u/s 455 u from the player before any input
  - round 2: asteroid 612000488 moving 88.5 u/s 161 u from the player before any input
- **player_control** (FAIL) — round 1 thrust 95.95 · round 1 yaw -2.07 · round 2 thrust 45.35 · round 2 yaw -1.57
  - round 2 thrust: held W 1.7 s → velocity reads 47 u/s but the ship moved 1.5 u of 93 u (pinned)
  - pinned 62.5–64.5 s: velocity says 175 u of travel, ship moved 21 u
  - pinned 67.9–68.8 s: velocity says 51 u of travel, ship moved 10 u
- **lod_churn** (FAIL) — 103 on-screen swaps over 67.3 sim s across 74 entities (175 more off screen, not graded)
  - player ship swapped model/LOD 1× (first sim 1.8 s: 29e2c9a6|DIRECT_AUTHORED_ADMISSION|null|compiling-pipelines → 29e2c9a6|GLTFKIT_ship_hornet_fd39bb46|lod0|authored)
  - entity 415 (enemy) 3 swaps in 10 s (3 total) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_3b79ff5d@lod1 at sim 18.9 s
  - entity 413 (enemy) 3 swaps in 10 s (3 total) — last ship_wasp_ac34e9af@lod1 → ship_wasp_ac34e9af@lod2 at sim 24.3 s
- **popping** (FAIL) — 123 pops inside the inner 80% of the view; 3 non-projectile bodies born on screen (info)
  - entity 406 (asteroid) appeared on screen 2× — first sim 8.5 s
  - entity 393 (asteroid) appeared on screen 2× — first sim 8.5 s
  - entity 358 (asteroid) appeared on screen 2× — first sim 9.6 s
- **readability** (FAIL) — samples: enemy 135, asteroid 981, projectile 71, pickup 12
  - enemy vs asteroid: separation 0.75 (colour Δ 5.8, size ratio 1.91) over 135/981 samples
  - enemy: 71% of samples barely differ from the background (ΔL < 8)
  - projectile: 80% of samples barely differ from the background (ΔL < 8)
- **vfx_coverage** (FAIL) — 64 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - player ship ≥50% under combat VFX pixels in 3% of splits (first sim 24.3 s)
  - peak combat-VFX pixels 38% of screen at sim 44.5 s (53 combat layers lit)
- **loadout** (FAIL) — 79 offers read; swap probe: 3 installs, 2 announced swaps, 0 silent
  - irrelevant to swarm: Cargo Scanner S (Rigs) — cargo kit — Swarm has no cargo loop
  - irrelevant to swarm: Market Data Uplink S (Rigs) — market/trade kit — Swarm has no market
  - irrelevant to swarm: Bio-Spectral Pass Head (Rigs) — prospecting/mining kit — Swarm has no ore economy
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 7421 ms at sim 24.4 s (frame 1057)
  - long task 6311 ms at sim 63.4 s (frame 1897)
  - long task 5964 ms at sim 23.1 s (frame 1033)
- **round_transitions** (FAIL) — round 2: 680 frames, hull 66%, 0 bad ship, 0 out of plane, 1/2 dead probes, 2 pinned
  - round 2 start (hull 66%): 1/2 control probes dead (held W 1.7 s → velocity reads 47 u/s but the ship moved 1.5 u of 93 u (pinned)); pinned 62.5–64.5 s (velocity 175 u, moved 21 u)

## Files
- verdict: `design/program/player-truth/swarm-ricochet-foundry-round2-damaged/verdict.md`
- contactSheet: `design/program/player-truth/swarm-ricochet-foundry-round2-damaged/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-ricochet-foundry-round2-damaged/verdict.json`
- trace: `design/program/player-truth/swarm-ricochet-foundry-round2-damaged/trace.json.gz`
- frames: `design/program/player-truth/swarm-ricochet-foundry-round2-damaged/frames`
