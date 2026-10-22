// Fingerprint: interrogate / gate auditor / sector_veil_nebula / witness
// Seed 4242. A witness mark stays on file, but a fault makes the auditor ask again.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  grantWitnessMark, witnessSkipsInterrogation, hasWitnessMark, advanceMachineProtocol,
  machineDirectiveLine, MACHINE_SITES,
} from '../src/data/precursorMachines.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { materializeMachineLayer, tickMachineLayer } from '../src/systems/precursorMachines.js';

function makeState() {
  return {
    meta: { seed: 4242 },
    simTime: 9,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500 } },
    world: { currentSectorId: 'sector_veil_nebula', sectors: {} },
    story: {},
  };
}

test('the veil gate auditor interrogates a faulted witness', () => {
  const state = makeState();
  assert.equal(grantWitnessMark(state, 'ashfall_gate_underlayer'), true);
  assert.equal(witnessSkipsInterrogation(state), true);
  assert.equal(advanceMachineProtocol(state, 'violated'), 'violation');
  assert.equal(hasWitnessMark(state), true);
  assert.equal(witnessSkipsInterrogation(state), false);
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
  const site = MACHINE_SITES.veil_revoked_gate;
  materializeMachineLayer(world, { id: site.sectorId }, world.active);
  const auditor = state.entityList.find((e) => e.data && e.data.machine && e.data.machine.kind === 'auditor');
  assert.ok(auditor);
  const player = {
    id: state.playerId, type: 'player', alive: true,
    pos: { x: auditor.pos.x, z: auditor.pos.z }, vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  tickMachineLayer(world, 0.1);
  const appeal = machineDirectiveLine('APPEAL');
  const line = log.find((e) => e.type === 'comms:log' && e.p && e.p.from === 'Gate Auditor');
  assert.ok(line);
  assert.match(line.p.text, /INTERROGATION/);
  assert.ok(line.p.text.includes(appeal));
  assert.equal(/PROCEED/.test(line.p.text), false);
});
