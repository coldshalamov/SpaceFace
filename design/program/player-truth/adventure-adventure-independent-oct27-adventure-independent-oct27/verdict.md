# Player-truth verdict: INCOMPLETE — adventure-adventure-independent-oct27-adventure-independent-oct27

- Mode: adventure · seed 4242 · build 602236b6bd7 (dirty)
- Source overlay: uncommitted candidate · base 602236b6bd747aaaa73226b6e7f4368d1d4b3a2c · digest 53e4f3291fb05c9e425af7878d177cfcb71bef0b847ff94aa3b985b8f19a0361
- Source at start: 602236b6bd7 · scripts/check-bar-canonical-contacts.mjs, scripts/check-overnight-playable.mjs, scripts/fleet-look.mjs, scripts/lib/simReadModel.mjs, src/ai/combatDoctrine.js, src/ai/maneuver.js, src/ai/reflexes.js, src/core/mainToSimEventSurface.js, src/core/sg02DynamicBodyOwner.js, src/data/gravedigger.js, src/data/localPortraits.js, src/data/lookMoods.js, src/data/physicsLog.js, src/data/portraits.js, src/data/survivalDraft.js, src/data/swarmArenaLadder.js, src/localization/catalogs/en-US.generated.js, src/localization/pipeline.js, src/main.js, src/render/forceLanguage/fieldForcePresentation.js, src/render/illustratedSurface.js, src/render/masslineLatchRim.js, src/render/masslinePresentation.js, src/render/masslineReleaseArc.js, src/render/racingCourseView.js, src/render/vfx.js, src/render/vfxColorLightDirector.js, src/render/visualOverrides.js, src/save/saveSystem.js, src/systems/borrowedSun.js, src/systems/bouncer.js, src/systems/encounterDirector.js, src/systems/faction_archive.js, src/systems/faction_choir.js, src/systems/faction_frontier.js, src/systems/faction_helix.js, src/systems/faction_meridian.js, src/systems/faction_pitborn.js, src/systems/faction_vael.js, src/systems/gravedigger.js, src/systems/impoundGrudge.js, src/systems/impoundLot.js, src/systems/lamplighter.js, src/systems/masslineImpactDamage.js, src/systems/missionObjectiveOps.js, src/systems/missions.js, src/systems/mobile/instrument.js, src/systems/mobile/styles.js, src/systems/mobile/view.js, src/systems/moralMemory.js, src/systems/pirateDisguise.js, src/systems/rookBooth.js, src/systems/tallyho.js, src/systems/world.js, src/ui/screens/crucibleDraft.js, src/ui/screens/help.js, src/ui/shipLedgerPanel.js, src/ui/station/screens/ledger.js, src/ui/uiRoot.js, src/data/bloomLadder.js
- Source at end: 3be995b97c8 · scripts/check-bar-canonical-contacts.mjs, scripts/check-overnight-playable.mjs, scripts/fleet-look.mjs, scripts/lib/simReadModel.mjs, src/ai/combatDoctrine.js, src/ai/maneuver.js, src/ai/reflexes.js, src/core/mainToSimEventSurface.js, src/core/sg02DynamicBodyOwner.js, src/data/gravedigger.js, src/data/localPortraits.js, src/data/lookMoods.js, src/data/physicsLog.js, src/data/portraits.js, src/data/survivalDraft.js, src/data/swarmArenaLadder.js, src/data/swarmDraft.js, src/data/swarmMode.js, src/localization/catalogs/en-US.generated.js, src/localization/pipeline.js, src/main.js, src/render/forceLanguage/fieldForcePresentation.js, src/render/illustratedSurface.js, src/render/masslineLatchRim.js, src/render/masslinePresentation.js, src/render/masslineReleaseArc.js, src/render/racingCourseView.js, src/render/vfx.js, src/render/vfxColorLightDirector.js, src/render/visualOverrides.js, src/save/saveSystem.js, src/systems/borrowedSun.js, src/systems/bouncer.js, src/systems/encounterDirector.js, src/systems/faction_archive.js, src/systems/faction_choir.js, src/systems/faction_frontier.js, src/systems/faction_helix.js, src/systems/faction_meridian.js, src/systems/faction_pitborn.js, src/systems/faction_vael.js, src/systems/gravedigger.js, src/systems/impoundGrudge.js, src/systems/impoundLot.js, src/systems/lamplighter.js, src/systems/masslineImpactDamage.js, src/systems/missions.js, src/systems/mobile/instrument.js, src/systems/mobile/styles.js, src/systems/mobile/view.js, src/systems/pirateDisguise.js, src/systems/survivalAnnounce.js, src/systems/swarmElites.js, src/systems/swarmHangar.js, src/systems/tallyho.js, src/systems/world.js, src/ui/screens/crucibleDraft.js, src/ui/screens/help.js, src/ui/shipLedgerPanel.js, src/ui/station/screens/ledger.js, src/ui/uiRoot.js, src/data/bloomLadder.js, src/data/special500/entries-anomaly-a.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Opening effect warm: skipped · reason parallel-compile-cook · KHR_parallel_shader_compile yes
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-27T12:01:37.855Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 608 s wall, 151.7 s of play sim time, 3556 frames sampled, 169 screenshots · player script: idle 6 s → thrust/yaw probes → cruise: thrust bursts and turns · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: duration 150 sim s reached
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

