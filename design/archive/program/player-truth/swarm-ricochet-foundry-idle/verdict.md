# Player-truth verdict: FAIL — swarm-ricochet-foundry

- Mode: swarm · arena Ricochet Foundry · seed 73311 (requested 4242; field not settable on this route) · build dbe7a4cec
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T00:55:18.228Z
- Run: 257 s wall, 23 s of play sim time, 1077 frames sampled, 32 screenshots · player script: idle 70 s → thrust/yaw probes → aim+fire at nearest hostile, close/open range, latch every 7th beat
- Stopped: run ended (player dead)

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | ≥20 s and player input |
| kills_before_input | **FAIL** | 7 kills | 0 |
| reward_before_input | **UNKNOWN** | — | 0 |
| spawn_motion | **FAIL** | 16 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **UNKNOWN** | — | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/638) | ≤0.5% |
| lod_churn | **FAIL** | max 7/10s per entity · 3.78/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 99.1/min · worst entity 3 toggles | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.79 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 15% screen · player hidden 4% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| loadout | **FAIL** | 5 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 216 ms · p99 1130 ms · 4 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won; round 1 ended (run over) after 23 s
- **kills_before_input** (FAIL) — non-player kills between round start and first flight input · whole run: 7 hostile deaths, 7 not credited to the player (info)
  - round 1: 7 kills in the first 23 s before input — by asteroid×3, ship×3, entity 110×1
- **reward_before_input** (UNKNOWN) — no run score sampled before the first input
- **spawn_motion** (FAIL) — 1 spawn moment(s) checked
  - round 1: asteroid 406 moving 55.5 u/s 317 u from the player before any input
  - round 1: asteroid 387 moving 54.5 u/s 95 u from the player before any input
  - round 1: asteroid 410 moving 45.7 u/s 113 u from the player before any input
- **player_control** (UNKNOWN) — no control probe ran
- **lod_churn** (FAIL) — 87 on-screen swaps over 23 sim s across 34 entities (57 more off screen, not graded)
  - entity 110 (asteroid) 7 swaps in 10 s (8 total) — last ship_wasp_bcd93ba9@lod2 → Asteroid_110@lod1 at sim 24.4 s
  - entity 379 (other) 7 swaps in 10 s (7 total) — last @-/compiling-pipelines → @- at sim 23.4 s
  - entity 355 (enemy) 7 swaps in 10 s (7 total) — last ship_wasp_a1a94758@lod1 → ship_wasp_a1a94758@lod2 at sim 21.5 s
- **popping** (FAIL) — 38 pops inside the inner 80% of the view; 0 non-projectile bodies born on screen (info)
  - entity 110 (enemy) appeared on screen 3× — first sim 1.8 s
  - entity 421 (asteroid) appeared on screen 3× — first sim 13.7 s
  - entity 355 (asteroid) removed without death on screen 3× — first sim 17.4 s
- **readability** (FAIL) — samples: enemy 68, asteroid 457, projectile 0, pickup 5
  - enemy vs asteroid: separation 0.79 (colour Δ 12.8, size ratio 1.09) over 68/457 samples
  - enemy: 59% of samples barely differ from the background (ΔL < 8)
- **vfx_coverage** (FAIL) — 159 scans of additive/transparent layers (bounding-sphere footprint on a 48×27 grid; 1 screen-sized batches excluded)
  - player ship ≥50% under additive VFX in 4% of scans (first sim 6.6 s; top: sf-selection-sigil)
  - peak coverage 16% at sim 7.1 s (overdraw 0.2×)
  - layer "sf-selection-sigil": mean 7.6% of screen, max 16%
- **loadout** (FAIL) — 79 offers read; swap probe: 3 installs, 2 announced swaps, 0 silent
  - irrelevant to swarm: Cargo Scanner S (Rigs) — cargo kit — Swarm has no cargo loop
  - irrelevant to swarm: Market Data Uplink S (Rigs) — market/trade kit — Swarm has no market
  - irrelevant to swarm: Bio-Spectral Pass Head (Rigs) — prospecting/mining kit — Swarm has no ore economy
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 2212 ms at sim 21.7 s (frame 973)
  - long task 659 ms at sim 10.9 s (frame 683)
  - long task 620 ms at sim 4.6 s (frame 499)

## Files
- verdict: `scratch/player-truth/swarm-idle/verdict.md`
- contactSheet: `scratch/player-truth/swarm-idle/contact-sheet.jpg`
- json: `scratch/player-truth/swarm-idle/verdict.json`
- trace: `scratch/player-truth/swarm-idle/trace.json.gz`
- frames: `scratch/player-truth/swarm-idle/frames`
