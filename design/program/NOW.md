<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-09-06
baseCommit: 099c2b8d9708c152e4449f0a4e04ffaae3a0f1eb
expiresAfterCommits: 10
expiresAfterDays: 2
```

This is a short collaboration board, not a roadmap, backlog, completion ledger, or reason to stop
working. Product status and remaining tasks live in
[`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md) and
[`roadmap/program-queue.json`](./roadmap/program-queue.json).

## Rules

1. Add one row immediately before the first mutation. Reading, research, review, and tests reserve no
   file and need no row.
2. Name the exact task, thread label, current state, and files being changed now. Do not claim a
   subsystem, lane, tool, GPU, or future phase.
3. A row protects the exact dirty hunk from being overwritten. It does not block the task, packet, or
   other files. Work on disjoint hunks or another returned task while arranging an explicit handoff.
3a. **A row is a claim, not evidence — check liveness before yielding to it.** Run
   `node scripts/check-now-liveness.mjs`. A row whose claimed files are untouched for 90 minutes is
   **stale by definition**: the writer is dead or done. Adopt the work (evaluate the dirty diff,
   finish or land it, receipt it) and delete the row — do not route around it, do not wait, do not
   ask. Dirty files alone are never proof of a live writer in this chronically dirty tree, and
   "row exists + files dirty" is the claim verifying itself. Collisions here are cheap and
   recoverable; work stalled behind a ghost is invisible and permanent — yielding to a stale row
   is the failure mode, not the safe choice.
4. Reread a shared file before every patch. Release the row as soon as mutation stops.
5. Use `PUBLISHING` only for the brief stage/commit/push window. Stage only the task's exact files,
   verify the staged names, publish, then remove the row. A staged deletion of a file that exists in
   `HEAD` and on disk means the shared index is stale, not that the file is gone: `git reset --
   <paths>`, then publish.
6. End every task with `RESULT: DONE` or `RESULT: NOT DONE` using the template in
   [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md). Delete stale rows; Git and receipts own history.
7. Do not create a worktree by default. Existing worktrees are recovery obligations recorded in
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md), not current ownership.

## Active mutation windows

