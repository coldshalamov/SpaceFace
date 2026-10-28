# Player-truth verdict: FAIL — swarm-ricochet-foundry-active-master

- Mode: swarm · arena Ricochet Foundry · seed 73311 (requested 4242; field not settable on this route) · build 5e1f24156
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T06:22:16.367Z
- Run: 1616 s wall, 25.6 s of play sim time, 1247 frames sampled, 37 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
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
| player_ship | **FAIL** | 0.6% frames bad (5/827) | ≤0.5% |
| lod_churn | **PASS** | max 3/10s per entity · 0.62/s total | ≤3/10s per entity · ≤1/s total |
| popping | **FAIL** | 30.3/min · worst entity 1 toggle | ≤6/min · ≤2 toggles |
| readability | **PASS** | min separation 3.24 | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **FAIL** | p95 6% screen · player hidden 3% · threats hidden p95 100% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 5% / p95 6% of screen · threats on bright backdrop p95 20% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 33 ms · p99 3778 ms · 38 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **FAIL** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 1 | ≥ round 3 |

## Worst offenders
- **route** (FAIL) — stalled at route: harness/route error: page.evaluate: Target page, context or browser has been closed
  - route: harness/route error: page.evaluate: Target page, context or browser has been closed
- **round_resolution** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round was won inside the run)
- **player_ship** (FAIL) — missing / hidden / off-frame / non-lod0 / placeholder (<300 tris) while alive in play
  - resolving marker: 5 frames, first at sim 1.5 s
  - asset compiling-pipelines: 5 frames, first at sim 1.5 s
- **popping** (FAIL) — 13 pops inside the inner 80% of the view; 0 non-projectile bodies born on screen (info)
  - entity 110 (enemy) appeared on screen 1× — first sim 1.6 s
  - entity 400 (asteroid) appeared on screen 1× — first sim 1.8 s
  - entity 392 (asteroid) removed without death on screen 1× — first sim 19.4 s
- **vfx_coverage** (FAIL) — 34 per-pixel splits (offscreen render with combat VFX hidden vs shown, pre-bloom 160×90; backdrop layers graded separately)
  - player ship ≥50% under combat VFX pixels in 3% of splits (first sim 13.5 s)
  - peak combat-VFX pixels 8% of screen at sim 20.1 s (39 combat layers lit)
- **frame_time** (UNKNOWN) — software GL (SwiftShader): frame time is not the player's — rerun headed on a GPU to grade
  - long task 14224 ms at sim 10.6 s (frame 747)
  - long task 5399 ms at sim 1.9 s (frame 433)
  - long task 4748 ms at sim 11.5 s (frame 768)
- **round_transitions** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round after round 1 was reached)
- **rounds_reached** (FAIL) — stopped: harness/route error: page.evaluate: Target page, context or browser has been closed
  - scripted fighter stopped at round 1: harness/route error: page.evaluate: Target page, context or browser has been closed

## Files
- verdict: `design/program/player-truth/swarm-ricochet-foundry-active-master/verdict.md`
- contactSheet: `design/program/player-truth/swarm-ricochet-foundry-active-master/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-ricochet-foundry-active-master/verdict.json`
