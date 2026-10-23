import assert from 'node:assert/strict';
import test from 'node:test';

// Focused source-context proof (Node 24):
// node --test --test-isolation=none --test-reporter=spec test/pro-five-kineticCatalysts.test.mjs
// Default subprocess isolation in the supplied VM reports only a file-level pass;
// the explicit flag above executes and reports every registered behavior assertion.

import { createBus, busFaultSummary } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { mulberry32 } from '../src/core/rng.js';
import { consumePhysicsCommand, queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createKineticCatalystKernel } from '../src/features/kineticCatalysts/kernel.js';
import { KINETIC_LIMITS } from '../src/features/kineticCatalysts/catalog.js';
import { createKineticCatalystsRuntime } from '../src/features/kineticCatalysts/runtime.js';
import { KINETIC_CATALYST_TRIAL_RUNTIME, TRIAL_CONFIG, catalystTrialEvidence } from '../src/features/kineticCatalysts/fieldTrial.js';
import {
  buildCatalystPresentation, createCatalystPresentationAdapter, CATALYST_PRESENTATION_LIMITS,
} from '../src/features/kineticCatalysts/presentation.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { PINNED_STATUS_ID } from '../src/data/combatDefs.js';
import {
  CATALYST_TRIAL_RECEIPT_ID, claimCatalystTrial, completeCatalystTrial,
  findCatalystFitConflict, readCatalystTrialReceipt, readFittedCatalyst,
  validateCatalystFittings, normalizeCatalystReceipts,
} from '../src/features/kineticCatalysts/fitting.js';

const SEEDS = [4242, 19373];
const DT = 1 / 60;
const EPS = 1e-8;
const INITIAL_BUS_FAULTS = busFaultSummary(512).reduce((sum, row) => sum + row.faults, 0);

function body(id, { x = 0, z = 0, vx = 0, vz = 0, mass = 12, radius = 3,
  kind = 'wreck', generation = 1, pinned = false, dynamic = true, alive = true } = {}) {
  return { id, pos: { x, z }, vel: { x: vx, z: vz }, mass, radius, kind,
    generation, pinned, dynamic, alive };
}

function fixture(seed = 4242) {
  const rng = mulberry32(seed);
  const player = body(1, { mass: 30, radius: 8, kind: 'ship' });
  player.cap = 1000;
  const bodies = [
    body(11, { x: 34, z: 0, vx: 0, vz: 18, mass: 8 + rng() * 4 }),
    body(12, { x: -18, z: 30, vx: -15, vz: -9, mass: 12 + rng() * 4 }),
    body(13, { x: -17, z: -30, vx: 16, vz: -9, mass: 16 + rng() * 4 }),
    body(14, { x: 48, z: 5, vx: 0, vz: 12, mass: 6 }),
  ];
  const frame = { now: 10, dt: DT, tick: 600, player, bodies };
  const kernel = createKineticCatalystKernel({ seed });
  return { kernel, frame, player, bodies };
}

function moveClock(frame, dt = DT) {
  frame.now += dt;
  frame.dt = dt;
  frame.tick += Math.max(1, Math.round(dt / DT));
}

function power(name, extra = {}) {
  return { power: name, sourceId: 1, center: { x: 0, z: 0 }, radius: 160,
    eventId: `${name}:600`, ...extra };
}

function commandEnergy(commands, frame) {
  let energy = 0;
  for (const command of commands) {
    const target = command.bodyId === frame.player.id ? frame.player
      : frame.bodies.find((candidate) => candidate.id === command.bodyId);
    assert.ok(target, 'every impulse targets an existing physical body');
    assert.ok(Number.isFinite(command.x) && Number.isFinite(command.z), 'world-plane impulse stays finite');
    energy += (command.x ** 2 + command.z ** 2) / (2 * target.mass);
  }
  return energy;
}

function debit(result, frame) {
  assert.ok(Number.isFinite(result.capCost) && result.capCost >= 0, 'capacitor debit is finite and nonnegative');
  assert.ok(result.capCost <= frame.player.cap + EPS, 'kernel never spends unavailable capacitor');
  frame.player.cap -= result.capCost;
  return result;
}

// This is a command-membrane witness, not a Rapier/GPU acceptance fixture. The kernel's
// world-plane impulses go through the actual production authority; no source is rewritten.
function admitAndConsume(result, frame) {
  const targets = new Map([frame.player, ...frame.bodies].map((record) => [record.id, {
    ...record, type: record.kind, occupantGeneration: record.generation,
    physicsBody: { schemaVersion: 1, mass: record.mass, radius: record.radius,
      inertiaY: record.mass * record.radius ** 2, dynamic: record.dynamic,
      material: 'ship', revision: 0 },
  }]));
  for (const command of result.impulses) {
    const target = targets.get(command.bodyId);
    assert.ok(target, 'command target exists');
    assert.equal(queuePhysicsImpulse(target, { x: command.x, y: 0, z: command.z }, {
      source: command.reason, tick: frame.tick, origin: 'kineticCatalysts', depth: command.depth,
    }), true);
  }
  const admitted = new Map();
  for (const [id, entity] of targets) {
    const command = consumePhysicsCommand(entity);
    if (command?.impulses?.length) admitted.set(id, command.impulses.map((v) => ({ x: v.x, z: v.z })));
  }
  return admitted;
}

for (const seed of SEEDS) {
  test(`seed ${seed}: an unfitted ship produces no catalyst impulses or capacitor costs`, () => {
    const h = fixture(seed);
    for (const name of ['pull', 'shove', 'pin', 'bomb', 'rig']) {
      const result = h.kernel.handlePower(power(name, { targetId: 11, bodyId: 12, active: true }), h.frame);
      assert.deepEqual(result.impulses, []);
      assert.equal(result.capCost, 0);
    }
    moveClock(h.frame, 2);
    const result = h.kernel.step(h.frame);
    assert.deepEqual(result.impulses, []);
    assert.equal(result.capCost, 0);
  });

  test(`seed ${seed}: Orbital Magazine stores bounded real bodies, spends cap, and pushes back on its carrier`, () => {
    const h = fixture(seed);
    h.kernel.setFitted('orbital_magazine', h.frame);
    const startCap = h.player.cap;
    debit(h.kernel.handlePower(power('pull'), h.frame), h.frame);
    moveClock(h.frame);
    const result = debit(h.kernel.step(h.frame), h.frame);
    const carried = new Set(result.impulses.filter((impulse) => impulse.bodyId !== h.player.id).map((impulse) => impulse.bodyId));
    assert.ok(carried.size > 0 && carried.size <= 3, 'one fitting controls at most three existing wrecks');
    assert.ok(h.player.cap < startCap, 'carrying debris costs capacitor');
    const playerImpulses = result.impulses.filter((impulse) => impulse.bodyId === h.player.id);
    assert.ok(playerImpulses.length > 0, 'a loaded magazine has a physical handling price');
    assert.ok(Math.hypot(...['x', 'z'].map((axis) => result.impulses.reduce((sum, impulse) => sum + impulse[axis], 0))) < EPS,
      'orbit drive exchanges momentum with the carrier');
    assert.ok(commandEnergy(result.impulses, h.frame) > 0);
    const admitted = admitAndConsume(result, h.frame);
    assert.ok(admitted.has(h.player.id), 'production authority receives actual carrier recoil');
    assert.ok(admitted.size >= 2, 'production authority receives body and carrier impulses');
  });

  test(`seed ${seed}: Shove release depends on measured tangential velocity and cannot fire twice`, () => {
    const a = fixture(seed);
    const b = fixture(seed);
    for (const body of b.bodies) { body.vel.x = -body.vel.x; body.vel.z = -body.vel.z; }
    for (const h of [a, b]) {
      h.kernel.setFitted('orbital_magazine', h.frame);
      debit(h.kernel.handlePower(power('pull'), h.frame), h.frame);
      moveClock(h.frame);
      debit(h.kernel.step(h.frame), h.frame);
    }
    const ar = a.kernel.handlePower(power('shove', { eventId: 'release:1' }), a.frame);
    const br = b.kernel.handlePower(power('shove', { eventId: 'release:1' }), b.frame);
    const aBody = ar.impulses.filter((impulse) => impulse.bodyId !== a.player.id);
    const bBody = br.impulses.filter((impulse) => impulse.bodyId !== b.player.id);
    assert.ok(aBody.length > 0 && aBody.length <= 3, 'Shove releases the stored physical bodies');
    assert.notDeepEqual(aBody, bBody, 'opposite measured orbit momentum changes the outgoing spread');
    const again = a.kernel.handlePower(power('shove', { eventId: 'release:1' }), a.frame);
    assert.deepEqual(again.impulses, [], 'one release cannot mint another volley');
    assert.equal(again.capCost, 0);
    assert.ok(commandEnergy(ar.impulses, a.frame) < 1e7, 'release kinetic work stays bounded');
  });

  test(`seed ${seed}: Aftershock stays at its paid cast point, telegraphs, and fires one weaker echo`, () => {
    const h = fixture(seed);
    h.kernel.setFitted('aftershock_core', h.frame);
    h.bodies = [body(21, { x: 30, z: 0, mass: 10 }), body(22, { x: 1030, z: 0, mass: 10 })];
    h.frame.bodies = h.bodies;
    const cast = power('shove', { center: { x: 0, z: 0 }, eventId: 'echo:1' });
    const armed = debit(h.kernel.handlePower(cast, h.frame), h.frame);
    assert.ok(armed.capCost > 0, 'echo requires an explicit resource debit');
    assert.ok(armed.cues.length > 0, 'player can see the delayed danger before it fires');
    assert.deepEqual(armed.impulses, [], 'echo never fires at cast time');
    cast.center.x = 9000;
    h.player.pos.x = 1000;
    moveClock(h.frame, 2);
    const fired = h.kernel.step(h.frame);
    assert.ok(fired.impulses.some((impulse) => impulse.bodyId === 21 && impulse.x > 0), 'old cast point expels its nearby body');
    assert.equal(fired.impulses.some((impulse) => impulse.bodyId === 22), false, 'echo does not travel with player or mutable event');
    assert.ok(fired.impulses.length <= 16, 'one echo has a finite body budget');
    commandEnergy(fired.impulses, h.frame);
    const repeated = h.kernel.step(h.frame);
    assert.deepEqual(repeated.impulses, [], 'the elapsed echo is consumed before side effects');
    assert.equal(repeated.capCost, 0);
  });

  test(`seed ${seed}: zero capacitor refuses all catalyst spending and leaves no delayed work`, () => {
    for (const id of ['orbital_magazine', 'aftershock_core', 'load_bridge']) {
      const h = fixture(seed);
      h.player.cap = 0;
      h.bodies[0].pinned = true;
      h.kernel.setFitted(id, h.frame);
      const results = [
        h.kernel.handlePower(power('pin', { bodyId: 11, seedId: 99 }), h.frame),
        h.kernel.handlePower(power('pull', { targetId: 12 }), h.frame),
        h.kernel.handlePower(power('shove'), h.frame),
      ];
      moveClock(h.frame, 2);
      results.push(h.kernel.step(h.frame));
      assert.ok(results.every((result) => result.capCost === 0));
      assert.ok(results.every((result) => result.impulses.length === 0), `${id} cannot create free physical effects`);
    }
  });
}

