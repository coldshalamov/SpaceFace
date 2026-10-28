# Player-truth verdict: INCOMPLETE — gauntlet-ricochet-foundry

- Mode: gauntlet · arena Ricochet Foundry · seed 73311 (requested 4242; field not settable on this route) · build ab0ca3365
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T01:10:58.919Z
- Run: 127 s wall, 24.8 s of play sim time, 813 frames sampled, 19 screenshots · player script: idle 30 s → thrust/yaw probes → aim+fire at nearest hostile, close/open range, latch every 7th beat
- Stopped: run ended (player dead)

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | ≥20 s and player input |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **UNKNOWN** | — | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0.4% frames bad (2/549) | ≤0.5% |
| lod_churn | **PASS** | max 3/10s per entity · 0.68/s total | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 8% screen · player hidden 0% · threats hidden p95 29% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 67 ms · p99 757 ms · 5 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won; round 1 ended (run over) after 24.8 s
- **player_control** (UNKNOWN) — no control probe ran
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 82, asteroid 0, projectile 0, pickup 0; need 5)
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 3520 ms at sim 0.1 s (frame 87)
  - long task 562 ms at sim 0.5 s (frame 99)
  - long task 532 ms at sim 0.5 s (frame 97)

## Files
- verdict: `design/program/player-truth/gauntlet-ricochet-foundry/verdict.md`
- contactSheet: `design/program/player-truth/gauntlet-ricochet-foundry/contact-sheet.jpg`
- json: `design/program/player-truth/gauntlet-ricochet-foundry/verdict.json`
