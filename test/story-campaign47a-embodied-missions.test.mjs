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
assert.equal(b1a.type, 'cargo_delivery');
assert.equal(b1a.storyTag, 'campaign47a:b1:honest_work');
assert.equal(b1a.campaign47aBeat, 1);
assert.equal(b1a.params.filedAs, 'SURPLUS REDISTRIBUTION — STANDARD');

const b2 = buildMissionBoardContract(2, { seed: 47, epoch: 3 });
assert.equal(b2.type, 'bounty_hunt');
assert.equal(b2.storyTarget.id, 'npc_elroy');
assert.equal(b2.storyTarget.registry, 'CIVILIAN VESSEL — REGISTERED');
assert.equal(b2.storyTarget.zoneId, 'zone_charon_ambush');
assert.equal(b2.destSectorId, 'sector_charon_expanse');
assert.deepEqual(buildAftermathHook(2), {
  beat: 2,
  recordKind: 'battle_wreck',
  owner: 'aftermathWrecks',
  source: 'entity:killed',
  sectorId: 'sector_charon_expanse',
  zoneId: 'zone_charon_ambush',
});

const patrol1 = buildMissionBoardContract(5, { seed: 47, epoch: 4, branch: 'patrol', chainStep: 0 });
const patrol2 = buildMissionBoardContract(5, { seed: 47, epoch: 4, branch: 'patrol', chainStep: 1 });
assert.equal(patrol1.type, 'patrol_clear');
assert.equal(patrol1.storyTarget.namedCaptainId, 'cap_sable_iask');
assert.equal(patrol2.storyTarget.namedCaptainId, 'cap_redcut_sorrel');
assert.deepEqual(getNamedCaptainBinding(5, { branch: 'patrol', chainStep: 0 }), {
  beat: 5, captainId: 'cap_sable_iask', bound: true, encounterShapeId: 'named_hunter',
});

assert.equal(buildMissionBoardContract(0, { seed: 47, epoch: 0 }), null);
assert.equal(buildMissionBoardContract(3, { seed: 47, epoch: 0 }), null);
assert.equal(buildMissionBoardContract(6, { seed: 47, epoch: 0 }), null);
assert.equal(buildMissionBoardContract(7, { seed: 47, epoch: 0 }), null);
assert.equal(describeEmbodiedMission(2, { seed: 47, epoch: 0 }).authority.cursor, 'missions');
assert.equal(describeEmbodiedMission(2, { seed: 47, epoch: 0 }).authority.aftermath, 'aftermathWrecks');

console.log('story-campaign47a-embodied-missions: all checks passed');
