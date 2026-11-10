# Player-truth verdict: FAIL — swarm-active-arena-frozen-swarm-oct27

- Mode: swarm · arena Ricochet Foundry · seed 4242 · build ebaea2ad5c1 (dirty)
- Source overlay: uncommitted candidate · base ebaea2ad5c1f2e664bd77e25645315b7e15af5ef · digest 08750c6ac26d10f8d3b6dda991b7bbe5bc3448e5c8f8aa2ee54edaff29954b81
- Source at start: ebaea2ad5c1 · scripts/check-bar-canonical-contacts.mjs, scripts/check-overnight-playable.mjs, scripts/fleet-look.mjs, scripts/lib/simReadModel.mjs, src/ai/combatDoctrine.js, src/ai/maneuver.js, src/ai/reflexes.js, src/core/mainToSimEventSurface.js, src/core/registry.js, src/core/sg02DynamicBodyOwner.js, src/data/localPortraits.js, src/data/lookMoods.js, src/data/physicsLog.js, src/data/portraits.js, src/data/survivalDraft.js, src/data/swarmArenaLadder.js, src/localization/catalogs/en-US.generated.js, src/localization/pipeline.js, src/main.js, src/render/forceLanguage/fieldForcePresentation.js, src/render/illustratedSurface.js, src/render/masslineLatchRim.js, src/render/masslinePresentation.js, src/render/masslineReleaseArc.js, src/render/racingCourseView.js, src/render/vfx.js, src/render/vfxColorLightDirector.js, src/render/visualOverrides.js, src/save/saveSystem.js, src/systems/borrowedSun.js, src/systems/bouncer.js, src/systems/encounterDirector.js, src/systems/faction_choir.js, src/systems/faction_frontier.js, src/systems/faction_helix.js, src/systems/faction_pitborn.js, src/systems/faction_vael.js, src/systems/gravedigger.js, src/systems/impoundGrudge.js, src/systems/impoundLot.js, src/systems/lamplighter.js, src/systems/masslineImpactDamage.js, src/systems/missionObjectiveOps.js, src/systems/missions.js, src/systems/mobile/instrument.js, src/systems/mobile/styles.js, src/systems/mobile/view.js, src/systems/moralMemory.js, src/systems/pirateDisguise.js, src/systems/rookBooth.js, src/systems/tallyho.js, src/systems/world.js, src/ui/screens/crucibleDraft.js, src/ui/screens/help.js, src/ui/shipLedgerPanel.js, src/ui/station/screens/ledger.js, src/ui/uiRoot.js, src/data/bloomLadder.js, src/data/special500/, src/systems/special500Director.js
- Source at end: d47d91c9e61 · scripts/check-bar-canonical-contacts.mjs, scripts/check-overnight-playable.mjs, scripts/fleet-look.mjs, scripts/lib/simReadModel.mjs, src/ai/combatDoctrine.js, src/ai/maneuver.js, src/ai/reflexes.js, src/core/mainToSimEventSurface.js, src/core/sg02DynamicBodyOwner.js, src/data/gravedigger.js, src/data/localPortraits.js, src/data/lookMoods.js, src/data/physicsLog.js, src/data/portraits.js, src/data/survivalDraft.js, src/data/swarmArenaLadder.js, src/localization/catalogs/en-US.generated.js, src/localization/pipeline.js, src/main.js, src/render/forceLanguage/fieldForcePresentation.js, src/render/illustratedSurface.js, src/render/masslineLatchRim.js, src/render/masslinePresentation.js, src/render/masslineReleaseArc.js, src/render/racingCourseView.js, src/render/vfx.js, src/render/vfxColorLightDirector.js, src/render/visualOverrides.js, src/save/saveSystem.js, src/systems/borrowedSun.js, src/systems/bouncer.js, src/systems/encounterDirector.js, src/systems/faction_archive.js, src/systems/faction_choir.js, src/systems/faction_frontier.js, src/systems/faction_helix.js, src/systems/faction_meridian.js, src/systems/faction_pitborn.js, src/systems/faction_vael.js, src/systems/gravedigger.js, src/systems/impoundGrudge.js, src/systems/impoundLot.js, src/systems/lamplighter.js, src/systems/masslineImpactDamage.js, src/systems/missionObjectiveOps.js, src/systems/missions.js, src/systems/mobile/instrument.js, src/systems/mobile/styles.js, src/systems/mobile/view.js, src/systems/moralMemory.js, src/systems/pirateDisguise.js, src/systems/rookBooth.js, src/systems/survivalRecords.js, src/systems/survivalResults.js, src/systems/survivalUnlocks.js, src/systems/tallyho.js, src/systems/world.js, src/ui/screens/crucibleDraft.js, src/ui/screens/help.js, src/ui/shipLedgerPanel.js, src/ui/station/screens/ledger.js, src/ui/uiRoot.js, src/data/bloomLadder.js
- Renderer: ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Opening effect warm: not run (no receipt) · KHR_parallel_shader_compile yes
- Browser: headed Chromium 149.0.7827.55 · 1280x720 · 2026-10-27T11:49:10.162Z
- Performance context: unmarked/contended development host · diagnostic-only · observer: 3 render/readback passes every 24 frames; screenshots every 1000 ms, included in measured wall time
- Run: 879 s wall, 0 s of play sim time, 120 frames sampled, 5 screenshots · player script: idle 3 s → thrust/yaw probes → kiting fighter: RMB select a reachable hostile, track its visible lead pip or hull while firing, hold 230–400 u range, burn away from packs, chase a fresh public radar bearing with sustained forward thrust and aligned boost, reposition after selection misses, latch every 7th beat; probes + shots at every round start · gate active pass · public gameplay admission; no probe-owned invulnerability toggle
- Stopped: harness/route error: flight did not become active before the timeout [chrome exit null signal none | free memory 5095 MiB / 32277 MiB | dmesg unavailable: spawnSync dmesg ENOENT]
- Host pressure: dmesg unavailable: spawnSync dmesg ENOENT

