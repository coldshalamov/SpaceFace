# Lantern Ward — exact source and test paths

Base: `fcc4491ac44162e5e73b5a062ccc37622fe7b9d4`. Latest source is pinned at `9c7bb9006b5dffee7fc39487277ad8f411feba10`, which repairs canonical procedural opening admission. `dee4757cfaba8e069a6f270fa80c8199aa9f06f2` adds the repeated commuter test to the preceding runtime candidate. Published aliases and identical Git trees are recorded in [published-history.json](evidence/published-history.json).

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
- `test/lantern-ward-save.test.mjs`
- `test/lantern-ward-story.test.mjs`
- `test/lantern-ward-unattended-law.test.mjs`
- `test/lantern-ward-visuals.test.mjs`
- `test/lantern-ward-worker-projection.test.mjs`
- `test/lantern-ward-world-life.test.mjs`

## Generated navigation indexes and validation artifacts

- `docs/EVENT_ROUTING.md`
- `docs/SYSTEM_REGISTRY.md`
- `docs/validation/lantern-ward/` — exact implementation/art/story/design contracts, independent hostile reports, source/hash manifests, native logs and original ordinary-camera PNGs.

No program-status, Finish board, NOW, camera, physics-backend, sector ID or memorial asset path is changed. Foreign temporary asset writes remain untouched.
