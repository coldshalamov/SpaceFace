# Player-truth verdict: FAIL — swarm-ricochet-foundry-active-seed4242

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 9e647c306
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T07:24:33.775Z
- Run: 1370 s wall, 11.2 s of play sim time, 764 frames sampled, 17 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: harness/route error: page.evaluate: Target page, context or browser has been closed

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **FAIL** | main menu → mode select → preparation → spawn | every step through public controls |
| round_resolution | **FAIL** | — | ≥20 s and player input |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/381) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.7/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 31.7/min · worst entity 1 toggle | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation 2.1 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 11% screen · player hidden 6% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 4% / p95 5% of screen · threats on bright backdrop p95 25% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 25 ms · p99 4126 ms · 19 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **FAIL** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 1 | ≥ round 3 |

## Worst offenders
- **route** (FAIL) — stalled at route: harness/route error: page.evaluate: Target page, context or browser has been closed
  - route: harness/route error: page.evaluate: Target page, context or browser has been closed
- **round_resolution** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round was won inside the run)
- **popping** (FAIL) — 6 pops inside the inner 80% of the view; 0 non-projectile bodies born on screen (info)
  - entity 366 (asteroid) appeared on screen 1× — first sim 2.3 s
  - entity 367 (asteroid) appeared on screen 1× — first sim 2.3 s
  - entity 368 (asteroid) appeared on screen 1× — first sim 2.3 s
- **readability** (FAIL) — samples: enemy 12, asteroid 115, projectile 0, pickup 0
  - enemy: 67% of samples barely differ from the background (ΔL < 8)
  - station:plate (station, dark, r 37 px) sits over the player ship in 27% of 11 samples — a play-space body that reads as neither enemy nor asteroid
- **vfx_coverage** (FAIL) — 16 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - player ship ≥50% under combat VFX pixels in 6% of splits (first sim 12.1 s)
  - peak combat-VFX pixels 11% of screen at sim 12.1 s (49 combat layers lit)
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 5246 ms at sim 11.3 s (frame 721)
  - long task 4702 ms at sim 2.2 s (frame 409)
  - long task 4593 ms at sim 12.2 s (frame 745)
- **round_transitions** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round after round 1 was reached)
- **rounds_reached** (FAIL) — stopped: harness/route error: page.evaluate: Target page, context or browser has been closed
  - scripted fighter stopped at round 1: harness/route error: page.evaluate: Target page, context or browser has been closed

## Files
- verdict: `design/program/player-truth/swarm-ricochet-foundry-active-seed4242/verdict.md`
- contactSheet: `design/program/player-truth/swarm-ricochet-foundry-active-seed4242/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-ricochet-foundry-active-seed4242/verdict.json`