const MODULES = {
  orbital_magazine: 'unique_kinetic_orbital_magazine',
  aftershock_core: 'unique_kinetic_aftershock_core',
  load_bridge: 'unique_kinetic_load_bridge',
};

function fittingState(seed = 4242) {
  const state = createGameState(seed);
  state.simTime = 10;
  state.tick = 600;
  state.mode = 'flight';
  state.player.activeShipIndex = 0;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: Array(7).fill(null), fittedInstances: {} }];
  state.player.moduleInventory = [];
  return state;
}

// Narrow owner-port fixture. Tests below prove this feature requests canonical grant/fit
// operations and preserves identity; they do not claim to execute the ships implementation.
function ownerPort(state, { blockFit = false, onGrant = null } = {}) {
  const calls = { grants: 0, fits: 0 };
  return {
    calls,
    grantModule({ defId, provenance, reason }) {
      calls.grants++;
      const item = { instanceId: `trial-owned-${calls.grants}`, defId, provenance, reason };
      state.player.moduleInventory.push(item);
      if (onGrant) onGrant();
      return item;
    },
    moduleFitBlocker({ slotIndex, def }) {
      return !blockFit && slotIndex === 5 && (def.slotType === 'utility' || def.module?.slotType === 'utility')
        ? null : { reason: 'incompatible_slot' };
    },
    fitModule({ shipIndex, slotIndex, instanceId }) {
      calls.fits++;
      const index = state.player.moduleInventory.findIndex((item) => item.instanceId === instanceId);
      if (index < 0 || slotIndex !== 5 || blockFit) return false;
      const [item] = state.player.moduleInventory.splice(index, 1);
      const ship = state.player.ownedShips[shipIndex];
      ship.fittings[slotIndex] = item.defId;
      ship.fittedInstances[slotIndex] = item;
      return true;
    },
  };
}

test('only one canonical catalyst on the active hull can activate; inventory, aliases and invalid slots cannot', () => {
  const state = fittingState();
  state.player.moduleInventory.push({ instanceId: 'parked-in-hold', defId: MODULES.orbital_magazine });
  assert.equal(readFittedCatalyst(state).id, null, 'owning a relic is not wearing it');
  state.player.ownedShips.push({ defId: 'ship_kestrel', fittings: [null, null, null, null, null, MODULES.aftershock_core, null] });
  assert.equal(readFittedCatalyst(state).id, null, 'a parked hull cannot lend its power');
  state.player.ownedShips[0].fittings[5] = MODULES.orbital_magazine;
  assert.equal(readFittedCatalyst(state).id, 'orbital_magazine');
  state.player.ownedShips[0].fittings[0] = MODULES.load_bridge;
  assert.equal(readFittedCatalyst(state).id, null, 'multiple catalyst occupancies fail closed');
  state.player.ownedShips[0].fittings[5] = null;
  assert.equal(readFittedCatalyst(state).id, null, 'a relic forced into a weapon slot cannot activate');
  state.player.ownedShips[0].fittings[0] = null;
  state.player.ownedShips[0].fittings[5] = 'orbital_magazine';
  assert.equal(readFittedCatalyst(state).id, null, 'selection alias is not a fitted module ID');
  state.player.ownedShips[0].fittings[5] = MODULES.orbital_magazine;
  state.player.activeShipIndex = 1;
  assert.equal(readFittedCatalyst(state).id, 'aftershock_core');
  for (const invalid of [-1, NaN, Infinity, 0.5, 999]) {
    state.player.activeShipIndex = invalid;
    assert.equal(readFittedCatalyst(state).id, null, 'invalid active index cannot silently activate hull zero');
  }
});

test('prospective fitting validation admits replacement but rejects a second catalyst and duplicate relic copies', () => {
  const fittings = [null, MODULES.orbital_magazine, null, null];
  assert.equal(validateCatalystFittings(fittings, { replaceSlot: 1, moduleId: MODULES.load_bridge }).ok, true);
  assert.equal(validateCatalystFittings(fittings, { replaceSlot: 2, moduleId: MODULES.load_bridge }).ok, false);
  assert.equal(validateCatalystFittings([MODULES.orbital_magazine, MODULES.orbital_magazine]).ok, false);
  assert.equal(findCatalystFitConflict(fittings, 1, MODULES.aftershock_core), null);
  assert.equal(findCatalystFitConflict(fittings, 2, MODULES.aftershock_core).id, MODULES.orbital_magazine);
  assert.equal(validateCatalystFittings(Array(65).fill(null)).ok, false, 'unbounded imported fitting arrays are rejected');
});

test('trial owner port grants one real identity, fits that identity, and cannot mint another on replay or loss', () => {
  const state = fittingState();
  const ships = ownerPort(state);
  const args = { catalystId: 'orbital_magazine', receiptId: CATALYST_TRIAL_RECEIPT_ID, ships };
  const first = claimCatalystTrial(state, args);
  assert.equal(first.ok, true);
  assert.equal(first.fitted, true);
  assert.equal(ships.calls.grants, 1);
  assert.equal(ships.calls.fits, 1);
  assert.equal(state.player.moduleInventory.length, 0);
  const identity = state.player.ownedShips[0].fittedInstances[5].instanceId;
  assert.equal(identity, first.instanceId);
  assert.equal(claimCatalystTrial(state, args).instanceId, identity);
  assert.equal(ships.calls.grants, 1, 'repeated choice reuses its receipt');
  assert.equal(claimCatalystTrial(state, { ...args, catalystId: 'load_bridge' }).ok, false, 'the one trial cannot reward all three');
  state.player.ownedShips[0].fittings[5] = null;
  delete state.player.ownedShips[0].fittedInstances[5];
  const lost = claimCatalystTrial(state, args);
  assert.equal(lost.fitted, false);
  assert.equal(lost.instanceId, identity);
  assert.equal(ships.calls.grants, 1, 'a sold or destroyed relic is not resurrected');
});

test('a refused fit retains its granted identity and save/reload does not grant again', () => {
  const state = fittingState();
  const ships = ownerPort(state, { blockFit: true });
  const args = { catalystId: 'aftershock_core', receiptId: CATALYST_TRIAL_RECEIPT_ID, ships };
  const first = claimCatalystTrial(state, args);
  assert.equal(first.ok, true);
  assert.equal(first.fitted, false);
  assert.equal(state.player.moduleInventory.length, 1);
  const saved = JSON.parse(JSON.stringify(state.kineticCatalysts));
  state.kineticCatalysts = saved;
  assert.equal(claimCatalystTrial(state, args).instanceId, first.instanceId);
  assert.equal(state.player.moduleInventory.length, 1);
  assert.equal(ships.calls.grants, 1);
  assert.equal(completeCatalystTrial(state, CATALYST_TRIAL_RECEIPT_ID, { kind: 'orbit_release', sequence: 1 }), false);
  assert.equal(completeCatalystTrial(state, CATALYST_TRIAL_RECEIPT_ID, { kind: 'echo_hit', sequence: 2, at: 12 }), true);
  assert.equal(readCatalystTrialReceipt(state).completed, true);
  assert.equal(completeCatalystTrial(state, CATALYST_TRIAL_RECEIPT_ID, { kind: 'echo_hit', sequence: 3, at: 13 }), true);
  assert.equal(ships.calls.grants, 1, 'calibration completion is not a second reward');
});

test('trial receipt whitelist and synchronous reentrancy protect the canonical grant call', () => {
  const state = fittingState();
  let nested;
  const ships = ownerPort(state, { onGrant() {
    nested = claimCatalystTrial(state, { catalystId: 'load_bridge', ships });
  } });
  assert.equal(claimCatalystTrial(state, { catalystId: 'load_bridge', receiptId: 'counterfeit-reward', ships }).ok, false);
  assert.equal(ships.calls.grants, 0);
  assert.equal(claimCatalystTrial(state, { catalystId: 'load_bridge', ships }).ok, true);
  assert.equal(nested.ok, false);
  assert.equal(nested.reason, 'claim_in_progress');
  assert.equal(ships.calls.grants, 1);
});

