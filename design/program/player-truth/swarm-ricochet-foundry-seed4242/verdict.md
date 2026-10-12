# Player-truth verdict: FAIL — swarm-ricochet-foundry-seed4242

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 62cdba622
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T02:02:31.130Z
- Run: 259 s wall, 24.7 s of play sim time, 1060 frames sampled, 32 screenshots · player script: idle 30 s → thrust/yaw probes → aim+fire at nearest hostile, close/open range, latch every 7th beat
- Stopped: run ended (player dead)

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | ≥20 s and player input |
| kills_before_input | **FAIL** | 4 kills | 0 |
| reward_before_input | **FAIL** | +3849 score | 0 |
| spawn_motion | **FAIL** | 13 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **UNKNOWN** | — | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/707) | ≤0.5% |
| lod_churn | **FAIL** | max 4/10s per entity · 2.79/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 109/min · worst entity 1 toggles | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.48 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 14% screen · player hidden 8% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| loadout | **FAIL** | 5 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 196 ms · p99 1086 ms · 5 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won; round 1 ended (run over) after 24.7 s
- **kills_before_input** (FAIL) — non-player kills between round start and first flight input · whole run: 4 hostile deaths, 4 not credited to the player (info)
  - round 1: 4 kills in the first 24.7 s before input — by ship×3, asteroid×1
- **reward_before_input** (FAIL) — HUD score credited between round start and the first flight input — the player is rewarded for doing nothing
  - round 1: +3849 score in the first 24.7 s with zero flight input (first credit at sim 1.7 s)
- **spawn_motion** (FAIL) — 1 spawn moment(s) checked
  - round 1: asteroid 377 moving 47.6 u/s 84 u from the player before any input
  - round 1: asteroid 399 moving 45.6 u/s 111 u from the player before any input
  - round 1: asteroid 398 moving 45.5 u/s 334 u from the player before any input
- **player_control** (UNKNOWN) — no control probe ran
- **lod_churn** (FAIL) — 69 on-screen swaps over 24.8 sim s across 42 entities (23 more off screen, not graded)
  - entity 69000391 (enemy) 4 swaps in 10 s (4 total) — last ship_wasp_35b48d08@lod1 → ship_wasp_35b48d08@lod2 at sim 24 s
  - entity 72000415 (enemy) 4 swaps in 10 s (4 total) — last ship_wasp_3b79ff5d@lod1 → ship_wasp_3b79ff5d@lod2 at sim 24.6 s
  - entity 74000379 (enemy) 4 swaps in 10 s (4 total) — last ship_wasp_882df7ee@lod1 → ship_wasp_882df7ee@lod2 at sim 26.1 s
- **popping** (FAIL) — 45 pops inside the inner 80% of the view; 1 non-projectile bodies born on screen (info)
  - entity 335 (enemy) appeared on screen 1× — first sim 1.6 s
  - entity 36000361 (asteroid) appeared on screen 1× — first sim 10.4 s
  - entity 28000397 (asteroid) removed without death on screen 1× — first sim 11.3 s
- **readability** (FAIL) — samples: enemy 109, asteroid 327, projectile 4, pickup 5
  - enemy vs asteroid: separation 0.48 (colour Δ 8.2, size ratio 1.41) over 109/327 samples
  - enemy: 61% of samples barely differ from the background (ΔL < 8)
- **vfx_coverage** (FAIL) — 177 scans of additive/transparent layers (bounding-sphere footprint on a 48×27 grid; 1 screen-sized batches excluded)
  - player ship ≥50% under additive VFX in 8% of scans (first sim 3.2 s; top: sf-selection-sigil)
  - peak coverage 16% at sim 7.6 s (overdraw 0.2×)
  - layer "sf-selection-sigil": mean 5.4% of screen, max 16%
- **loadout** (FAIL) — 79 offers read; swap probe: 3 installs, 2 announced swaps, 0 silent
  - irrelevant to swarm: Cargo Scanner S (Rigs) — cargo kit — Swarm has no cargo loop
  - irrelevant to swarm: Market Data Uplink S (Rigs) — market/trade kit — Swarm has no market
  - irrelevant to swarm: Bio-Spectral Pass Head (Rigs) — prospecting/mining kit — Swarm has no ore economy
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 1096 ms at sim 12.7 s (frame 660)
  - long task 543 ms at sim 2.9 s (frame 380)
  - long task 404 ms at sim 1.6 s (frame 340)

## Files
- verdict: `design/program/player-truth/swarm-ricochet-foundry-seed4242/verdict.md`
- contactSheet: `design/program/player-truth/swarm-ricochet-foundry-seed4242/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-ricochet-foundry-seed4242/verdict.json`