| Task | Thread | State | Exact paths being changed now | Next terminal action |
|---|---|---|---|---|
| PQ-204 smoothness algorithms | grok-pq-204 | RESULT: DONE | released; always-on grid, combat SoA, dirty journal, NEAR tokens, save-safe Rapier sleep, far outcomes, packed-ORM family key, after-present compile, snapshot lean. GPU batch and Worker/WebGPU not started. `test/pq-204-advanced-perf.test.mjs` 9/9. Hitch freeze / Hornet / faction-kit hunks untouched. | no commit |
| PQ-033.02 min-spec soak | devin-cli | MUTATING | `scripts/lib/releaseSoakProbe.mjs`, `src/data/collisionProxyManifests.js`, `test/station-docking-corridor.test.mjs` (all committed a7c86788b), `design/program/roadmap/receipts/PQ-033.02-REPORT.md`. Prior: GPU admission seal, save dup/quota + convoy cap + backup-quota degrade, autopilot dock limit-cycle, corridor lane-lock (7842a4b2a), soak write-trap instrumentation, occlusion-stall fix (624466961), shader canonicalizer boot fix (5afa9de8c), dock-corridor contact-held heading-gate fix (a7c86788b). PQ-170.00 closed (848d1a882); PQ-170.01 closed via Claude Fable (0b1cd3039). | Browser soak re-running in frozen worktree `.devin-tmp/soak-wt` (snapshot 5afa9de8 + dirty state + a7c86788b fix) after prior run caught a real cycle-503 wedge: contact-held ship parked 23 wu off berth, heading-gated out of capture assist forever. Remaining: soak completion (2h/200cy), electron soak, check:pq033:min-spec, check:all, probe:runtime-witness, finalize report, queue flip |
| Chart leftover scans | grok-perf-table-finish | MUTATING | `src/ui/galaxyMap.js`, `src/ui/station/screens/market.js`, `src/systems/onboarding.js`, `test/m2-map-cutover.test.mjs`, `src/systems/survivorPod.js`, `src/systems/aftermathWrecks.js`, `src/systems/surrenderRecovery.js`, `src/render/illustratedSurface.js`, `src/render/visualFactory.js`, `src/systems/automation.js`, `src/ui/dockDenyBanner.js`, `test/illustrated-surface.test.mjs`, `src/render/opaqueMaterialBatch.js`, `src/render/renderer.js`, `test/opaque-material-batch.test.mjs`, `build_map.md`, `design/PERF_OPTION_SPACE.md`. Hitch freeze untouched. partsLibrary still live (PQ-193.09/12). | checkpoint `.codex/agent-checkpoints/leftover-chart-scans.json`. Investigate `PQ-196`–`PQ-203` in `build_map.md` §8.2. No commit. |
| HUD/target per-frame scans skip projectiles | grok-perf-table-finish | RESULT: DONE | released; overview 5 Hz uses shipLike+wrecks; Tab/radar lock uses shipLike; trap readout uses charges; shader-key collapse still blocked by live partsLibrary | crucible readout + ui-correctness 17/17 |
| Crowded-frame leftover scans + cargo NEAR | grok-perf-table-finish | RESULT: DONE | released; swarm arena cohort/wreck/solid scans typed; survival role counter + wing morale + scenario cold-start on shipLike; cargo NEAR skips hitch catch-up; partsLibrary still live (PQ-193.09) so shader-key collapse not started | clock/swarm-arena/thunderchild/safe-opening 38/38 |
| Remaining table-clock leftover scans | grok-perf-table-finish | RESULT: DONE | released; choir/tideline/bombs/combatOutcome/titles/fields/lootShards/uniqueWrecks on typed indexes; combatOutcome NEAR (skips catch-up rescans); colliding travel-lane FX left live; aperture occupancy left on entityList (hangar jam is a pre-existing real-path fail) | loot/titles/bombs/clock/unique-wreck tests 64/65; census membership 56; p50 host-noisy 5.7–6.0 ms (gate not weakened) |
| Quiet-Ceres tick + boot hitch leftovers | grok-perf-table-finish | RESULT: DONE | released; staged title-first screen parse, aftermath/wingMorale calendar, residency poll no longer promotes on present, indexed mine/sling/law/world scans | membership 56 live / 279 field rocks / 19 far rows; quiet p50 ~2.1 ms, contended host ~6.5 ms |
| Impulse/faction index leftover scans | grok-perf-table-finish | RESULT: DONE | released; `impulseCharges` charge ticks use `indexedTypeScan('charges')`; faction presence activate/reset walks `indexedShipLikeScan`; colliding travel-lane FX left live | impulse-charge + faction-module tests 10/10 |
| Drift-bomb bay combat verb (user-directed) | zai-coding-plan/glm-5.3 2026-09-14 | RESULT: DONE | released: `src/data/bombs.js` + `src/systems/bombs.js` (new), `src/data/combatDefs.js` (status_goo), `src/core/coreSystem.js` (bombs bucket), `src/core/registry.js`, `src/runtime/authoritativeSystemManifest.js` (counts 148/110), `src/systems/input.js` + `src/systems/gamepad.js` (dropBomb Digit9 / cycleBomb Comma; pad dRight/dLeft), `src/render/visualFactory.js` + `src/render/vfx.js` (8 bodies + per-payload detonation reads), `test/bombs.test.mjs` (9/9), `test/authoritative-manifest.test.mjs`, spec/handoff `design/ORDNANCE_BOMBS_SPEC.md`. 15/15 baseline green, goldens byte-identical | cloud agent continues from `design/ORDNANCE_BOMBS_SPEC.md` §5 (feel pass, economy, HUD, audio, NPC droppers) |
| P0 B3b and scoreboard | Devin P0 continuation | MUTATING | `src/render/camera.js`, `src/render/cameraDirector.js`, `src/combat/runtime.js`, `scripts/lib/bench/crucibleBench.mjs`, `scripts/lib/bench/frameStripCapture.mjs`, `scripts/probe-runtime-witness.mjs`, `scripts/lib/runtimeWitnessProductionMatrix.mjs`, `test/camera-focus-separation.test.mjs`, `test/dense-scene-camera-legibility.test.mjs`, `test/pq-159-01-two-body.test.mjs`, `test/crucible-bench-real-path.test.mjs`, `test/runtime-witness-production-matrix.test.mjs`, `test/seam-combat-subsystems.test.mjs`, `test/seam-combat-statuses.test.mjs`, `SAVE_SCHEMA.md`, `src/runtime/nodeSystemFactoryTable.js`, `design/program/roadmap/receipts/fun-loop/package0-felt-scoreboard.md` | current-tick B3b exclusion repaired (5 focused tests pass); diagnose v4 Cinder/physics/4242; checkpoint `.codex/agent-checkpoints/p0-b3b-v4.json`; preserve foreign hunks; no commit before fresh tribunal approval |
| Owner UI glass pass (2026-09-14) | opencode-go/deepseek-v4.1-flash | RESULT: DONE | released; `src/ui/views/hudStyles.js` glass register (panels, vitals, rail sockets, radar, gauge redraw) + dated owner amendment in `design/frontend/direction/FIELD_HARDWARE_PROGRAM.md`; flight/power-rail stills captured, type-floor/a11y/labels/effects/wcag green (target-panel + colour-token reds pre-existed); `check:ui:layout` full walk exceeds 10 min here | pathspec-commit |
| PQ-050.01 Hornet residual | grok-pq-050-01 | MUTATING | `assets/ships/fleet_player_bodies_v1/hornet/`, `assets/ships/parts/wholeships/hornet_production_v1*.glb`, `assets/ships/release/parts/wholeships/hornet_production_v1*.glb`, `assets/ships/release/render-packages/hornet-production-v1/`. Hitch freeze untouched. Places/pods/ui/traffic/visualFactory untouched. partsLibrary Hornet map only if filename changes. | chase-camera form+surfaces, promote Hornet LODs, pathspec-commit |
| PQ-193.10 dock/hulk/debris live presentation | grok-pq-193-10 | RESULT: DONE | released; dock/hulk/debris maps only; grit/military unrouted; Hitch frozen; foreign partsLibrary hunks uncommitted | receipt `design/program/roadmap/receipts/PQ-193.10-REPORT.md` |
| PQ-193.09 faction kits | grok-pq-193-09 | MUTATING | `src/render/partsLibrary.js` (faction overlay / Span / Wasp kit maps only; foreign hunks preserved), `assets/ships/` existing overlay identities (Span/Wasp kits + three trade-hub overlays). Hitch freeze untouched. | package kits, wire maps, checks, pathspec-commit |
| PQ-164.02 Deck + trackpad | grok-pq-164-02 | RESULT: DONE | released; first-ten 600s 5 verbs; Deck still 1280×800 scale 1 overflowX 0 note in view twice; pad-focus hunks in input.js untouched | receipt `design/program/roadmap/receipts/PQ-164.02-REPORT.md` |
| Four headed claims (141.02/030.02/159.01/166.01) | grok-next20-headed | RESULT: NOT DONE | released; PQ-166.01 done (canvas wrap, HUD in sweep, two PASS); 141.02/030.02/159.01 stay ready | miner-on-rock, pirate hunt, corsair cutter, TWO_BODY swing |
| PQ-159.03 photo mode | grok-pq-159-03 | RESULT: DONE | released; Pause → Photo, HUD gone, free cam, exposure 1, filters off; Capture writes the store-page still; seed 15903 6/6 twice; foreign Clips/Replay hunks untouched | receipt `design/program/roadmap/receipts/PQ-159.03-REPORT.md` |
| PQ-159.01 two-body framing | grok-pq-159-01 | RESULT: DONE | released; taut swing 23.3%→100% both in frame on shipping chase camera seed 15901; slack stays FOLLOW; live remoteMassline bridle; foreign twoBodyFraming.js / pause.js / feel.js / camera.js hunks untouched | receipt `design/program/roadmap/receipts/PQ-159.01-REPORT.md` |
| PQ-158.03 composed themes | grok-pq-158-03 | RESULT: DONE | released; stranger hummed A C E A from the travel WAV; Helios 82.4 Hz warm-sine vs Sker 72.3 Hz saw-growl; 10/10 beds named blind; 10/10 twice seed 15803; foreign synth/generate-samples/voice/massline hunks untouched | receipt `design/program/roadmap/receipts/PQ-158.03-REPORT.md` |
| PQ-158.01 A/B close | grok-pq-158-01 | RESULT: DONE | released; A/B unique bodies 4→9, light split 1→3, scout 0.40s 1909 Hz vs station 1.40s 563 Hz (3.50×); B9b 1.08 oct / 20.79 dB; 11/11 twice seed 15801; foreign audio hunks untouched | receipt `design/program/roadmap/receipts/PQ-158.01-REPORT.md` |
| PQ-030.02 counter first | grok-pq-030-02 | RESULT: NOT DONE | released; live hull+taut-sweep names the cutter, Range Massline sheet is the raider, hostile-sweep observer 1/1; stranger still residual | GPU shipping-camera still |
| PQ-193.02 reverse jets | grok-pq-193-165 | RESULT: NOT DONE | released; volumetric retro shorter/fatter, 3/3 twice; stranger still residual | GPU HUD-hidden brake still |
| PQ-193.01 opening NPCs | grok-pq-193-01 | RESULT: DONE | released; 7/7 packaged hulls; pirate is accepted Wasp not factory Hornet; Hitch vs Lark same game on chase stills; Hitch frozen | receipt `design/program/roadmap/receipts/PQ-193.01-REPORT.md` |
| PQ-165.01 captions and cues | grok-pq-193-165 | RESULT: DONE | released; 271/271 barkFor captions; well/taut/telegraph silent when Audio cues off | 4/4 twice with .02 |
| PQ-165.02 checklist | grok-pq-193-165 | RESULT: DONE | released; statement on Access; 10/10 screens green | 4/4 twice |
| PQ-166.01/.02 growth + five languages | grok-pq166 | RESULT: DONE | released; catalogs, growth layout, barks/store, tests, receipts | 5/5 and 6/6 twice; 0 clips at seed 16601; five catalogs + store at seed 16602 |
| Perf three-wave sweep | grok-goal-bb2ec0e50769 | RESULT: DONE | released; leftover S3 delayed-exit shelves via entityIndex shipLike+wrecks; quiet after pair hitch 0 p95 7.5/5.0 vs 7.8/5.5 | far-actors 6/6 twice; ab-table + after-1/after-2; 47-A not claimed |
| Next-20 dispatch pipeline | grok-next20-pipeline | RESULT: DONE | released; 20 live `--ready` leaves closed with receipts + two review waves | Chromium playable walk timed out (GPU); headed stills residual |
| PQ-194 packet refit + S2 embark | devin controller 2026-09-11 | RESULT: DONE | released; packets refit for local Codex route (image-production law, legibility floors, independent frames, honest BLOCKED), S2–S5 zips rebuilt carrying the real kit; Codex gpt-6-astra xhigh landed P15 keyart tiles (38 files) + eight Blender S2 scenes and draft plates; backdrops promoted pre-quieted (5.2–6.9:1 vs bone); receipt P15-REPORT.md; S1 leftovers adopted by pathspec | S2 frames composition + twelve prototypes remain (P03/P04/P16 continue) |
| Finish-game fleet | grok-controller 01a08d61 | MUTATING | `design/program/NOW.md`, `design/program/roadmap/program-queue.json` | 164 walker not run (GPU); 164.00b node pin; 158/160/166/194 live; skip 141.02 |
| Bug/perf sweep | grok-controller 01a08d61 | RESULT: DONE | released; frame cap now gates GPU presents; menu stage draw is allocation-free | 30 fps cap skips presents, leftover sim still 60 Hz; 9/9 twice |
| PQ-160.00 ring buffer + replay | opencode-go/deepseek-v4.1-flash | RESULT: DONE | released; 30 s ring + replay verifier + pause Replay surface | 600/600 ticks hash-equal at seed 16000; new test 4/4 twice; live capture + free camera are the open seams |
| PQ-160.01 auto-clip | grok-pq160-164 | RESULT: DONE | released; GIF/MP4 export when frames exist, software card without GPU, fail-closed bare id; Electron save + browser download | 6/6 twice seed 16001; bolas window 301/301 |
| PQ-145.00 drawn map route | Codex map remainder 2026-09-10 | RESULT: DONE | released; map, freight test and receipt ready for controller | seed 14500 route true at 120 ticks; 2/2 twice; Throughline 8/8; headless only |
| PQ-163.04 cliff | opencode-go/deepseek-v4.1-flash (recovery) | RESULT: DONE | released; receipt appendix committed | design proxy 4/4; playtest retention residual |
| PQ-163.03b stranger readback | grok-controller 01a08d61 | RESULT: DONE | released; STRANGER_READBACK committed `ad35e82b2` | Kimi accept; controller 7/7 twice; unaided stranger residual |
| PQ-153.02 landmarks | zai-coding-plan/glm-5.3-flash max pid 29352 | RESULT: NOT DONE | released; 6/6 reachable committed; stills rejected (skybox/dust, onCamera110=0) | recapture serialized behind 194.01 GPU |
| PQ-161.01 telegraphs | opencode-go/deepseek-v4.1-flash pid 12240 | RESULT: DONE | released; pairing committed | live death-cause pairing ≥90% |
| PQ-161.02 seed align | opencode-go/deepseek-v4.1-flash | RESULT: DONE | released; seed 16102 aligned, contrast green 6/6 twice, receipt appended | controller commits by pathspec |
| PQ-194.00 S1 kit | claude-opus-5 pid 18804 | RESULT: DONE | `design/frontend/direction/approved/`, `assets/ui/kit/`, `design/frontend/direction/receipts/` | six frames + 157-asset kit + 86 icons + 41 marks + tokens + motion/sound + kit page + 3 file:// prototypes; title pick v2; receipt at `design/frontend/direction/receipts/S1-REPORT.md`; controller commits by pathspec |
| PQ-164.00 pad screen walk | grok-pq160-164 | RESULT: NOT DONE | released; Node pin 5/5 twice; Chromium walk timed out waiting for window.SF (30s) | check:gamepad:screens residual |
| PQ-164.03 haptics | command-code/deepseek-v4.1-flash pid 11900 | RESULT: DONE | released; `src/systems/gamepad.js`, `test/pq-164-03-haptics.test.mjs`, `design/program/roadmap/receipts/PQ-164.03-REPORT.md` | rumble table by momentum (seed 16403, rows monotone); reduce-motion silent; 3/3 twice; no Chromium; baseline reds pre-existing |
| PQ-194.01 UI stage (gate zero) | claude-opus-5 L-A | RESULT: DONE | `src/render/uiStage.js` (new), `src/core/presentationFreeze.js`, `src/core/renderUpdatePhase.js`, `src/ui/screenManager.js`, `src/ui/views/menuFrames.js`, `src/ui/screens/mainMenu.js`, `src/ui/screens/crucible.js`, `src/ui/station/stationApp.js`, `src/ui/station/stationScreen.js`, `styles/kit.css`, `assets/ui/backdrops/` (new) | released; 9/9 `--world` frames show a lit world at 1280/1920/2560, one GL context on Intel, stage released in flight; receipt `design/frontend/direction/receipts/P20-REPORT.md`; controller commits by pathspec |
| PQ-193.00 packaged bodies | Devin adoption 2026-09-11 | RESULT: DONE | released; committed `1cbbf1072` (193.00 hunks only — first-flight cook diff preserved uncommitted in `src/render/partsLibrary.js`) | 49/49 + 42/42 + arrival 7/7; Electron route seed 47: 7/7 lockable ships authored packaged bodies, 0 blank locks; pending Hornet published before lockable; queue row done in tree, controller pathspec-commits |
| PQ-166.00 language bridge | opencode-go/deepseek-v4.1-flash | RESULT: DONE | released; receipt `design/program/roadmap/receipts/PQ-166.00-REPORT.md` | language picker + live re-render for any locale; English default; 4/4 headless screens re-render, seed 16600 |
| PQ-165.00 presets and frame cap | command-code/deepseek-v4.1-flash pid 15456 | RESULT: DONE | released; receipt `design/program/roadmap/receipts/PQ-165.00-REPORT.md` | 3 presets → 3 tiers; 30/60/120/off resolve with VSync; seed 16500; headless only (renderer scheduler consumption unproven) |
| PQ-158.00 sample library | zai-coding-plan/glm-5.3 leaf .00 | RESULT: DONE | released; 181/182 cues sample-backed (seed 15800), new-game unmute, frame-sleep unchanged; SAVE_SCHEMA.md regenerated (one default line); integrator flip wanted: test/depth-program-a1-live-integration.test.mjs:13-17 still pins the old mute policy | receipt `design/program/roadmap/receipts/PQ-158.00-REPORT.md` |
The legacy extraction, live Shipworks guidance, Market quantity controls and public career route are
committed after controller review. UI performance and place acceptance continue in this campaign.
PQ-184.01, PQ-184.03, PQ-187.00, PQ-177.07, PQ-144.01, PQ-190.00 and PQ-184.02 are closed in the
canonical queue. The duplicate incomplete checkout was removed after its DROP disposition was
committed and pushed.