test('a loose copy of an already fitted catalyst cannot request a second fitting from a permissive owner', () => {
  const state = fittingState();
  const worn = { instanceId: 'already-fitted', defId: MODULES.orbital_magazine };
  const loose = { instanceId: 'separate-loose-copy', defId: MODULES.orbital_magazine };
  state.player.ownedShips[0].fittings[5] = worn.defId;
  state.player.ownedShips[0].fittedInstances[5] = worn;
  state.player.moduleInventory.push(loose);
  const ships = ownerPort(state);
  ships.moduleFitBlocker = () => null;
  const result = claimCatalystTrial(state, { catalystId: 'orbital_magazine', ships });
  assert.equal(result.fitted, false);
  assert.equal(ships.calls.grants, 0);
  assert.equal(ships.calls.fits, 0, 'feature-side exclusivity works before a shared prospective hook is installed');
  assert.equal(state.player.ownedShips[0].fittedInstances[5], worn);
  assert.equal(state.player.moduleInventory[0], loose);
});

test('rehydrated receipt sequence values remain finite scalar evidence after malformed input', () => {
  const rec = { receiptId: CATALYST_TRIAL_RECEIPT_ID, catalystId: 'aftershock_core', instanceId: 'retained-one' };
  for (const [input, expected] of [[Infinity, 0], [-Infinity, 0], [NaN, 0], ['Infinity', 0],
    [-7, 0], [4.9, 4], [Number.MAX_VALUE, Number.MAX_SAFE_INTEGER]]) {
    const [normalized] = normalizeCatalystReceipts([{ ...rec, evidenceSequence: input }]);
    assert.equal(normalized.evidenceSequence, expected);
    assert.deepEqual(JSON.parse(JSON.stringify(normalized)), normalized,
      'serialization does not silently convert non-finite receipt values');
  }
});

test('a malformed active hull selection cannot claim or fit a trial reward onto hull zero', () => {
  for (const activeShipIndex of [-1, NaN, Infinity, 0.5, '0', 999]) {
    const state = fittingState();
    state.player.activeShipIndex = activeShipIndex;
    const ships = ownerPort(state);
    assert.equal(claimCatalystTrial(state, { catalystId: 'aftershock_core', ships }).ok, false);
    assert.equal(ships.calls.grants, 0);
    assert.equal(ships.calls.fits, 0);
    assert.equal(state.player.moduleInventory.length, 0);
  }
});

function runtimeFixture(seed = 4242, fitted = null) {
  const state = fittingState(seed);
  state.ui.docked = false;
  state.world.currentSectorId = TRIAL_CONFIG.sectorId;
  state.run.kind = 'adventure';
  state.entities.clear();
  state.entityList.length = 0;
  let nextId = 100;
  const spawn = (spec) => {
    const id = spec.id ?? nextId++;
    const e = { alive: true, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
      radius: 3, mass: 10, occupantGeneration: 1, flags: {}, data: {}, hull: 200, hullMax: 200,
      ...spec, id };
    e.physicsBody ||= { schemaVersion: 1, mass: e.mass, radius: e.radius,
      inertiaY: e.mass * e.radius ** 2, dynamic: true, material: 'ship', revision: 0 };
    state.entities.set(id, e);
    state.entityList.push(e);
    return e;
  };
  const player = spawn({ id: 1, type: 'ship', isPlayer: true, radius: 8, mass: 30,
    cap: 100, capMax: 100, data: { defId: 'ship_kestrel' } });
  state.playerId = player.id;
  if (fitted) state.player.ownedShips[0].fittings[5] = MODULES[fitted];
  const bus = createBus();
  const runtime = createKineticCatalystsRuntime();
  const ships = ownerPort(state);
  const registry = { get(name) { return name === 'kineticCatalysts' ? runtime : name === 'ships' ? ships : null; } };
  const helpers = { spawnEntity: spawn, queryRadius(center, radius, out = []) {
    out.length = 0;
    for (const e of state.entityList) if (e.alive !== false && Math.hypot(e.pos.x - center.x, e.pos.z - center.z) <= radius) out.push(e);
    return out;
  } };
  const ctx = { state, bus, registry, helpers };
  runtime.init(ctx);
  function advance(seconds = DT) {
    state.simTime += seconds;
    state.tick += Math.max(1, Math.round(seconds / DT));
    runtime.update(Math.min(seconds, DT), state);
  }
  function field(kind, center = player.pos, extra = {}) {
    const emitter = spawn({ type: 'field_emitter', ownerId: player.id,
      pos: { x: center.x, z: center.z },
      physicsBody: { mass: 20, radius: 3, dynamic: false, material: 'sensor' },
      data: { fieldEmitter: true, ownerId: player.id } });
    bus.emit('fields:deployed', { fieldId: `field_${kind}_${state.tick}_${emitter.id}`,
      sourceId: emitter.id, center: { x: center.x, z: center.z }, kind, radius: 160,
      expireAt: state.simTime + 5, ...extra });
    return emitter;
  }
  return { state, player, bus, runtime, ships, registry, helpers, ctx, spawn, advance, field };
}

function impulsesOf(entity) {
  const command = consumePhysicsCommand(entity);
  return (command?.impulses || []).map((value) => ({ x: value.x, z: value.z }));
}

for (const seed of SEEDS) {
  test(`seed ${seed}: production adapter observes real field emitter ownership and queues one echo through physics authority`, () => {
    const h = runtimeFixture(seed, 'aftershock_core');
    const target = h.spawn({ type: 'wreck', pos: { x: 35, z: 0 } });
    h.field('repulsor', h.player.pos, { npc: true });
    assert.equal(h.player.cap, 100, 'NPC power confirmations cannot debit the player');
    assert.equal(h.runtime.getSnapshot().echo, null);
    h.field('repulsor');
    assert.equal(h.player.cap, 100 - KINETIC_LIMITS.echo.cost);
    assert.ok(h.runtime.getSnapshot().echo, 'a player-owned emitter (not the player ID itself) arms the real core');
    h.advance(KINETIC_LIMITS.echo.delay + 0.1);
    const impulses = impulsesOf(target);
    assert.ok(impulses.some((impulse) => impulse.x > 0), 'the real command membrane has an outward world impulse');
    const proof = h.runtime.getEvidence().find((row) => row.kind === 'echo_hit');
    assert.ok(proof?.totalImpulse > 0 && proof.bodyIds.includes(target.id));
    assert.equal(proof.bodyGenerations[target.id], target.occupantGeneration);
    proof.center.x = 999999;
    proof.bodyIds.length = 0;
    proof.bodyGenerations[target.id]++;
    const retainedProof = h.runtime.getEvidence().find((row) => row.kind === 'echo_hit');
    assert.notEqual(retainedProof.center.x, 999999, 'nested evidence cannot be rewritten by a display or trial consumer');
    assert.ok(retainedProof.bodyIds.includes(target.id));
    assert.equal(retainedProof.bodyGenerations[target.id], target.occupantGeneration);
    assert.equal(readRecentImpulseProvenance(target, h.state.tick)?.actorId, h.player.id,
      'secondary physical damage keeps the real player provenance');
    h.runtime.update(DT, h.state);
    assert.deepEqual(impulsesOf(target), [], 'duplicate system update in one tick cannot echo twice');
    h.runtime.destroy();
    assert.equal(h.runtime.getSnapshot(), null);
    h.field('repulsor');
    h.advance(20);
    assert.deepEqual(impulsesOf(target), [], 'the registry destroy lifecycle unsubscribes every live event owner');
  });

  test(`seed ${seed}: adapter reinit, fit swap, docking and saved body loss clean up transient work`, () => {
    const h = runtimeFixture(seed, 'orbital_magazine');
    const load = h.spawn({ type: 'wreck', pos: { x: 34, z: 0 }, vel: { x: 0, z: 18 }, mass: 10 });
    h.runtime.init(h.ctx);
    h.field('well');
    assert.equal(h.player.cap, 100 - KINETIC_LIMITS.orbit.captureCost, 'reinit did not duplicate capture listeners');
    h.advance();
    assert.ok(impulsesOf(load).length > 0);
    const saved = JSON.parse(JSON.stringify(h.runtime.serialize()));
    h.state.entities.delete(load.id);
    h.state.entityList = h.state.entityList.filter((e) => e !== load);
    h.runtime.deserialize(saved);
    h.bus.emit('save:loaded', {});
    h.advance();
    assert.equal(h.runtime.getSnapshot().stored, 0, 'no missing body is recreated from a saved orbit');
    h.state.player.ownedShips[0].fittings[5] = MODULES.aftershock_core;
    h.bus.emit('module:equipped', { shipId: 1, slotIndex: 5, defId: MODULES.aftershock_core });
    h.field('repulsor');
    assert.ok(h.runtime.getSnapshot().echo);
    h.state.ui.docked = true;
    h.bus.emit('dock:docked', {});
    h.state.ui.docked = false;
    h.advance(2);
    assert.equal(h.runtime.getSnapshot().echo, null, 'docking consumes pending transient hazards');
    h.runtime.dispose();
  });
}

