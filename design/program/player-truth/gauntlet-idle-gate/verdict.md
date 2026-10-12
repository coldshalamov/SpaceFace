# Player-truth verdict: FAIL — gauntlet-idle-gate

- Mode: gauntlet · seed 4242 · build 9741522468
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): slow, frame times not representative
- Browser: headless Chromium 149.0.7827.55 · 960x540 · 2026-10-12T14:37:41.298Z
- Run: 114 s wall, 0 s of play sim time, 1221 frames sampled, 2 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start · gate idle pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: harness/route error: Enter the Gauntlet missed the draft: mode=flight kind=adventure phase=inactive top=none at -1900,-2200 helios_core spawn hud="RADIO TRAGEDY AT HELIOS: RELIEF FREIGHTE"

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **FAIL** | main menu → mode select | every step through public controls |
| round_resolution | **UNKNOWN** | — | ≥20 s and player input |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **UNKNOWN** | — | 0 bodies >8 u/s |
| player_control | **UNKNOWN** | — | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **FAIL** | — | — |
| player_ship | **FAIL** | — | ≤0.5% frames |
| lod_churn | **UNKNOWN** | — | 3 |
| popping | **UNKNOWN** | — | ≤6/min |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **UNKNOWN** | — | p95 ≤0.25 |
| backdrop_coverage | **UNKNOWN** | — | threats over bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | — | — |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **route** (FAIL) — stalled at route: harness/route error: Enter the Gauntlet missed the draft: mode=flight kind=adventure phase=inactive top=none at -1900,-2200 helios_core spawn hud="RADIO TRAGEDY AT HELIOS: RELIEF FREIGHTE"
  - route: harness/route error: Enter the Gauntlet missed the draft: mode=flight kind=adventure phase=inactive top=none at -1900,-2200 helios_core spawn hud="RADIO TRAGEDY AT HELIOS: RELIEF FREIGHTE"
- **round_resolution** (UNKNOWN) — no round started
- **spawn_motion** (UNKNOWN) — no spawn moment recorded
- **player_control** (UNKNOWN) — no control probe ran
- **tumble** (FAIL) — not measured — gate counts UNKNOWN as FAIL (too few play frames)
- **player_ship** (FAIL) — not measured — gate counts UNKNOWN as FAIL (too few play frames)
- **lod_churn** (UNKNOWN) — too few play frames sampled
- **popping** (UNKNOWN) — too few play frames
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5)
- **vfx_coverage** (UNKNOWN) — too few VFX scans
- **backdrop_coverage** (UNKNOWN) — no per-pixel splits sampled
- **frame_time** (UNKNOWN) — too few frames
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `design/program/player-truth/gauntlet-idle-gate/verdict.md`
- contactSheet: `design/program/player-truth/gauntlet-idle-gate/contact-sheet.jpg`
- json: `design/program/player-truth/gauntlet-idle-gate/verdict.json`
