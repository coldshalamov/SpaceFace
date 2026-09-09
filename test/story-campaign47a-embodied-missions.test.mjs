import assert from 'node:assert/strict';
import {
  buildAftermathHook,
  buildMissionBoardContract,
  describeEmbodiedMission,
  getNamedCaptainBinding,
  listEmbodiedMissions,
  validateEmbodiedMissions,
} from '../src/story/campaign47a/index.js';

console.log('story-campaign47a-embodied-missions');
const validation = validateEmbodiedMissions();
assert.deepEqual(validation, { ok: true, errors: [] });
const beats = listEmbodiedMissions();
assert.equal(beats.length, 8);
assert.deepEqual(beats.map((beat) => beat.id), [
  'cold_start', 'honest_work', 'first_blood', 'bigger_boat',
  'pick_a_side', 'proving_ground', 'empire_seed', 'deep_reach',
]);

const b1a = buildMissionBoardContract(1, { seed: 47, epoch: 3 });
const b1b = buildMissionBoardContract(1, { seed: 47, epoch: 3 });
assert.deepEqual(b1a, b1b, 'authored offer must be deterministic');
assert.equal(b1a.type, 'demolition');
assert.equal(b1a.storyTag, 'campaign47a:b1:honest_work');
assert.equal(b1a.campaign47aBeat, 1);
assert.equal(b1a.title, 'Knock the variance tower');
assert.deepEqual(b1a.params.completionMethods, ['wrecking_ball', 'cut_down']);

const b2 = buildMissionBoardContract(2, { seed: 47, epoch: 3 });
assert.equal(b2.type, 'rescue_under_fire');
assert.equal(b2.title, 'Pull the pods under fire');
assert.deepEqual(b2.params.completionMethods, ['stage_tow', 'corridor_pull']);
assert.equal(b2.destSectorId, 'sector_charon_expanse');
assert.deepEqual(buildAftermathHook(2), {
  beat: 2,
  recordKind: 'battle_wreck',
  owner: 'aftermathWrecks',
  source: 'entity:killed',
  sectorId: 'sector_charon_expanse',
  zoneId: 'zone_charon_ambush',
});

const b3 = buildMissionBoardContract(3, { seed: 47, epoch: 3 });
assert.equal(b3.type, 'tow_recovery');
assert.equal(b3.storyTag, 'campaign47a:b3:bigger_boat');
assert.equal(b3.title, 'Tow the slag core');
assert.deepEqual(b3.params.completionMethods, ['tow_in', 'sling_in']);

const patrol1 = buildMissionBoardContract(5, { seed: 47, epoch: 4, branch: 'patrol', chainStep: 0 });
const patrol2 = buildMissionBoardContract(5, { seed: 47, epoch: 4, branch: 'patrol', chainStep: 1 });
assert.equal(patrol1.type, 'patrol_clear');
assert.equal(patrol1.storyTarget.namedCaptainId, 'cap_sable_iask');
assert.equal(patrol2.storyTarget.namedCaptainId, 'cap_redcut_sorrel');
assert.deepEqual(getNamedCaptainBinding(5, { branch: 'patrol', chainStep: 0 }), {
  beat: 5, captainId: 'cap_sable_iask', bound: true, encounterShapeId: 'named_hunter',
});

assert.equal(buildMissionBoardContract(0, { seed: 47, epoch: 0 }), null);
assert.ok(buildMissionBoardContract(3, { seed: 47, epoch: 0 }));
assert.equal(buildMissionBoardContract(6, { seed: 47, epoch: 0 }), null);
assert.equal(buildMissionBoardContract(7, { seed: 47, epoch: 0 }), null);
assert.equal(describeEmbodiedMission(2, { seed: 47, epoch: 0 }).authority.cursor, 'missions');
assert.equal(describeEmbodiedMission(2, { seed: 47, epoch: 0 }).authority.aftermath, 'aftermathWrecks');

console.log('story-campaign47a-embodied-missions: all checks passed');
