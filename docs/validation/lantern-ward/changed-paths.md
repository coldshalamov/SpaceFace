# Lantern Ward — exact source and test paths

Initial base: `fcc4491ac44162e5e73b5a062ccc37622fe7b9d4`. Current Finish controller base: `f71edbfcbccb33c2fbc424116c6684b4ed7596ad`, integrated by ordinary merge `27f4571d`. Latest source and reviewed compatibility metadata: `8c66b48500d475e48518118293b810dab589e4fc`. Production runtime is unchanged from `8cf0034e814ef18af14dcc52f26485e637820e57`. The 56 source/test paths below are the exact delta against that current controller base; upstream work is not claimed as Ward authorship. Published aliases and byte-identical Git trees are recorded in [published-history.json](evidence/published-history.json).

## Dedicated district modules

- `src/data/lanternWardHail.js`
- `src/data/lanternWardHardware.js`
- `src/data/lanternWardLayout.js`
- `src/data/lanternWardNavigation.js`
- `src/missions/lanternWardConversation.js`
- `src/missions/lanternWardStory.js`
- `src/render/lanternWardVisuals.js`
- `src/systems/lanternWardWork.js`
- `src/world/lanternWardActors.js`
- `src/world/lanternWardDressing.js`

## Canonical owner hooks and compatibility

- `src/audio/commissionCues.js`
- `src/data/audioRecipes.js`
- `src/data/combatDefs.js`
- `src/data/contactHail.js`
- `src/data/saveVersion.js`
- `src/features/counterweightCircuit/persistence.js`
- `src/render/combat/npcCableFx.js`
- `src/render/ordnanceMotionPresentation.js`
- `src/render/visualFactory.js`
- `src/render/visualOverrides.js`
- `src/save/migrations.js`
- `src/save/saveSystem.js`
- `src/systems/missionStoryOps.js`
- `src/systems/missions.js`
- `src/systems/npcJobsRuntime.js`
- `src/systems/scanner.js`
- `src/systems/world.js`
- `src/ui/galaxyMap.js`
- `src/world/worldCatchup.js`
- `src/world/worldRecords.js`

## Existing worker bridge

- `scripts/lib/npcJobsMirror.mjs`
- `scripts/lib/simReadModel.mjs`
- `scripts/lib/simWorkerHost.mjs`
- `src/runtime/laneSystemFacades.js`

## Focused tests

- `test/counterweight-circuit-persistence.test.mjs`
- `test/lantern-ward-approach.test.mjs`
- `test/lantern-ward-authority.test.mjs`
- `test/lantern-ward-autosave.test.mjs`
- `test/lantern-ward-center-lane.test.mjs`
- `test/lantern-ward-commuter-route.test.mjs`
- `test/lantern-ward-custody-adversarial.test.mjs`
- `test/lantern-ward-dressing.test.mjs`
- `test/lantern-ward-hail.test.mjs`
- `test/lantern-ward-native-pose-render.test.mjs`
- `test/lantern-ward-opening-admission.test.mjs`
- `test/lantern-ward-production-settlement.test.mjs`
- `test/lantern-ward-rescue-occlusion.test.mjs`
- `test/lantern-ward-save-import-bridge.test.mjs`
- `test/lantern-ward-save.test.mjs`
- `test/lantern-ward-story.test.mjs`
- `test/lantern-ward-unattended-law.test.mjs`
- `test/lantern-ward-visuals.test.mjs`
- `test/lantern-ward-worker-projection.test.mjs`
- `test/lantern-ward-world-life.test.mjs`

## Existing simulation envelopes — version-only hash metadata

- `test/47a.telemetry.expected.json`
- `test/47a.telemetry.v3.native-contact.expected.json`

## Generated save contract, navigation indexes and validation artifacts

- `SAVE_SCHEMA.md`

- `docs/EVENT_ROUTING.md`
- `docs/SYSTEM_REGISTRY.md`
- `docs/validation/lantern-ward/` — exact implementation/art/story/design contracts, independent hostile reports, source/hash manifests, native logs and original ordinary-camera PNGs.

The Ward delta changes no program-status, Finish board, NOW, camera, physics-backend, sector ID or memorial asset path. The ordinary merge preserves newer controller-owned program/status edits. Foreign temporary asset writes remain untouched.
