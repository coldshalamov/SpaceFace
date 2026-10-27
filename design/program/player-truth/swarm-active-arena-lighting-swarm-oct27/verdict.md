# Player-truth verdict: FAIL — swarm-active-arena-lighting-swarm-oct27

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build ed2d19b2700 (dirty)
- Source overlay: uncommitted candidate · base ed2d19b27007ec3e05105595d78fd5009feb6b53 · digest ed27e0ac0ecd17b17dd2cebc81b9af429b97349d6b0b8b79ae37c8819436e09d
- Source at start: ed2d19b2700 · scripts/check-bar-canonical-contacts.mjs, scripts/check-overnight-playable.mjs, scripts/fleet-look.mjs, scripts/lib/simReadModel.mjs, src/ai/combatDoctrine.js, src/ai/maneuver.js, src/ai/reflexes.js, src/core/mainToSimEventSurface.js, src/core/sg02DynamicBodyOwner.js, src/data/localPortraits.js, src/data/lookMoods.js, src/data/physicsLog.js, src/data/portraits.js, src/data/survivalDraft.js, src/data/swarmArenaLadder.js, src/data/swarmBroodLate.js, src/localization/catalogs/en-US.generated.js, src/localization/pipeline.js, src/main.js, src/render/forceLanguage/fieldForcePresentation.js, src/render/illustratedSurface.js, src/render/masslineLatchRim.js, src/render/masslinePresentation.js, src/render/masslineReleaseArc.js, src/render/racingCourseView.js, src/render/vfx.js, src/render/vfxColorLightDirector.js, src/render/visualOverrides.js, src/save/saveSystem.js, src/systems/borrowedSun.js, src/systems/bouncer.js, src/systems/encounterDirector.js, src/systems/faction_choir.js, src/systems/faction_frontier.js, src/systems/faction_helix.js, src/systems/faction_pitborn.js, src/systems/faction_vael.js, src/systems/gravedigger.js, src/systems/impoundGrudge.js, src/systems/impoundLot.js, src/systems/lamplighter.js, src/systems/masslineImpactDamage.js, src/systems/missionObjectiveOps.js, src/systems/missions.js, src/systems/mobile/instrument.js, src/systems/mobile/styles.js, src/systems/mobile/view.js, src/systems/moralMemory.js, src/systems/pirateDisguise.js, src/systems/rookBooth.js, src/systems/swarmBrood.js, src/systems/tallyho.js, src/ui/screens/crucibleDraft.js, src/ui/screens/help.js, src/ui/shipLedgerPanel.js, src/ui/station/screens/ledger.js, src/ui/uiRoot.js, src/data/bloomLadder.js
- Source at end: ebaea2ad5c1 · scripts/check-bar-canonical-contacts.mjs, scripts/check-overnight-playable.mjs, scripts/fleet-look.mjs, scripts/lib/simReadModel.mjs, src/ai/combatDoctrine.js, src/ai/maneuver.js, src/ai/reflexes.js, src/core/mainToSimEventSurface.js, src/core/sg02DynamicBodyOwner.js, src/data/localPortraits.js, src/data/lookMoods.js, src/data/physicsLog.js, src/data/portraits.js, src/data/survivalDraft.js, src/data/swarmArenaLadder.js, src/localization/catalogs/en-US.generated.js, src/localization/pipeline.js, src/main.js, src/render/forceLanguage/fieldForcePresentation.js, src/render/illustratedSurface.js, src/render/masslineLatchRim.js, src/render/masslinePresentation.js, src/render/masslineReleaseArc.js, src/render/racingCourseView.js, src/render/vfx.js, src/render/vfxColorLightDirector.js, src/render/visualOverrides.js, src/save/saveSystem.js, src/systems/borrowedSun.js, src/systems/bouncer.js, src/systems/encounterDirector.js, src/systems/faction_choir.js, src/systems/faction_frontier.js, src/systems/faction_helix.js, src/systems/faction_pitborn.js, src/systems/faction_vael.js, src/systems/gravedigger.js, src/systems/impoundGrudge.js, src/systems/impoundLot.js, src/systems/lamplighter.js, src/systems/masslineImpactDamage.js, src/systems/missionObjectiveOps.js, src/systems/missions.js, src/systems/mobile/instrument.js, src/systems/mobile/styles.js, src/systems/mobile/view.js, src/systems/moralMemory.js, src/systems/pirateDisguise.js, src/systems/rookBooth.js, src/systems/tallyho.js, src/ui/screens/crucibleDraft.js, src/ui/screens/help.js, src/ui/shipLedgerPanel.js, src/ui/station/screens/ledger.js, src/ui/uiRoot.js, src/data/bloomLadder.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Opening effect warm: not run (no receipt) · KHR_parallel_shader_compile yes
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-27T11:26:57.329Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 840 s wall, 300.5 s of play sim time, 5935 frames sampled, 322 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 300 sim s reached
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → first-run prompt → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **PASS** | shortest 197.9 s | finite quota materialized and resolved, and ≥1 input (src/data/swarmMode.js rules 2–3: the finite cohort must arrive and resolve; no fixed time-to-death target) |
| kills_before_input | **PASS** | 0 kills | 0 |
| reward_before_input | **PASS** | +0 score | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/4 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/5699) | ≤0.5% |
| lod_churn | **PASS** | max 2/10s per entity · 0.6/s total · 85 real LOD · 95 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | asteroid 57% low-contrast (radius-square diagnostic) | separation ≥1; ≤50% low-contrast per measured class |
| vfx_coverage | **PASS** | p95 1% screen · player hidden 0% · threats hidden p95 14% · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 1% / p95 1% of screen · threats on bright backdrop p95 0% | threats on bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps · row-on-select (inferred) | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | p50 95 ms · p99 208 ms · 8 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **PASS** | 0/1 round starts broken | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 2 | ≥ round 3 |
| crucible_realm | **PASS** | 0/318 Adventure frames · armory 70 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | +300.283 s / 651 s wall | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 399 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |
| first_hour_budget | **n/a** | — | latch ≤60s · raid ≤180s |

## Worst offenders
- **readability** (UNKNOWN) — samples: enemy 0, asteroid 216, projectile 0, pickup 0; capture coherence: 4007 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic; not graded (under 5): enemy, projectile; hull contrast UNKNOWN: asteroid: missing asteroid silhouette pixel ownership; inner radius square mixes body and backdrop; radius-square contrast and affected class separation remain diagnostic
- **frame_time** (UNKNOWN) — 5699 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - long task 747 ms (805 ms less 58 ms harness reader) at sim 199.7 s (frame 7072)
  - long task 373 ms (379 ms less 6 ms harness reader) at sim 27.6 s (frame 3743)
  - long task 285 ms (288 ms less 3 ms harness reader) at sim 83.8 s (frame 5004)
- **rounds_reached** (FAIL) — stopped: duration 300 sim s reached
  - scripted fighter stopped at round 2: duration 300 sim s reached

## Files
- verdict: `design\program\player-truth\swarm-active-arena-lighting-swarm-oct27\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-arena-lighting-swarm-oct27\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-arena-lighting-swarm-oct27\verdict.json`
