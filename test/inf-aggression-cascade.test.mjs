// inf-aggression-cascade — the last authored-but-unwired BLOOM cascade finally runs.
// The pathology spine authored three cascades (bloomLadder.js §Pathology): grief shipped
// (inf-brood-grief), panic shipped (inf-panic-cascade), and aggression stayed motion-law
// prose. This completes it on the authored numbers exactly:
//   trigger — a HIT on the brood's relay node (BROOD_QUEEN_LOOT_ID, or the Tendril's head
//   for its wave) arms every living neighbor inside BROOD_CASCADE_RADIUS of the relay;
//   rush — each aggravated body bends toward the player's LIVE position for the authored
//   BROOD_AGGRESSION_S window at BROOD_AGGRESSION_ACCEL, replacing the ordinary flock
//   jitter (never the room's fields), so the pack reads as one angry animal;
//   law — only the authored relay ids arm it; a hit on anything else is a hit the brood
//   does not answer; a windup holds its telegraphed attack while the brood rushes around
//   it; a live panic outranks the rush; the kind publishes on the view
//   (BROOD_CASCADE_AGGRESSION); the window expires on the authored clock;
//   wire — the arena forwards a relay entity's ordinary `combat:damage` receipt to the
//   engine's relayHit seam and receipts `swarm:broodAggression`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { BROOD_PHASE_FLOCK, BROOD_PHASE_WINDUP } from '../src/systems/swarmBrood.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import {
  BROOD_AGGRESSION_S,
  BROOD_CASCADE_AGGRESSION,
  BROOD_CASCADE_NONE,
  BROOD_CASCADE_PANIC,
  BROOD_CASCADE_RADIUS,
  BROOD_QUEEN_LOOT_ID,
  TENDRIL_HEAD_LOOT_ID,
  BROOD_PANIC_REFORM_S,
  BROOD_PANIC_SCATTER_MAX_S,
} from '../src/data/swarmBrood.js';

const DT = 1 / 60;
const SEED = 4242;
const RELAY = { x: 2000, z: 2000 };

// Wave 15 fields the mite fodder beside the wake_eel, so one fixture serves the rush law
// and the panic-outranks law without inventing a roster.
function fixture(wave = 15) {
  const state = createGameState(SEED), bus = createBus();
  state.mode = 'flight';
  state.simTime = 30;
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED }),
    { wave, phase: 'active' });
  const player = { id: state.nextEntityId++, type: 'ship', alive: true,
    hull: 40, hullMax: 200, radius: 8, mass: 400, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player); state.entityList.push(player);
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [] };
  const engine = createBroodEngine({ getState: () => state, bus, fieldList: () => [] });
  engine.prepareWave(state.run, state.run.wave);
  engine.spawnWave(state);
  return { state, bus, player, engine, bodies: engine._bodies };
}

/** The body's family id — liveFamilyId is indexed by family slot, the body's by family[i]. */
function famIdOf(bodies, i) {
  return bodies.liveFamilyId[bodies.family[i]];
}

function findBody(h, famId) {
  const i = h.bodies.alive.findIndex((alive, k) => alive === 1 && famIdOf(h.bodies, k) === famId);
  assert.ok(i >= 0, `wave 15 fields a ${famId} for this law`);
  return i;
}

/** Stage mites around the relay; `windup` holds a long telegraph instead of flocking. */
function stageRelayPack(h, specs, keep = []) {
  const taken = [];
  const slots = specs.map((spec) => {
    const i = h.bodies.alive.findIndex((alive, k) => alive === 1 && !taken.includes(k)
      && !keep.includes(k) && famIdOf(h.bodies, k) === 'mite');
    assert.ok(i >= 0, 'a mite exists to stage');
    taken.push(i);
    h.bodies.px[i] = spec.x; h.bodies.pz[i] = spec.z;
    h.bodies.vx[i] = 0; h.bodies.vz[i] = 0;
    h.bodies.phase[i] = spec.windup ? BROOD_PHASE_WINDUP : BROOD_PHASE_FLOCK;
    if (spec.windup) h.bodies.timer[i] = 5; // a long telegraph: it must hold through the rush
    return i;
  });
  // Silence the rest of the wave so the staged read is the cascade and nothing else.
  const spare = new Set([...slots, ...keep]);
  for (let j = 0; j < h.bodies.alive.length; j++) {
    if (h.bodies.alive[j] === 1 && !spare.has(j)) h.bodies.alive[j] = 0;
  }
  return slots;
}

function steps(h, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) { h.state.simTime += DT; h.engine.step(h.state); }
}

const distToPlayer = (h, i) => Math.hypot(h.bodies.px[i], h.bodies.pz[i]);

