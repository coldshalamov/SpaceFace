// SFQ-I060 — Executor quarantine warning names the flagged biological lots.
// Fixed seed 4242. The catalog names the executor's site as `charon_vigil_executor`,
// but that id does not exist in the live data (src/data/precursorMachines.js): the
// only live executor body is at `veil_exception_chamber`. This test exercises the
// live executor path, which is where the generic warning actually fires.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { materializeMachineLayer, tickMachineLayer } from '../src/systems/precursorMachines.js';
import { addCargo } from '../src/systems/cargo.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { mulberry32, hash32 } from '../src/core/rng.js';

function fixture(sectorId) {
  const state = {
    meta: { seed: 4242 }, simTime: 0, tick: 0, playerId: 1,
    entities: new Map(), entityList: [],
    player: { activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }],
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 } },
    world: { currentSectorId: sectorId, sectors: {} },
  };
  const events = [];
  let id = 100;
  const world = {
    state, active: { dressing: [] }, registry: { get: () => null },
    _toGlobal: (p) => ({ ...p }), bus: { emit: (name, payload) => events.push({ name, payload }) },
    helpers: {
      mulberry32, hash32,
      spawnEntity(spec) {
        const e = { ...spec, id: id++, alive: true, occupantGeneration: 1,
          pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
        state.entities.set(e.id, e); state.entityList.push(e); return e;
      },
    },
  };
  materializeMachineLayer(world, { id: sectorId }, world.active);
  return { state, world, events,
    step(dt = 0.1) { state.simTime += dt; state.tick++; tickMachineLayer(world, dt); },
    playerAt(pos) {
      const e = { id: 1, alive: true, occupantGeneration: 1,
        pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 10 };
      state.entities.set(1, e); return e;
    } };
}

function executorWarningTexts(events) {
  // The done check names `comms:message`; the long-standing machine log line
  // (`comms:log`) carries the same flagged-lot detail for the backlog surface.
  return events
    .filter((e) => e.name === 'comms:message' && typeof e.payload?.text === 'string'
      && e.payload.text.includes('BIOLOGICAL MANIFEST SUBJECT TO PURGE'))
    .map((e) => e.payload.text);
}

test('executor warning names the flagged biological lots from the incident manifest', () => {
  const f = fixture('sector_veil_nebula');
  const executor = f.state.entityList.find((e) => e.alive !== false && e.data?.machine?.kind === 'executor');
  assert.ok(executor, 'executor spawned');
  f.playerAt({ x: executor.pos.x + 100, z: executor.pos.z });
  ensureAlienEcologyState(f.state).machineProtocol = 'revoked';
  addCargo(f.state, 'cmdty_spore_catalyst', 2);
  f.step();
  const warnings = executorWarningTexts(f.events);
  assert.equal(warnings.length, 1, 'one quarantine warning on executor approach with biological cargo');
  assert.ok(warnings[0].includes('2'), 'warning contains the flagged lot count');
  const spore = COMMODITIES.find((c) => c.id === 'cmdty_spore_catalyst');
  assert.ok(spore && warnings[0].includes(spore.name),
    'warning names the flagged commodity by its display name');
  assert.ok(!warnings[0].includes('cmdty_'), 'no raw commodity id reaches the player');
});

test('entering with only mineral/metal cargo emits no warning', () => {
  const f = fixture('sector_veil_nebula');
  const executor = f.state.entityList.find((e) => e.alive !== false && e.data?.machine?.kind === 'executor');
  assert.ok(executor, 'executor spawned');
  f.playerAt({ x: executor.pos.x + 100, z: executor.pos.z });
  ensureAlienEcologyState(f.state).machineProtocol = 'revoked';
  addCargo(f.state, 'cmdty_alloys', 3);
  addCargo(f.state, 'cmdty_silicate', 5);
  f.step();
  assert.equal(executorWarningTexts(f.events).length, 0,
    'no biological-manifest warning for mineral/metal cargo only');
});