test('fitting into an already active Rig closes magazine intake and creates an initially braced Bridge', () => {
  const magazine = runtimeFixture(4242);
  magazine.spawn({ type: 'wreck', pos: { x: 34, z: 0 }, vel: { x: 0, z: 18 }, mass: 12 });
  magazine.state.fields ||= {};
  magazine.state.fields.coneActive = true;
  magazine.state.player.ownedShips[0].fittings[5] = MODULES.orbital_magazine;
  magazine.bus.emit('module:equipped', { shipId: magazine.player.id, slotIndex: 5, defId: MODULES.orbital_magazine });
  magazine.field('well');
  assert.equal(magazine.runtime.getSnapshot().stored, 0, 'the running owner cone closes intake without requiring a new toggle');
  assert.equal(magazine.player.cap, 100, 'refused intake spends no capture cost');
  magazine.state.fields.coneActive = false;
  magazine.field('well');
  assert.equal(magazine.runtime.getSnapshot().stored, 1, 'the explicit owner off state opens intake again');
  magazine.runtime.destroy();

  const bridge = runtimeFixture(19373);
  bridge.state.planet ||= {};
  bridge.state.planet.player ||= {};
  bridge.state.planet.player.collectorOn = true;
  bridge.state.player.ownedShips[0].fittings[5] = MODULES.load_bridge;
  bridge.bus.emit('module:equipped', { shipId: bridge.player.id, slotIndex: 5, defId: MODULES.load_bridge });
  const anchor = bridge.spawn({ type: 'wreck', pos: { x: 20, z: 0 }, mass: 20 });
  const load = bridge.spawn({ type: 'wreck', pos: { x: 45, z: 0 }, mass: 20 });
  const seed = bridge.spawn({ type: 'massSeed', pos: { ...anchor.pos }, ownerId: bridge.player.id,
    data: { ownerId: bridge.player.id, massSeedState: { phase: 'active' } },
    physicsBody: { mass: 20, radius: 4, dynamic: false, material: 'sensor' } });
  bridge.state.fields ||= {};
  bridge.state.fields.hitches = { [anchor.id]: { fieldId: 'rig-running-pin', sourceId: seed.id } };
  bridge.bus.emit('fields:hitchLatched', { entityId: anchor.id, fieldId: 'rig-running-pin', sourceId: seed.id });
  bridge.state.player.targetId = load.id;
  bridge.field('well', load.pos);
  assert.equal(bridge.runtime.getSnapshot().bridge?.braced, true, 'an already running collector braces the new link');
  bridge.runtime.routeImpulse(anchor, { x: 100, z: 0 }, { chainId: 'already-braced-impact' });
  assert.ok(Math.abs(sumImpulses(impulsesOf(load)).x - 100 * KINETIC_LIMITS.bridge.bracedFraction) < EPS,
    'the initially braced link redirects its larger physical share immediately');
  bridge.runtime.destroy();
});

function trialFixture(seed = 4242) {
  const h = runtimeFixture(seed);
  const anchor = sectorLocalToGlobalForSector(TRIAL_CONFIG.localAnchor, TRIAL_CONFIG.sectorId);
  Object.assign(h.player.pos, anchor);
  const resolutions = [], says = [], offers = [];
  const director = {
    registry: h.registry, helpers: h.helpers,
    player: () => h.player, now: () => h.state.simTime,
    say: (_live, _kind, text) => says.push(text),
    offerChoices: (_live, choices) => offers.push([...choices]),
    resolve(live, outcome) { resolutions.push(outcome); live.phase = 'done'; },
    abort(live, reason) { resolutions.push(`abort:${reason}`); live.phase = 'done'; },
  };
  const live = { id: 'trial-live-1', shapeId: TRIAL_CONFIG.id, sectorId: TRIAL_CONFIG.sectorId,
    zoneId: TRIAL_CONFIG.zoneId, shape: { primaryLine: 'Optional physical field trial' }, vars: {}, ids: [], roles: {} };
  return { ...h, anchor, director, live, resolutions, says, offers };
}

test('field trial is geographically deliberate and declining changes no inventory, bodies or capacitor', () => {
  const h = trialFixture();
  h.live.sectorId = 'sector_helios_prime';
  KINETIC_CATALYST_TRIAL_RUNTIME.fire(h.director, h.live, h.state);
  assert.deepEqual(h.resolutions, ['abort:wrong_location']);
  assert.equal(h.ships.calls.grants, 0);
  assert.equal(h.state.entities.size, 1, 'starter sanctuary receives no trial debris');
  h.live.sectorId = TRIAL_CONFIG.sectorId;
  h.resolutions.length = 0;
  KINETIC_CATALYST_TRIAL_RUNTIME.fire(h.director, h.live, h.state);
  assert.equal(h.live.phase, 'offer');
  assert.equal(h.state.entities.size, 1, 'offering the trial spawns no physical clutter');
  KINETIC_CATALYST_TRIAL_RUNTIME.choose(h.director, h.live, h.state, 'decline');
  assert.deepEqual(h.resolutions, ['declined']);
  assert.equal(h.ships.calls.grants, 0);
  assert.equal(h.state.entities.size, 1);
  assert.equal(h.player.cap, 100);
  h.runtime.dispose();
});

for (const seed of SEEDS) {
  test(`seed ${seed}: actual adapter impulse evidence completes the trial once and retains its one fitted relic`, () => {
    const h = trialFixture(seed);
    KINETIC_CATALYST_TRIAL_RUNTIME.fire(h.director, h.live, h.state);
    KINETIC_CATALYST_TRIAL_RUNTIME.choose(h.director, h.live, h.state, 'aftershock_core');
    assert.equal(h.live.phase, 'trial');
    assert.equal(h.live.vars.bodyIds.length, TRIAL_CONFIG.maxBodies);
    for (const id of h.live.vars.bodyIds) {
      const mass = h.state.entities.get(id);
      assert.deepEqual(mass.data.loot, []);
      assert.deepEqual(mass.data.salvagePool, {});
      assert.equal(mass.data.debrisCache, 'empty', 'ordinary deep scan cannot turn a calibration piece into repeatable loot');
    }
    assert.equal(h.ships.calls.grants, 1);
    KINETIC_CATALYST_TRIAL_RUNTIME.choose(h.director, h.live, h.state, 'load_bridge');
    assert.equal(h.live.vars.bodyIds.length, TRIAL_CONFIG.maxBodies);
    assert.equal(h.ships.calls.grants, 1, 'duplicate choices cannot issue another relic');
    h.advance();
    KINETIC_CATALYST_TRIAL_RUNTIME.tick(h.director, h.live, h.state, h.state.simTime);
    assert.equal(h.live.phase, 'trial', 'fitting alone is not physical calibration');
    h.field('repulsor', h.anchor);
    h.advance(KINETIC_LIMITS.echo.delay + 0.1);
    const affected = h.live.vars.bodyIds.filter((id) => impulsesOf(h.state.entities.get(id)).length > 0);
    assert.ok(affected.length > 0, 'actual trial masses receive authority commands');
    assert.ok(catalystTrialEvidence(h.live, h.runtime.getEvidence()));
    KINETIC_CATALYST_TRIAL_RUNTIME.tick(h.director, h.live, h.state, h.state.simTime);
    assert.deepEqual(h.resolutions, ['calibrated']);
    assert.equal(readCatalystTrialReceipt(h.state).completed, true);
    assert.equal(readFittedCatalyst(h.state).id, 'aftershock_core');
    KINETIC_CATALYST_TRIAL_RUNTIME.tick(h.director, h.live, h.state, h.state.simTime + 1);
    assert.equal(h.resolutions.length, 1);
    assert.equal(h.ships.calls.grants, 1);
    const serialized = JSON.parse(JSON.stringify(h.runtime.serialize()));
    h.runtime.deserialize(serialized);
    h.bus.emit('save:loaded', {});
    const repeat = { ...h.live, phase: 'new', vars: {}, ids: [] };
    KINETIC_CATALYST_TRIAL_RUNTIME.fire(h.director, repeat, h.state);
    assert.equal(h.resolutions.at(-1), 'abort:already_calibrated');
    assert.equal(h.ships.calls.grants, 1);
    h.runtime.dispose();
  });
}

test('a rehydrated trial with all four bodies gone resolves without manufacturing replacements', () => {
  const h = trialFixture();
  KINETIC_CATALYST_TRIAL_RUNTIME.fire(h.director, h.live, h.state);
  KINETIC_CATALYST_TRIAL_RUNTIME.choose(h.director, h.live, h.state, 'orbital_magazine');
  h.advance();
  for (const id of h.live.vars.bodyIds) h.state.entities.delete(id);
  h.state.entityList = [h.player];
  const restoredLive = JSON.parse(JSON.stringify(h.live));
  KINETIC_CATALYST_TRIAL_RUNTIME.tick(h.director, restoredLive, h.state, h.state.simTime);
  assert.equal(h.resolutions.at(-1), 'spent');
  assert.equal(h.state.entities.size, 1);
  assert.equal(h.ships.calls.grants, 1);
  assert.equal(readFittedCatalyst(h.state).id, 'orbital_magazine', 'leaving an unfinished trial does not steal its retained relic');
  h.runtime.dispose();
});

function runtimeBridge(seed = 4242) {
  const h = runtimeFixture(seed, 'load_bridge');
  const a = h.spawn({ type: 'wreck', pos: { x: 20, z: 0 }, mass: 20 });
  const b = h.spawn({ type: 'wreck', pos: { x: 45, z: 0 }, mass: 20 });
  const seedBody = h.spawn({ type: 'massSeed', pos: { x: 20, z: 0 }, ownerId: h.player.id,
    data: { ownerId: h.player.id, massSeedState: { phase: 'active' } },
    physicsBody: { mass: 20, radius: 4, dynamic: false, material: 'sensor' } });
  h.state.fields ||= {};
  h.state.fields.hitches = { [a.id]: { fieldId: 'pin-live', sourceId: seedBody.id, attachedAt: h.state.simTime } };
  h.bus.emit('fields:hitchLatched', { entityId: a.id, fieldId: 'pin-live', sourceId: seedBody.id });
  h.state.player.targetId = b.id;
  h.field('well', b.pos);
  assert.ok(h.runtime.getSnapshot().bridge, 'actual Pin hitch followed by Pull creates a production link');
  return { ...h, a, b, seedBody };
}

