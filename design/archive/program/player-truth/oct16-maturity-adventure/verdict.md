# Player-truth verdict: INCOMPLETE — adventure

- Mode: adventure · seed 4242 · build 92dfc854fe (dirty)
- Source at start: 92dfc854fe · src/combat/attachments.js, src/combat/damage.js, src/core/sg02DynamicBodyOwner.js, src/data/encounters/index.generated.js, src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/localization/catalogs/en-US.generated.js, src/render/statusAttachedVfx.js, src/systems/cargo.js, src/systems/chronicler.js, src/systems/economyCycles.js, src/systems/hullFracture.js, src/systems/lawSecurity.js, src/ui/customsPrompt.js, src/ui/dockArrival.js, src/ui/screens/pause.js, src/data/encounters/1301-the-runaway-kiln.js, src/systems/runawayKilnRuntime.js
- Source at end: aff0a21342 · src/combat/attachments.js, src/combat/damage.js, src/core/flight/flightTelemetry.js, src/core/sg02DynamicBodyOwner.js, src/data/environmentalMachinery.js, src/data/newGameDefaults.js, src/data/sectorWayOfLife.js, src/localization/catalogs/en-US.generated.js, src/render/statusAttachedVfx.js, src/systems/alienEcology.js, src/systems/barkDirector.js, src/systems/cargo.js, src/systems/collisionConsequences.js, src/systems/economyCycles.js, src/systems/hullFracture.js, src/systems/lawSecurity.js, src/systems/lossLedger.js, src/systems/weapons.js, src/ui/customsPrompt.js, src/ui/hud.js, src/ui/marketNews.js, src/data/routeChart.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-16T03:51:01.107Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 398 s wall, 300.6 s of play sim time, 6356 frames sampled, 286 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 300 sim s reached
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- readability — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 119 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- frame_time — 6236 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/6236) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0/s total · 0 real LOD · 1 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0.2/min · worst entity 1 toggle · 1 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 0% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 3% / p95 4% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 35 ms · p99 170 ms · 1 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **n/a** | — | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | no active span | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 50 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 119 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **frame_time** (UNKNOWN) — 6236 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - long task 277 ms (282 ms less 5 ms harness reader) at sim 159.4 s (frame 5286)
  - frame 5302: 1307 ms at sim 160.3 s (387 entities, 0 draws)
  - frame 7486: 1274 ms at sim 278.5 s (589 entities, 0 draws)

## Files
- verdict: `.devshots\oct16-maturity-adventure-gate\verdict.md`
- contactSheet: `.devshots\oct16-maturity-adventure-gate\contact-sheet.jpg`
- json: `.devshots\oct16-maturity-adventure-gate\verdict.json`
- trace: `.devshots\oct16-maturity-adventure-gate\trace.json.gz`
- frames: `.devshots\oct16-maturity-adventure-gate\frames`
