// Fingerprint: announce / scanner catalogue / sector_charon_expanse / scan
// Seed 4242. The first machine sighting announces the label you actually earned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scannerMachineLabel, MACHINE_SITES } from '../src/data/precursorMachines.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { materializeMachineLayer, tickMachineLayer } from '../src/systems/precursorMachines.js';

test('the charon pylon field announces the observed scan label', () => {
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500 } },
    world: { currentSectorId: 'sector_charon_expanse', sectors: {} },
    story: {},
  };
  const log = [];
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
      removeEntity: () => {},
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, p) => { log.push({ type, p }); } },
  };
  const site = MACHINE_SITES.charon_pylon_field;
  materializeMachineLayer(world, { id: site.sectorId }, world.active);
  const player = {
    id: 1, type: 'player', alive: true,
    pos: { x: site.center.x, z: site.center.z }, vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  tickMachineLayer(world, 0.1);
  const earned = scannerMachineLabel('observed');
  const toast = log.find((e) => e.type === 'toast' && e.p && /Scanner catalogue revised/.test(e.p.text));
  assert.ok(toast);
  assert.equal(toast.p.text, `Scanner catalogue revised: ${earned}.`);
  assert.equal(ensureAlienEcologyState(state).machineProtocol, 'observed');
  assert.equal(toast.p.text.includes(scannerMachineLabel('compliant')), false);
});