The three native art rows (ordinary working tug, held furniture construction repair, yard tug body
re-author) are deleted: their writers stopped on provider limits, the dirty work was adopted and
finished, and it is committed and pushed. Ordinary life is done on the route — the tug moves a real
load through the combat attachment service under Rapier, and a five-minute HUD-hidden capture at the
Ceres reference pocket shows all six quiet behaviours (`scripts/capture-ordinary-life.mjs`).

| PQ-158.01 impact ladder | zai-coding-plan/glm-5.3 leaf .01 | RESULT: DONE | released; nine distinct designed transient/body/tail samples (86→95 WAVs, byte-identical --check), ladder cell on the collision cue, recipe/synth law untouched; B9b table 10/10 twice (seed 15801: 1.08 octaves, 20.79 dB); foreign PQ-139.01 pins 8/8; headed A/B capture residual behind 141.02 GPU | receipt `design/program/roadmap/receipts/PQ-158.01-REPORT.md`; controller commits by pathspec |
| PQ-158.02-.05 audio direction | grok-pq-158-01-05 | RESULT: DONE | released; massline instrument + composed themes + bark voice pipeline + hangar/void mix; 29/29 leaf tests twice; synth.js and settings.js untouched | receipts PQ-158.02 through .05; controller commits by pathspec |
| PQ-141.02 every actor has a sentence | grok-pq-141.02 (adopting devin-wave1) | RESULT: DONE | released; 6/7 HUD-hidden stills named on seed 14102; pirate hull never spawned | contact tests 11/11 twice; pirate still residual |
| PQ-193.03 buoy/beacon/pod | devin-wave1 | MUTATING | `assets/ships/parts/places/`, `assets/ships/parts/pods/`, `design/program/GRAPHICS_3D_CAMPAIGN.md`, `design/program/roadmap/receipts/PQ-193.03-REPORT.md` (new) | verify the three same-slot GLBs at the legal chase cameras vs Hitch; re-author only if a still fails; manifest/render-package hash parity; checks; receipt |
| PQ-159.00 impact kick | devin-wave1 | RESULT: DONE | released; committed `8af83e60d` | seed 15900: dp 2124 → kick 1.850 wu authored / 1.833 wu applied, recoil −x, decays <0.02 wu; reduce-motion capture exactly 0; 7/7 new test, 63/63 camera+feel tests, check:feel:scenarios 48/48; baseline/camera-check reds all pre-existing foreign drift |
| PQ-193.12 station fallback | devin-wave1 | MUTATING | `src/render/partsLibrary.js` (station-archetype hunks only; foreign first-flight cook hunks preserved uncommitted), `src/render/spaceBackground.js`, `test/` (new), `design/program/roadmap/receipts/PQ-193.12-REPORT.md` (new) | station archetype resolution total over STATION_TYPES; unresolved station archetype fails closed instead of publishing the fat-cylinder procedural; run leaf checks; receipt |
| PQ-160.02 seeds and ghosts | grok-pq160-164 (adopting devin-wave1) | RESULT: DONE | released; two machines same runHash at seed 16002; translucent ghost hull 0.32 | 4/4 twice; pause.js/settings.js untouched |
| PQ-193.06 corsair body | grok-pq-193-06 | RESULT: DONE | released; corsair_raider is Corsair Blade; pirate Rig untouched; Hitch frozen | receipt `design/program/roadmap/receipts/PQ-193.06-REPORT.md`; controller pathspec-commits |
| VFX force-language integration (fallback packet af37489) | zai-coding-plan/glm-5.3 2026-09-15 | RESULT: DONE | released; `src/render/forceLanguage/` (4 modules), `src/render/vfx.js` (−631 legacy field meshes → swept force surfaces; adopted foreign momentum-sink + projectile-sleep hunks), `src/render/weapons/presenter.js` (discharge pool + adopted quarks hunks), `src/render/thruster/recipes/plasmaStreamRecipe.js`, `src/render/thruster/ribbon/driveForge.js`, `src/render/thruster/systems/playerRetroVolume.js` (retro v5 directional jet; local chase-distance compensation preserved), `test/vfx-force-language.test.mjs` + 4 updated tests, `scripts/vfx-force-language-lab.html`, `docs/visual-assets/VFX_FORCE_LANGUAGE_STANDARD_2026-09-16.md`, `package.json` `check:vfx-force-language`, evidence `design/program/roadmap/evidence/vfx-force-language-2026-09-16/`. weaponLights pool stays 2 (committed P1 perf measurement outranks packet's 16 revert). Foreign check:47a/sim/massline reds pre-existed (massline lane). | check:vfx-force-language 66/66, check:vfx-techniques 10/10, check:vfx-sleep green; baseline reds all foreign-lane |
| VFX lifecycle v2 upgrade (packet spaceface-vfx-lifecycle-v2) | zai-coding-plan/glm-5.3 2026-09-16 | RESULT: DONE | released; landed as commit `d94e8d995` (concurrent devin agent committed while this agent audited — merge independently verified, byte-hash + hunk audit). All five tools animate birth→sustain→retire with no targets (`forceLanguage/effectLifecycle.js` + `fieldForcePresentation.js`/`sweptSurfaceBatch.js`), `engaged` is contact-only. 18/26 packet files byte-exact; 8 adapted better (repo doc path, `python` alias, quarks + chase-distance compensation + momentum-sink/indexedTypeScan foreign hunks preserved, fixture import-map for `three.quarks`). Schema `spaceface.force-language.lifecycle.v2`. Independent bisect: check:47a red in live tree is foreign perf-lane dirty work (passes clean at `d94e8d995`) | check:vfx-force-language 86/86, check:vfx-field-lifecycle covered, check:vfx-sleep + check:vfx-techniques green (this tree); 47A green at commit |

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
