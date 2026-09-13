import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { COHORT_RECIPE_RIVER } from '../src/ai/fodderCohort.js';
import { gatherCohorts, markCheapCohortMembers } from '../src/systems/tacticalAI.js';
import { indexedShipLikeScan } from '../src/world/livingWorldViews.js';

function ship(id, extras = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: extras.team == null ? 1 : extras.team,
    pos: { x: extras.x || 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    data: {
      ai: {
        passive: extras.passive === true,
        allowPassiveManeuver: extras.allowPassiveManeuver === true,
        cohortRecipe: extras.cohort ? COHORT_RECIPE_RIVER : null,
        ...(extras.ai || {}),
      },
    },
  };
}

function rock(id) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    pos: { x: 4000, z: 0 },
    radius: 12,
    data: { oreHP: 10 },
  };
}

test('tactical AI cheap-cohort stamp walks shipLike, not the fat rock list', () => {
  const player = ship(1, { team: 0 });
  player.isPlayer = true;
  const fodder = ship(2, { cohort: true, x: 40 });
  const rocks = [];
  for (let i = 0; i < 80; i++) rocks.push(rock(100 + i));
  const list = [player, fodder, ...rocks];
  let fatReads = 0;
  const state = {
    tick: 4,
    simTime: 4 / 60,
    playerId: 1,
    mode: 'flight',
    entities: new Map(list.map((entity) => [entity.id, entity])),
    get entityList() {
      fatReads += 1;
      return list;
    },
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      shipLike: [player, fodder],
      asteroids: rocks,
    },
    combat: { trace: { events: [] } },
    runtime: { profileId: 'production' },
  };

  assert.equal(indexedShipLikeScan(state), state.entityIndex.shipLike);
  assert.equal(indexedShipLikeScan(state).includes(rocks[0]), false);

  const before = fatReads;
  markCheapCohortMembers(state);
  const groups = gatherCohorts(state);
  assert.equal(fodder.data.ai.passive, true);
  assert.equal(fodder.data.ai.allowPassiveManeuver, false);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members[0], fodder);
  assert.equal(fatReads, before, 'tactical AI must not reread entityList when shipLike is ready');
});

test('60 Hz ship scanners use the compact shipLike scan, not the fat master list', async () => {
  const files = [
    'src/systems/tacticalAI.js',
    'src/systems/flybyFocus.js',
    'src/systems/pirateParley.js',
    'src/systems/pirateDisengage.js',
    'src/systems/aiEncounter.js',
    'src/systems/encounterDirector.js',
    'src/systems/aiFireIntent.js',
    'src/ai/pdScreen.js',
    'src/systems/bountyHunt.js',
    'src/systems/factionPresence.js',
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /indexedShipLikeScan/, `${file} must scan shipLike`);
  }
  const bark = await readFile(new URL('../src/systems/barkDirector.js', import.meta.url), 'utf8');
  assert.match(bark, /forEachLivingWorldActor/);
  const cruise = await readFile(new URL('../src/systems/cruise.js', import.meta.url), 'utf8');
  assert.match(cruise, /queryNearbyEntities/);
  assert.match(cruise, /MASS_LOCK_RADIUS/);
});
