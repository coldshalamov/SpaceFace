import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createDamageRouter, scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { noteSwarmPilotAction, swarmPilotHasActed, swarmPilotIsActing } from '../src/systems/swarmSafety.js';
import { input } from '../src/systems/input.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';

function harness() {
  const state = createGameState(4242);
  state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1 };
  state.playerId = 1;
  const cohort = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 100, z: 0 },
    vel: { x: 30, z: 4 }, radius: 8, mass: 20, hull: 10, hullMax: 10, armorHp: 0, shield: 0,
    data: { runCohort: 'survival', ai: {} } };
  const rock = { id: 3, type: 'asteroid', alive: true, pos: { x: 105, z: 0 }, radius: 10, mass: 200, data: {} };
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 40, hull: 200, hullMax: 200,
    armorHp: 0, shield: 0, data: {} };
  state.entities = new Map([[player.id, player], [cohort.id, cohort], [rock.id, rock]]);
  state.entityList = [...state.entities.values()];
  state.mode = 'flight';
  const bus = createBus();
  const killed = [];
  const impulses = [];
  bus.on('entity:killed', receipt => killed.push(receipt));
  const route = createDamageRouter({ state, bus, catalog: createCombatCatalog(),
    helpers: { combatPhysics: { applyImpulse: request => { impulses.push(request); return true; } } } },
  { schedule() {} });
  return { state, cohort, rock, route, killed, impulses, bus };
}

for (const source of ['collision_terrain', 'collision_craft', 'material_blast']) {
  test(`idle Swarm ${source} preserves live cohort motion and admits harm after the pilot acts`, () => {
    const h = harness();
    const packet = scalarHitToDamagePacket({ damage: 100, damageType: 'kinetic',
      impulse: { x: 40, z: 0 }, source: { kind: source } });
    packet.flags = { allowAnyTarget: true, ignoreFriendlyFire: true };
    const request = { attackerId: source === 'collision_craft' ? h.cohort.id : h.rock.id,
      targetId: h.cohort.id, packet, origin: { kind: source } };
    const before = { ...h.cohort.vel };
    assert.equal(h.route(request).reason, 'swarm_waiting_for_input');
    assert.equal(h.cohort.alive, true);
    assert.equal(h.cohort.hull, 10);
    assert.deepEqual(h.cohort.vel, before, 'admission never writes a parking velocity');
    assert.equal(h.impulses.length, 1, 'physical impulse remains admitted');
    assert.deepEqual(h.killed, []);
    noteSwarmPilotAction(h.state);
    assert.equal(h.route(request).ok, true);
    assert.equal(h.cohort.alive, false);
    assert.equal(h.killed.length, 1);
  });
}

test('Adventure and Gauntlet contacts keep their existing lethal damage', () => {
  for (const run of [{ kind: 'adventure', phase: 'active' },
    { kind: 'survival', ruleset: 'scored', phase: 'active', wave: 1 }]) {
    const h = harness();
    h.state.run = run;
    assert.equal(h.route({ attackerId: h.rock.id, targetId: h.cohort.id,
      packet: scalarHitToDamagePacket({ damage: 100, damageType: 'kinetic' }) }).ok, true);
    assert.equal(h.killed.length, 1);
  }
});

test('an idle cohort dart retains its live proximity fuse until the pilot acts', () => {
  const h = harness();
  h.cohort.pos.x = 30;
  h.cohort.data.detonator = { triggerRange: 56, blastRadius: 96, impulse: 100, damage: 30 };
  const detonations = [];
  h.bus.on('detonator:detonated', receipt => detonations.push(receipt));
  const system = Object.create(impulseCharges);
  system.init({ state: h.state, bus: h.bus, helpers: {
    routeCombatDamage: h.route,
    combatPhysics: { applyImpulse: request => { h.impulses.push(request); return true; } },
  }, registry: { get() { return null; } } });
  system._tickDetonatorFuses(h.state);
  assert.equal(h.cohort.alive, true);
  assert.equal(system._detonatedEnts.has(h.cohort), false, 'the waiting fuse is not spent');
  assert.equal(detonations.length, 0);
  noteSwarmPilotAction(h.state);
  system._tickDetonatorFuses(h.state);
  assert.equal(h.cohort.alive, false);
  assert.equal(detonations.length, 1, 'the same staged body still detonates after admission');
  system._tickDetonatorFuses(h.state);
  assert.equal(detonations.length, 1);
  system.destroy();
});