test('a relay hit turns the linked brood on the player: the rush, the kind, the receipt', () => {
  const h = fixture();
  const slots = stageRelayPack(h, [
    { x: RELAY.x, z: RELAY.z + 40 },
    { x: RELAY.x + 40, z: RELAY.z },
    { x: RELAY.x - 40, z: RELAY.z },
  ]);
  const started = slots.map((i) => distToPlayer(h, i));
  const armed = h.engine.relayHit({ x: RELAY.x, z: RELAY.z, relayLootId: BROOD_QUEEN_LOOT_ID });
  assert.ok(armed >= 3, `the staged neighbors arm (got ${armed})`);
  assert.equal(h.engine.census().aggravated, armed, 'the census counts the rush');
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_AGGRESSION,
    'the aggression kind publishes on the view while the window is live');

  steps(h, 0.5);
  slots.forEach((i, k) => {
    const now = distToPlayer(h, i);
    assert.ok(now < started[k] - 10,
      `the neighbor closes on the player (staged ${started[k].toFixed(1)} -> ${now.toFixed(1)})`);
  });
  h.engine.clear();
});

test('the rush tracks the player\'s LIVE position at rush speed, not the flock seek', () => {
  const h = fixture();
  const [chaser] = stageRelayPack(h, [{ x: RELAY.x, z: RELAY.z + 40 }]);
  h.engine.relayHit({ x: RELAY.x, z: RELAY.z, relayLootId: BROOD_QUEEN_LOOT_ID });
  steps(h, 0.5);
  // The player bolts to the far side mid-window: the rush's target moves with them.
  h.player.pos.x = -2600; h.player.pos.z = 0;
  steps(h, 0.5);
  const vx = h.bodies.vx[chaser], vz = h.bodies.vz[chaser];
  const speed = Math.hypot(vx, vz);
  const toPlayerNew = Math.hypot(-2600 - h.bodies.px[chaser], 0 - h.bodies.pz[chaser]);
  const closing = ((-2600 - h.bodies.px[chaser]) * vx + (0 - h.bodies.pz[chaser]) * vz) / (toPlayerNew || 1);
  assert.ok(speed > 40, `the rush carries rush-level speed, not the flock seek (v=${speed.toFixed(1)})`);
  assert.ok(closing > 20,
    `the velocity points at the MOVED player (closing ${closing.toFixed(1)} wu/s of ${speed.toFixed(1)})`);
  h.engine.clear();
});

test('the reach is the authored cascade radius, and only relays arm it', () => {
  const h = fixture();
  stageRelayPack(h, [
    { x: RELAY.x, z: RELAY.z + BROOD_CASCADE_RADIUS + 60 },
    { x: RELAY.x, z: RELAY.z + 40 },
  ]);
  assert.equal(h.engine.relayHit({ x: RELAY.x, z: RELAY.z, relayLootId: BROOD_QUEEN_LOOT_ID }), 1,
    'only the neighbor inside the reach joins');
  assert.equal(h.engine.census().aggravated, 1);

  // A stranger's hull hit is not the brood's business: no relay id, no cascade.
  assert.equal(h.engine.relayHit({ x: RELAY.x, z: RELAY.z, relayLootId: 'drone_swarm' }), 0);
  assert.equal(h.engine.relayHit({ x: RELAY.x, z: RELAY.z }), 0);
  assert.equal(h.engine.census().aggravated, 1, 'the live window is untouched by the noise');

  // The Tendril's head is the other authored relay node.
  assert.equal(h.engine.relayHit({ x: RELAY.x, z: RELAY.z, relayLootId: TENDRIL_HEAD_LOOT_ID }), 1,
    'the Tendril head arms the same law');
  h.engine.clear();
});

test('a winding body holds its telegraph while the brood rushes around it', () => {
  const h = fixture();
  const [windup, rusher] = stageRelayPack(h, [
    { x: RELAY.x, z: RELAY.z + 40, windup: true },
    { x: RELAY.x + 40, z: RELAY.z },
  ]);
  h.engine.relayHit({ x: RELAY.x, z: RELAY.z, relayLootId: BROOD_QUEEN_LOOT_ID });
  const held = distToPlayer(h, windup);
  const chaseStart = distToPlayer(h, rusher);
  steps(h, 0.5);
  const heldNow = distToPlayer(h, windup);
  assert.ok(Math.abs(heldNow - held) < 2,
    `the telegraphed attack holds (moved ${(heldNow - held).toFixed(2)} wu)`);
  assert.ok(distToPlayer(h, rusher) < chaseStart - 10,
    `the flocking neighbor still rushes (${chaseStart.toFixed(1)} -> ${distToPlayer(h, rusher).toFixed(1)})`);
  h.engine.clear();
});

test('the window expires on the authored clock', () => {
  const h = fixture();
  stageRelayPack(h, [{ x: RELAY.x, z: RELAY.z + 40 }]);
  h.engine.relayHit({ x: RELAY.x, z: RELAY.z, relayLootId: BROOD_QUEEN_LOOT_ID });
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_AGGRESSION);
  steps(h, BROOD_AGGRESSION_S - 0.2);
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_AGGRESSION, 'still rushing near the end');
  steps(h, 0.4);
  assert.equal(h.engine.census().aggravated, 0, 'the window ends');
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_NONE, 'the room reads quiet again');
  h.engine.clear();
});

