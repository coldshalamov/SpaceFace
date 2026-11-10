// Fingerprint: speak / revoked gate / sector_veil_nebula / directive
// Seed 4242. The revoked gate states the seal. Leaving does not earn compliance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { machineDirectiveLine, MACHINE_SITES, advanceMachineProtocol } from '../src/data/precursorMachines.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { materializeMachineLayer, tickMachineLayer } from '../src/systems/precursorMachines.js';

function makeState() {
  return {
    meta: { seed: 4242 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500 } },
    world: { currentSectorId: 'sector_veil_nebula', sectors: {} },
    story: {},
  };
}

function makeWorld(state, log) {
  const world = {
    state,
    registry: { get: () => null },
    helpers: {
      mulberry32,
      hash32,
      spawnEntity: (spec) => {
        const e = { ...spec, alive: true, pos: { x: spec.pos.x, z: spec.pos.z }, vel: { x: 0, z: 0 } };
        e.id = state.entities.size + 100;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      removeEntity: (id) => {
        const e = state.entities.get(id);
        if (e) e.alive = false;
      },
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, p) => { log.push({ type, p }); } },
  };
  return world;
}

test('the veil revoked gate speaks the seal and does not grade a fly-by', () => {
  const closed = machineDirectiveLine('CLOSE', 'observed');
  const opened = machineDirectiveLine('CLOSE', 'compliant');
  assert.equal(closed, 'ROUTE AUTHORITY CLOSED.');
  assert.equal(opened, 'ROUTE AUTHORITY GRANTED.');
  assert.equal(machineDirectiveLine('CLOSE'), closed);
  const state = makeState();
  const log = [];
  const world = makeWorld(state, log);
  const site = MACHINE_SITES.veil_revoked_gate;
  materializeMachineLayer(world, { id: site.sectorId }, world.active);
  const player = {
    id: state.playerId, type: 'player', alive: true,
    pos: { x: site.center.x, z: site.center.z }, vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  tickMachineLayer(world, 0.1);
  const ae = ensureAlienEcologyState(state);
  assert.equal(ae.machineProtocol, 'observed');
  const first = log.filter((e) => e.type === 'comms:log' && e.p && e.p.from === site.name);
  assert.ok(first.some((e) => e.p.text === closed));
  assert.equal(first.some((e) => /CLEAR RADIUS/.test(e.p.text)), false);
  player.pos.x = site.center.x + site.radius + 400;
  tickMachineLayer(world, 0.1);
  assert.equal(ae.machineProtocol, 'observed');
  for (let i = 0; i < 70; i += 1) {
    state.simTime += 1;
    player.pos.x = site.center.x;
    player.pos.z = site.center.z;
    tickMachineLayer(world, 1);
  }
  assert.equal(ae.machineProtocol, 'observed');
  assert.equal(advanceMachineProtocol(state, 'satisfied'), 'compliant');
  tickMachineLayer(world, 0.1);
  const later = log.filter((e) => e.type === 'comms:log' && e.p && e.p.from === site.name);
  assert.ok(later.some((e) => e.p.text === opened));
});