function sumImpulses(values) {
  return values.reduce((sum, value) => ({ x: sum.x + value.x, z: sum.z + value.z }), { x: 0, z: 0 });
}

for (const seed of SEEDS) {
  test(`seed ${seed}: production Load Bridge redirects actual queued momentum and guards generated transfers`, () => {
    const h = runtimeBridge(seed);
    assert.equal(h.runtime.routeImpulse(h.a, { x: 100, y: 0, z: -40 }, { chainId: 'weapon-impact-1' }), true);
    const a = sumImpulses(impulsesOf(h.a)), b = sumImpulses(impulsesOf(h.b));
    assert.ok(b.x > 0 && b.z < 0, 'partner receives part of the exact external impulse');
    assert.ok(Math.abs(a.x + b.x - 100) < EPS);
    assert.ok(Math.abs(a.z + b.z + 40) < EPS);
    assert.ok((a.x ** 2 + a.z ** 2 + b.x ** 2 + b.z ** 2) / 40 <= (100 ** 2 + 40 ** 2) / 40 + EPS);
    const beforeCount = h.runtime.getEvidence().filter((row) => row.kind === 'bridge_transfer').length;
    const beforeCap = h.player.cap;
    assert.equal(h.runtime.routeImpulse(h.b, { x: b.x, z: b.z }, {
      depth: 1, provenance: { source: 'kineticCatalysts' }, chainId: 'kinetic:bridge:1',
    }), true);
    assert.deepEqual(impulsesOf(h.a), [], 'generated transfer does not send another share to its source');
    assert.equal(h.player.cap, beforeCap);
    assert.equal(h.runtime.getEvidence().filter((row) => row.kind === 'bridge_transfer').length, beforeCount);
    h.runtime.dispose();
  });

  test(`seed ${seed}: collision receipts are compensated once, after solving, and cannot reflect inside the pair`, () => {
    const h = runtimeBridge(seed);
    const striker = h.spawn({ type: 'wreck', pos: { x: 16, z: 0 }, mass: 30 });
    // The real physics receipt arrives after the solver has already imparted -J to a.
    h.a.vel.x = -5;
    const event = { aId: h.a.id, bId: striker.id, aGeneration: h.a.occupantGeneration,
      bGeneration: striker.occupantGeneration, normal: { x: 1, z: 0 }, impulse: 100,
      tick: h.state.tick, pairKey: `${h.a.id}:${striker.id}` };
    h.bus.emit('physics:impact', event);
    const correction = sumImpulses(impulsesOf(h.a));
    const partner = sumImpulses(impulsesOf(h.b));
    assert.ok(correction.x > 0 && partner.x < 0, 'source gives back part of its applied impulse; partner receives it');
    assert.ok(Math.abs(correction.x + partner.x) < EPS, 'compensation creates no net momentum');
    assert.ok(Math.abs(correction.z + partner.z) < EPS);
    h.bus.emit('physics:impact', event);
    assert.deepEqual(impulsesOf(h.a), []);
    assert.deepEqual(impulsesOf(h.b), []);
    h.bus.emit('physics:impact', { ...event, bId: h.b.id, bGeneration: h.b.occupantGeneration });
    assert.deepEqual(impulsesOf(h.a), []);
    assert.deepEqual(impulsesOf(h.b), [], 'pair colliding with itself is not a new external input');
    delete h.state.fields.hitches[h.a.id];
    h.bus.emit('fields:hitchCut', { entityId: h.a.id, sourceId: h.seedBody.id, fieldId: 'pin-live' });
    h.advance();
    assert.equal(h.runtime.getSnapshot().bridge, null, 'lost Pin dissolves its bridge');
    h.runtime.dispose();
  });
}

test('production field-force sampling redistributes an accepted command without replaying its base impulse', () => {
  const h = runtimeBridge();
  const other = h.registry.get.bind(h.registry);
  h.registry.get = (name) => name === 'fields' ? {
    readAcceptedFieldAcceleration(entity) {
      return entity === h.a ? { tick: h.state.tick, ax: 300, az: 0 } : null;
    },
  } : other(name);
  queuePhysicsImpulse(h.a, { x: 300 * h.a.mass * DT, y: 0, z: 0 });
  h.runtime.update(DT, h.state);
  const a = sumImpulses(impulsesOf(h.a));
  const b = sumImpulses(impulsesOf(h.b));
  assert.ok(b.x > 0, 'accepted field acceleration reaches the bridge partner');
  assert.ok(Math.abs(a.x + b.x - 300 * h.a.mass * DT) < EPS, 'the original accepted field command is counted exactly once');
  h.runtime.update(DT, h.state);
  assert.deepEqual(impulsesOf(h.a), []);
  assert.deepEqual(impulsesOf(h.b), []);
  h.runtime.dispose();
});

test('a retained old entity object cannot transfer into a new occupant linked under its recycled id', () => {
  const h = runtimeBridge();
  const old = h.a;
  const replacement = h.spawn({ id: old.id, occupantGeneration: old.occupantGeneration + 1,
    type: 'wreck', pos: { ...old.pos }, mass: old.mass });
  h.state.fields.hitches[replacement.id].fieldId = 'pin-recycled';
  h.bus.emit('fields:hitchLatched', { entityId: replacement.id,
    sourceId: h.seedBody.id, fieldId: 'pin-recycled' });
  h.field('well', h.b.pos);
  assert.equal(h.runtime.getSnapshot().bridge?.a.generation, replacement.occupantGeneration,
    'the new physical occupant has its own correctly re-established bridge');
  const beforeCap = h.player.cap;
  h.runtime.routeImpulse(old, { x: 100, z: 0 }, { chainId: 'stale-retained-object' });
  assert.deepEqual(impulsesOf(h.b), [], 'the partner cannot receive momentum from an unreachable old body');
  assert.deepEqual(impulsesOf(replacement), [], 'the new occupant cannot inherit old-object commands');
  assert.equal(h.player.cap, beforeCap, 'a stale body cannot spend capacitor on a new link');
  h.runtime.dispose();
});

test('repeated same-tick Load Bridge inputs never add kinetic energy beyond the currently admitted input', () => {
  const random = mulberry32(4242);
  for (let scenario = 0; scenario < 20; scenario++) {
    const h = runtimeBridge(4242 + scenario);
    h.a.vel.x = (random() - 0.5) * 40;
    h.a.vel.z = (random() - 0.5) * 40;
    h.b.vel.x = (random() - 0.5) * 40;
    h.b.vel.z = (random() - 0.5) * 40;
    const velocities = new Map([[h.a.id, { ...h.a.vel }], [h.b.id, { ...h.b.vel }]]);
    for (let hit = 0; hit < 4; hit++) {
      const source = hit % 2 ? h.b : h.a;
      const partner = source === h.a ? h.b : h.a;
      const incoming = { x: (random() - 0.5) * 500, z: (random() - 0.5) * 500 };
      const sv = velocities.get(source.id), pv = velocities.get(partner.id);
      const prospective = 0.5 * source.mass * ((sv.x + incoming.x / source.mass) ** 2 + (sv.z + incoming.z / source.mass) ** 2)
        + 0.5 * partner.mass * (pv.x ** 2 + pv.z ** 2);
      h.runtime.routeImpulse(source, incoming, { chainId: `same-tick:${scenario}:${hit}` });
      for (const entity of [h.a, h.b]) {
        const command = sumImpulses(impulsesOf(entity));
        const velocity = velocities.get(entity.id);
        velocity.x += command.x / entity.mass;
        velocity.z += command.z / entity.mass;
      }
      const av = velocities.get(h.a.id), bv = velocities.get(h.b.id);
      const after = 0.5 * h.a.mass * (av.x ** 2 + av.z ** 2) + 0.5 * h.b.mass * (bv.x ** 2 + bv.z ** 2);
      assert.ok(after <= prospective + 1e-6,
        `scenario ${scenario}, input ${hit}: ${after} exceeds admitted input energy ${prospective}`);
    }
    h.runtime.dispose();
  }
});

test('post-contact compensation remains in the next pre-physics prediction until the physics owner consumes it', () => {
  const h = runtimeBridge();
  const striker = h.spawn({ type: 'wreck', pos: { x: 16, z: 0 }, mass: 30 });
  h.a.vel.x = -5;
  h.bus.emit('physics:impact', { aId: h.a.id, bId: striker.id,
    aGeneration: h.a.occupantGeneration, bGeneration: striker.occupantGeneration,
    normal: { x: 1, z: 0 }, impulse: 100, tick: h.state.tick });
  const pendingA = sumImpulses(impulsesOf(h.a));
  const pendingB = sumImpulses(impulsesOf(h.b));
  assert.ok(pendingA.x > 0 && pendingB.x < 0);
  // Advance only the clock. These commands were created after the solver, so native
  // velocities still exclude them at the next pre-physics catalyst phase.
  h.state.tick += 1;
  h.state.simTime += DT;
  const incoming = { x: 75, z: 0 };
  const av = h.a.vel.x + pendingA.x / h.a.mass;
  const bv = h.b.vel.x + pendingB.x / h.b.mass;
  const baseline = 0.5 * h.a.mass * (av + incoming.x / h.a.mass) ** 2 + 0.5 * h.b.mass * bv ** 2;
  h.runtime.routeImpulse(h.a, incoming, { chainId: 'next-pre-physics-input' });
  const newA = sumImpulses(impulsesOf(h.a)), newB = sumImpulses(impulsesOf(h.b));
  const actual = 0.5 * h.a.mass * (av + newA.x / h.a.mass) ** 2
    + 0.5 * h.b.mass * (bv + newB.x / h.b.mass) ** 2;
  assert.ok(actual <= baseline + EPS, 'postsolve pending momentum is not forgotten at the tick boundary');
  h.runtime.dispose();
});

