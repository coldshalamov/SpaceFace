import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { swarmSupply, SWARM_REPAIR_KIND, swarmRepairInterval } from '../src/systems/swarmSupply.js';

function fixture() {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight';
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    { wave: 1, phase: 'active' });
  const player = { id: state.nextEntityId++, type: 'ship', alive: true,
    hull: 40, hullMax: 200, radius: 8, mass: 400, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player); state.entityList.push(player);
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [] };
  const helpers = { spawnEntity(spec) {
    const e = { ...spec, id: state.nextEntityId++, alive: true };
    state.entities.set(e.id, e); state.entityList.push(e);
    bus.emit('entity:spawned', { entity: e });
    return e;
  } };
  const supply = Object.create(swarmSupply);
  supply.init({ state, bus, helpers });
  const cells = () => state.entityList.filter(e => e.alive && e.data?.kind === SWARM_REPAIR_KIND);
  const receipt = (count, extra = {}) => bus.emit('swarm:broodKills', {
    count, wave: state.run.wave, pos: { x: 320, z: -80 }, ...extra });
  return { state, bus, player, helpers, supply, cells, receipt };
}

test('native Brood explosion kills open the ordinary scoopable recovery opportunity', () => {
  const h = fixture();
  const engine = createBroodEngine({ getState: () => h.state, bus: h.bus, fieldList: () => [] });
  engine.prepareWave(h.state.run, 1); engine.spawnWave(h.state);
  assert.ok(engine.census().alive >= 20);
  engine.onExplosion({ pos: { x: 320, z: -80 }, radius: 100000, ownerId: h.player.id });
  assert.equal(engine.census().alive, 0);
  assert.equal(h.cells().length, 3, 'one large room wipe offers bounded recovery');
  const cell = h.cells()[0];
  assert.deepEqual(cell.pos, { x: 320, z: -80 }, 'the pickup stays at the real blast receipt');
  assert.ok(Number.isFinite(cell.data.despawnAt));
  h.bus.emit('pickup:collected', { pickupId: cell.id, collectorId: h.player.id });
  assert.equal(h.player.hull, 84, 'Brood supply uses the existing 22% hull scoop');
  h.supply.destroy();
});

test('Brood and ship kills share the same repair tally, with no duplicate corpse credit', () => {
  const h = fixture(), interval = swarmRepairInterval(0.2);
  h.receipt(interval - 1);
  assert.equal(h.cells().length, 0);
  const victim = h.helpers.spawnEntity({ type: 'ship', pos: { x: 120, z: 50 },
    vel: { x: 0, z: 0 }, data: { runCohort: 'survival' } });
  victim.alive = false;
  h.bus.emit('entity:killed', { id: victim.id });
  assert.equal(h.cells().length, 1);
  assert.deepEqual(h.cells()[0].pos, victim.pos);
  for (let i = 0; i < interval; i++) h.bus.emit('entity:killed', { id: victim.id });
  assert.equal(h.cells().length, 1, 'one body cannot manufacture repeated repair drops');
  h.supply.destroy();
});

test('expired cells free the live supply budget and old/uncredited receipts earn nothing', () => {
  const h = fixture(), interval = swarmRepairInterval(0.2);
  h.receipt(400);
  assert.equal(h.cells().length, 3);
  h.receipt(400);
  assert.equal(h.cells().length, 3);
  for (const cell of h.cells()) cell.alive = false;
  h.receipt(0, { removedCount: 400, environmentalCount: 400 });
  h.receipt(interval, { wave: h.state.run.wave - 1 });
  assert.equal(h.cells().length, 0);
  h.receipt(interval);
  assert.equal(h.cells().length, 1);
  h.state.run.phase = 'draft';
  h.receipt(interval);
  assert.equal(h.cells().length, 1);
  h.supply.destroy();
});
