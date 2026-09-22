import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { HITSTUN_IMPULSE_EVENT } from '../src/combat/impulseKernel.js';
import {
  barkDirector,
  BODY_NEAR_MISS_COOLDOWN_TICKS,
} from '../src/systems/barkDirector.js';

const THROW_TEXT = 'That thrown hull nearly hit us. Clear the lane!';
const SHOVE_TEXT = 'That loose hull nearly hit us. Clear the lane!';

function makeHarness() {
  const bus = createBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: 1,
    entities,
    entityList,
    meta: { seed: 5150 },
    world: {},
    story: { titles: { byId: {} } },
    settings: { audio: {}, accessibility: {} },
    heat: { wanted: false, level: 0, fines: 0 },
    law: { fines: 0, citations: [] },
  };
  const add = (spec) => {
    const entity = {
      id: spec.id,
      type: spec.type || 'ship',
      team: spec.team ?? 1,
      alive: true,
      radius: spec.radius ?? 4,
      pos: { x: spec.x ?? 0, z: spec.z ?? 0 },
      vel: { x: 0, z: 0 },
      data: spec.data || {},
    };
    entities.set(entity.id, entity);
    entityList.push(entity);
    return entity;
  };
  add({ id: 1, type: 'ship', team: 0, x: 5000, z: 5000 });
  const says = [];
  const nearMissReceipts = [];
  const voiceReceipts = [];
  bus.on('barkDirector:bodyNearMiss', (p) => nearMissReceipts.push(p));
  bus.on('barkDirector:voice', (p) => voiceReceipts.push(p));
  const voice = { say: (req) => { says.push(req); return true; } };
  barkDirector.init({ state, bus, helpers: { voice } });
  const step = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      state.tick += 1;
      state.simTime = state.tick / 60;
      barkDirector.update(1 / 60, state);
    }
  };
  const heatSnapshot = () => JSON.stringify({ heat: state.heat, law: state.law });
  return { bus, state, add, says, nearMissReceipts, voiceReceipts, step, heatSnapshot, heatAtInit: heatSnapshot() };
}

function runPass(h, body) {
  for (const x of [-60, -30, -5, 0, 5]) {
    body.pos.x = x;
    h.step();
  }
}

test.afterEach(() => { barkDirector.destroy(); });

test('a thrown hull passing a civilian earns exactly one near-miss bark', () => {
  const h = makeHarness();
  const body = h.add({ id: 20, type: 'ship', team: 1, radius: 4, x: -400, z: 0 });
  const witness = h.add({ id: 30, type: 'ship', team: 2, radius: 6, x: 0, z: 15 });
  h.bus.emit('tether:released', { targetId: body.id });
  h.step();
  assert.equal(h.says.length, 0, 'far approach must stay silent');
  body.pos.x = -60; h.step();
  body.pos.x = -30; h.step();
  body.pos.x = -5; h.step();
  body.pos.x = 0; h.step();
  assert.equal(h.says.length, 0, 'the closest approach itself must stay silent');
  body.pos.x = 5; h.step();
  assert.equal(h.says.length, 1, 'departure after a <70 WU pass speaks once');
  assert.equal(h.says[0].channel, 'bark');
  assert.equal(h.says[0].kind, 'bodyNearMiss');
  assert.equal(h.says[0].text, THROW_TEXT);
  assert.equal(h.says[0].id, `bodyNearMiss:${body.id}:${witness.id}:6`);
  assert.equal(h.nearMissReceipts.length, 1);
  assert.equal(h.nearMissReceipts[0].entityId, witness.id);
  assert.equal(h.nearMissReceipts[0].bodyId, body.id);
  assert.equal(h.nearMissReceipts[0].source, 'throw');
  assert.ok(Math.abs(h.nearMissReceipts[0].closestWu - 15) < 1e-9);
  for (const x of [20, 35, 60]) { body.pos.x = x; h.step(); }
  body.pos.x = 35; h.step();
  body.pos.x = 20; h.step();
  assert.equal(h.says.length, 1, 'repeated near samples in the same pass must not re-bark');
  assert.equal(h.nearMissReceipts.length, 1);
  assert.equal(h.state.heat.wanted, false);
  assert.equal(h.state.heat.fines, 0);
  assert.equal(h.heatSnapshot(), h.heatAtInit, 'near-miss barking must not write heat or fines');
});

