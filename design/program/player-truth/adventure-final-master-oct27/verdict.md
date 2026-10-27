# Player-truth verdict: FAIL — adventure

- Mode: adventure · seed 4242 · build 3aec2546fca
- Source at start: 3aec2546fca · no dirty source paths
- Source at end: 3aec2546fca · no dirty source paths
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Opening effect warm: skipped · reason parallel-compile-cook · KHR_parallel_shader_compile no
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-27T22:30:28.424Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 605 s wall, 171.8 s of play sim time, 20464 frames sampled, 447 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: wall-clock cap
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → first-run prompt → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **FAIL** | 79.4% frames bad (16163/20344) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.05/s total · 3 real LOD · 6 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 0% / p95 2% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 16 ms · p99 117 ms · 8 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **n/a** | — | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | no active span | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 61 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |
| first_hour_budget | **n/a** | — | latch ≤60s · raid ≤180s |

## Worst offenders
- **player_ship** (FAIL) — missing / hidden / off-frame / non-lod0 / placeholder (<300 tris) while alive in play
  - no mesh: 16163 frames, first at sim 171.8 s
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 104 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **frame_time** (UNKNOWN) — 20344 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - long task 7227 ms (7355 ms less 128 ms harness reader) at sim 111.3 s (frame 3913)
  - long task 1760 ms at sim 169.9 s (frame 5064)
  - long task 606 ms (607 ms less 1 ms harness reader) at sim 136.3 s (frame 4442)

## Files
- verdict: `scratch\player-truth\adventure\verdict.md`
- contactSheet: `scratch\player-truth\adventure\contact-sheet.jpg`
- json: `scratch\player-truth\adventure\verdict.json`
- trace: `scratch\player-truth\adventure\trace.json.gz`
- frames: `scratch\player-truth\adventure\frames`