Incomplete because:
- readability — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 76 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- frame_time — 3436 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **PASS** | main menu → first-run prompt → mode select → preparation → spawn → play | every step through public controls |
| round_resolution | **n/a** | — | — |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **PASS** | 0 bodies | 0 passive bodies >8 u/s within 900 u |
| player_control | **PASS** | 0/2 probes dead · 0 pinned spans | thrust Δv≥3 u/s and moves ≥25% of its velocity · yaw Δ≥0.2 rad |
| tumble | **PASS** | longest 0 s | <0.5 s out of plane / uncommanded spin |
| player_ship | **PASS** | 0% frames bad (0/3436) | ≤0.5% |
| lod_churn | **PASS** | max 1/10s per entity · 0.02/s total · 3 real LOD · 0 loading | ≤3/10s per entity · ≤max(1, 1.5× master same-window)/s total |
| popping | **PASS** | 0/min · worst entity 0 toggles · 0 visibility · 0 loading | ≤6/min · ≤2 toggles |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **PASS** | p95 0% screen · player hidden 0% · threats hidden p95 n/a · 0 s persist | ≤25% · ≤10% · ≤30% · ≤3 s |
| backdrop_coverage | **PASS** | backdrop lights median 0% / p95 2% of screen · threats on bright backdrop p95 n/a | threats on bright backdrop p95 ≤30% |
| loadout | **n/a** | — | 0 irrelevant · 0 undescribed · 0 silent swaps |
| frame_time | **UNKNOWN** | p50 112 ms · p99 200 ms · 3 long tasks ≥250 ms | p99 ≤50 ms · 0 long tasks ≥250 ms |
| round_transitions | **n/a** | — | — |
| rounds_reached | **n/a** | — | — |
| crucible_realm | **n/a** | — | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **PASS** | no active span | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **PASS** | HUD held | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **PASS** | 12 samples with an off-screen hostile and an edge marker | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |
| first_hour_budget | **n/a** | — | latch ≤60s · raid ≤180s |

## Worst offenders
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 76 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **frame_time** (UNKNOWN) — 3436 play frames · unmarked/contended development host: diagnostic wall-clock only; quiet-host performance unmeasured (QUIET_HOST_PROGRAM §0). Reader windows (pixel readbacks) are excluded when the trace records them; screenshots remain included.
  - long task 1153 ms (1157 ms less 4 ms harness reader) at sim 0.1 s (frame 1482)
  - long task 350 ms (351 ms less 1 ms harness reader) at sim 100.3 s (frame 3737)
  - long task 275 ms (278 ms less 3 ms harness reader) at sim 0.1 s (frame 1484)

## Files
- verdict: `design\program\player-truth\adventure-adventure-independent-oct27-adventure-independent-oct27\verdict.md`
- contactSheet: `design\program\player-truth\adventure-adventure-independent-oct27-adventure-independent-oct27\contact-sheet.jpg`
- json: `design\program\player-truth\adventure-adventure-independent-oct27-adventure-independent-oct27\verdict.json`
