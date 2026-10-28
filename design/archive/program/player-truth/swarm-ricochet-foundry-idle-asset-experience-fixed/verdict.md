# Player-truth verdict: INCOMPLETE — swarm-ricochet-foundry-idle-asset-experience-fixed

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build f5d845116fc
- Source at start: f5d845116fc · no dirty source paths
- Source at end: f5d845116fc · no dirty source paths
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-16T16:44:02.098Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 124 s wall, 45.5 s of play sim time, 2093 frames sampled, 49 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate idle pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 45 sim s reached
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- round_resolution — no round was won inside the run
- readability — samples: enemy 1, asteroid 132, projectile 0, pickup 0; capture coherence: 333 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; not graded (under 5): enemy, projectile; hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes body and backdrop; asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- frame_time — 1946 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
- round_transitions — no round after round 1 was reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | finite quota materialized and resolved, and ≥1 input (src/data/swarmMode.js rules 2–3: the finite cohort must arrive and resolve; no fixed time-to-death target) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/1946) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.02/s total · 0 real LOD · 1 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | asteroid 32% low-contrast (radius-square diagnostic) | separation ≥1; ≤50% low-contrast per measured class |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 2% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps · row-on-select (inferred) | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 18 ms · p99 57 ms · 0 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **PASS** | 0/45 Adventure frames · armory 63 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +45.3 s / 45 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 13 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **readability** (UNKNOWN) — samples: enemy 1, asteroid 132, projectile 0, pickup 0; capture coherence: 333 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; not graded (under 5): enemy, projectile; hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes body and backdrop; asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — 1946 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - frame 2702: 72 ms at sim 29.6 s (134 entities, 0 draws)
  - frame 2298: 71 ms at sim 19 s (132 entities, 0 draws)
  - frame 3059: 69 ms at sim 38.6 s (134 entities, 0 draws)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached

## Files
- verdict: `design\program\player-truth\swarm-ricochet-foundry-idle-asset-experience-fixed\verdict.md`
- contactSheet: `design\program\player-truth\swarm-ricochet-foundry-idle-asset-experience-fixed\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-ricochet-foundry-idle-asset-experience-fixed\verdict.json`
