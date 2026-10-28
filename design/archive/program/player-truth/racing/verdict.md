# Player-truth verdict: FAIL — racing

- Mode: racing · seed 4242 · build 62cdba622
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T01:57:29.959Z
- Run: 277 s wall, 76 s of play sim time, 1728 frames sampled, 58 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns
- Stopped: duration 75 sim s reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0.1% frames bad (2/1643) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.08/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 7.9/min · worst entity 1 toggle | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 0% · threats hidden p95 n/a · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 117 ms · p99 413 ms · 7 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |

## Worst offenders
- **popping** (FAIL) — 10 pops inside the inner 80% of the view; 0 non-projectile bodies born on screen (info)
  - entity 417 (neutral) appeared on screen 1× — first sim 1 s
  - entity 475 (other) appeared on screen 1× — first sim 1.7 s
  - entity 404 (other) appeared on screen 1× — first sim 1.9 s
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5)
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 631 ms at sim 0.3 s (frame 95)
  - long task 547 ms at sim 20 s (frame 564)
  - long task 382 ms at sim 4.9 s (frame 201)

## Files
- verdict: `design/program/player-truth/racing/verdict.md`
- contactSheet: `design/program/player-truth/racing/contact-sheet.jpg`
- json: `design/program/player-truth/racing/verdict.json`
