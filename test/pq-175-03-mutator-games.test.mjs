// PQ-175.03 — Mutators are games.
//
// Seed family 17530. Four weekly Crucible twists, four best builds.
// Compile-time strategy signatures. Hitch cannot fit M concussion.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CRUCIBLE_WEEKLY_ROTATION,
  CRUCIBLE_WEEKLY_STRATEGIES,
} from '../src/data/survivalMutators.js';
import {
  compileChallenge,
  strategyFitsHull,
  strategyIsLegal,
  topWeeklyStrategy,
  weeklyGameSignature,
} from '../src/systems/survivalMutators.js';

const SEEDS = Object.freeze(Array.from({ length: 10 }, (_, i) => 17530 + i));
const WAVE = 1;

const EXPECTED = Object.freeze({
  gravity_slalom: 'well_tag',
  heavies_only: 'heavy_throw',
  weapons_cold: 'cold_whip',
  reef: 'reef_bank',
});

const HITCH_CONCUSSION = Object.freeze({
  id: 'hitch_concussion',
  hullId: 'ship_kestrel',
  fittings: Object.freeze(['wpn_concussion_cannon_m']),
  verb: 'Throw',
});

test('four weekly mutators, four distinct top strategies on seed family 17530', () => {
  assert.deepEqual(CRUCIBLE_WEEKLY_ROTATION.slice(), [
    'gravity_slalom',
    'heavies_only',
    'weapons_cold',
    'reef',
  ]);
  assert.equal(CRUCIBLE_WEEKLY_STRATEGIES.length, 4);

  const heads = {};
  for (const id of CRUCIBLE_WEEKLY_ROTATION) {
    const rows = SEEDS.map((seed) => topWeeklyStrategy(id, seed));
    const strategyIds = new Set(rows.map((row) => row.strategyId));
    assert.equal(strategyIds.size, 1, `${id} must keep one top strategy across 17530..17539`);
    assert.equal(rows[0].strategyId, EXPECTED[id], id);
    assert.ok(rows[0].score > 0, id);
    heads[id] = rows[0];
  }

  const unique = new Set(CRUCIBLE_WEEKLY_ROTATION.map((id) => heads[id].strategyId));
  assert.equal(unique.size, 4);
  const signatures = new Set(CRUCIBLE_WEEKLY_ROTATION.map((id) => heads[id].signature));
  assert.equal(signatures.size, 4);
  const verbs = new Set(CRUCIBLE_WEEKLY_ROTATION.map((id) => heads[id].verb));
  assert.equal(verbs.size, 4);

  assert.equal(heads.gravity_slalom.verb, 'Tag');
  assert.equal(heads.gravity_slalom.hullId, 'ship_kestrel');
  assert.equal(heads.heavies_only.verb, 'Throw');
  assert.equal(heads.heavies_only.hullId, 'ship_hornet');
  assert.equal(heads.weapons_cold.verb, 'Whip');
  assert.equal(heads.weapons_cold.hullId, 'ship_drifter');
  assert.equal(heads.reef.verb, 'Bank');
  assert.equal(heads.reef.hullId, 'ship_kestrel');

  const slalom = compileChallenge(17530, ['gravity_slalom'], 'swarm');
  assert.equal(slalom.wellCount, 3);
  assert.equal(slalom.strategyId, 'well_tag');

  const heavies = compileChallenge(17530, ['heavies_only'], 'swarm');
  assert.ok(heavies.plannerMutators.includes('heavies_only'));
  assert.equal(heavies.strategyId, 'heavy_throw');

  const cold = compileChallenge(17530, ['weapons_cold'], 'swarm');
  assert.equal(cold.physicsOnly, true);
  assert.equal(cold.skipDraft, true);
  assert.equal(cold.strategyId, 'cold_whip');

  const reef = compileChallenge(17530, ['reef'], 'swarm');
  assert.equal(reef.reefLayoutId, 'crucible_reef');
  assert.equal(reef.strategyId, 'reef_bank');

  console.log(
    `STRATEGIES_17530 wave=${WAVE} `
    + CRUCIBLE_WEEKLY_ROTATION.map((id) => `${id}=${heads[id].strategyId}/${heads[id].verb}`).join(' | '),
  );
});

test('four weekly games keep distinct telemetry over 10 seeds', () => {
  const games = {};
  for (const id of CRUCIBLE_WEEKLY_ROTATION) {
    const rows = SEEDS.map((seed) => weeklyGameSignature(id, seed, WAVE));
    const signatures = new Set(rows.map((row) => row.game));
    assert.equal(signatures.size, 1, `${id} must be one game across 17530..17539`);
    games[id] = rows[0];
  }
  assert.equal(games.gravity_slalom.wellCount, 3);
  assert.equal(games.heavies_only.heavyCount, 10);
  assert.equal(games.heavies_only.fodder, 0);
  assert.equal(games.weapons_cold.physicsOnly, true);
  assert.equal(games.reef.reefLayoutId, 'crucible_reef');
  const unique = new Set(CRUCIBLE_WEEKLY_ROTATION.map((id) => games[id].game));
  assert.equal(unique.size, 4, JSON.stringify(games, null, 2));
  const strategies = new Set(CRUCIBLE_WEEKLY_ROTATION.map((id) => games[id].strategyId));
  assert.equal(strategies.size, 4);
  console.log(
    `GAMES_17530 `
    + CRUCIBLE_WEEKLY_ROTATION.map((id) => `${id}=${games[id].game}/${games[id].strategyId}`).join(' | '),
  );
});

test('Hitch cannot fit M concussion; Hornet can', () => {
  assert.equal(strategyFitsHull(HITCH_CONCUSSION), false);
  assert.equal(strategyFitsHull({
    hullId: 'ship_hornet',
    fittings: ['wpn_concussion_cannon_m'],
  }), true);
  assert.equal(strategyFitsHull({
    hullId: 'ship_kestrel',
    fittings: ['mod_elastic_whip_m'],
  }), false);
  assert.equal(strategyFitsHull({
    hullId: 'ship_drifter',
    fittings: ['mod_elastic_whip_m'],
  }), true);
});

test('weapons cold rejects a gun kit; whip stays legal', () => {
  const challenge = compileChallenge(17530, ['weapons_cold'], 'swarm');
  assert.equal(strategyIsLegal({
    id: 'gun',
    hullId: 'ship_hornet',
    fittings: ['wpn_concussion_cannon_m'],
    verb: 'Throw',
  }, challenge), false);
  assert.equal(strategyIsLegal({
    id: 'well_tag',
    hullId: 'ship_kestrel',
    fittings: ['wpn_gravity_marker_s'],
    verb: 'Tag',
  }, challenge), false);
  assert.equal(strategyIsLegal({
    id: 'cold_whip',
    hullId: 'ship_drifter',
    fittings: ['mod_elastic_whip_m'],
    verb: 'Whip',
  }, challenge), true);
});