test('explicit quiet post-physics input preserves pending work and snapshots show measured body velocity', () => {
  const h = runtimeBridge();
  h.runtime.routeImpulse(h.a, { x: 100, z: 0 }, { chainId: 'before-quiet-solve' });
  assert.equal(h.runtime.getSnapshot().bridge.a.vx, h.a.vel.x,
    'a render snapshot does not present a queued prediction as measured motion');
  assert.equal(h.runtime.getSnapshot().bridge.b.vx, h.b.vel.x);
  // Model a quiet real solve: consume authoritative commands into native velocities,
  // with no physics:impact event. The post-physics caller supplies its known phase.
  for (const entity of [h.a, h.b]) {
    const impulse = sumImpulses(impulsesOf(entity));
    entity.vel.x += impulse.x / entity.mass;
    entity.vel.z += impulse.z / entity.mass;
  }
  h.runtime.routeImpulse(h.b, { x: 100, z: 0 }, { chainId: 'after-quiet-solve' }, { phase: 'afterPhysics' });
  const pendingA = sumImpulses(impulsesOf(h.a));
  const pendingB = sumImpulses(impulsesOf(h.b));
  assert.ok(Math.abs(pendingA.x - 30) < EPS && Math.abs(pendingB.x - 70) < EPS,
    'consumed pre-solve work is not double counted by a later source');
  assert.equal(h.runtime.getSnapshot().bridge.a.vx, h.a.vel.x);
  assert.equal(h.runtime.getSnapshot().bridge.b.vx, h.b.vel.x);
  h.state.tick++;
  h.state.simTime += DT;
  h.runtime.routeImpulse(h.a, { x: -50, z: 0 }, { chainId: 'next-pre-solve' });
  const nextA = sumImpulses(impulsesOf(h.a)), nextB = sumImpulses(impulsesOf(h.b));
  assert.ok(Math.abs(nextA.x + 35) < EPS && Math.abs(nextB.x + 15) < EPS,
    'the next pre-solve transfer still sees unconsumed post-solve commands');
  h.runtime.dispose();
});

test('actual Pull PINNED status changes solver mass without making a loose orbital body an anchored Pin hitch', () => {
  const h = runtimeFixture(4242, 'orbital_magazine');
  const load = h.spawn({ type: 'wreck', pos: { x: 34, z: 0 }, vel: { x: 0, z: 18 }, mass: 12 });
  h.state.combat.entities ||= {};
  h.state.combat.entities[String(load.id)] = { statuses: { [PINNED_STATUS_ID]: { expiresTick: h.state.tick + 90 } },
    physicsResponse: { massScale: 6 } };
  h.field('well');
  h.advance();
  assert.equal(h.runtime.getSnapshot().stored, 1, 'the base twelve-tonne load remains eligible under its own Pull status');
  assert.ok(impulsesOf(load).length > 0, 'orbit control authors force against the effective 72-tonne solver mass');
  const seedBody = h.spawn({ type: 'massSeed', pos: { x: 34, z: 0 }, ownerId: h.player.id,
    data: { ownerId: h.player.id, massSeedState: { phase: 'active' } },
    physicsBody: { mass: 20, radius: 4, dynamic: false, material: 'sensor' } });
  h.state.fields ||= {};
  h.state.fields.hitches = { [load.id]: { sourceId: seedBody.id, fieldId: 'real-pin' } };
  h.bus.emit('fields:hitchLatched', { entityId: load.id, sourceId: seedBody.id, fieldId: 'real-pin' });
  h.advance();
  assert.equal(h.runtime.getSnapshot().stored, 0, 'only the actual anchor hitch removes orbital membership');
  h.runtime.dispose();
});

test('measured existing well acceleration and scaled effective mass preserve a physical lossy orbit over 180 steps', () => {
  const h = fixture();
  h.frame.bodies = [h.bodies[0]];
  const load = h.frame.bodies[0];
  load.baseMass = 12;
  load.mass = 72;
  load.pinned = true;
  load.hitched = false;
  const well = normalizeField({ id: 'actual-pull-profile', kind: 'well', center: { x: 0, z: 0 },
    radius: 190, strength: 240, falloff: 1.4, ownerId: h.player.id, filters: { excludeId: h.player.id } });
  h.kernel.setFitted('orbital_magazine', h.frame);
  debit(h.kernel.handlePower(power('pull'), h.frame), h.frame);
  for (let step = 0; step < 180; step++) {
    const sample = sampleFieldAcceleration(load.pos, load.vel, [well], h.frame.now,
      { id: load.id, type: 'wreck', mass: load.baseMass, fieldResponseMult: 1, dynamic: true });
    load.ownPullAcceleration = { x: sample.ax, z: sample.az };
    moveClock(h.frame);
    const result = debit(h.kernel.step(h.frame), h.frame);
    load.vel.x += sample.ax * DT;
    load.vel.z += sample.az * DT;
    for (const impulse of result.impulses) {
      const entity = impulse.bodyId === load.id ? load : h.player;
      entity.vel.x += impulse.x / entity.mass;
      entity.vel.z += impulse.z / entity.mass;
    }
    for (const entity of [load, h.player]) {
      entity.pos.x += entity.vel.x * DT;
      entity.pos.z += entity.vel.z * DT;
    }
    assert.ok([load.pos.x, load.pos.z, h.player.pos.x, h.player.pos.z].every(Number.isFinite));
  }
  const distance = Math.hypot(load.pos.x - h.player.pos.x, load.pos.z - h.player.pos.z);
  assert.equal(h.kernel.snapshot(h.frame).stored, 1, 'real Pull forces do not invalidate their own captured load');
  assert.ok(distance > h.player.radius + load.radius && distance < KINETIC_LIMITS.orbit.maxDistance,
    `load remains physically separated at ${distance} WU`);
});

test('three heavy Pull-loaded magazine bodies share carrier recoil without collapsing another orbit', () => {
  const h = fixture();
  h.frame.bodies = [12, 18, 24].map((baseMass, index) => {
    const angle = index * 2 * Math.PI / 3;
    const radius = 40 + index * 14;
    const load = body(11 + index, { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
      vx: -Math.sin(angle) * 15, vz: Math.cos(angle) * 15, mass: baseMass * 6, radius: 4, pinned: true });
    return { ...load, baseMass, hitched: false };
  });
  const well = normalizeField({ id: 'real-pull-three-loads', kind: 'well', center: { x: 0, z: 0 },
    radius: 190, strength: 240, falloff: 1.4, ownerId: h.player.id, filters: { excludeId: h.player.id } });
  h.kernel.setFitted('orbital_magazine', h.frame);
  debit(h.kernel.handlePower(power('pull'), h.frame), h.frame);
  assert.equal(h.kernel.snapshot(h.frame).stored, 3);
  const entities = [h.player, ...h.frame.bodies];
  const kineticEnergy = () => entities.reduce((sum, entity) => sum + entity.mass *
    (entity.vel.x ** 2 + entity.vel.z ** 2) / 2, 0);
  let closest = Infinity;
  for (let step = 0; step < 180; step++) {
    for (const load of h.frame.bodies) {
      const sample = sampleFieldAcceleration(load.pos, load.vel, [well], h.frame.now,
        { id: load.id, type: 'wreck', mass: load.baseMass, fieldResponseMult: 1, dynamic: true });
      load.ownPullAcceleration = { x: sample.ax, z: sample.az };
      // The production adapter predicts accepted field commands before producing its
      // correction. Apply the same external work exactly once to this integration fixture.
      load.vel.x += sample.ax * DT;
      load.vel.z += sample.az * DT;
    }
    moveClock(h.frame);
    const beforeEnergy = kineticEnergy();
    const commands = debit(h.kernel.step(h.frame), h.frame);
    const momentum = { x: 0, z: 0 };
    for (const impulse of commands.impulses) {
      const entity = entities.find((entry) => entry.id === impulse.bodyId);
      assert.ok(Math.hypot(impulse.x, impulse.z) <= KINETIC_LIMITS.maxImpulse + EPS);
      entity.vel.x += impulse.x / entity.mass;
      entity.vel.z += impulse.z / entity.mass;
      momentum.x += impulse.x;
      momentum.z += impulse.z;
    }
    assert.ok(Math.hypot(momentum.x, momentum.z) < EPS, 'all load reactions return through the carrier');
    assert.ok(kineticEnergy() <= beforeEnergy + commands.capCost * KINETIC_LIMITS.workPerCap + 1e-6,
      'combined satellite control respects the paid work budget');
    for (const entity of entities) {
      entity.pos.x += entity.vel.x * DT;
      entity.pos.z += entity.vel.z * DT;
    }
    for (const load of h.frame.bodies) {
      const distance = Math.hypot(load.pos.x - h.player.pos.x, load.pos.z - h.player.pos.z);
      closest = Math.min(closest, distance);
      assert.ok(distance > load.radius + h.player.radius && distance < KINETIC_LIMITS.orbit.maxDistance,
        `load ${load.id} stays physically separated at step ${step}: ${distance} WU`);
    }
  }
  assert.equal(h.kernel.snapshot(h.frame).stored, 3, `all three real loads remain held; closest ${closest} WU`);
});

