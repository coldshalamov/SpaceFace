# Player-truth verdict: INCOMPLETE — adventure

- Mode: adventure · seed 4242 · build 74b88892c
- Source at start: 74b88892c · no dirty source paths
- Source at end: 74b88892c · no dirty source paths
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): absolute frame times are software-renderer evidence, graded only against --baseline
- Opening effect warm: ran · reason shell-released · KHR_parallel_shader_compile no · software GPU · 1 touched, 3 timed out, 6 skipped, 0 failed, 31 sweeps
- Browser: headless Chromium 141.0.7390.37 · 960x540 · 2026-10-28T14:37:39.531Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 3000 ms, included in measured wall time
- Run: 365 s wall, 8.1 s of play sim time, 319 frames sampled, 17 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: wall-clock cap
- Host pressure: dmesg unavailable: Command failed: dmesg -T

Incomplete because:
- readability — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 16 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- frame_time — software-renderer evidence only; no --baseline to grade regression · harness reader excluded: 10 long tasks (total 13094 ms, max 4841 ms), 3 trimmed · 237 reader windows (total 14406 ms, max 4723 ms) · 237 frame dts reduced
- offscreen_marker — edge markers were not read
- Harness overhead (reader tasks excluded from frame_time): harness reader excluded: 10 long tasks (total 13094 ms, max 4841 ms), 3 trimmed · 237 reader windows (total 14406 ms, max 4723 ms) · 237 frame dts reduced · harness-inclusive p99 4826 ms, 16 long tasks

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → first-run prompt → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/237) | ≤0.5% |
| lod_churn | **PASS** | max 0/10s per entity · 0/s total · 0 real LOD · 0 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 0% · threats hidden p95 n/a · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 n/a | threats on bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | software-renderer evidence · p50 146 ms · p99 2343 ms · 6 long tasks ≥250 ms | no regression vs --baseline (p99 ≤125% and ≤+100 ms · long tasks ≤125% and ≤+30) |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **n/a** | — | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | no active span | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **UNKNOWN** | — | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |
| first_hour_budget | **n/a** | — | latch ≤60s · raid ≤180s |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 16 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **frame_time** (UNKNOWN) — software-renderer evidence only; no --baseline to grade regression · harness reader excluded: 10 long tasks (total 13094 ms, max 4841 ms), 3 trimmed · 237 reader windows (total 14406 ms, max 4723 ms) · 237 frame dts reduced
  - long task 2651 ms at sim 0 s (frame 84)
  - long task 1315 ms at sim 0 s (frame 87)
  - long task 1021 ms (1023 ms less 2 ms harness reader) at sim 0 s (frame 86)
- **offscreen_marker** (UNKNOWN) — edge markers were not read

## Files
- verdict: `.devshots/coherent-flight-74b88892/adventure/verdict.md`
- contactSheet: `.devshots/coherent-flight-74b88892/adventure/contact-sheet.jpg`
- json: `.devshots/coherent-flight-74b88892/adventure/verdict.json`
- trace: `.devshots/coherent-flight-74b88892/adventure/trace.json.gz`
- frames: `.devshots/coherent-flight-74b88892/adventure/frames`
