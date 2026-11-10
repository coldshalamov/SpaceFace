# Player-truth verdict: FAIL — swarm-idle

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 07e4eda14
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T04:09:22.565Z
- Run: 324 s wall, 13.2 s of play sim time, 881 frames sampled, 24 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate idle pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: run ended (player dead)

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | ≥20 s and player input |
| kills_before_input | **FAIL** | 9 kills | 0 |
| reward_before_input | **FAIL** | +4041 score | 0 |
| spawn_motion | **FAIL** | 13 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **UNKNOWN** | — | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/391) | ≤0.5% |
| lod_churn | **FAIL** | max 4/10s per entity · 5.34/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 306.8/min · worst entity 1 toggle | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.69 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 8% screen · player hidden 0% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 7% / p95 8% of screen · threats on bright backdrop p95 7% | threats on bright backdrop p95 ≤30% |
| loadout | **FAIL** | 5 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 79 ms · p99 8511 ms · 21 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won; round 1 ended (run over) after 13.2 s
- **kills_before_input** (FAIL) — non-player kills between round start and first flight input · whole run: 9 hostile deaths, 9 not credited to the player (info)
  - round 1: 9 kills in the first 13.2 s before input — by ship×8, no killer×1
- **reward_before_input** (FAIL) — HUD score credited between round start and the first flight input — the player is rewarded for doing nothing
  - round 1: +4041 score in the first 13.2 s with zero flight input (first credit at sim 1.8 s)
- **spawn_motion** (FAIL) — 1 spawn moment(s) checked
  - round 1: asteroid 377 moving 48.9 u/s 80 u from the player before any input
  - round 1: asteroid 399 moving 48.9 u/s 115 u from the player before any input
  - round 1: asteroid 398 moving 48.6 u/s 335 u from the player before any input
- **player_control** (UNKNOWN) — no control probe ran
- **lod_churn** (FAIL) — 71 on-screen swaps over 13.3 sim s across 43 entities (84 more off screen, not graded)
  - entity 358 (enemy) 4 swaps in 10 s (4 total) — last ship_wasp_14bb1967@lod1 → ship_wasp_14bb1967@lod2 at sim 9.5 s
  - entity 402 (enemy) 4 swaps in 10 s (4 total) — last ship_wasp_fadff585@lod1 → ship_wasp_fadff585@lod2 at sim 11.5 s
  - entity 345 (enemy) 3 swaps in 10 s (3 total) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_9cc6d8b9@lod1 at sim 5.2 s
- **popping** (FAIL) — 68 pops inside the inner 80% of the view; 4 non-projectile bodies born on screen (info)
  - entity 376 (asteroid) appeared on screen 2× — first sim 2 s
  - entity 377 (asteroid) appeared on screen 2× — first sim 2 s
  - entity 378 (asteroid) appeared on screen 2× — first sim 2 s
- **readability** (FAIL) — samples: enemy 65, asteroid 180, projectile 12, pickup 14
  - enemy vs asteroid: separation 0.69 (colour Δ 8, size ratio 1.71) over 65/180 samples
  - enemy: 63% of samples barely differ from the background (ΔL < 8)
  - projectile: 58% of samples barely differ from the background (ΔL < 8)
- **vfx_coverage** (FAIL) — 17 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - peak combat-VFX pixels 8% of screen at sim 10.4 s (41 combat layers lit)
- **loadout** (FAIL) — 79 offers read; swap probe: 3 installs, 2 announced swaps, 0 silent
  - irrelevant to swarm: Cargo Scanner S (Rigs) — cargo kit — Swarm has no cargo loop
  - irrelevant to swarm: Market Data Uplink S (Rigs) — market/trade kit — Swarm has no market
  - irrelevant to swarm: Bio-Spectral Pass Head (Rigs) — prospecting/mining kit — Swarm has no ore economy
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 10478 ms at sim 9.6 s (frame 649)
  - long task 10097 ms at sim 6.7 s (frame 577)
  - long task 8676 ms at sim 11.6 s (frame 697)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `design/program/player-truth/swarm-ricochet-foundry-gate-idle/verdict.md`
- contactSheet: `design/program/player-truth/swarm-ricochet-foundry-gate-idle/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-ricochet-foundry-gate-idle/verdict.json`