test('a live panic outranks the rush, and both hand back to quiet', () => {
  const h = fixture();
  const v = findBody(h, 'wake_eel');
  const slots = stageRelayPack(h, [{ x: RELAY.x, z: RELAY.z + 40 }], [v]);
  h.engine.relayHit({ x: RELAY.x, z: RELAY.z, relayLootId: BROOD_QUEEN_LOOT_ID });
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_AGGRESSION);
  // The mass victim dies beside the staged pack so the credited kill arms panic over the
  // already-live aggression window.
  h.bodies.px[v] = RELAY.x; h.bodies.pz[v] = RELAY.z;
  h.bodies.vx[v] = 0; h.bodies.vz[v] = 0;
  h.engine.onExplosion({ pos: RELAY, radius: 4, ownerId: h.player.id });
  assert.equal(h.bodies.alive[v], 0, 'the mass body dies by the room\'s own explosion law');
  assert.ok(h.engine.census().panicking >= 1, 'the kill breaks the pack');
  assert.ok(h.engine.census().aggravated >= 1, 'the rush window still runs underneath');
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_PANIC,
    'the pack breaking is the more urgent read');
  steps(h, BROOD_PANIC_SCATTER_MAX_S + BROOD_PANIC_REFORM_S + BROOD_AGGRESSION_S + 0.4);
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_NONE, 'then every window hands back to quiet');
  h.engine.clear();
});

test('a second hit re-arms the rush: keeping the pressure on is what the window means', () => {
  const h = fixture();
  const [rusher] = stageRelayPack(h, [{ x: RELAY.x, z: RELAY.z + 40 }]);
  h.engine.relayHit({ x: RELAY.x, z: RELAY.z, relayLootId: BROOD_QUEEN_LOOT_ID });
  steps(h, BROOD_AGGRESSION_S + 0.1);
  assert.equal(h.engine.census().aggravated, 0, 'let the first window lapse');
  // The second hit lands where the relay NOW stands — the Queen travels with her brood,
  // so the arena forwards the live position and the rushed-to body is inside the reach.
  h.engine.relayHit({
    x: h.bodies.px[rusher], z: h.bodies.pz[rusher], relayLootId: BROOD_QUEEN_LOOT_ID,
  });
  assert.equal(h.engine.census().aggravated, 1, 'the fresh hit arms the rush again');
  assert.equal(h.engine.view.cascade, BROOD_CASCADE_AGGRESSION);
  h.engine.clear();
});

test('the arena forwards a relay entity\'s ordinary hit receipt to the engine seam', () => {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
        vel: spec.vel ? { x: spec.vel.x, z: spec.vel.z } : { x: 0, z: 0 },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 400,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  state.run.phase = 'active';
  state.run.wave = 15;
  state.mode = 'flight';
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  swarmArena.init(ctx);
  try {
    bus.emit('run:wavePlanned', { wave: 15, plan: {} });
    bus.emit('run:waveStarted', { wave: 15 });
    const engine = swarmArena._brood;
    assert.ok(engine, 'the room holds its brood engine');
    assert.ok(engine.census().alive > 0, 'the wave fielded its brood');

    // Stage the Queen over a living body so the reach has someone inside it.
    const pack = engine._bodies;
    let any = -1;
    for (let i = 0; i < pack.alive.length; i++) {
      if (pack.alive[i] === 1) { any = i; break; }
    }
    assert.ok(any >= 0, 'a brood body exists to stage under the relay');
    const queen = helpers.spawnEntity({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: pack.px[any], z: pack.pz[any] },
      data: { lootTableId: BROOD_QUEEN_LOOT_ID },
    });
    bus.emit('combat:damage', { targetId: queen.id, attackerId: player.id, amount: 12 });
    assert.ok(engine.census().aggravated >= 1,
      `the hit on the Queen arms the brood (got ${engine.census().aggravated})`);
    assert.equal(engine.view.cascade, BROOD_CASCADE_AGGRESSION);
    const receipts = emitted.filter((e) => e.event === 'swarm:broodAggression');
    assert.ok(receipts.length >= 1, 'the arm receipts on the bus');
    assert.equal(receipts[0].payload.relayLootId, BROOD_QUEEN_LOOT_ID);

    // A stranger hull's hit receipts nothing: only the authored relays answer.
    const before = engine.census().aggravated;
    const drone = helpers.spawnEntity({
      type: 'ship', team: 1,
      pos: { x: pack.px[any], z: pack.pz[any] },
      data: { lootTableId: 'drone_swarm' },
    });
    bus.emit('combat:damage', { targetId: drone.id, attackerId: player.id, amount: 12 });
    assert.equal(engine.census().aggravated, before, 'a non-relay hit arms nothing');
  } finally {
    swarmArena.destroy();
  }
});