test('a second pass after exit and cooldown earns exactly one more bark', () => {
  const h = makeHarness();
  const body = h.add({ id: 21, type: 'ship', team: 1, radius: 4, x: -400, z: 0 });
  h.add({ id: 31, type: 'ship', team: 2, radius: 6, x: 0, z: 15 });
  h.bus.emit('tether:released', { targetId: body.id });
  runPass(h, body);
  assert.equal(h.says.length, 1);
  body.pos.x = 400;
  h.state.tick += BODY_NEAR_MISS_COOLDOWN_TICKS + 5;
  h.step();
  runPass(h, body);
  assert.equal(h.says.length, 2, 'a re-armed second pass speaks once more');
  assert.equal(h.says[1].kind, 'bodyNearMiss');
  assert.equal(h.says[1].text, THROW_TEXT);
  assert.equal(h.nearMissReceipts.length, 2);
  for (const x of [20, 40]) { body.pos.x = x; h.step(); }
  assert.equal(h.says.length, 2);
});

test('a player shove emits the loose-hull wording through the impulse receipt', () => {
  const h = makeHarness();
  const body = h.add({ id: 22, type: 'ship', team: 1, radius: 4, x: -300, z: 0 });
  h.add({ id: 32, type: 'ship', team: 2, radius: 6, x: 0, z: 15 });
  h.bus.emit(HITSTUN_IMPULSE_EVENT, { victimId: body.id, attackerId: h.state.playerId, deltaV: 3 });
  runPass(h, body);
  assert.equal(h.says.length, 1);
  assert.equal(h.says[0].kind, 'bodyNearMiss');
  assert.equal(h.says[0].text, SHOVE_TEXT);
  assert.equal(h.nearMissReceipts.length, 1);
  assert.equal(h.nearMissReceipts[0].source, 'shove');
});

test('impulses from non-player attackers or with no deltaV do not track', () => {
  const h = makeHarness();
  const body = h.add({ id: 23, type: 'ship', team: 1, radius: 4, x: -300, z: 0 });
  h.add({ id: 33, type: 'ship', team: 2, radius: 6, x: 0, z: 15 });
  h.bus.emit(HITSTUN_IMPULSE_EVENT, { victimId: body.id, attackerId: 77, deltaV: 3 });
  h.bus.emit(HITSTUN_IMPULSE_EVENT, { victimId: body.id, attackerId: h.state.playerId, deltaV: 0 });
  runPass(h, body);
  assert.equal(h.says.length, 0);
  assert.equal(h.nearMissReceipts.length, 0);
});

test('a physics impact against the witness suppresses the bark for that pass', () => {
  const h = makeHarness();
  const body = h.add({ id: 24, type: 'ship', team: 1, radius: 4, x: -300, z: 0 });
  const witness = h.add({ id: 34, type: 'ship', team: 2, radius: 6, x: 0, z: 15 });
  h.bus.emit('tether:released', { targetId: body.id });
  body.pos.x = -30; h.step();
  body.pos.x = -5; h.step();
  body.pos.x = 0; h.step();
  h.bus.emit('physics:impact', { aId: body.id, bId: witness.id, dp: 5, impulse: 12 });
  body.pos.x = 5; h.step();
  for (const x of [20, 40]) { body.pos.x = x; h.step(); }
  assert.equal(h.says.length, 0, 'a body that actually connected is no near miss');
  assert.equal(h.nearMissReceipts.length, 0);
  body.pos.x = 400;
  h.state.tick += BODY_NEAR_MISS_COOLDOWN_TICKS + 5;
  h.step();
  runPass(h, body);
  assert.equal(h.says.length, 1, 'the hit flag clears on rearm so a later clean pass still speaks');
  assert.equal(h.says[0].text, THROW_TEXT);
  assert.equal(h.heatSnapshot(), h.heatAtInit);
});

test('an ordinary untracked flyby earns nothing', () => {
  const h = makeHarness();
  const drifter = h.add({ id: 25, type: 'ship', team: 1, radius: 4, x: -300, z: 0 });
  h.add({ id: 35, type: 'ship', team: 2, radius: 6, x: 0, z: 15 });
  runPass(h, drifter);
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = -300; player.pos.z = 0;
  for (const x of [-60, -30, 0, 30, 60]) { player.pos.x = x; h.step(); }
  assert.equal(h.says.length, 0);
  assert.equal(h.nearMissReceipts.length, 0);
  assert.equal(h.voiceReceipts.length, 0);
  assert.equal(h.heatSnapshot(), h.heatAtInit);
});
