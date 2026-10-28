# Player-truth verdict: FAIL — swarm-active

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 345b66551ad (dirty)
- Source at start: 345b66551ad · scripts/lib/livingWorldPlan.mjs, scripts/living-world.mjs
- Source at end: d47080878c2 · no dirty source paths
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Opening effect warm: not run (no receipt) · KHR_parallel_shader_compile yes
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-28T01:24:17.318Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 632 s wall, 26.4 s of play sim time, 777 frames sampled, 45 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: wall-clock cap
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → first-run prompt → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **FAIL** | — | finite quota materialized and resolved, and ≥1 input (src/data/swarmMode.js rules 2–3: the finite cohort must arrive and resolve; no fixed time-to-death target) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/657) | ≤0.5% |
| lod_churn | **UNKNOWN** | max 2/10s per entity · 2.93/s total (no master baseline window over 26.6 sim s) · 32 real LOD · 46 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | asteroid 44% low-contrast (radius-square diagnostic) | separation ≥1; ≤50% low-contrast per measured class |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 6% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps · row-on-select (inferred) | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 279 ms · p99 4606 ms · 335 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **FAIL** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 1 | ≥ round 3 |
| crucible_realm | **PASS** | 0/41 Adventure frames · armory 70 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +26.183 s / 466 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 40 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |
| first_hour_budget | **n/a** | — | latch ≤60s · raid ≤180s |

## Worst offenders
- **round_resolution** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round was won inside the run)
- **lod_churn** (UNKNOWN) — 32 real LOD/model swaps · 46 visible loading-state swaps (awaiting/loading/compiling, still counted) over 26.6 sim s across 72 entities (94 more off screen, not graded); 100 metadata-only transitions with unchanged drawn contents (diagnostic)
  - player ship swapped model/LOD 1× (1 real LOD, 0 loading-state; first sim 5 s: 0beac6e4|GLTFKIT_ship_hornet_fd39bb46|lod0|authored|draw:34:65853e89:7178c8ab → 53c9d5d8|GLTFKIT_ship_hornet_fd39bb46|lod0|authored|draw:36:595cf536:9e7961d4)
  - entity 558 (asteroid) 2 swaps in 10 s (0 real LOD, 2 loading-state) — last PlaceProp_AuthoredAssetBound@lod2/compiling-pipelines → place_rock_crystal_pebble@lod2 at sim 6.6 s
  - entity 595 (enemy) 2 swaps in 10 s (0 real LOD, 2 loading-state) — last DIRECT_AUTHORED_ADMISSION@-/compiling-pipelines → ship_wasp_d28d2286@lod0 at sim 13.6 s
- **readability** (UNKNOWN) — samples: enemy 0, asteroid 36, projectile 0, pickup 0; capture coherence: 1967 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 1 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; not graded (under 5): enemy, projectile; hull contrast UNKNOWN: asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — 657 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - long task 5372 ms (5386 ms less 14 ms harness reader) at sim 25.8 s (frame 3605)
  - long task 4860 ms (4864 ms less 4 ms harness reader) at sim 25.7 s (frame 3603)
  - long task 4857 ms (4864 ms less 7 ms harness reader) at sim 25.4 s (frame 3592)
- **round_transitions** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round after round 1 was reached)
- **rounds_reached** (FAIL) — stopped: wall-clock cap
  - scripted fighter stopped at round 1: wall-clock cap

## Files
- verdict: `scratch\player-truth\swarm-active\verdict.md`
- contactSheet: `scratch\player-truth\swarm-active\contact-sheet.jpg`
- json: `scratch\player-truth\swarm-active\verdict.json`
- trace: `scratch\player-truth\swarm-active\trace.json.gz`
- frames: `scratch\player-truth\swarm-active\frames`
