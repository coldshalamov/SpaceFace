// SEED-SW-15 — the synthesis shelf holds at least ten named trades.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { SURVIVAL_EVOLUTIONS, evolutionOffersFor } from '../src/data/survivalEvolutions.js';
import { buildSlotList } from '../src/systems/ships.js';

const SEED = 4242;
const SIZE_RANK = { S: 1, M: 2, L: 3 };
const MODULE_BY_ID = new Map(MODULES.map((def) => [def.id, def]));

function hawserBuild(partIds) {
  const hull = SHIPS.find((ship) => ship.id === 'ship_hawser');
  const slots = buildSlotList(hull);
  const fittings = new Array(slots.length).fill(null);
  fittings[0] = 'wpn_pulse_laser_m';
  return {
    hullId: 'ship_hawser',
    slots,
    fittings,
    moduleInventory: partIds.map((defId, index) => ({ instanceId: index + 1, defId })),
  };
}

test('ten named trades each spend at least two held parts on one existing module', () => {
  const state = createGameState(SEED);
  assert.equal(state.meta.seed, SEED);
  state.simTime = 0;
  assert.equal(typeof state.rng(), 'number');

  assert.ok(SURVIVAL_EVOLUTIONS.length >= 10, `shelf has ${SURVIVAL_EVOLUTIONS.length}`);
  const seen = new Set();
  for (const evo of SURVIVAL_EVOLUTIONS) {
    assert.equal(seen.has(evo.id), false, `${evo.id} is named once`);
    seen.add(evo.id);
    assert.equal(evo.verb, 'Evolve');
    assert.ok(evo.consumes.length >= 2, `${evo.id} consumes at least two parts`);
    assert.equal(evo.consumes.includes(evo.defId), false, `${evo.id} does not consume its own result`);
    const result = MODULE_BY_ID.get(evo.defId);
    assert.ok(result, `${evo.defId} is an existing module`);
    let smallest = Infinity;
    for (const defId of evo.consumes) {
      const part = MODULE_BY_ID.get(defId);
      assert.ok(part, `${defId} is an existing module`);
      assert.equal(part.slotType, result.slotType, `${evo.id} stays on the ${result.slotType} bay`);
      smallest = Math.min(smallest, SIZE_RANK[part.size]);
    }
    assert.ok(SIZE_RANK[result.size] <= smallest, `${evo.id} lands in a slot the spent parts already fit`);
  }
});

test('two different part sets on one hull get two different offers', () => {
  const state = createGameState(SEED);
  state.simTime = 0;
  state.rng();

  const gravity = ['mod_gravity_bumper_s', 'mod_ram_plate'];
  const drive = ['mod_engine_sprint_m', 'mod_engine_endurance_m'];
  const both = evolutionOffersFor(hawserBuild([...gravity, ...drive]));
  const gravityOffer = both.find((offer) => offer.id === 'evo_long_gravity');
  const driveOffer = both.find((offer) => offer.id === 'evo_fusion_drive');
  assert.ok(gravityOffer, 'the gravity pair is offered');
  assert.ok(driveOffer, 'the drive pair is offered');
  assert.notEqual(gravityOffer.defId, driveOffer.defId);
  assert.equal(both.length, 2, 'those two piles are the only trades this hull can take');

  const onlyGravity = evolutionOffersFor(hawserBuild(gravity));
  assert.deepEqual(onlyGravity.map((offer) => offer.id), ['evo_long_gravity']);
  const onlyDrive = evolutionOffersFor(hawserBuild(drive));
  assert.deepEqual(onlyDrive.map((offer) => offer.id), ['evo_fusion_drive']);
});
