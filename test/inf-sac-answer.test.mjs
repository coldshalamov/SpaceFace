// inf-sac-answer — a sac's death the room answers. The Hive's spawn sacs are the room's
// own counter (burst them and the wave's tide runs dry), and their death receipt
// (`swarm:hiveSacKilled`) is named in the cascade contract itself — BROOD_CASCADE_EVENTS
// lists it beside `entity:killed` as a seam "the arena wires to the engine's cascade
// seams (queen hits, node deaths)". None of that answer existed: a burst sac left a pool
// and a bus event nobody heard, while the brood it had been feeding kept formation around
// the corpse without a glance. This unit wires the authored answer end to end:
//   engine — the arena calls hiveSacFell at the corpse; the grief loop arms at those
//   coordinates with the identical radius/window/last-write law a credited cell keeps;
//   net — survivalAnnounce names the tide law once per run: "The sac bursts — the tide
//   it was feeding dies with it."
// Nothing here invents numbers: radius/window are BROOD_CASCADE_RADIUS/BROOD_GRIEF_S,
// the ones the grief loop already keeps.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  BROOD_CASCADE_GRIEF,
  BROOD_CASCADE_NONE,
  BROOD_CASCADE_RADIUS,
  BROOD_GRIEF_S,
} from '../src/data/swarmBrood.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import {
  HIVE_ARENA_ID,
  HIVE_SAC_PERIOD_S,
  HIVE_SAC_TAG,
} from '../src/systems/theHiveArena.js';
import { survivalAnnounce } from '../src/systems/survivalAnnounce.js';

const DT = 1 / 60;
const SEED = 4242;

/** The ordinary arena boot, with the combat net wired onto the same bus. */
function arenaBoot() {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const spawned = [];
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
      spawned.push(entity);
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
  state.run.arenaId = HIVE_ARENA_ID;
  state.run.phase = 'active';
  state.run.wave = 1;
  state.mode = 'flight';
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  swarmArena.init(ctx);
  survivalAnnounce.init(ctx);
  return { state, bus, emitted, helpers, player, spawned };
}

function ticks(h, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    swarmArena.update();
  }
}

function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

function startHiveWave(h) {
  h.bus.emit('run:wavePlanned', { wave: 1, plan: {} });
  h.bus.emit('run:waveStarted', { wave: 1 });
}

test('the room answers a burst sac: the brood it was feeding mourn around the corpse', () => {
  const h = arenaBoot();
  try {
    startHiveWave(h);
    // Sacs must have fed at least once so the corpse has hearers: one cadence out,
    // the first births are due.
    ticks(h, HIVE_SAC_PERIOD_S + 0.3);
    const engine = swarmArena._brood;
    assert.ok(engine, 'the room holds its brood engine');
    assert.ok(engine.census().alive > 0, 'the sacs fed the wave before the burst');

    const sacs = h.spawned.filter((e) => e.data && e.data[HIVE_SAC_TAG] && e.alive !== false);
    assert.ok(sacs.length >= 1, 'a sac stands to burst');
    const dead = sacs[0];
    dead.alive = false;
    ticks(h, 0.1);

    assert.ok(named(h, 'swarm:hiveSacKilled').some((e) => e.payload.sacId === dead.id),
      'the burst still receipts for the room');
    const census = engine.census();
    assert.ok(census.mourners >= 1,
      `the brood near the burst mourn it (got ${census.mourners})`);
    assert.equal(engine.view.cascade, BROOD_CASCADE_GRIEF,
      'the answer publishes as the authored grief kind');

    // The identical window: past BROOD_GRIEF_S the mourning ends like any other corpse's.
    ticks(h, BROOD_GRIEF_S + 0.4);
    assert.equal(engine.census().mourners, 0, 'the grief window expires on the authored clock');
    assert.equal(engine.view.cascade, BROOD_CASCADE_NONE, 'the kind clears with the window');
  } finally {
    survivalAnnounce.destroy();
    swarmArena.destroy();
  }
});

test('a burst where no living brood can hear it is an honest no-op, not a pretend room', () => {
  // The engine seam directly, so distances are stageable: the same radius law the credited
  // grief keeps must hold for the Hive node's death — mourners only inside the cascade reach.
  const state = createGameState(SEED);
  const bus = createBus();
  state.mode = 'flight';
  state.simTime = 30;
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED }),
    { wave: 1, phase: 'active', arenaId: HIVE_ARENA_ID });
  const player = { id: state.nextEntityId++, type: 'ship', alive: true,
    hull: 40, hullMax: 200, radius: 8, mass: 400, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player); state.entityList.push(player);
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [] };
  const engine = createBroodEngine({ getState: () => state, bus, fieldList: () => [] });
  engine.prepareWave(state.run, state.run.wave);
  assert.equal(engine.census().alive, 0, 'a prepare-only Hive fielded nobody yet');
  assert.equal(engine.hiveSacFell(10, 10), 0, 'nothing hears the burst, so nobody mourns');
  assert.equal(engine.view.cascade, BROOD_CASCADE_NONE, 'no cascade publishes for a unheard burst');

  // One hearer, staged just outside the authored reach: the same radius law holds.
  engine.spawnWave(state);
  const bodies = engine._bodies;
  const far = bodies.alive.findIndex((v) => v === 1);
  assert.ok(far >= 0, 'a body exists to stage');
  bodies.px[far] = 2000;
  bodies.pz[far] = 2000 + BROOD_CASCADE_RADIUS + 60;
  bodies.vx[far] = 0; bodies.vz[far] = 0;
  assert.equal(engine.hiveSacFell(2000, 2000), 0, 'the reach is the authored one');
  bodies.pz[far] = 2000 + 40;
  assert.ok(engine.hiveSacFell(2000, 2000) >= 1, 'inside the reach, the brood mourns');
  assert.equal(engine.view.cascade, BROOD_CASCADE_GRIEF);
  engine.clear();
});

test('the net names the tide law once: the first burst teaches, later bursts stay silent', () => {
  const h = arenaBoot();
  try {
    startHiveWave(h);
    ticks(h, HIVE_SAC_PERIOD_S + 0.3);
    const killFirst = () => {
      const sacs = h.spawned.filter((e) => e.data && e.data[HIVE_SAC_TAG] && e.alive !== false);
      sacs[0].alive = false;
      ticks(h, 0.1);
    };
    killFirst();
    const lines = named(h, 'voice:say').filter((e) => e.payload.id.startsWith('hive-sac:'));
    assert.equal(lines.length, 1, 'exactly one sac line spoke');
    assert.equal(lines[0].payload.channel, 'objective', 'a state of the room, not a danger beat');
    assert.equal(lines[0].payload.text,
      'The sac bursts — the tide it was feeding dies with it.',
      'the line names what the burst took');

    killFirst();
    const after = named(h, 'voice:say').filter((e) => e.payload.id.startsWith('hive-sac:'));
    assert.equal(after.length, 1, 'the lesson belonged to the first burst, not a chorus');
  } finally {
    survivalAnnounce.destroy();
    swarmArena.destroy();
  }
});
