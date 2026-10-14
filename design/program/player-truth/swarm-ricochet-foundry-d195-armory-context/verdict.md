# Player-truth verdict: FAIL — swarm-ricochet-foundry-d195-armory-context

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 20d15cc87 (dirty)
- Source at start: 20d15cc87 · scripts/player-truth/routes.mjs, scripts/player-truth/run.mjs, src/ui/orrery/crucibleArmory.js, src/ui/orrery/pipSpannerCrew.js, src/ui/screens/crucibleDraft.js, src/ui/shipPreviewMount.js
- Source at end: 20d15cc87 · scripts/player-truth/routes.mjs, scripts/player-truth/run.mjs, src/ui/orrery/crucibleArmory.js, src/ui/orrery/pipSpannerCrew.js, src/ui/screens/crucibleDraft.js, src/ui/shipPreviewMount.js
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): absolute frame times are software-renderer evidence, graded only against --baseline
- Browser: headless Chromium 141.0.7390.37 · 960x540 · 2026-10-14T04:28:26.089Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 3000 ms, included in measured wall time
- Run: 704 s wall, 20.4 s of play sim time, 703 frames sampled, 78 screenshots · player script: idle 2 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 20 sim s reached

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | finite quota materialized and resolved, and ≥1 input (src/data/swarmMode.js rules 2–3: the finite cohort must arrive and resolve; no fixed time-to-death target) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/558) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.92/s total · 4 real LOD · 15 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 5.8/min · worst entity 1 toggle · 2 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | min separation n/a | ≥1 per class pair; ≤50% low-contrast |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 2% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | software-renderer evidence · p50 392 ms · p99 6840 ms · 30 long tasks ≥250 ms | no regression vs --baseline (p99 ≤125% and ≤+100 ms · long tasks ≤125% and ≤+30) |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **PASS** | 0/74 Adventure frames · armory 63 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +20.417 s / 427 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **FAIL** | edge marker has no living shooter | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **readability** (UNKNOWN) — samples: enemy 39, asteroid 304, projectile 0, pickup 0; capture coherence: 2345 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; opaque body/player coverage UNKNOWN for wreck:wreck: 0 measured/163 unknown (unsupported-player-silhouette); wreck:: 0 measured/22 unknown (unsupported-player-silhouette); station:plate: 0 measured/9 unknown (unsupported-player-silhouette); hull contrast UNKNOWN: enemy: missing enemy silhouette pixel ownership; inner radius square mixes hull and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — software-renderer evidence only; no --baseline to grade regression
  - long task 10546 ms at sim 11.2 s (frame 600)
  - long task 8959 ms at sim 13.6 s (frame 672)
  - long task 7150 ms at sim 10.4 s (frame 577)
- **round_transitions** (UNKNOWN) — no round after round 1 was reached
- **offscreen_marker** (FAIL) — 2 edge-marker misses
  - edge marker has no living shooter
  - edge marker has no living shooter

## Files
- verdict: `design/program/player-truth/swarm-ricochet-foundry-d195-armory-context/verdict.md`
- contactSheet: `design/program/player-truth/swarm-ricochet-foundry-d195-armory-context/contact-sheet.jpg`
- json: `design/program/player-truth/swarm-ricochet-foundry-d195-armory-context/verdict.json`
