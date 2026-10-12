# Player-truth verdict: FAIL — swarm-ricochet-foundry

- Mode: swarm · arena Ricochet Foundry · seed 73311 (requested 4242; field not settable on this route) · build ab0ca3365
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T01:08:14.849Z
- Run: 617 s wall, 88.3 s of play sim time, 4098 frames sampled, 122 screenshots · player script: idle 30 s → thrust/yaw probes → aim+fire at nearest hostile, close/open range, latch every 7th beat
- Stopped: run ended (player dead)

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 73.5 s | ≥20 s and ≥1 input (SWARM_WAVE_DURATION_TICKS = 3600 (60 s wave), src/data/swarmMode.js; N = one third of the designed wave) |
| kills_before_input | **FAIL** | 12 kills | 0 |
| reward_before_input | **FAIL** | +3324 score | 0 |
| spawn_motion | **FAIL** | 65 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/4 probes dead | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/2184) | ≤0.5% |
| lod_churn | **FAIL** | max 7/10s per entity · 3.48/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 203.2/min · worst entity 7 toggles | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.41 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 29% screen · player hidden 6% · threats hidden p95 100% · 1.1 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| loadout | **FAIL** | 5 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 170 ms · p99 1036 ms · 6 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |

## Worst offenders
- **kills_before_input** (FAIL) — non-player kills between round start and first flight input · whole run: 29 hostile deaths, 24 not credited to the player (info)
  - round 1: 12 kills in the first 30.4 s before input — by ship×7, no killer×2, wreck×1, asteroid×2
- **reward_before_input** (FAIL) — HUD score credited between round start and the first flight input — the player is rewarded for doing nothing
  - round 1: +3324 score in the first 30.4 s with zero flight input (first credit at sim 1.6 s)
- **spawn_motion** (FAIL) — 2 spawn moment(s) checked
  - round 2: asteroid 484 moving 210 u/s 234 u from the player before any input
  - round 2: asteroid 542 moving 199.6 u/s 248 u from the player before any input
  - round 2: asteroid 368 moving 163.4 u/s 267 u from the player before any input
- **lod_churn** (FAIL) — 307 on-screen swaps over 88.3 sim s across 137 entities (775 more off screen, not graded)
  - entity 426 (asteroid) 7 swaps in 10 s (7 total) — last Asteroid_426@lod1 → Asteroid_426@lod2 at sim 22.3 s
  - entity 416 (enemy) 7 swaps in 10 s (7 total) — last ship_wasp_e6990798@lod1 → ship_wasp_e6990798@lod2 at sim 15.6 s
  - entity 427 (enemy) 6 swaps in 10 s (6 total) — last ship_wasp_acbfc584@lod1 → ship_wasp_acbfc584@lod2 at sim 15.6 s
- **popping** (FAIL) — 299 pops inside the inner 80% of the view; 3 non-projectile bodies born on screen (info)
  - entity 438 (asteroid) appeared on screen 7× — first sim 14.9 s
  - entity 462 (asteroid) appeared on screen 7× — first sim 19.5 s
  - entity 465 (asteroid) appeared on screen 7× — first sim 19.7 s
- **readability** (FAIL) — samples: enemy 119, asteroid 1243, projectile 90, pickup 33
  - enemy vs asteroid: separation 0.41 (colour Δ 9.4, size ratio 1.05) over 119/1243 samples
  - enemy: 66% of samples barely differ from the background (ΔL < 8)
  - projectile: 88% of samples barely differ from the background (ΔL < 8)
- **vfx_coverage** (FAIL) — 547 scans of additive/transparent layers (bounding-sphere footprint on a 48×27 grid; 2 screen-sized batches excluded)
  - player ship ≥50% under additive VFX in 6% of scans (first sim 6.4 s; top: sf-selection-sigil)
  - peak coverage 100% at sim 19 s (overdraw 1.9×)
  - layer "sf-fracture-veins (entity 479)": mean 4.6% of screen, max 240%
- **loadout** (FAIL) — 79 offers read; swap probe: 3 installs, 2 announced swaps, 0 silent
  - irrelevant to swarm: Cargo Scanner S (Rigs) — cargo kit — Swarm has no cargo loop
  - irrelevant to swarm: Market Data Uplink S (Rigs) — market/trade kit — Swarm has no market
  - irrelevant to swarm: Bio-Spectral Pass Head (Rigs) — prospecting/mining kit — Swarm has no ore economy
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 915 ms at sim 3.8 s (frame 414)
  - long task 697 ms at sim 10.8 s (frame 617)
  - long task 647 ms at sim 2 s (frame 365)

## Files
- verdict: `design/program/player-truth/swarm-ricochet-foundry/verdict.md`
- contactSheet: `design/program/player-truth/swarm-ricochet-foundry/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-ricochet-foundry/verdict.json`