test('missing or mismatched live controlled ships cannot inherit a parked hull catalyst', () => {
  const h = runtimeFixture(4242, 'aftershock_core');
  h.player.data.defId = 'ship_pelican';
  h.field('repulsor');
  assert.equal(h.player.cap, 100);
  assert.equal(h.runtime.getSnapshot().echo, null);
  h.player.data.defId = 'ship_kestrel';
  h.state.entities.delete(h.player.id);
  h.field('repulsor');
  assert.equal(h.player.cap, 100);
  h.runtime.dispose();
});

test('legacy fitted catalyst occupancy without an instance record does not mint a duplicate trial reward', () => {
  const state = fittingState();
  state.player.ownedShips[0].fittings[5] = MODULES.orbital_magazine;
  const ships = ownerPort(state);
  claimCatalystTrial(state, { catalystId: 'orbital_magazine', ships });
  assert.equal(ships.calls.grants, 0, 'a legacy occupied slot is not evidence the reward is absent');
  assert.equal(state.player.moduleInventory.length, 0);
  assert.equal(state.player.ownedShips[0].fittings[5], MODULES.orbital_magazine);
});

test('presentation descriptors preserve true footprints, readable shape tells, access settings and floating-origin precision', () => {
  const h = fixture();
  h.kernel.setFitted('aftershock_core', h.frame);
  h.kernel.handlePower(power('shove'), h.frame);
  const snapshot = h.kernel.snapshot(h.frame);
  const before = JSON.stringify(snapshot);
  const full = buildCatalystPresentation(snapshot, { simTime: h.frame.now + 0.2 });
  const reduced = buildCatalystPresentation(snapshot, { simTime: h.frame.now + 0.2, reducedMotion: true, reducedFlash: true });
  assert.ok(full.count > 3 && full.count <= CATALYST_PRESENTATION_LIMITS.activeSurfaces,
    'echo is a designed broken footprint and countdown, not a surrogate object');
  assert.equal(reduced.count, full.count, 'accessibility keeps the actual danger footprint readable');
  for (let i = 0; i < reduced.count; i++) {
    assert.equal(reduced.surfaces[i].length, 36);
    assert.ok(reduced.surfaces[i].every(Number.isFinite));
    for (const index of [16, 17, 18, 30]) assert.equal(reduced.surfaces[i][index], 0);
    assert.ok(reduced.surfaces[i][15] <= full.surfaces[i][15]);
  }
  assert.equal(JSON.stringify(snapshot), before, 'render recipes cannot mutate simulation state');
  assert.equal(buildCatalystPresentation({ catalystId: null }).count, 0);
  const submitted = [];
  let disposed = 0;
  const batch = { begin() { submitted.length = 0; }, add(data) { submitted.push([...data]); }, end() {}, dispose() { disposed++; } };
  const adapter = createCatalystPresentationAdapter({ surfaceBatch: batch,
    toLocal(x, z, out) { out.x = x - 10_000_000; out.z = z + 10_000_000; } });
  const far = { catalystId: 'load_bridge', owner: { x: 10_000_000, z: -10_000_000 },
    bridge: { a: { id: 11, x: 10_000_000.125, z: -10_000_000.25, radius: 3 },
      b: { id: 12, x: 10_000_020.125, z: -10_000_000.25, radius: 3 }, restLength: 20, fraction: 0.3 } };
  adapter.update(far, { simTime: 10, reducedMotion: true });
  assert.ok(submitted.length > 0);
  assert.ok(submitted.some((data) => Math.abs(data[0] - 0.125) < 1e-5),
    'origin is subtracted before float32 quantization');
  adapter.update({ catalystId: null }, { simTime: 10.1 });
  assert.equal(submitted.length, 0, 'unfitting removes misleading physical boundaries immediately');
  adapter.dispose();
  assert.equal(disposed, 1);
  assert.equal(adapter.update(far, { simTime: 10.2 }).count, 0);
});

test('Orbital Magazine Pin hands a held piece back to its real anchor and Bomb releases one screen', () => {
  const h = fixture();
  h.kernel.setFitted('orbital_magazine', h.frame);
  debit(h.kernel.handlePower(power('pull'), h.frame), h.frame);
  h.bodies[0].pinned = true;
  h.kernel.handlePower(power('pin', { bodyId: 11, seedId: 99, eventId: 'orbit-pin' }), h.frame);
  moveClock(h.frame);
  const orbit = h.kernel.step(h.frame);
  assert.equal(orbit.impulses.some((impulse) => impulse.bodyId === 11), false, 'the magazine never fights a real Pin');
  const release = h.kernel.handlePower(power('bomb', { bodyId: 91, eventId: 'bomb-screen' }), h.frame);
  const releasedIds = release.impulses.filter((impulse) => impulse.bodyId !== h.player.id).map((impulse) => impulse.bodyId);
  assert.equal(new Set(releasedIds).size, 1, 'Bomb releases exactly one existing magazine body as a moving screen');
  const rest = h.kernel.handlePower(power('shove', { eventId: 'remaining-volley' }), h.frame);
  assert.ok(rest.impulses.filter((impulse) => impulse.bodyId !== h.player.id).length <= 1,
    'Pin and Bomb both consume their old magazine membership');
});

test('Aftershock Pull delays and weakens the paid pulse; Pin narrows it and Rig vents without a refund', () => {
  function armed() {
    const h = fixture();
    h.kernel.setFitted('aftershock_core', h.frame);
    debit(h.kernel.handlePower(power('shove'), h.frame), h.frame);
    return h;
  }
  const normal = armed();
  const delayed = armed();
  const pull = debit(delayed.kernel.handlePower(power('pull', { eventId: 'echo-gather' }), delayed.frame), delayed.frame);
  assert.ok(pull.capCost > 0, 'stretching the gathering window has a price');
  moveClock(normal.frame, KINETIC_LIMITS.echo.delay + 0.01);
  moveClock(delayed.frame, KINETIC_LIMITS.echo.delay + 0.01);
  const baseline = normal.kernel.step(normal.frame);
  assert.ok(baseline.impulses.length > 0);
  assert.deepEqual(delayed.kernel.step(delayed.frame).impulses, [], 'Pull buys real extra gathering time');
  moveClock(delayed.frame, KINETIC_LIMITS.echo.pullDelay + 0.01);
  const later = delayed.kernel.step(delayed.frame);
  assert.ok(later.impulses.length > 0);
  assert.ok(commandEnergy(later.impulses, delayed.frame) < commandEnergy(baseline.impulses, normal.frame),
    'the longer gathering window pays with a weaker discharge');
  const grounded = armed();
  grounded.kernel.handlePower(power('pin', { center: { x: 0, z: 0 }, seedId: 99, eventId: 'ground-echo' }), grounded.frame);
  moveClock(grounded.frame, 2);
  const groundedPulse = grounded.kernel.step(grounded.frame);
  assert.ok(commandEnergy(groundedPulse.impulses, grounded.frame) < commandEnergy(baseline.impulses, normal.frame));
  const vented = armed();
  const capAfterArming = vented.player.cap;
  debit(vented.kernel.handlePower(power('rig', { active: true, eventId: 'vent-echo' }), vented.frame), vented.frame);
  moveClock(vented.frame, KINETIC_LIMITS.echo.ventDelay + 0.01);
  const vent = vented.kernel.step(vented.frame);
  assert.ok(vent.impulses.length > 0, 'Rig releases the field early');
  assert.ok(commandEnergy(vent.impulses, vented.frame) < commandEnergy(baseline.impulses, normal.frame));
  assert.ok(vented.player.cap <= capAfterArming, 'venting never refunds the paid core charge');
});

test('Aftershock Bomb transfers part of its finite stored impulse into actual thrown ordnance', () => {
  const h = fixture();
  h.kernel.setFitted('aftershock_core', h.frame);
  debit(h.kernel.handlePower(power('shove'), h.frame), h.frame);
  h.bodies.push(body(91, { x: 15, mass: 3, radius: 2, kind: 'payload' }));
  const result = debit(h.kernel.handlePower(power('bomb', { bodyId: 91, eventId: 'echo-payload' }), h.frame), h.frame);
  assert.ok(result.impulses.some((impulse) => impulse.bodyId === 91), 'the already-spawned payload receives the bleed impulse');
  assert.ok(result.capCost > 0, 'ordnance assistance is paid');
  assert.ok(commandEnergy(result.impulses, h.frame) > 0);
});

test('Load Bridge Rig changes transfer and drain, while Bomb can replace only the loose endpoint', () => {
  const normal = linked(4242, { sourceMass: 20, partnerMass: 20 });
  const braced = linked(4242, { sourceMass: 20, partnerMass: 20 });
  braced.kernel.handlePower(power('rig', { active: true, eventId: 'brace' }), braced.frame);
  moveClock(normal.frame);
  moveClock(braced.frame);
  const normalRunning = normal.kernel.step(normal.frame);
  const bracedRunning = braced.kernel.step(braced.frame);
  assert.ok(bracedRunning.capCost > normalRunning.capCost, 'braced sharing has a higher ongoing capacitor burden');
  const input = { bodyId: 11, impulse: { x: 100, z: 0 }, eventId: 'brace-impact' };
  const ordinary = normal.kernel.transferImpulse(input, normal.frame);
  const tensioned = braced.kernel.transferImpulse(input, braced.frame);
  assert.ok(tensioned.partnerImpulse.x > ordinary.partnerImpulse.x, 'Rig physically redirects a larger finite share');
  braced.bodies.push(body(91, { x: 45, mass: 10, radius: 2, kind: 'payload' }));
  debit(braced.kernel.handlePower(power('bomb', { bodyId: 91, eventId: 'bridge-payload' }), braced.frame), braced.frame);
  const payloadTransfer = braced.kernel.transferImpulse({ ...input, eventId: 'after-payload' }, braced.frame);
  assert.equal(payloadTransfer.partnerImpulse?.bodyId, 91, 'the real thrown payload becomes the unpinned endpoint');
  assert.equal(payloadTransfer.impulses.some((impulse) => impulse.bodyId === 12), false, 'old loose load is released');
});

