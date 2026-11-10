// inf-throw-carries — the pilot's throw survives the buzzer.
//
// Seed: "debris that keeps momentum and becomes the next round's terrain." The round settle
// (`_settleRoom`) parks every drifting rock between rounds because ANONYMOUS leftover drift
// killed four hulls in a next round's first second. But the monolith the pilot spent the round
// winding up through the well is aimed — the buzzer erasing it throws away the one thing the
// pilot earned. Now the newest impulse provenance on the body names the thrower: a bounded few
// pilot-thrown bodies keep their speed into the next round, the room says so on the one-voice
// alert floor, and everything nobody claimed still settles.
//
// Driven through the real system on the production route (bus `run:wavePlanned` →
// `_onWavePlanned` → `_settleRoom`), with a physics port spy where Rapier sits.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { SWARM_DEBRIS_TAG, swarmArena } from '../src/systems/swarmArena.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const SEED = 4242;
const ARENA = 'helios_core';

function boot() {
  const state = createGameState(SEED);
  const bus = createBus();
  const settledIds = [];
  const helpers = {
    combatPhysics: {
      settlePassiveBody(input) { settledIds.push(input.entityId); return true; },
      applyImpulse(input) { settledIds.push(input.entityId); return true; },
    },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  const receipts = { alerts: [], carried: [] };
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  bus.on('alert', (p) => receipts.alerts.push(p));
  bus.on('swarmArena:debrisCarried', (p) => receipts.carried.push(p));
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA });
  bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed: SEED, arenaId: ARENA, wave: 1, ruleset: SWARM_RULESET }) });
  return { state, bus, helpers, player, receipts, settledIds };
}

function rocks(h) {
  return h.state.entityList.filter((e) => e.alive !== false && e.data && e.data[SWARM_DEBRIS_TAG]);
}

function thrown(rock, h, { actorId, tag = 'massline_throw', appliedTick, speed = 30 }) {
  rock.vel = { x: speed, z: 0 };
  recordImpulseProvenance(rock, { actorId, tag, appliedTick, magnitude: speed });
}

function crossWave(h, wave) {
  h.bus.emit('run:wavePlanned', { wave, plan: planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET }) });
}

test('the rock the pilot threw keeps its speed across the buzzer; anonymous drift still settles', () => {
  const h = boot();
  const [a, b, c, d] = rocks(h);
  h.state.tick = 100;
  thrown(a, h, { actorId: h.player.id, appliedTick: 100 });            // the pilot's throw
  thrown(b, h, { actorId: 987654, appliedTick: 100 });                 // somebody else's
  c.vel = { x: 30, z: 0 };                                             // nobody's
  thrown(d, h, { actorId: h.player.id, appliedTick: 100, speed: 3 });  // already at rest speed

  crossWave(h, 2);

  assert.ok(!h.settledIds.includes(a.id), 'the pilot-thrown rock was not settled');
  assert.ok(h.settledIds.includes(b.id), 'an NPC-thrown rock still settles');
  assert.ok(h.settledIds.includes(c.id), 'anonymous drift still settles');
  assert.ok(h.settledIds.includes(d.id), 'a slow throw is below the carry floor and settles');
  assert.equal(h.receipts.carried.length, 1, 'one carried receipt');
  assert.deepEqual(h.receipts.carried[0].ids, [a.id]);
  assert.equal(h.receipts.carried[0].count, 1);
  assert.equal(h.receipts.carried[0].wave, 2);
  assert.ok(h.receipts.alerts.some((p) => /YOUR THROW IS STILL IN HERE/.test(p.text)),
    'the room names the moment on the alert floor');
});

test('the carry is rare: at most three bodies keep going, the slowest of the pack settles', () => {
  const h = boot();
  const field = rocks(h);
  h.state.tick = 100;
  const picks = field.slice(0, 4);
  const speeds = [40, 34, 28, 22];
  picks.forEach((rock, i) => thrown(rock, h, { actorId: h.player.id, appliedTick: 100, speed: speeds[i] }));

  crossWave(h, 2);

  const carriedIds = new Set(h.receipts.carried[0].ids);
  assert.equal(carriedIds.size, 3, 'the carry cap holds');
  assert.ok(!carriedIds.has(picks[3].id), 'the slowest throw settles');
  assert.ok(!h.settledIds.includes(picks[0].id), 'the fastest throw keeps going');
});

test('equal-speed ties break on id, never on insertion order', () => {
  const h = boot();
  const field = rocks(h);
  h.state.tick = 100;
  const [late, early] = field.slice(0, 2);
  const order = [late, early].sort((x, y) => x.id - y.id);
  thrown(late, h, { actorId: h.player.id, appliedTick: 100, speed: 30 });
  thrown(early, h, { actorId: h.player.id, appliedTick: 100, speed: 30 });

  crossWave(h, 2);

  const carriedIds = h.receipts.carried[0].ids;
  assert.equal(carriedIds.length, 2, 'both equal-speed carries fit the cap here');
  assert.deepEqual([...carriedIds].sort((x, y) => x - y), [order[0].id, order[1].id]);
});

test('a throw the pilot never claimed again settles: stale provenance does not carry', () => {
  const h = boot();
  const [a] = rocks(h);
  h.state.tick = 4000;
  thrown(a, h, { actorId: h.player.id, appliedTick: 100 }); // 3900 ticks old > the 2700 window

  crossWave(h, 2);

  assert.ok(h.settledIds.includes(a.id), 'a 45 s-old throw is the room again');
  assert.equal(h.receipts.carried.length, 0, 'no carried receipt for stale provenance');
});

test('a pilot impulse that is not a throw does not carry: weapons fire settles like anything else', () => {
  const h = boot();
  const [a] = rocks(h);
  h.state.tick = 100;
  thrown(a, h, { actorId: h.player.id, tag: 'kinetic', appliedTick: 100 });

  crossWave(h, 2);

  assert.ok(h.settledIds.includes(a.id), 'a weapons tag is not a thrown rock');
  assert.equal(h.receipts.carried.length, 0);
});
