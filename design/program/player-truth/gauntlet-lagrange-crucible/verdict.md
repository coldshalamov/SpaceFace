# Player-truth verdict: FAIL — gauntlet-lagrange-crucible

- Mode: gauntlet · arena Lagrange Crucible · seed 73311 (requested 4242; field not settable on this route) · build a4536789f
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T01:16:56.489Z
- Run: 357 s wall, 75.4 s of play sim time, 1812 frames sampled, 66 screenshots · player script: idle 30 s → thrust/yaw probes → aim+fire at nearest hostile, close/open range, latch every 7th beat
- Stopped: duration 75 sim s reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | ≥20 s and player input |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0.1% frames bad (2/1697) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.2/s total | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 4.8/min · worst entity 1 toggles | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 0.43 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 7% screen · player hidden 4% · threats hidden p95 60% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 105 ms · p99 861 ms · 9 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **readability** (FAIL) — samples: enemy 164, asteroid 57, projectile 2, pickup 1
  - enemy vs asteroid: separation 0.43 (colour Δ 8.3, size ratio 1.22) over 164/57 samples
  - enemy: 64% of samples barely differ from the background (ΔL < 8)
- **vfx_coverage** (FAIL) — 425 scans of additive/transparent layers (bounding-sphere footprint on a 48×27 grid; 1 screen-sized batches excluded)
  - player ship ≥50% under additive VFX in 4% of scans (first sim 4.8 s; top: sf-selection-sigil)
  - peak coverage 9% at sim 3.4 s (overdraw 0.1×)
  - layer "sf-selection-sigil": mean 2.2% of screen, max 9%
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 916 ms at sim 7.1 s (frame 265)
  - long task 904 ms at sim 46.2 s (frame 1126)
  - long task 502 ms at sim 1.1 s (frame 142)

## Files
- verdict: `design/program/player-truth/gauntlet-lagrange-crucible/verdict.md`
- contactSheet: `design/program/player-truth/gauntlet-lagrange-crucible/contact-sheet.jpg`
- json: `design/program/player-truth/gauntlet-lagrange-crucible/verdict.json`
