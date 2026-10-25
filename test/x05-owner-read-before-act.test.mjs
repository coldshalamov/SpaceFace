// X-05 (row 563): read the owner before the act. A titled chip carries its cutter's name, and
// the first owned lot inside reach speaks its consequence once — anchored to the lot.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { createSimulation } from '../src/core/sim.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { mining } from '../src/systems/mining.js';
import { onboarding } from '../src/systems/onboarding.js';
import { FIRST_USE_LINE, firstUseAttachKind } from '../src/ui/hudAttention.js';

function bargeBoot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [world, traffic, npcJobsRuntime, mining] });
  sim.state.mode = 'flight';
  sim.state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
    radius: 12, hull: 100, hullMax: 100 }).id;
  sim.registry.get('world').enterSector('sector_helios_prime');
  sim.step(1 / 60);
  const rec = sim.state.traffic.freighters.find((r) => r.role === 'ore_carrier');
  const barge = sim.state.entities.get(rec.id);
  const refinery = sim.state.entityList.find((e) => e.data?.stationId === 'station_helios');
  return { sim, rec, barge, refinery, owner: sim.registry.get('traffic') };
}

function cutChip(h, wrId) {
  // A claim chip off the starter seam, titled by the next barge pass — the body shape
  // npcMiningSource produces in production.
  const chip = {
    id: 9000 + h.sim.state.entityList.length, type: 'pickup', alive: true,
    pos: { x: h.barge.pos.x + 40, z: h.barge.pos.z }, vel: { x: 0, z: 0 }, radius: 4,
    data: {
      amount: 6, commodityId: 'cmdty_silicate',
      npcMiningSource: { fieldId: 'f_helios_starter', minerWorldRecordId: wrId },
    },
  };
  h.sim.state.entities.set(chip.id, chip);
  h.sim.state.entityList.push(chip);
  if (h.sim.state.entityIndex && Array.isArray(h.sim.state.entityIndex.pickups)) {
    h.sim.state.entityIndex.pickups.push(chip);
  }
  return chip;
}

test('X-05 a barge titling a chip stamps ownerId AND the cutter name', () => {
  const h = bargeBoot();
  const chip = cutChip(h, h.barge.data.worldRecordId);
  h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
  assert.equal(chip.data.ownerId, h.barge.data.worldRecordId,
    'title rides the cutter stable record');
  assert.equal(chip.data.ownerName,
    h.barge.name || h.barge.data.name || 'Claim crew',
    'the panel Owner: fact resolves off the freighter row');
  h.sim.dispose();
});

test('X-05 a cutter-less title falls back to Claim crew', () => {
  const h = bargeBoot();
  const chip = cutChip(h, 'wr_ghost_cutter'); // no freighter row resolves this record
  h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
  assert.equal(chip.data.ownerId, 'wr_ghost_cutter');
  assert.equal(chip.data.ownerName, 'Claim crew', 'an unresolvable cutter still names an owner');
  h.sim.dispose();
});

function onboardingRig(entities, { railActive = false } = {}) {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 };
  const state = {
    mode: 'flight', playerId: 1, simTime: 0, tick: 0, meta: { seed: 4242 }, rng: mulberry32(4242),
    player: { hints: {}, cargo: { items: {} } },
    input: { aimAngle: 0, fireGroup: 0, actions: {} },
    entities: new Map([[1, player], ...entities.map((e) => [e.id, e])]),
    entityList: [player, ...entities],
    world: { currentSectorId: 'sector_helios_prime' },
    onboarding: { active: railActive, finished: !railActive },
    settings: { gameplay: {} }, ui: {},
    missions: { active: [] },
  };
  const bus = createBus();
  const hints = [];
  bus.on('hud:firstUse', (p) => hints.push(p));
  const ob = { ...onboarding };
  ob.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } }, registry: { get: () => null } });
  return { state, bus, hints, player, ob };
}

function tickScan(h, ticks = 20) {
  for (let i = 0; i < ticks; i++) {
    h.state.tick += 1; h.state.simTime += 1 / 60;
    h.ob.update(0.25, h.state);
  }
}

test('X-05 an owned lot within 220 wu after the rail speaks once, anchored to the lot', () => {
  const pod = { id: 50, type: 'payload', alive: true, pos: { x: 180, z: 0 }, vel: { x: 0, z: 0 },
    data: { ownerId: 'wr_miner_ves' } };
  const pod2 = { id: 51, type: 'payload', alive: true, pos: { x: 150, z: 0 }, vel: { x: 0, z: 0 },
    data: { ownerId: 'wr_other' } };
  const h = onboardingRig([pod, pod2]);
  tickScan(h);
  const lines = h.hints.filter((e) => e.verbId === 'firstOwnedGoods');
  assert.equal(lines.length, 1, 'exactly one read');
  assert.ok(lines[0].entityId === 50 || lines[0].entityId === 51, 'anchored to an owned lot');
  assert.equal(h.state.player.hints.firstOwnedGoods, true);
  tickScan(h, 40);
  assert.equal(h.hints.filter((e) => e.verbId === 'firstOwnedGoods').length, 1, 'and never again');
});

test('X-05 the player own lot, a custody pod, and an untitled chip stay silent', () => {
  const own = { id: 60, type: 'payload', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    data: { ownerId: 1 } }; // the player's own lot
  const custody = { id: 61, type: 'payload', alive: true, pos: { x: 110, z: 0 }, vel: { x: 0, z: 0 },
    data: { ownerId: 'wr_hauler_9', freightCustodyPod: true } };
  const scrap = { id: 62, type: 'pickup', alive: true, pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 },
    data: { amount: 3, commodityId: 'cmdty_silicate' } };
  const h = onboardingRig([own, custody, scrap]);
  tickScan(h, 40);
  assert.equal(h.hints.filter((e) => e.verbId === 'firstOwnedGoods').length, 0);
});

test('X-05 the rail owns the voice — no read fires while it runs', () => {
  const pod = { id: 70, type: 'payload', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    data: { ownerId: 'wr_miner_ves' } };
  const h = onboardingRig([pod], { railActive: true });
  tickScan(h, 40);
  assert.equal(h.hints.length, 0, 'nothing speaks during the rail');
  assert.equal(h.state.player.hints.firstOwnedGoods == null, true, 'and the key is not spent');
});

test('X-05 the read attaches as rock; the line is the approved copy', () => {
  assert.equal(firstUseAttachKind('firstOwnedGoods'), 'rock');
  assert.equal(FIRST_USE_LINE.firstOwnedGoods,
    'Someone owns that lot. Lift it in sight, you\'re wanted.');
});
