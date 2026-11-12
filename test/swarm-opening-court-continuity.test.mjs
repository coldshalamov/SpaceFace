import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { swarmArenaTierForRun, swarmArenaDebrisLayout } from '../src/data/swarmArenaLadder.js';
import { swarmOpeningTerrainStage, planSwarmOpeningTerrain } from '../src/data/swarmOpeningTerrain.js';

function fixture() {
  const state = createGameState(724), bus = createBus();
  state.rockCore = { ratingT: 0 };
  const add = spec => {
    const e = { id: state.nextEntityId++, alive: true, ...spec };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  };
  const player = add({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {} });
  state.playerId = player.id;
  const helpers = { spawnEntity: add }, registry = { get: () => null };
  const session = Object.create(runSession), owner = Object.create(swarmArena);
  session.init({ state, bus, helpers, registry }); owner.init({ state, bus, helpers, registry });
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 724, arenaId: 'helios_core' });
  // This test targets actual census/admission/spawn, with the separately owned optic room absent.
  owner._syncOpticLattice = () => {};
  const bodies = () => state.entityList.filter(e => e.alive && Number.isInteger(e.data?.openingTerrainSlot));
  return { state, owner, bodies, close() { owner.destroy(); session.destroy?.(); } };
}

test('authored stages use the actual tier vocabulary and stay inside its opening radial reach', () => {
  const tier = swarmArenaTierForRun({ wave: 1, ratingT: 0 });
  const layout = swarmArenaDebrisLayout(tier);
  assert.equal(tier.ratingTierMin, 0);
  for (const [wave, count] of [[1, 8], [2, 11], [3, 14]]) {
    const stage = swarmOpeningTerrainStage({ arenaId: 'helios_core', wave, lineTier: tier.ratingTierMin });
    const spots = planSwarmOpeningTerrain({ stage, anchor: { x: 0, z: 0 }, layout, want: 20 });
    assert.equal(spots.length, count);
    assert.equal(new Set(spots.map(p => p.openingTerrainSlot)).size, count);
    assert.ok(spots.every(p => Math.hypot(p.x, p.z) <= Math.min(300, layout.outer)));
    assert.ok(spots.every(p => Math.abs(p.z) - p.radius >= 48));
  }
  for (const override of [{ arenaId: 'the_hive' }, { wave: 4 }, { lineTier: 1 }, { altered: true }]) {
    assert.equal(swarmOpeningTerrainStage({ arenaId: 'helios_core', wave: 1, lineTier: 0, ...override }), null);
  }
});

test('actual arena census carries authored slot identity when the player throws a surviving bank', () => {
  const h = fixture();
  try {
    h.owner._topUp(h.state.run, 1);
    const first = h.bodies();
    assert.equal(first.length, 8, 'current tier field must admit the authored first court');
    const original = first.find(e => e.data.openingTerrainSlot === 0);
    original.pos = { x: -290, z: -50 };
    original.vel = { x: 0, z: 0 };
    h.owner._topUp(h.state.run, 2);
    assert.equal(h.bodies().length, 11);
    assert.equal(h.bodies().filter(e => e.data.openingTerrainSlot === 0).length, 1);
    assert.equal(h.bodies().find(e => e.data.openingTerrainSlot === 0), original);
    h.owner._topUp(h.state.run, 3);
    assert.equal(h.bodies().length, 14);
    assert.equal(new Set(h.bodies().map(e => e.data.openingTerrainSlot)).size, 14);
    h.owner._topUp(h.state.run, 3);
    assert.equal(h.bodies().length, 14, 'repeated census never mints a thrown bank twice');
  } finally { h.close(); }
});

for (const distance of [401, 901]) {
  test(`a bank returning from ${distance}wu keeps its slot through the next court expansion`, () => {
    const h = fixture();
    try {
      h.owner._topUp(h.state.run, 1);
      const original = h.bodies().find(e => e.data.openingTerrainSlot === 0);
      original.pos = { x: distance, z: 0 };
      h.owner._topUp(h.state.run, 2);
      assert.equal(h.bodies().filter(e => e.data.openingTerrainSlot === 0).length, 1,
        'departure is not destruction: do not clone a body while its release clock is running');
      assert.equal(original.data.despawnAt, 20);
      h.state.simTime = 10;
      original.pos = { x: 325, z: 0 };
      h.owner._topUp(h.state.run, 3);
      assert.deepEqual(h.bodies().map(e => e.data.openingTerrainSlot).sort((a, b) => a - b),
        Array.from({ length: 14 }, (_, i) => i));
      assert.equal(h.bodies().find(e => e.data.openingTerrainSlot === 0), original);
      assert.ok(original.data.despawnAt > 20, 'ordinary returned-body lifetime renewal is retained');
    } finally { h.close(); }
  });
}

test('actual removal frees the reserved opening slot for ordinary round replenishment', () => {
  const h = fixture();
  try {
    h.owner._topUp(h.state.run, 1);
    const original = h.bodies().find(e => e.data.openingTerrainSlot === 0);
    original.pos = { x: 901, z: 0 };
    h.owner._topUp(h.state.run, 2);
    h.state.entities.delete(original.id);
    h.state.entityList = h.state.entityList.filter(e => e !== original);
    h.state.simTime = 21;
    h.owner._topUp(h.state.run, 3);
    assert.deepEqual(h.bodies().map(e => e.data.openingTerrainSlot).sort((a, b) => a - b),
      Array.from({ length: 14 }, (_, i) => i));
    assert.notEqual(h.bodies().find(e => e.data.openingTerrainSlot === 0), original);
  } finally { h.close(); }
});

test('indexed census reserves live outliers but not dead or foreign bodies', () => {
  for (const kind of ['live', 'dead', 'foreign']) {
    const h = fixture();
    try {
      h.owner._topUp(h.state.run, 1);
      const original = h.bodies().find(e => e.data.openingTerrainSlot === 0);
      original.pos = { x: 901, z: 0 };
      if (kind === 'dead') original.alive = false;
      if (kind === 'foreign') delete original.data.swarmArenaDebris;
      h.state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
        asteroids: h.state.entityList.filter(e => e.type === 'asteroid'),
        wrecks: h.state.entityList.filter(e => e.type === 'wreck'), stations: [] };
      h.owner._topUp(h.state.run, 2);
      const slot = h.bodies().filter(e => e.data.swarmArenaDebris && e.data.openingTerrainSlot === 0);
      assert.equal(slot.length, 1, kind);
      if (kind === 'live') assert.equal(slot[0], original);
      else assert.notEqual(slot[0], original);
    } finally { h.close(); }
  }
});
