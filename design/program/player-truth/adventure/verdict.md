# Player-truth verdict: INCOMPLETE — adventure

- Mode: adventure · seed 4242 · build a4536789f
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T01:41:11.157Z
- Run: 250 s wall, 150.9 s of play sim time, 3304 frames sampled, 68 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns
- Stopped: duration 150 sim s reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0.2% frames bad (6/3165) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.03/s total | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 55 ms · p99 214 ms · 4 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 1, asteroid 0, projectile 0, pickup 0; need 5)
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 1238 ms at sim 0.3 s (frame 148)
  - long task 334 ms at sim 0.6 s (frame 154)
  - long task 286 ms at sim 7.5 s (frame 306)

## Files
- verdict: `design/program/player-truth/adventure/verdict.md`
- contactSheet: `design/program/player-truth/adventure/contact-sheet.jpg`
- json: `design/program/player-truth/adventure/verdict.json`
