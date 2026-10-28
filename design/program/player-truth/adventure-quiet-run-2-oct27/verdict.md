# Player-truth verdict: INCOMPLETE — adventure

- Mode: adventure · seed 4242 · build 5a66f5e8873
- Source at start: 5a66f5e8873 · no dirty source paths
- Source at end: 5a4f3a51427 · no dirty source paths
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Opening effect warm: skipped · reason parallel-compile-cook · KHR_parallel_shader_compile yes
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-28T01:09:14.955Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 567 s wall, 300.7 s of play sim time, 6336 frames sampled, 316 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 300 sim s reached
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- readability — not enough on-screen samples per class (enemy 0, asteroid 3, projectile 0, pickup 0; need 5); capture coherence: 136 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 1 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; hull contrast UNKNOWN: asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- frame_time — 6216 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
- offscreen_marker — edge markers were not read

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → first-run prompt → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/6216) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.03/s total · 10 real LOD · 0 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0.4/min · worst entity 1 toggle · 2 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 n/a · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 0% / p95 2% of screen · threats on bright backdrop p95 n/a | threats on bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 64 ms · p99 183 ms · 22 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **n/a** | — | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | no active span | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **UNKNOWN** | — | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |
| first_hour_budget | **n/a** | — | latch ≤60s · raid ≤180s |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 3, projectile 0, pickup 0; need 5); capture coherence: 136 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 1 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; hull contrast UNKNOWN: asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — 6216 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - long task 524 ms (531 ms less 7 ms harness reader) at sim 300.1 s (frame 7206)
  - long task 499 ms (500 ms less 1 ms harness reader) at sim 0 s (frame 1158)
  - long task 454 ms (456 ms less 2 ms harness reader) at sim 300.1 s (frame 7204)
- **offscreen_marker** (UNKNOWN) — edge markers were not read

## Files
- verdict: `scratch\player-truth\adventure\verdict.md`
- contactSheet: `scratch\player-truth\adventure\contact-sheet.jpg`
- json: `scratch\player-truth\adventure\verdict.json`
- trace: `scratch\player-truth\adventure\trace.json.gz`
- frames: `scratch\player-truth\adventure\frames`
