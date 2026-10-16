# Player-truth verdict: INCOMPLETE — racing-asset-experience-fixed-asset-experience-fixed

- Mode: racing · seed 2327391364 (requested 4242; field not settable on this route) · build 75c3bf55f45
- Source at start: 75c3bf55f45 · no dirty source paths
- Source at end: 75c3bf55f45 · no dirty source paths
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Opening effect warm: skipped · reason parallel-compile-cook · KHR_parallel_shader_compile yes
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-16T17:01:50.641Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 242 s wall, 180.3 s of play sim time, 5033 frames sampled, 187 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 180 sim s reached
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- readability — not enough on-screen samples per class (enemy 0, asteroid 2, projectile 0, pickup 0; need 5); capture coherence: 782 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; hull contrast UNKNOWN: asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- frame_time — 4903 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/4903) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.08/s total · 6 real LOD · 9 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 1.3/min · worst entity 1 toggle · 4 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 2% / p95 2% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 31 ms · p99 96 ms · 0 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **n/a** | — | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | no active span | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 104 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 2, projectile 0, pickup 0; need 5); capture coherence: 782 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; hull contrast UNKNOWN: asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — 4903 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - frame 3276: 284 ms at sim 100.5 s (210 entities, 0 draws)
  - frame 1936: 267 ms at sim 42.2 s (201 entities, 0 draws)
  - frame 3635: 247 ms at sim 116.5 s (219 entities, 11 draws)

## Files
- verdict: `design\program\player-truth\racing-asset-experience-fixed-asset-experience-fixed\verdict.md`
- contactSheet: `design\program\player-truth\racing-asset-experience-fixed-asset-experience-fixed\contact-sheet.jpg`
- json: `design\program\player-truth\racing-asset-experience-fixed-asset-experience-fixed\verdict.json`
