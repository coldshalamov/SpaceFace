# Player-truth verdict: FAIL — swarm-idle

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build 49a9e420b
- Source at start: 49a9e420b · no dirty source paths
- Source at end: 49a9e420b · no dirty source paths
- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) — SOFTWARE GL (SwiftShader): absolute frame times are software-renderer evidence, graded only against --baseline
- Opening effect warm: not run (no receipt) · KHR_parallel_shader_compile no · software GPU
- Browser: headless Chromium 141.0.7390.37 · 960x540 · 2026-10-28T13:34:31.628Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 3000 ms, included in measured wall time
- Run: 369 s wall, 0 s of play sim time, 126 frames sampled, 4 screenshots · player script: idle 40 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate idle pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: wall-clock cap
- Host pressure: dmesg unavailable: Command failed: dmesg -T

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → first-run prompt → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **UNKNOWN** | — | finite quota materialized and resolved, and ≥1 input (src/data/swarmMode.js rules 2–3: the finite cohort must arrive and resolve; no fixed time-to-death target) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **UNKNOWN** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **UNKNOWN** | — | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **FAIL** | — | — |
| player_ship | **FAIL** | — | ≤0.5% frames |
| lod_churn | **UNKNOWN** | — | 3 |
| popping | **UNKNOWN** | — | ≤6/min |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **UNKNOWN** | — | p95 ≤0.25 |
| backdrop_coverage | **UNKNOWN** | — | threats over bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | — | — |
| round_transitions | **UNKNOWN** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **UNKNOWN** | 0/0 Adventure frames · armory 70 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +0 s / 0 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **UNKNOWN** | — | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |
| first_hour_budget | **n/a** | — | latch ≤60s · raid ≤180s |

## Worst offenders
- **round_resolution** (UNKNOWN) — no round was won inside the run
- **reward_before_input** (UNKNOWN) — no run score sampled before the first input
- **player_control** (UNKNOWN) — no control probe ran
- **tumble** (FAIL) — not measured — gate counts UNKNOWN as FAIL (too few play frames)
- **player_ship** (FAIL) — not measured — gate counts UNKNOWN as FAIL (too few play frames)
- **lod_churn** (UNKNOWN) — too few play frames sampled
- **popping** (UNKNOWN) — too few play frames
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 0 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **vfx_coverage** (UNKNOWN) — too few VFX scans · skipped 4
- **backdrop_coverage** (UNKNOWN) — no per-pixel splits sampled · skipped 4
- **frame_time** (UNKNOWN) — too few frames
- **round_transitions** (UNKNOWN) — no round after round 1 was reached
- **crucible_realm** (UNKNOWN) — sectors seen: n/a
- **offscreen_marker** (UNKNOWN) — edge markers were not read

## Files
- verdict: `.devshots/coherent-flight-final/swarm/swarm-idle/verdict.md`
- contactSheet: `.devshots/coherent-flight-final/swarm/swarm-idle/contact-sheet.jpg`
- json: `.devshots/coherent-flight-final/swarm/swarm-idle/verdict.json`
- trace: `.devshots/coherent-flight-final/swarm/swarm-idle/trace.json.gz`
- frames: `.devshots/coherent-flight-final/swarm/swarm-idle/frames`
