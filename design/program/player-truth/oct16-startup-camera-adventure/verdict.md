# Player-truth verdict: INCOMPLETE — adventure

- Mode: adventure · seed 4242 · build 9c0d104448 (dirty)
- Source at start: 9c0d104448 · src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/localization/catalogs/en-US.generated.js, src/render/packageCpuDetach.js, src/render/renderPackageLoader.js
- Source at end: 05f69030cd · src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/localization/catalogs/en-US.generated.js, src/render/packageCpuDetach.js, src/render/renderPackageLoader.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-16T10:03:29.601Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 387 s wall, 300.7 s of play sim time, 14113 frames sampled, 305 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 300 sim s reached
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- readability — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 64 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- frame_time — 13993 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/13993) | ≤0.5% |
| lod_churn | **PASS** | max 0/10s per entity · 0/s total · 0 real LOD · 0 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 n/a · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 3% / p95 8% of screen · threats on bright backdrop p95 n/a | threats on bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 16 ms · p99 63 ms · 0 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **n/a** | — | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | no active span | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 4 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 64 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **frame_time** (UNKNOWN) — 13993 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - frame 1627: 246 ms at sim 0.1 s (149 entities, 0 draws)
  - frame 1616: 205 ms at sim 0 s (138 entities, 0 draws)
  - frame 2163: 137 ms at sim 22.6 s (173 entities, 0 draws)

## Files
- verdict: `.devshots\player-truth\oct16-startup-camera-adventure\verdict.md`
- contactSheet: `.devshots\player-truth\oct16-startup-camera-adventure\contact-sheet.jpg`
- json: `.devshots\player-truth\oct16-startup-camera-adventure\verdict.json`
- trace: `.devshots\player-truth\oct16-startup-camera-adventure\trace.json.gz`
- frames: `.devshots\player-truth\oct16-startup-camera-adventure\frames`
