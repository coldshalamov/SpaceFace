# Player-truth verdict: FAIL — adventure-pr-maturation-pr-maturation

- Mode: adventure · seed 4242 · build bef0a2a43 (dirty)
- Source at start: bef0a2a43 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Source at end: bef0a2a43 · scripts/check-tether-gameplay.mjs, src/core/flight/orbitAssist.js, src/systems/onboarding.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-12T17:29:51.231Z
- Run: 450 s wall, 300.7 s of play sim time, 7829 frames sampled, 325 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)
- Stopped: duration 300 sim s reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **FAIL** | 0/2 probes dead · 1 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/6337) | ≤0.5% |
| lod_churn | **PASS** | max 3/10s per entity · 0.08/s total · 6 real LOD · 17 loading | ≤3/10s per entity · ≤1/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 n/a · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 11% / p95 15% of screen · threats on bright backdrop p95 n/a | threats on bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **FAIL** | p50 53 ms · p99 152 ms · 1 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |

## Worst offenders
- **player_control** (FAIL) — spawn thrust 13.07 · spawn yaw -3.1
  - pinned 28.6–30.6 s: velocity says 238 u of travel, ship moved 23 u — ship sits 30 u from fx #97
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 10, projectile 0, pickup 0; need 5)
- **frame_time** (FAIL) — 6337 play frames
  - long task 338 ms at sim 164.2 s (frame 5169)
  - frame 1520: 2443 ms at sim 1.4 s (157 entities, 0 draws)
  - frame 1790: 517 ms at sim 13.2 s (165 entities, 0 draws)

## Files
- verdict: `design\program\player-truth\adventure-pr-maturation-pr-maturation\verdict.md`
- contactSheet: `design\program\player-truth\adventure-pr-maturation-pr-maturation\contact-sheet.jpg`
- json: `design\program\player-truth\adventure-pr-maturation-pr-maturation\verdict.json`