test('physical verbs count as pilot acts even with the combat stick enabled', () => {
  for (const action of ['tetherFire', 'tetherCut', 'chargeThrow', 'chargeDetonate', 'dropBomb',
    'gyreSnare', 'throwArm', 'deployWell', 'deployRepulsor', 'deployMassSeed']) {
    const h = harness();
    h.state.input = { autoFire: true, actions: { [action]: true } };
    assert.equal(swarmPilotIsActing(h.state), true, action);
  }
  const h = harness();
  h.state.input = { autoFire: true, actions: { reelDelta: -0.5 } };
  assert.equal(swarmPilotIsActing(h.state), true, 'explicit reel control');
});

test('rebound charge input latches admission before its one-shot action is consumed', () => {
  const h = harness();
  h.state.settings.controls.bindings = { chargeThrow: ['KeyO'] };
  const host = Object.assign(Object.create(input), {
    _keys: { KeyO: true }, _ndc: { x: 0, y: 0 }, _screen: { x: 0, y: 0, active: false },
    _m0: false, _m1: false, _m2: false, _lastKbmMs: 0,
    helpers: { raycastToPlane: () => ({ x: 100, z: 0 }) }, bus: h.bus,
    gamepad: null, touch: null,
  });
  host.update(1 / 60, h.state);
  assert.equal(h.state.input.actions.chargeThrow, true);
  assert.equal(swarmPilotHasActed(h.state), true);
  h.state.input.actions.chargeThrow = false;
  assert.equal(swarmPilotHasActed(h.state), true, 'consumer clearing the edge cannot re-arm admission');
  h.state.run.wave++;
  assert.equal(swarmPilotHasActed(h.state), false, 'each new wave still has its own opener');
});

test('production worker DOM input admits damage on its own authoritative state', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { runtime, state } = lane.host;
    state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1 };
    state.mode = 'flight';
    state.ui.screenStack.length = 0;
    const victim = runtime.spawn({ type: 'ship', team: 1, hull: 100, hullMax: 100,
      shield: 0, armorHp: 0, pos: { x: -1850, z: -2200 }, data: { runCohort: 'survival' } });
    const kernel = runtime.getSystem('combat').ensureKernel();
    const hit = { attackerId: state.playerId, targetId: victim.id,
      packet: scalarHitToDamagePacket({ damage: 1, damageType: 'kinetic' }) };
    assert.equal(kernel.routeDamage(hit).reason, 'swarm_waiting_for_input');
    await lane.tick({ tick: 1, steps: 0, ackEnd: init.initRebuild?.end ?? 0,
      commands: [{ seq: 1, t: 'dom', p: { d: { type: 'mousedown', button: 0,
        offCanvas: false, uiCommand: false, neutralize: false } } }] });
    runtime.getSystem('input').update(1 / 60, state);
    assert.equal(state.input.fire, true);
    assert.equal(swarmPilotHasActed(state), true);
    assert.equal(kernel.routeDamage(hit).ok, true);
    assert.ok(victim.hull < 100, 'the worker-local canonical damage owner sees the act');
  } finally { lane.shutdown(); }
});

test('manual keyboard thrust under autoFire admits harm without a trigger pull', () => {
  const h = harness();
  h.state.input.autoFire = true;
  const host = Object.assign(Object.create(input), {
    state: h.state, _keys: {}, _ndc: { x: 0, y: 0 }, _screen: { x: 0, y: 0, active: false },
    _m0: false, _m1: false, _m2: false, _lastKbmMs: 0,
    helpers: { raycastToPlane: () => ({ x: 100, z: 0 }) }, bus: h.bus,
    gamepad: null, touch: null,
  });
  host.ingestLaneDomEvent({ type: 'keydown', code: 'KeyW', pressed: true, blocked: false });
  host.update(1 / 60, h.state);
  assert.equal(h.state.input.drawFlightManual, true, 'input already distinguishes deliberate controls from assist axes');
  assert.equal(swarmPilotHasActed(h.state), true);
});
