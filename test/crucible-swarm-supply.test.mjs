// PQ-135 — repair cells. An endless mode with no way back is a stopwatch, not a game.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SWARM_REPAIR_HEALTHY_AT,
  SWARM_REPAIR_HURT_AT,
  SWARM_REPAIR_INTERVAL_HEALTHY,
  SWARM_REPAIR_INTERVAL_HURT,
  SWARM_REPAIR_KIND,
  SWARM_REPAIR_TTL_S,
  swarmRepairAmount,
  swarmRepairInterval,
  swarmSupply,
} from '../src/systems/swarmSupply.js';
import { PRODUCTION_INIT_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const SEED = 4242;
const ARENA = 'helios_core';
const HULL_MAX = 200;

function boot({ ruleset = SWARM_RULESET, hull = HULL_MAX } = {}) {
  const state = createGameState(SEED);
  const bus = createBus();
  const emitted = [];
  const wrapped = {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    once: bus.once.bind(bus),
    emit(event, payload) { emitted.push({ event, payload }); bus.emit(event, payload); },
  };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { ...spec.pos } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      wrapped.emit('entity:spawned', { id, type: entity.type, entity });
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship',
    hull, hullMax: HULL_MAX,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  const ctx = { state, bus: wrapped, helpers };
  runSession.init(ctx);
  swarmSupply.init(ctx);
  wrapped.emit('run:beginRequested', { kind: 'survival', ruleset, seed: SEED, arenaId: ARENA });
  return { state, bus: wrapped, emitted, helpers, player, ctx };
}

let bodyN = 0;
function killCohortBody(h, { cohort = SURVIVAL_COHORT_TAG, killerId = null } = {}) {
  const id = h.state.nextEntityId++;
  const victim = {
    id, alive: true, type: 'ship', pos: { x: 30 + (bodyN++ % 7), z: -10 },
    vel: { x: 4, z: 0 }, data: cohort ? { runCohort: cohort } : {},
  };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id, killerId: killerId == null ? h.state.playerId : killerId,
    type: 'ship', pos: { ...victim.pos },
  });
  return victim;
}

function cells(h) {
  return h.state.entityList.filter(
    (e) => e.alive !== false && e.type === 'pickup' && e.data && e.data.kind === SWARM_REPAIR_KIND,
  );
}

/** Scoop a cell the way mining's generic collector does. */
function scoop(h, cell) {
  h.bus.emit('pickup:collected', {
    pickupId: cell.id,
    collectorId: h.state.playerId,
    kind: cell.data.kind,
    amount: cell.data.amount,
    pos: { ...cell.pos },
  });
}

test('swarmSupply is in the production init order and never ticks', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('swarmSupply'));
  assert.equal(typeof swarmSupply.update, 'function');
});

test('the drop interval tightens as the hull falls, on one publishable line', () => {
  assert.equal(swarmRepairInterval(1), SWARM_REPAIR_INTERVAL_HEALTHY);
  assert.equal(swarmRepairInterval(SWARM_REPAIR_HEALTHY_AT), SWARM_REPAIR_INTERVAL_HEALTHY);
  assert.equal(swarmRepairInterval(SWARM_REPAIR_HURT_AT), SWARM_REPAIR_INTERVAL_HURT);
  assert.equal(swarmRepairInterval(0), SWARM_REPAIR_INTERVAL_HURT);
  // Monotone in between: more trouble is never a longer wait.
  let previous = SWARM_REPAIR_INTERVAL_HEALTHY;
  for (let f = 1; f >= 0; f -= 0.05) {
    const interval = swarmRepairInterval(f);
    assert.ok(interval <= previous, `interval never grows as hull falls (at ${f.toFixed(2)})`);
    previous = interval;
  }
  assert.equal(swarmRepairInterval(NaN), SWARM_REPAIR_INTERVAL_HEALTHY, 'garbage reads as healthy');
});

test('a full hull earns no cells at all — a repair that repairs nothing is litter', () => {
  const h = boot({ hull: HULL_MAX });
  for (let i = 0; i < 60; i++) killCohortBody(h);
  assert.equal(cells(h).length, 0);
});

