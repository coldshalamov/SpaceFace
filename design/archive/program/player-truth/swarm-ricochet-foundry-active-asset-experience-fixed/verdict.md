# Player-truth verdict: INCOMPLETE — swarm-ricochet-foundry-active-asset-experience-fixed

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build f5d845116fc
- Source at start: f5d845116fc · no dirty source paths
- Source at end: f5d845116fc · no dirty source paths
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-16T16:50:53.550Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 407 s wall, 229.3 s of play sim time, 8686 frames sampled, 332 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: run ended (player dead)
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- readability — samples: enemy 24, asteroid 303, projectile 0, pickup 0; capture coherence: 7952 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; opaque body/player coverage UNKNOWN for wreck:wreck: 546 measured/5 unknown (missing-opaque-geometry); station:furnace: 2 measured/0 unknown (insufficient samples); hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes body and backdrop; asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- frame_time — 8133 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 72.2 s | finite quota materialized and resolved, and ≥1 input (src/data/swarmMode.js rules 2–3: the finite cohort must arrive and resolve; no fixed time-to-death target) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/6 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/8133) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.53/s total · 73 real LOD · 47 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0.3/min · worst entity 0 toggles · 1 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | min separation n/a | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **PASS** | p95 2% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps · row-on-select (inferred) | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 29 ms · p99 98 ms · 2 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/2 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **PASS** | round 3 | ≥ round 3 |
| crucible_realm | **PASS** | 0/326 Adventure frames · armory 63 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +226.283 s / 337 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 198 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **readability** (UNKNOWN) — samples: enemy 24, asteroid 303, projectile 0, pickup 0; capture coherence: 7952 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; opaque body/player coverage UNKNOWN for wreck:wreck: 546 measured/5 unknown (missing-opaque-geometry); station:furnace: 2 measured/0 unknown (insufficient samples); hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes body and backdrop; asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — 8133 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - long task 282 ms at sim 74.8 s (frame 4759)
  - long task 276 ms at sim 191.3 s (frame 8602)
  - frame 9073: 189 ms at sim 209.8 s (264 entities, 0 draws)

## Files
- verdict: `design\program\player-truth\swarm-ricochet-foundry-active-asset-experience-fixed\verdict.md`
- contactSheet: `design\program\player-truth\swarm-ricochet-foundry-active-asset-experience-fixed\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-ricochet-foundry-active-asset-experience-fixed\verdict.json`
