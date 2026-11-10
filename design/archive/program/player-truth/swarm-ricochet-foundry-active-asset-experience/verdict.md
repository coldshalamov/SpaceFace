# Player-truth verdict: FAIL — swarm-ricochet-foundry-active-asset-experience

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build eec43ded890 (dirty)
- Source at start: eec43ded890 · index.html, src/data/encounters/set-piece-authored.js, src/story/campaign47a/embodiedMissions.js, src/systems/missions.js, scripts/asset-stocktake.mjs
- Source at end: caa47fc5eed · no dirty source paths
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-16T16:04:41.662Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 609 s wall, 230.6 s of play sim time, 10657 frames sampled, 476 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: wall-clock cap
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 65.9 s | finite quota materialized and resolved, and ≥1 input (src/data/swarmMode.js rules 2–3: the finite cohort must arrive and resolve; no fixed time-to-death target) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/6 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/10304) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.73/s total · 106 real LOD · 63 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 1/min · worst entity 0 toggles · 4 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **FAIL** | min separation n/a | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps · row-on-select (inferred) | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 37 ms · p99 123 ms · 2 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/2 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **PASS** | round 3 | ≥ round 3 |
| crucible_realm | **PASS** | 0/472 Adventure frames · armory 63 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +230.55 s / 533 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 319 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **readability** (FAIL) — samples: enemy 24, asteroid 531, projectile 0, pickup 0; capture coherence: 6841 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; opaque body/player coverage UNKNOWN for wreck:: 498 measured/5 unknown (missing-opaque-geometry); wreck:wreck: 627 measured/5 unknown (missing-opaque-geometry); hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes body and backdrop; asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
  - station:furnace (station, orange, r 64 px) sits over the player ship in 50% of 8 native opaque-mask samples — actual body pixels cover the ship
- **frame_time** (UNKNOWN) — 10304 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - long task 514 ms at sim 68.3 s (frame 3926)
  - long task 491 ms at sim 147.6 s (frame 6558)
  - frame 1943: 799 ms at sim 17.6 s (159 entities, 0 draws)

## Files
- verdict: `design\program\player-truth\swarm-ricochet-foundry-active-asset-experience\verdict.md`
- contactSheet: `design\program\player-truth\swarm-ricochet-foundry-active-asset-experience\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-ricochet-foundry-active-asset-experience\verdict.json`