test('a hurt hull gets a cell, and it drops where the body died — inside the swarm', () => {
  const h = boot({ hull: HULL_MAX * 0.5 });
  const interval = swarmRepairInterval(0.5);
  let last = null;
  for (let i = 0; i < interval; i++) last = killCohortBody(h);
  const dropped = cells(h);
  assert.equal(dropped.length, 1, `one cell after ${interval} kills`);
  const cell = dropped[0];
  assert.ok(
    Math.hypot(cell.pos.x - last.pos.x, cell.pos.z - last.pos.z) < 1,
    'it is on the corpse, not next to the player',
  );
  assert.ok(cell.data.despawnAt > 0, 'and it is on a clock');
  assert.ok(Number.isFinite(SWARM_REPAIR_TTL_S) && SWARM_REPAIR_TTL_S > 0);
});

test('a nearly dead hull gets them much faster', () => {
  const hurt = boot({ hull: HULL_MAX * 0.2 });
  for (let i = 0; i < SWARM_REPAIR_INTERVAL_HURT; i++) killCohortBody(hurt);
  assert.equal(cells(hurt).length, 1);

  const healthy = boot({ hull: HULL_MAX * 0.9 });
  for (let i = 0; i < SWARM_REPAIR_INTERVAL_HURT; i++) killCohortBody(healthy);
  assert.equal(cells(healthy).length, 0, 'a healthy hull waits longer for the same kills');
});

test('scooping one tops the hull up without ever exceeding it', () => {
  const h = boot({ hull: HULL_MAX * 0.5 });
  for (let i = 0; i < swarmRepairInterval(0.5); i++) killCohortBody(h);
  const cell = cells(h)[0];
  const before = h.player.hull;
  scoop(h, cell);
  assert.equal(h.player.hull, before + swarmRepairAmount(HULL_MAX));
  assert.ok(h.player.hull <= HULL_MAX);

  // A second cell on a nearly full hull clamps rather than overfilling.
  h.player.hull = HULL_MAX - 3;
  const h2 = boot({ hull: HULL_MAX - 3 });
  for (let i = 0; i < swarmRepairInterval((HULL_MAX - 3) / HULL_MAX); i++) killCohortBody(h2);
  const cell2 = cells(h2)[0];
  scoop(h2, cell2);
  assert.equal(h2.player.hull, HULL_MAX);
});

test('a cell is claimed by ID, so both publishers of pickup:collected work', () => {
  // physics' contact-collect payload carries no `wallet` and no `kind` — the exact shape that once
  // made a chip the ship physically touched pay nothing. Claiming by id is the fix.
  const h = boot({ hull: HULL_MAX * 0.5 });
  for (let i = 0; i < swarmRepairInterval(0.5); i++) killCohortBody(h);
  const cell = cells(h)[0];
  const before = h.player.hull;
  h.bus.emit('pickup:collected', { pickupId: cell.id, collectorId: h.state.playerId });
  assert.equal(h.player.hull, before + swarmRepairAmount(HULL_MAX), 'a bare payload still pays');
});

test('a cell pays exactly once, however many receipts arrive', () => {
  const h = boot({ hull: HULL_MAX * 0.5 });
  for (let i = 0; i < swarmRepairInterval(0.5); i++) killCohortBody(h);
  const cell = cells(h)[0];
  const before = h.player.hull;
  scoop(h, cell);
  scoop(h, cell);
  scoop(h, cell);
  assert.equal(h.player.hull, before + swarmRepairAmount(HULL_MAX));
});

test('the room’s kills count toward the next cell too', () => {
  const h = boot({ hull: HULL_MAX * 0.5 });
  const interval = swarmRepairInterval(0.5);
  for (let i = 0; i < interval; i++) killCohortBody(h, { killerId: 9999 });
  assert.equal(cells(h).length, 1, 'a mine kill is still the run’s kill');
});

test('ambient traffic never drops a cell, and neither does the Gauntlet', () => {
  const bystanders = boot({ hull: HULL_MAX * 0.5 });
  for (let i = 0; i < 40; i++) killCohortBody(bystanders, { cohort: null });
  assert.equal(cells(bystanders).length, 0);

  const arc = boot({ ruleset: 'scored', hull: HULL_MAX * 0.5 });
  for (let i = 0; i < 40; i++) killCohortBody(arc);
  assert.equal(cells(arc).length, 0, 'the authored arc is untouched');
});
