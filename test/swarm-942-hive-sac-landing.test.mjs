// PRI-11f / PR #942 F26 — a carried Hive sac bursts where the slung body finally
// lay, exactly once, and a recycled id can never inherit the sac's ledger row.
// On master the tick reads the sac back off the ENTITY MAP by id alone: a killed
// body bursts at its last synced berth (not its final pose), the receipt's emit
// runs before the sac row is consumed (a synchronous listener bursts it again),
// an id's replacement occupant silently becomes the carried sac, and a room
// release stamps despawn deadlines onto whichever body recycled the id.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { HIVE_ARENA_ID, HIVE_SAC_TAG } from '../src/systems/theHiveArena.js';

const DT = 1 / 60;
const SEED = 4242;

function boot({ wave = 1, arenaId = HIVE_ARENA_ID, seed = SEED } = {}) {
  const state = createGameState(seed);
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
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  state.run.arenaId = arenaId;
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  return { state, bus, emitted, helpers, spawned, player };
}

function start() {
  const h = boot();
  const ctx = { state: h.state, bus: h.bus, helpers: h.helpers, registry: { get: () => null } };
  swarmArena.init(ctx);
  h.bus.emit('run:wavePlanned', { wave: 1, plan: {} });
  h.bus.emit('run:waveStarted', { wave: 1 });
  return h;
}

/** The first pool slot holding (x, z), or -1 — pool slots are cursor-indexed, not count-indexed. */
function poolAt(engine, x, z) {
  const px = engine._pools.x, pz = engine._pools.z;
  for (let i = 0; i < px.length; i++) {
    if (Math.abs(px[i] - x) < 1e-3 && Math.abs(pz[i] - z) < 1e-3) return i;
  }
  return -1;
}

for (const receipt of [null, 'entity:killed', 'entity:destroyed']) {
  test(`a thrown sac bursts at its final body pose, once: ${receipt || 'dead body retained'}`, () => {
    const h = start();
    try {
      const sac = h.spawned.find((e) => e.data && e.data[HIVE_SAC_TAG]);
      assert.ok(sac, 'the installed Hive has sacs');
      sac.pos = { x: sac.pos.x + 190, z: sac.pos.z - 110 }; // slung since the last tick
      sac.alive = false;
      if (receipt) {
        h.bus.emit(receipt, { id: sac.id, pos: { x: 99999, z: 99999 } });
        h.state.entities.delete(sac.id);
      }
      const engine = swarmArena._brood;
      const before = engine.view.poolCount;
      let bursts = 0;
      let reentered = false;
      h.bus.on('swarm:hiveSacKilled', (p) => {
        if (p.sacId !== sac.id) return;
        bursts++;
        // A synchronous listener that re-enters the tick must find the sac already
        // consumed. The guard keeps a buggy order from recursing forever — it fails.
        if (!reentered) { reentered = true; swarmArena._hiveTick(h.state, h.state.run); }
      });
      swarmArena._hiveTick(h.state, h.state.run);
      assert.equal(bursts, 1, 'one sac death, one burst');
      assert.equal(engine.view.poolCount, before + 1, 'one pool left where it fell');
      assert.ok(poolAt(engine, sac.pos.x, sac.pos.z) >= 0,
        'the pool lands at the thrown sac\'s final pose, not the last synced berth');
      // A later ordinary tick never re-tells the death.
      swarmArena._hiveTick(h.state, h.state.run);
      assert.equal(bursts, 1);
    } finally {
      swarmArena.destroy();
    }
  });
}

test('a recycled id cannot become the carried sac, and ending the room mid-receipt stops old births', () => {
  const h = start();
  try {
    const sacs = h.spawned.filter((e) => e.data && e.data[HIVE_SAC_TAG]);
    const dead = sacs[0];
    dead.pos = { x: 500, z: 600 };
    dead.alive = false;
    // The dead sac's id now belongs to somebody else entirely.
    const replacement = { ...dead, alive: true, pos: { x: -900, z: -800 }, data: {} };
    h.state.entities.set(dead.id, replacement);
    const engine = swarmArena._brood;
    const pools = [];
    const origPool = engine.hivePool.bind(engine);
    engine.hivePool = (x, z, r) => { pools.push([x, z, r]); return origPool(x, z, r); };
    let deaths = 0;
    h.bus.on('swarm:hiveSacKilled', () => {
      deaths++;
      h.bus.emit('run:ended', {}); // a synchronous listener ends the run mid-receipt
    });
    h.state.simTime = swarmArena._hive.sacs.get(dead.id).nextBirthAt;
    swarmArena._hiveTick(h.state, h.state.run);
    assert.equal(deaths, 1, 'the dead sac bursts once — the replacement is not it');
    assert.equal(swarmArena._hive, null, 'the run ended the room');
    // The burst ran its pool branch at the thrown pose before the room release wiped it.
    assert.ok(pools.some(([x, z, r]) => x === 500 && z === 600 && r === 6),
      'the burst still left its pool where the sac fell');
    assert.equal(replacement.alive, true, 'the recycled occupant is untouched');
    assert.deepEqual(replacement.data, {}, 'no hive stamp on the recycled occupant');
    // The stale room must not keep birthing after the run ended inside its own receipt.
    assert.equal(h.emitted.filter((e) => e.event === 'swarm:hiveBirth').length, 0,
      'no births out of a released room');
  } finally {
    swarmArena.destroy();
  }
});

test('ending before the next room tick does not release a recycled sac id', () => {
  const h = start();
  try {
    const [id] = swarmArena._hive.sacs.keys();
    const replacement = { id, alive: true, data: {}, pos: { x: 900, z: 800 } };
    h.state.entities.set(id, replacement);
    h.bus.emit('run:ended', {});
    assert.deepEqual(replacement.data, {},
      'the room release cannot stamp its deadline on the id\'s new occupant');
  } finally {
    swarmArena.destroy();
  }
});

test('a consumed dead sac never owns a later occupant during cleanup', () => {
  const h = start();
  try {
    const [id] = swarmArena._hive.sacs.keys();
    const dead = h.state.entities.get(id);
    dead.alive = false;
    swarmArena._hiveTick(h.state, h.state.run);
    const replacement = { id, alive: true, data: {}, pos: { x: 900, z: 800 } };
    h.state.entities.set(id, replacement);
    h.bus.emit('run:ended', {});
    assert.deepEqual(replacement.data, {},
      'the release must not despawn the body that inherited the consumed id');
  } finally {
    swarmArena.destroy();
  }
});