| Check | Result | Measured | Threshold |
|---|---|---|---|
| route | **FAIL** | main menu → first-run prompt → mode select → preparation | every step through public controls |
| round_resolution | **FAIL** | — | finite quota materialized and resolved, and ≥1 input (src/data/swarmMode.js rules 2–3: the finite cohort must arrive and resolve; no fixed time-to-death target) |
| kills_before_input | **n/a** | — | 0 |
| reward_before_input | **n/a** | — | 0 |
| spawn_motion | **UNKNOWN** | — | 0 bodies >8 u/s |
| player_control | **FAIL** | — | thrust Δv≥3 u/s · yaw Δ≥0.2 rad |
| tumble | **FAIL** | — | — |
| player_ship | **FAIL** | — | ≤0.5% frames |
| lod_churn | **UNKNOWN** | — | 3 |
| popping | **UNKNOWN** | — | ≤6/min |
| readability | **UNKNOWN** | — | separation ≥1 |
| vfx_coverage | **UNKNOWN** | — | p95 ≤0.25 |
| backdrop_coverage | **UNKNOWN** | — | threats over bright backdrop p95 ≤30% |
| loadout | **PASS** | 0 irrelevant · 0 undescribed · 0 silent swaps · row-on-select (inferred) | 0 · 0 · 0 |
| frame_time | **UNKNOWN** | — | — |
| round_transitions | **FAIL** | — | ship whole · probes answer · in plane, first 8 s of each round |
| rounds_reached | **FAIL** | round 0 | ≥ round 3 |
| crucible_realm | **FAIL** | 0/0 Adventure frames · armory 70 offers | 0 Adventure frames · armory > 0 offers |
| sim_stalled | **n/a** | — | ≥0.5 s sim per 60 s wall while phase is active and not loading |
| play_interrupted | **n/a** | — | flight HUD only during active play; a screen the script did not open fails |
| offscreen_marker | **n/a** | — | one screen-edge marker while a hostile is off-screen; none while every hostile is in frame; the side matches that hostile |
| first_hour_budget | **n/a** | — | latch ≤60s · raid ≤180s |

## Worst offenders
- **route** (FAIL) — stalled at route: harness/route error: flight did not become active before the timeout [chrome exit null signal none | free memory 5095 MiB / 32277 MiB | dmesg unavailable: spawnSync dmesg ENOENT]
  - route: harness/route error: flight did not become active before the timeout [chrome exit null signal none | free memory 5095 MiB / 32277 MiB | dmesg unavailable: spawnSync dmesg ENOENT]
- **round_resolution** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round started)
- **spawn_motion** (UNKNOWN) — no spawn moment recorded
- **player_control** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no control probe ran)
- **tumble** (FAIL) — not measured — gate counts UNKNOWN as FAIL (too few play frames)
- **player_ship** (FAIL) — not measured — gate counts UNKNOWN as FAIL (too few play frames)
- **lod_churn** (UNKNOWN) — too few play frames sampled
- **popping** (UNKNOWN) — too few play frames
- **readability** (UNKNOWN) — not enough on-screen samples per class (enemy 0, asteroid 0, projectile 0, pickup 0; need 5); capture coherence: 0 body samples rejected for capture-motion, identity/visibility changes, or HUD occlusion; 0 screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic
- **vfx_coverage** (UNKNOWN) — too few VFX scans · skipped 0
- **backdrop_coverage** (UNKNOWN) — no per-pixel splits sampled · skipped 0
- **frame_time** (UNKNOWN) — too few frames
- **round_transitions** (FAIL) — not measured — gate counts UNKNOWN as FAIL (no round after round 1 was reached)
- **rounds_reached** (FAIL) — stopped: harness/route error: flight did not become active before the timeout [chrome exit null signal none | free memory 5095 MiB / 32277 MiB | dmesg unavailable: spawnSync dmesg ENOENT]
  - scripted fighter stopped at round 0: harness/route error: flight did not become active before the timeout [chrome exit null signal none | free memory 5095 MiB / 32277 MiB | dmesg unavailable: spawnSync dmesg ENOENT]
- **crucible_realm** (FAIL) — not measured — gate counts UNKNOWN as FAIL (sectors seen: n/a)

## Files
- verdict: `design\program\player-truth\swarm-active-arena-frozen-swarm-oct27\verdict.md`
- contactSheet: `design\program\player-truth\swarm-active-arena-frozen-swarm-oct27\contact-sheet.jpg`
- json: `design\program\player-truth\swarm-active-arena-frozen-swarm-oct27\verdict.json`