function linked(seed = 4242, { sourceMass = 20, partnerMass = 10, sourceVx = 0, partnerVx = 0 } = {}) {
  const h = fixture(seed);
  h.bodies = [
    body(11, { x: 20, mass: sourceMass, pinned: true, vx: sourceVx }),
    body(12, { x: 45, mass: partnerMass, vx: partnerVx }),
  ];
  h.frame.bodies = h.bodies;
  h.kernel.setFitted('load_bridge', h.frame);
  debit(h.kernel.handlePower(power('pin', { bodyId: 11, seedId: 99 }), h.frame), h.frame);
  debit(h.kernel.handlePower(power('pull', { targetId: 12, eventId: 'link:1' }), h.frame), h.frame);
  return h;
}

for (const seed of SEEDS) {
  test(`seed ${seed}: Load Bridge shares a capped impulse with mass-aware conservation and no recursion`, () => {
    for (const [sourceMass, partnerMass] of [[2, 80], [80, 2], [20, 20]]) {
      const h = linked(seed, { sourceMass, partnerMass });
      const incoming = { bodyId: 11, impulse: { x: 140, z: -60 }, eventId: `impact:${sourceMass}`, origin: 'weapon', depth: 0 };
      const before = structuredClone(incoming);
      const result = h.kernel.transferImpulse(incoming, h.frame);
      assert.equal(result.accepted, true, 'a live pinned pair can share a real incoming impulse');
      assert.deepEqual(incoming, before, 'caller impulse remains immutable');
      assert.ok(result.partnerImpulse, 'the second body actually receives momentum');
      assert.equal(result.partnerImpulse.bodyId, 12);
      assert.ok(Math.hypot(result.partnerImpulse.x, result.partnerImpulse.z) > 0);
      assert.ok(Math.hypot(result.partnerImpulse.x, result.partnerImpulse.z) <= Math.hypot(140, -60) * 0.5,
        'only a capped fraction travels through the bridge');
      assert.ok(Math.abs(result.impulse.x + result.partnerImpulse.x - 140) < EPS);
      assert.ok(Math.abs(result.impulse.z + result.partnerImpulse.z + 60) < EPS);
      const originalEnergy = (140 ** 2 + 60 ** 2) / (2 * sourceMass);
      const sharedEnergy = (result.impulse.x ** 2 + result.impulse.z ** 2) / (2 * sourceMass)
        + (result.partnerImpulse.x ** 2 + result.partnerImpulse.z ** 2) / (2 * partnerMass);
      assert.ok(sharedEnergy <= originalEnergy + EPS, 'light receivers cannot multiply incoming impulse energy');
      const replay = h.kernel.transferImpulse(incoming, h.frame);
      assert.equal(replay.accepted, false, 'same causal impulse is processed once');
      const reflection = h.kernel.transferImpulse({ bodyId: 12, impulse: result.partnerImpulse,
        eventId: 'reflected', origin: 'kineticCatalysts', depth: 1 }, h.frame);
      assert.equal(reflection.accepted, false, 'a generated transfer cannot reflect back through the bridge');
    }
  });

  test(`seed ${seed}: Load Bridge rejects a transfer that would manufacture energy from a faster partner`, () => {
    const h = linked(seed, { sourceMass: 20, partnerMass: 20, sourceVx: 0, partnerVx: 100 });
    const result = h.kernel.transferImpulse({ bodyId: 11, impulse: { x: 10, z: 0 }, eventId: 'faster-partner', origin: 'weapon' }, h.frame);
    const source = result.impulse || { x: 10, z: 0 };
    const partner = result.partnerImpulse || { x: 0, z: 0 };
    const baseline = 0.5 * 20 * ((10 / 20) ** 2 + 100 ** 2);
    const actual = 0.5 * 20 * ((source.x / 20) ** 2 + (source.z / 20) ** 2)
      + 0.5 * 20 * ((100 + partner.x / 20) ** 2 + (partner.z / 20) ** 2);
    assert.ok(actual <= baseline + EPS, 'the transfer is capped by actual work as well as impulse magnitude');
  });

  test(`seed ${seed}: swapping fittings cancels pending echoes and releases every held constraint`, () => {
    const h = fixture(seed);
    h.kernel.setFitted('aftershock_core', h.frame);
    debit(h.kernel.handlePower(power('shove'), h.frame), h.frame);
    h.kernel.setFitted('orbital_magazine', h.frame);
    moveClock(h.frame, 2);
    assert.deepEqual(h.kernel.step(h.frame).impulses, [], 'the removed core leaves no ghost echo');
    debit(h.kernel.handlePower(power('pull', { eventId: 'new-orbit' }), h.frame), h.frame);
    moveClock(h.frame);
    assert.ok(h.kernel.step(h.frame).impulses.length > 0, 'replacement fitting works on its own');
    h.kernel.setFitted(null, h.frame);
    moveClock(h.frame);
    assert.deepEqual(h.kernel.step(h.frame).impulses, [], 'unfitting leaves no orbit forces');
    assert.deepEqual(h.kernel.handlePower(power('shove', { eventId: 'after-unfit' }), h.frame).impulses, []);
  });

  test(`seed ${seed}: a saved pending echo resumes once and a spent echo never replays`, () => {
    const original = fixture(seed);
    original.kernel.setFitted('aftershock_core', original.frame);
    debit(original.kernel.handlePower(power('shove', { eventId: 'saved-echo' }), original.frame), original.frame);
    const saved = JSON.parse(JSON.stringify(original.kernel.serialize()));
    const resumed = fixture(seed);
    resumed.frame = structuredClone(original.frame);
    resumed.player = resumed.frame.player;
    resumed.bodies = resumed.frame.bodies;
    resumed.kernel.setFitted('aftershock_core', resumed.frame);
    resumed.kernel.restore(saved, resumed.frame);
    moveClock(original.frame, 2);
    moveClock(resumed.frame, 2);
    const expected = original.kernel.step(original.frame);
    const actual = resumed.kernel.step(resumed.frame);
    assert.ok(actual.impulses.length > 0, 'one due echo survives a valid restore');
    assert.deepEqual(actual.impulses, expected.impulses, 'save/reload preserves deterministic physical results');
    assert.equal(actual.capCost, expected.capCost, 'restore cannot refund or recharge the pending echo');
    const spent = JSON.parse(JSON.stringify(resumed.kernel.serialize()));
    resumed.kernel.restore(spent, resumed.frame);
    moveClock(resumed.frame);
    assert.deepEqual(resumed.kernel.step(resumed.frame).impulses, [], 'saved spent effects stay spent');
    assert.deepEqual(resumed.kernel.handlePower(power('shove', { eventId: 'saved-echo' }), resumed.frame).impulses, []);
  });

  test(`seed ${seed}: destroyed or recycled bodies never regain an orbit or bridge on reload`, () => {
    const h = fixture(seed);
    h.kernel.setFitted('orbital_magazine', h.frame);
    debit(h.kernel.handlePower(power('pull'), h.frame), h.frame);
    const saved = JSON.parse(JSON.stringify(h.kernel.serialize()));
    h.frame.bodies = h.bodies.map((entry) => ({ ...entry, generation: entry.generation + 1 }));
    h.kernel.restore(saved, h.frame);
    moveClock(h.frame);
    assert.deepEqual(h.kernel.step(h.frame).impulses, [], 'same numeric ids denote different occupants after recycling');
    const bridge = linked(seed);
    const bridgeSaved = JSON.parse(JSON.stringify(bridge.kernel.serialize()));
    bridge.frame.bodies = bridge.bodies.filter((entry) => entry.id !== 12);
    bridge.kernel.restore(bridgeSaved, bridge.frame);
    const result = bridge.kernel.transferImpulse({ bodyId: 11, impulse: { x: 100, z: 0 }, eventId: 'after-loss' }, bridge.frame);
    assert.equal(result.accepted, false, 'a missing endpoint cannot be rehydrated by its saved link');
    assert.equal(bridge.frame.bodies.length, 1, 'restoration never creates entities');
  });

  test(`seed ${seed}: deterministic admission does not depend on candidate iteration order`, () => {
    const a = fixture(seed);
    const b = fixture(seed);
    b.bodies.reverse();
    for (const h of [a, b]) {
      h.kernel.setFitted('orbital_magazine', h.frame);
      debit(h.kernel.handlePower(power('pull'), h.frame), h.frame);
      moveClock(h.frame);
    }
    assert.deepEqual(a.kernel.step(a.frame), b.kernel.step(b.frame), 'entity-map insertion history cannot change orbit admission');
  });
}

test('production event handlers add no swallowed event-bus faults', () => {
  const faults = busFaultSummary(512);
  assert.equal(faults.reduce((sum, row) => sum + row.faults, 0), INITIAL_BUS_FAULTS,
    JSON.stringify(faults));
});
