# Player-truth verdict: FAIL — adventure-starter-fight

- Mode: adventure · seed 4242 · build c90e4fd1a (dirty)
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T03:11:21.742Z
- Run: 443 s wall, 300.2 s of play sim time, 6238 frames sampled, 129 screenshots · player script: idle 6 s → thrust/yaw probes → adventure fight: aim+fire at nearest hostile when one is in reach, else cruise
- Stopped: duration 300 sim s reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **FAIL** | 5 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0.1% frames bad (7/6111) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0/s total | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0.8/min · worst entity 1 toggle | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 0% · threats hidden p95 n/a · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 58 ms · p99 188 ms · 4 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |

## Worst offenders
- **spawn_motion** (FAIL) — 1 spawn moment(s) checked
  - spawn: asteroid 17 moving 62 u/s 841 u from the player before any input
  - spawn: asteroid 41 moving 44.5 u/s 864 u from the player before any input
  - spawn: asteroid 28 moving 30.9 u/s 798 u from the player before any input
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 13, projectile 0, pickup 0; need 5)
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 4597 ms at sim 0.5 s (frame 139)
  - long task 475 ms at sim 0.3 s (frame 136)
  - long task 282 ms at sim 13 s (frame 404)

## Files
- verdict: `design/program/player-truth/adventure-starter-fight/verdict.md`
- contactSheet: `design/program/player-truth/adventure-starter-fight/contact-sheet.jpg`
- json: `design/program/player-truth/adventure-starter-fight/verdict.json`
