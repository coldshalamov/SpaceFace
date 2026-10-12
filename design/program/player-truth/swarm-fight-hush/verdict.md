# Player-truth verdict: FAIL — swarm-fight-hush

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build c90e4fd1a (dirty)
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T03:45:05.884Z
- Run: 374 s wall, 39 s of play sim time, 4248 frames sampled, 61 screenshots · player script: idle 6 s → thrust/yaw probes → aim+fire at nearest hostile, close/open range, latch every 7th beat
- Stopped: run ended (player dead)

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 28.4 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **FAIL** | +2973 score | 0 |
| spawn_motion | **FAIL** | 97 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **FAIL** | 1/4 probes dead | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/1002) | ≤0.5% |
| lod_churn | **FAIL** | max 4/10s per entity · 3.54/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 155.5/min · worst entity 1 toggle | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.74 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 90% screen · player hidden 45% · threats hidden p95 100% · 5.4 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| loadout | **FAIL** | 5 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 200 ms · p99 1043 ms · 9 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |

## Worst offenders
- **reward_before_input** (FAIL) — HUD score credited between round start and the first flight input — the player is rewarded for doing nothing
  - round 1: +2973 score in the first 6 s with zero flight input (first credit at sim 1.7 s)
- **spawn_motion** (FAIL) — 2 spawn moment(s) checked
  - round 2: asteroid 337000371 moving 119.7 u/s 798 u from the player before any input
  - round 2: asteroid 248000437 moving 116.2 u/s 240 u from the player before any input
  - round 2: asteroid 267000454 moving 95.8 u/s 875 u from the player before any input
- **player_control** (FAIL) — round 1 thrust 167.84 · round 1 yaw -2.49 · round 2 thrust -0.18 · round 2 yaw -2.32
  - round 2 thrust: held W 1.2 s → Δspeed -0.2 u/s, moved 0.6 u
- **lod_churn** (FAIL) — 138 on-screen swaps over 39 sim s across 82 entities (144 more off screen, not graded)
  - entity 417 (enemy) 4 swaps in 10 s (4 total) — last ship_wasp_27e38f93@lod1 → ship_wasp_27e38f93@lod2 at sim 13.5 s
  - entity 423 (enemy) 4 swaps in 10 s (4 total) — last ship_wasp_2dbb2168@lod1 → ship_wasp_2dbb2168@lod2 at sim 17.8 s
  - entity 424 (enemy) 4 swaps in 10 s (4 total) — last ship_wasp_fc5a6af9@lod1 → ship_wasp_fc5a6af9@lod2 at sim 17.7 s
- **popping** (FAIL) — 101 pops inside the inner 80% of the view; 8 non-projectile bodies born on screen (info)
  - entity 380 (asteroid) appeared on screen 2× — first sim 8.8 s
  - entity 447 (asteroid) appeared on screen 2× — first sim 19.7 s
  - entity 335 (enemy) appeared on screen 1× — first sim 1.9 s
- **readability** (FAIL) — samples: enemy 165, asteroid 562, projectile 50, pickup 34
  - enemy vs asteroid: separation 0.74 (colour Δ 10.7, size ratio 1.69) over 165/562 samples
  - enemy: 75% of samples barely differ from the background (ΔL < 8)
  - projectile: 88% of samples barely differ from the background (ΔL < 8)
- **vfx_coverage** (FAIL) — 251 scans of additive/transparent layers (bounding-sphere footprint on a 48×27 grid; 2 screen-sized batches excluded)
  - player ship ≥50% under additive VFX in 45% of scans (first sim 3.2 s; top: sf-selection-sigil)
  - peak coverage 100% at sim 24.1 s (overdraw 1×)
  - layer "sf-fracture-veins (entity 396)": mean 20.9% of screen, max 131%
- **loadout** (FAIL) — 79 offers read; swap probe: 3 installs, 2 announced swaps, 0 silent
  - irrelevant to swarm: Cargo Scanner S (Rigs) — cargo kit — Swarm has no cargo loop
  - irrelevant to swarm: Market Data Uplink S (Rigs) — market/trade kit — Swarm has no market
  - irrelevant to swarm: Bio-Spectral Pass Head (Rigs) — prospecting/mining kit — Swarm has no ore economy
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 716 ms at sim 30.4 s (frame 2326)
  - long task 617 ms at sim 1.9 s (frame 1525)
  - long task 561 ms at sim 12.4 s (frame 1831)

## Files
- verdict: `design/program/player-truth/swarm-fight-hush/verdict.md`
- contactSheet: `design/program/player-truth/swarm-fight-hush/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-fight-hush/verdict.json`
