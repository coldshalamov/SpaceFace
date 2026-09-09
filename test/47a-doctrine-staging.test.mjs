import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { spawn47aScenarioCast } from '../src/data/scenarios/47aLiveScene.js';

const contract = JSON.parse(await readFile(
  new URL('../src/data/scenarios/47a.scenario.json', import.meta.url),
  'utf8',
));

function spawnColdCast() {
  let id = 10;
  const spawned = [];
  const state = { playerId: 1 };
  const cast = spawn47aScenarioCast({
    state,
    liveColdStartSafe: true,
    spawn(spec) {
      const entity = structuredClone(spec);
      entity.id = id++;
      entity.prevPos = { ...entity.pos };
      spawned.push(entity);
      return entity;
    },
  });
  return { cast, spawned };
}

test('47-A stages all three readable doctrines outside the lawful cold-open bubble', () => {
  const { cast } = spawnColdCast();
  const actors = [cast.interceptor, cast.harasser, cast.thief];
  assert.equal(actors.length, 3);
  assert.deepEqual(actors.map((entity) => entity.data.scenarioActorId), [
    'scavenger_interceptor',
    'scavenger_harasser',
    'scavenger_thief',
  ]);
  assert.deepEqual(actors.map((entity) => entity.data.ai.combatDoctrineId), [
    'interceptor_flyby',
    'ranged_disengager',
    'tether_control_raider',
  ]);
  for (const entity of actors) {
    assert.equal(entity.team, 0, `${entity.data.scenarioActorId} starts neutral`);
    assert.equal(entity.factionId, 'faction_free', `${entity.data.scenarioActorId} starts non-hostile`);
    assert.equal(entity.data.ai.passive, true, `${entity.data.scenarioActorId} starts passive`);
    assert.equal(entity.data.combat.targetId, null, `${entity.data.scenarioActorId} has no cold-open target`);
    assert(Math.hypot(entity.pos.x, entity.pos.z) >= 1500,
      `${entity.data.scenarioActorId} stages outside the 1500-WU cold-open bubble`);
  }

  const prospectivePlayer = { x: 1300, z: 0 };
  const ranges = actors.map((entity) => Math.hypot(
    entity.pos.x - prospectivePlayer.x,
    entity.pos.z - prospectivePlayer.z,
  ));
  assert(ranges[0] >= 420 && ranges[0] <= 650, 'interceptor begins one readable ingress away');
  assert(ranges[1] >= 600 && ranges[1] <= 1100, 'ranged actor begins in its standoff envelope');
  assert(ranges[2] >= 600 && ranges[2] <= 1100, 'tether raider begins outside instant-latch range');
});

test('the canonical scavenger beat requires the three doctrine actors', () => {
  const beat = contract.beats.find((entry) => entry.id === 'scavenger_arrival');
  assert(beat, 'scavenger_arrival beat exists');
  for (const actorId of ['scavenger_interceptor', 'scavenger_harasser', 'scavenger_thief']) {
    assert(beat.requiredActors.includes(actorId), `${actorId} is required by the live beat`);
    assert(contract.actors.some((actor) => actor.id === actorId), `${actorId} is a canonical actor`);
  }
});
