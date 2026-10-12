# Player-truth verdict: FAIL — gauntlet-cryo-drift

- Mode: gauntlet · arena Cryo Drift · seed 73311 (requested 4242; field not settable on this route) · build a4536789f
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T01:25:34.126Z
- Run: 200 s wall, 62.3 s of play sim time, 3098 frames sampled, 50 screenshots · player script: idle 30 s → thrust/yaw probes → aim+fire at nearest hostile, close/open range, latch every 7th beat
- Stopped: run ended (player dead)

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | ≥20 s and player input |
| kills_before_input | **FAIL** | 1 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0.1% frames bad (1/1174) | ≤0.5% |
| lod_churn | **PASS** | max 0/10s per entity · 0/s total | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 13% screen · player hidden 1% · threats hidden p95 n/a · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 80 ms · p99 383 ms · 5 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won; round 1 ended (run over) after 62.3 s
- **kills_before_input** (FAIL) — non-player kills between round start and first flight input · whole run: 3 hostile deaths, 3 not credited to the player (info)
  - round 1: 1 kill in the first 30.1 s before input — by ship×1
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5)
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 3266 ms at sim 0.1 s (frame 66)
  - long task 775 ms at sim 1.6 s (frame 103)
  - long task 383 ms at sim 1.9 s (frame 111)

## Files
- verdict: `design/program/player-truth/gauntlet-cryo-drift/verdict.md`
- contactSheet: `design/program/player-truth/gauntlet-cryo-drift/contact-sheet.jpg`
- json: `design/program/player-truth/gauntlet-cryo-drift/verdict.json`
