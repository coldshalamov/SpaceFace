import assert from 'node:assert/strict';
import test from 'node:test';

import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { DOOR_PUBLIC_STARTERS, SURVIVAL_UNLOCK_CATALOG } from '../src/data/survivalUnlocks.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSlotList, fits } from '../src/systems/ships.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { isStarterAvailable, validateUnlockCatalog } from '../src/systems/survivalUnlocks.js';
import { heroManeuvers, heroManeuverReadiness, pinballRushReadiness } from '../src/systems/heroManeuvers.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { reservePhaseBlinkEnergy } from '../src/systems/phaseBlink.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createBus } from '../src/core/eventBus.js';
import { crucibleCombatLines } from '../src/ui/crucibleCombatReadout.js';
import { COMBAT_LAB_SURFACE_STARTERS } from '../src/data/combatLab.js';
import {
  buildCrucibleRetryRequest, clearCrucibleSetup, crucibleSetupFor, lastCrucibleSetup, requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';
import { bombScenario } from './helpers/bombScenario.mjs';
import { createSimulation } from '../src/core/sim.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { materializeWaveBatch } from '../src/systems/waveMaterialization.js';
import { bombs } from '../src/systems/bombs.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';

function prepareScenario(targetX = 112) {
  const scenario = bombScenario();
  const { state, player } = scenario;
  state.mode = 'flight';
  state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active' };
  player.boost = { ...SHIPS.find(row => row.id === 'ship_kestrel').boost,
    energy: 200, dashCost: 28, dashCd: 2, dashCdT: 0 };
  state.player.activeShipIndex = 0;
  state.player.ownedShips = [{ fittings: ['wpn_pulse_laser_s', 'mod_boomerang_run'] }];
  const target = scenario.spawn({
    pos: { x: targetX, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI,
    team: 1, hull: 80, hullMax: 80, radius: 12,
    data: { encounter: { id: 'm02-hostile' } },
  });
  state.player.targetId = target.id;
  const registry = { get(name) { return name === 'bombs' ? scenario.system : null; } };
  const maneuvers = Object.create(heroManeuvers);
  maneuvers.init({ state, bus: scenario.bus, registry });
  return { ...scenario, state, player, target, maneuvers };
}

function command(state) {
  state.input.actions ||= {};
  state.input.actions.bomb = { pressed: true, held: false };
  state.input.actions.dropBomb = true;
  state.input.actions.chargeThrow = true;
}

function tick(state, maneuvers, dt = 0.05) {
  state.tick += 1;
  state.simTime += dt;
  state.input.moveX = state.input.moveZ = state.input.turnIntent = 0;
  state.input.turn = state.input.strafe = state.input.throttle = 0;
  state.input.brake = state.input.boost = false;
  state.input.actions.bomb = { pressed: false, held: false };
  maneuvers.update(dt, state);
}

function placeOnRearAttackRail(player, target, distance = 80) {
  const rear = target.rot + Math.PI;
  player.pos.x = target.pos.x + Math.cos(rear) * distance;
  player.pos.z = target.pos.z + Math.sin(rear) * distance;
}

function advanceToCanonicalBombRelease(scenario) {
  placeOnRearAttackRail(scenario.player, scenario.target);
  for (let i = 0; i < 360 && scenario.maneuvers._run
    && !scenario.maneuvers._run.attackCommitted; i++) {
    tick(scenario.state, scenario.maneuvers);
  }
}

test('Boomerang Bomb Run is a legal fresh-profile public starter fitting', () => {
  const kit = COMBAT_LAB_STARTER_PACKAGES.find(row => row.id === 'boomerang_bomb_run');
  assert.ok(kit);
  assert.ok(DOOR_PUBLIC_STARTERS.includes(kit.id));
  assert.equal(isStarterAvailable(null, kit.id), true);
  assert.equal(validateUnlockCatalog().ok, true);
  assert.ok(SURVIVAL_UNLOCK_CATALOG.some(row => row.id === 'unlock_kit_boomerang_bomb_run'
    && row.defaultUnlocked && row.grants.starters.includes(kit.id)));
  assert.ok(COMBAT_LAB_SURFACE_STARTERS.some(row => row.id === kit.id), 'the normal starter picker receives it');
  const hull = SHIPS.find(row => row.id === kit.hullId);
  const slot = buildSlotList(hull)[kit.loadout[1].slotIndex];
  const module = MODULES.find(row => row.id === 'mod_boomerang_run');
  assert.equal(slot.type, 'utility');
  assert.equal(fits(slot, module), true);
  const setup = crucibleSetupFor({ starterId: kit.id, seed: 4242 });
  assert.equal(setup.ok, true, setup.issues?.map(row => row.message).join('; '));
  const emitted = [];
  clearCrucibleSetup();
  assert.equal(requestCrucibleRun({ emit: (name, payload) => emitted.push({ name, payload }) }, setup), true);
  assert.equal(lastCrucibleSetup().hullId, kit.hullId);
  assert.deepEqual(lastCrucibleSetup().loadout, kit.loadout);
  assert.deepEqual(buildCrucibleRetryRequest().setup.loadout, kit.loadout,
    'retry keeps the selected choreography kit');
  assert.ok(emitted.some(row => row.name === 'game:new'));
  clearCrucibleSetup();
});

test('Pinball Rush is a legal public starter fitting and excludes a simultaneous hero kit', () => {
  const kit = COMBAT_LAB_STARTER_PACKAGES.find(row => row.id === 'pinball_rush');
  assert.ok(kit);
  assert.ok(DOOR_PUBLIC_STARTERS.includes(kit.id));
  assert.equal(isStarterAvailable(null, kit.id), true);
  assert.equal(validateUnlockCatalog().ok, true);
  assert.ok(SURVIVAL_UNLOCK_CATALOG.some(row => row.id === 'unlock_kit_pinball_rush'
    && row.defaultUnlocked && row.grants.starters.includes(kit.id)));
  assert.ok(COMBAT_LAB_SURFACE_STARTERS.some(row => row.id === kit.id));
  const hull = SHIPS.find(row => row.id === kit.hullId);
  const slot = buildSlotList(hull)[kit.loadout[1].slotIndex];
  const module = MODULES.find(row => row.id === 'mod_pinball_rush');
  assert.equal(slot.type, 'utility');
  assert.equal(fits(slot, module), true);
  assert.equal(crucibleSetupFor({ starterId: kit.id, seed: 4242 }).ok, true);

  const s = prepareScenario();
  try {
    s.state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_pinball_rush'];
    s.player.boost = { energy: 100, max: 100, dashImpulse: 120, dashCost: 28, dashCd: 3, dashCdT: 0 };
    s.maneuvers.update(1 / 60, s.state);
    assert.equal(s.state.heroManeuverReadModel.mode, 'pinball');
    assert.equal(s.state.heroManeuverReadModel.status, 'armed');
    assert.equal(s.state.heroManeuverReadModel.targetName, `Hostile ${s.target.id}`);
    const rail = crucibleCombatLines(s.state).find(row => row.id === 'pinball-rush');
    assert.equal(rail.status, 'armed');
    assert.match(rail.text, /hold.*release.*ready/i);
    s.state.player.ownedShips[0].fittings.push('mod_boomerang_run');
    s.maneuvers.update(1 / 60, s.state);
    assert.equal(pinballRushReadiness(s.state).reason, 'fit_one_hero_maneuver');
    assert.equal(heroManeuverReadiness(s.state).reason, 'fit_one_hero_maneuver');
    assert.equal(s.state.heroManeuverReadModel.mode, 'pinball');
    assert.equal(s.state.heroManeuverReadModel.reason, 'fit_one_hero_maneuver');

    s.state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_boomerang_run', 'mod_veil_step'];
    assert.equal(heroManeuverReadiness(s.state).reason, 'fit_one_hero_maneuver',
      'Veil Step and Boomerang Run cannot both claim the fitted boost path');
    s.state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_pinball_rush', 'mod_veil_step'];
    assert.equal(pinballRushReadiness(s.state).reason, 'fit_one_hero_maneuver',
      'Veil Step and Pinball Rush cannot both claim the Shift gesture');
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('a Veil plus Pinball Shift hold is refused before either real flight owner consumes it', () => {
  const s = prepareScenario();
  try {
    const fittings = ['wpn_pulse_laser_s', 'mod_pinball_rush', 'mod_veil_step'];
    s.state.player.ownedShips[0].fittings = fittings;
    s.player.data = { ...s.player.data,
      derived: getDerivedStats('ship_kestrel', fittings) };
    s.state.input.boost = true;
    s.state.input.actions ||= {};
    s.state.input.actions.boost = { pressed: true, held: true };
    const phaseEvents = [];
    s.bus.on('ship:phaseBlink', event => phaseEvents.push(event));

    s.maneuvers.update(1 / 60, s.state);
    assert.equal(s.maneuvers._pinball, null, 'the conflicting Pinball gesture is rejected');
    assert.equal(s.state.heroManeuverReadModel.reason, 'fit_one_hero_maneuver');
    assert.equal(s.state.flightRuntime.heroManeuverBoost?.suppressBoost, true,
      'the rejected hold owns the shared Shift input for this tick');

    const flight = Object.create(flightV3);
    flight.init({ state: s.state, bus: s.bus, helpers: { getEntity: id => s.state.entities.get(id) } });
    flight._stepCraft(s.player, s.state.input, 1 / 60, s.state, true);
    assert.notEqual(s.player._phaseBlink?.aiming, true,
      'the V3 Veil owner does not start a second interpretation of the same raw Shift hold');
    assert.equal(phaseEvents.length, 0, 'no competing phase step is emitted');
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('Crucible Pinball readout trusts the worker projection when private sim inputs are absent', () => {
  const player = { alive: true };
  const state = {
    run: { kind: 'survival', phase: 'active' },
    mode: 'flight',
    player: { ownedShips: [{ fittings: ['mod_pinball_rush'] }] },
    playerId: 7,
    entities: new Map([[7, player]]),
    heroManeuverReadModel: { mode: 'pinball', phase: 'ready', status: 'armed',
      reason: 'ready', text: 'ready · Needle · 28 cap', targetName: 'Needle' },
  };
  const row = crucibleCombatLines(state).find(line => line.id === 'pinball-rush');
  assert.equal(row.status, 'armed');
  assert.match(row.text, /ready · Needle/);
});

test('newGame synchronously clears an active Pinball lease and its worker status', () => {
  const s = prepareScenario();
  try {
    s.state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_pinball_rush'];
    s.player.boost = { energy: 100, max: 100, dashImpulse: 120, dashCost: 28, dashCdT: 0 };
    s.state.input.boost = true;
    s.state.input.actions ||= {};
    s.state.input.actions.boost = { held: true };
    s.maneuvers.update(1 / 60, s.state);
    assert.ok(s.maneuvers._pinball, 'hold began the active maneuver');
    assert.equal(s.state.flightRuntime.heroManeuverBoost?.suppressBoost, true);
    s.maneuvers.newGame();
    assert.equal(s.maneuvers._pinball, null);
    assert.equal(s.state.flightRuntime.heroManeuverBoost, null);
    assert.equal(s.state.flightRuntime.heroManeuverStatus.phase, 'pinball_interrupted');
    assert.equal(s.state.heroManeuverReadModel.mode, 'pinball');
    assert.equal(s.state.heroManeuverReadModel.phase, 'pinball_interrupted');
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('Veil HUD projection reports the phase owner landing, energy, and cooldown without writing them', () => {
  const player = { id: 1, alive: true, occupantGeneration: 4, hull: 100, hullMax: 100,
    pos: { x: 0, z: 0 }, rot: 0, boost: { energy: 100, max: 100 },
    _phaseBlink: { aiming: true, active: true, dist: 80, readyAt: 0 } };
  const state = { mode: 'flight', run: { kind: 'survival', phase: 'active' }, tick: 6, simTime: 5,
    playerId: player.id, player: { activeShipIndex: 0, ownedShips: [{ fittings: ['mod_veil_step'] }] },
    entities: new Map([[player.id, player]]), input: { actions: {} } };
  const maneuvers = Object.create(heroManeuvers);
  maneuvers.init({ state, bus: createBus(), registry: { get() { return null; } } });
  try {
    maneuvers.update(1 / 60, state);
    const read = state.heroManeuverReadModel;
    assert.equal(read.mode, 'veil_step');
    assert.equal(read.status, 'armed');
    assert.equal(read.distance, 80);
    assert.equal(read.validLanding, true);
    assert.ok(read.veil.cost > 0);
    assert.equal(player.boost.energy, 100, 'projection never spends phase energy');

    player._phaseBlink.active = false;
    player._phaseBlink.dist = 12;
    maneuvers.update(1 / 60, state);
    assert.equal(read.status, 'blocked');
    assert.equal(read.reason, 'no_clear_landing');
    assert.equal(read.validLanding, false);

    player._phaseBlink.aiming = false;
    player._phaseBlink.readyAt = 10;
    player.boost.energy = 20;
    maneuvers.update(1 / 60, state);
    assert.equal(read.reason, 'phase_recharging', 'cooldown is the current refusal');
    player._phaseBlink.readyAt = 0;
    state.simTime = 11;
    maneuvers.update(1 / 60, state);
    assert.equal(read.reason, 'needs_42_energy');
  } finally {
    maneuvers.destroy();
  }
});

test('Pinball Rush hold/release spends one canonical dash and leaves contacts to Rapier', async () => {
  const s = prepareScenario(58);
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  let combatSystem = null;
  let consequences = null;
  const previousImpulseConsequences = COMBAT_FLAGS.weaponImpulseConsequences;
  try {
    const { state, player, target, maneuvers, bus } = s;
    state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_pinball_rush'];
    player.data = { ...(player.data || {}), derived: getDerivedStats('ship_kestrel', ['wpn_pulse_laser_s', 'mod_pinball_rush']) };
    player.boost = { energy: 100, max: 100, dashImpulse: 120, dashCost: 28, dashCd: 3, dashCdT: 0 };
    player.physicsBody = { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 12, mass: 32, inertiaY: 3200 };
    target.physicsBody = { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 10, mass: 32, inertiaY: 100 };
    target.data.runCohort = 'survival';
    target.data.runWave = 1;
    state.player.targetId = target.id;
    player.rot = Math.atan2(target.pos.z - player.pos.z, target.pos.x - player.pos.x);
    state.run.phase = 'active';
    const dashEvents = [];
    const impacts = [];
    const damage = [];
    const kills = [];
    bus.on('ship:dash', payload => dashEvents.push(payload));
    bus.on('physics:impact', payload => impacts.push(payload));
    bus.on('combat:damage', payload => damage.push(payload));
    bus.on('entity:killed', payload => kills.push(payload));
    COMBAT_FLAGS.weaponImpulseConsequences = true;
    combatSystem = Object.create(combat);
    combatSystem.init({ state, bus, helpers: s.helpers, registry: { get: name => name === 'combat' ? combatSystem : null } });
    consequences = Object.create(collisionConsequences);
    consequences.init({ state, bus, helpers: s.helpers, registry: { get: name => name === 'combat' ? combatSystem : null } });
    assert.equal(pinballRushReadiness(state).status, 'armed');

    state.input.boost = true;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    assert.equal(state.flightRuntime.heroManeuverStatus.phase, 'pinball_charge');
    assert.equal(player.boost.energy, 100, 'charging reserves no dash energy');
    const chargingLine = crucibleCombatLines(state).find(row => row.id === 'pinball-rush');
    assert.match(chargingLine.text, /charging/i, 'the worker readmodel gives the live charge state to the fitted ability rail');
    for (let i = 0; i < 24; i++) {
      state.tick += 1;
      state.simTime += 1 / 60;
      maneuvers.update(1 / 60, state);
    }
    state.input.boost = false;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    const request = state.flightRuntime.heroManeuverBoost;
    assert.ok(request?.dashRequestId, 'release submits one life/tick-bound request to flightV3');

    const flight = Object.create(flightV3);
    flight.init({ state, bus, helpers: { getEntity: id => state.entities.get(id) } });
    native.syncFromEntities(state.entityList);
    flight._stepCraft(player, state.input, 1 / 60, state, true);
    native.syncFromEntities(state.entityList);
    native.step(1 / 60, state.tick);
    assert.equal(state.flightRuntime.heroManeuverDashReceipt?.accepted, true);
    assert.equal(player.boost.energy, 72, 'flightV3 charges its canonical dash cost exactly once');
    assert.equal(dashEvents.length, 1, 'the existing ship:dash event supplies audio, VFX and haptics');
    assert.ok(Math.hypot(player.vel.x, player.vel.z) > 60, 'Rapier adopts the committed impulse as real hull velocity');

    state.input.boost = false;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    assert.equal(state.flightRuntime.heroManeuverStatus.phase, 'pinball_dash');
    for (let i = 0; i < 36; i++) {
      state.tick += 1;
      state.simTime += 1 / 60;
      maneuvers.update(1 / 60, state);
      flight._stepCraft(player, state.input, 1 / 60, state, true);
      native.syncFromEntities(state.entityList);
      native.step(1 / 60, state.tick);
      for (const impact of native.drainContactImpacts()) bus.emit('physics:impact', {
        ...impact, tick: state.tick, backend: 'rapier-dynamic', consequenceKernelVersion: 1,
      });
      consequences.update(1 / 60, state);
      bus.flush();
    }
    assert.ok(impacts.some(row => row.aId === player.id && row.bId === target.id
      || row.bId === player.id && row.aId === target.id), 'the committed dash reaches the locked hull through a real Rapier contact');
    assert.equal(state.flightRuntime.heroManeuverStatus.contactCount, 1,
      'the ability counts the real player-caused contact before the target is retired by combat');
    assert.ok(damage.some(row => row.targetId === target.id),
      `collisionConsequences routes the physical hit through the canonical combat kernel (impact=${JSON.stringify(impacts[0])}, hull=${target.hull}, target=${JSON.stringify(target)})`);
    assert.equal(target.alive, false, 'lethal dash contact retires the target through canonical combat');
    assert.equal(kills.length, 1);
    assert.equal(kills[0].killerId, player.id);
    assert.equal(kills[0].bountyCr, 0, 'a survival kill publishes through the run reward owner without promising campaign credits');
    assert.equal(state.flightRuntime.heroManeuverStatus.phase, 'pinball_target_lost',
      'a destroyed locked target ends the bounded dash state without a second hit');
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = previousImpulseConsequences;
    consequences?.destroy();
    combatSystem?.destroy?.();
    native.dispose();
    s.maneuvers.destroy();
    s.close();
  }
});

test('Pinball Rush refusals, recycled targets, and teardown never spend dash energy', () => {
  const blocked = prepareScenario(112);
  try {
    const { state, player, maneuvers, bus } = blocked;
    state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_pinball_rush'];
    player.boost = { energy: 80, max: 100, dashImpulse: 120, dashCost: 28, dashCd: 3, dashCdT: 0 };
    player.rot = 0;
    blocked.target.pos.x = 400;
    const dashEvents = [];
    bus.on('ship:dash', row => dashEvents.push(row));
    state.input.boost = true;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    assert.equal(maneuvers._pinball, null);
    assert.equal(state.flightRuntime.heroManeuverStatus.reason, 'hostile_out_of_range');
    assert.equal(player.boost.energy, 80);
    assert.equal(dashEvents.length, 0);
  } finally {
    blocked.maneuvers.destroy();
    blocked.close();
  }

  const recycled = prepareScenario(112);
  try {
    const { state, player, target, maneuvers, bus } = recycled;
    state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_pinball_rush'];
    player.boost = { energy: 80, max: 100, dashImpulse: 120, dashCost: 28, dashCd: 3, dashCdT: 0 };
    state.input.boost = true;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    assert.equal(maneuvers._pinball.phase, 'charge');
    const replacement = { ...target, occupantGeneration: target.occupantGeneration + 1, alive: true };
    target.alive = false;
    state.entities.set(target.id, replacement);
    state.entityList = state.entityList.map(row => row === target ? replacement : row);
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    assert.equal(maneuvers._pinball, null);
    assert.equal(state.flightRuntime.heroManeuverStatus.reason, 'locked_target_lost');
    assert.equal(player.boost.energy, 80);
    bus.emit('player:death', { playerId: player.id });
    assert.equal(state.flightRuntime.heroManeuverBoost, null);
  } finally {
    recycled.maneuvers.destroy();
    recycled.close();
  }
});

test('Pinball Rush cancels a short or modal charge and respects canonical dash cooldown', () => {
  const s = prepareScenario(112);
  try {
    const { state, player, maneuvers } = s;
    state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_pinball_rush'];
    player.boost = { energy: 80, max: 100, dashImpulse: 120, dashCost: 28, dashCd: 3, dashCdT: 0 };
    const energy = player.boost.energy;
    state.input.boost = true;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    state.input.boost = false;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    assert.equal(state.flightRuntime.heroManeuverStatus.reason, 'charge_too_short');
    assert.equal(player.boost.energy, energy);

    player.boost.dashCdT = 1;
    state.input.boost = true;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    assert.equal(maneuvers._pinball, null);
    assert.equal(state.flightRuntime.heroManeuverStatus.reason, 'dash_recharging');
    assert.equal(player.boost.energy, energy);

    player.boost.dashCdT = 0;
    state.input.boost = false;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    state.input.boost = true;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    assert.equal(maneuvers._pinball.phase, 'charge');
    state.ui.screenStack.push('pause');
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    assert.equal(maneuvers._pinball, null);
    assert.equal(state.flightRuntime.heroManeuverBoost, null);
    assert.equal(player.boost.energy, energy);
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('Pinball Rush cannot ghost through a heavy body; native collision arrests the dash and recoils the pilot', async () => {
  const s = prepareScenario(58);
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  try {
    const { state, player, target, maneuvers, bus } = s;
    state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_pinball_rush'];
    player.data = { ...(player.data || {}), derived: getDerivedStats('ship_kestrel', ['wpn_pulse_laser_s', 'mod_pinball_rush']) };
    player.boost = { energy: 100, max: 100, dashImpulse: 120, dashCost: 28, dashCd: 3, dashCdT: 0 };
    player.physicsBody = { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 12, mass: 32, inertiaY: 3200 };
    target.mass = 3000;
    target.radius = 28;
    target.hull = target.hullMax = 10000;
    target.physicsBody = { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 28, mass: 3000, inertiaY: 800000 };
    player.rot = 0;
    const impacts = [];
    bus.on('physics:impact', impact => impacts.push(impact));
    state.input.boost = true;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    for (let i = 0; i < 24; i++) {
      state.tick += 1;
      state.simTime += 1 / 60;
      maneuvers.update(1 / 60, state);
    }
    state.input.boost = false;
    state.tick += 1;
    state.simTime += 1 / 60;
    maneuvers.update(1 / 60, state);
    const flight = Object.create(flightV3);
    flight.init({ state, bus, helpers: { getEntity: id => state.entities.get(id) } });
    native.syncFromEntities(state.entityList);
    flight._stepCraft(player, state.input, 1 / 60, state, true);
    native.syncFromEntities(state.entityList);
    native.step(1 / 60, state.tick);
    let firstContactSpeedChange = 0;
    for (let i = 0; i < 42; i++) {
      state.tick += 1;
      state.simTime += 1 / 60;
      maneuvers.update(1 / 60, state);
      flight._stepCraft(player, state.input, 1 / 60, state, true);
      native.syncFromEntities(state.entityList);
      const speedBefore = Math.hypot(player.vel.x, player.vel.z);
      native.step(1 / 60, state.tick);
      for (const impact of native.drainContactImpacts()) {
        if (impact.aId === player.id && impact.bId === target.id
          || impact.bId === player.id && impact.aId === target.id) {
          firstContactSpeedChange = Math.max(firstContactSpeedChange,
            Math.abs(speedBefore - Math.hypot(player.vel.x, player.vel.z)));
          bus.emit('physics:impact', { ...impact, tick: state.tick,
            backend: 'rapier-dynamic', consequenceKernelVersion: 1 });
        }
      }
    }
    assert.ok(impacts.some(impact => impact.aId === player.id && impact.bId === target.id
      || impact.bId === player.id && impact.aId === target.id), 'the heavy target is a real blocking collider');
    assert.ok(firstContactSpeedChange > 8, `heavy-body recoil was only ${firstContactSpeedChange.toFixed(1)} WU/s`);
    assert.ok(Math.hypot(target.pos.x - 58, target.pos.z) < 12,
      'the massive target resists displacement instead of behaving like a pinball-sized enemy');
    assert.equal(target.alive, true, 'the light hull cannot erase a heavy body with a choreography shortcut');
  } finally {
    native.dispose();
    s.maneuvers.destroy();
    s.close();
  }
});

test('one Bomb command makes a physical V3 bank, drops one canonical bomb, and phases to the certified anchor', async () => {
  const s = prepareScenario(190);
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  try {
    const { state, player, maneuvers, events } = s;
    const anchor = { x: player.pos.x, z: player.pos.z };
    const phaseEvents = [];
    s.bus.on('ship:phaseBlink', payload => phaseEvents.push(payload));
    const toasts = [];
    s.bus.on('toast', payload => toasts.push(payload));
    const startEnergy = player.boost.energy;
    assert.equal(heroManeuverReadiness(state).status, 'armed');
    command(state);
    maneuvers.update(1 / 60, state);
    assert.ok(toasts.some(row => row.text.includes(`Hostile ${s.target.id} locked`)),
      'acceptance names the actual locked target instead of an absent readiness-only field');
    assert.equal(state.input.actions.dropBomb, false, 'the ordinary bomb consumer cannot duplicate the command');
    assert.equal(state.bombs.rack.cells[0].count, 4, 'bomb stock is reserved, not consumed, at start');
    assert.ok(Math.abs(player.boost.energy - (startEnergy - 111.2)) < 1e-9,
      'the longer physical sortie reserves its larger phase return cost once');
    const intent = state.flightRuntime.heroManeuverIntent;
    assert.equal(intent.playerId, player.id);
    assert.equal(intent.occupantGeneration, player.occupantGeneration);
    assert.ok(Math.abs(intent.throttle) <= 1 && Math.abs(intent.strafe) <= 1 && Math.abs(intent.turn) <= 1);
    assert.equal(state.flightRuntime.heroManeuverStatus.phase, 'bank');
    player.data = { ...(player.data || {}), derived: getDerivedStats('ship_kestrel', ['wpn_pulse_laser_s', 'mod_boomerang_run']) };
    player.physicsBody = { schemaVersion: 1, dynamic: true, shape: 'ball', radius: player.radius,
      mass: player.mass, inertiaY: 3200 };
    s.target.physicsBody = { schemaVersion: 1, dynamic: false, shape: 'ball', radius: s.target.radius,
      mass: 1000, inertiaY: 1 };
    native.syncFromEntities(state.entityList);
    const flight = Object.create(flightV3);
    flight.init({ state, bus: s.bus, helpers: { getEntity: id => state.entities.get(id) } });
    flight._stepCraft(player, state.input, 1 / 60, state, true);
    const physicsCommand = consumePhysicsCommand(player);
    assert.ok(physicsCommand?.control?.force,
      'flightV3 consumes the leased intent into canonical physics control');
    assert.equal(physicsCommand.control.source, 'player-flight-v3');
    assert.ok(Math.hypot(physicsCommand.control.force.x, physicsCommand.control.force.z) > 0,
      'the maneuver submits physical thrust instead of moving the entity pose');

    let farthestFromAnchor = 0;
    let releasePose = null;
    s.bus.on('bombs:dropped', () => { releasePose = { x: player.pos.x, z: player.pos.z }; });
    let lastAngle = Math.atan2(player.pos.z - s.target.pos.z, player.pos.x - s.target.pos.x);
    let angleTravel = 0;
    for (let i = 0; i < 900 && maneuvers._run; i++) {
      tick(state, maneuvers, 1 / 60);
      flight._stepCraft(player, state.input, 1 / 60, state, true);
      native.syncFromEntities(state.entityList);
      native.step(1 / 60, state.tick);
      farthestFromAnchor = Math.max(farthestFromAnchor,
        Math.hypot(player.pos.x - anchor.x, player.pos.z - anchor.z));
      const angle = Math.atan2(player.pos.z - s.target.pos.z, player.pos.x - s.target.pos.x);
      let delta = angle - lastAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      angleTravel += Math.abs(delta);
      lastAngle = angle;
    }
    assert.equal(maneuvers._run, null);
    assert.ok(farthestFromAnchor > 5, `native V3/Rapier bank displacement was only ${farthestFromAnchor.toFixed(2)} WU`);
    assert.ok(farthestFromAnchor <= 520, `native bank exceeded its reserved return envelope (${farthestFromAnchor.toFixed(2)} WU)`);
    assert.ok(angleTravel > 2.4, `native trajectory did not cross the locked target's flank (${angleTravel.toFixed(3)} rad)`);
    assert.equal(events('dropped').length, 1, 'attack commitment uses bombs.drop once');
    const dropped = state.entities.get(events('dropped')[0].bombId);
    assert.ok(releasePose, 'the canonical bomb is released from the live hull pose');
    const releaseDx = releasePose.x - s.target.pos.x;
    const releaseDz = releasePose.z - s.target.pos.z;
    const releaseDistance = Math.hypot(releaseDx, releaseDz);
    const rearDot = (releaseDx / releaseDistance) * -Math.cos(s.target.rot)
      + (releaseDz / releaseDistance) * -Math.sin(s.target.rot);
    assert.ok(rearDot >= 0.65,
      `bomb released before the target's rear-side attack region (rear dot ${rearDot.toFixed(2)})`);
    assert.ok(releaseDistance >= 52 && releaseDistance <= 132,
      `bomb release range ${releaseDistance.toFixed(1)} WU was outside the authored attack rail`);
    assert.equal(dropped.data.bombId, 'bomb_frag');
    assert.equal(state.bombs.rack.cells[0].count, 3, 'only canonical bomb release consumes a round');
    assert.ok(events('dropped')[0].ownerId === player.id);
    assert.deepEqual(phaseEvents[0]?.to, anchor,
      'phaseBlink adopts the original certified anchor after the physical bank');
    assert.ok(Math.hypot(player.pos.x - anchor.x, player.pos.z - anchor.z) < 2,
      'the production native sync consumes the phase resync before ordinary motion resumes');
    assert.equal(state.flightRuntime.heroManeuverIntent, null);
    assert.equal(phaseEvents.length, 1, 'phaseBlink publishes its existing visible arrival event once');
    assert.ok(player.boost.energy >= 0);
  } finally {
    native.dispose();
    s.maneuvers.destroy();
    s.close();
  }
});

for (const m02Case of [
  { warmupTicks: 30, minRange: 190, maxRange: 300 },
  { warmupTicks: 120, minRange: 120, maxRange: 150 },
]) test(`M02 commits against a moving production wave-1 target at ${m02Case.minRange}-${m02Case.maxRange} WU`, async () => {
  const tactical = createTacticalAISystem({ config: { enemyMind: { enabled: false } } });
  const sim = createSimulation({ seed: 4242,
    systems: [aiPorts, tactical, heroManeuvers, bombs],
    updateOrder: [tactical, aiPorts, heroManeuvers, bombs] });
  const { state, registry } = sim;
  const liveManeuvers = registry.get('heroManeuvers');
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  try {
    state.mode = 'flight';
    state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1, seed: 4242 };
    const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      rot: Math.PI * 0.75, radius: 12, mass: 400, hull: 200, hullMax: 200, shield: 0,
      boost: { ...SHIPS.find(row => row.id === 'ship_kestrel').boost,
        energy: 200, dashCost: 28, dashCd: 2, dashCdT: 0 }, physicsBody: { schemaVersion: 1, dynamic: true,
        shape: 'ball', radius: 12, mass: 400, inertiaY: 3200 },
      data: { defId: 'ship_kestrel', derived: getDerivedStats('ship_kestrel', ['wpn_pulse_laser_s', 'mod_boomerang_run']),
        fittings: ['wpn_pulse_laser_s', 'mod_boomerang_run'], ai: {} } });
    state.playerId = player.id;
    state.player.activeShipIndex = 0;
    state.player.ownedShips = [{ fittings: ['wpn_pulse_laser_s', 'mod_boomerang_run'] }];
    state.bombs.rack.cells[0] = { id: 'bomb_frag', count: 4 };
    state.bombs.selectedId = 'bomb_frag';
    const plan = planWave({ seed: 4242, arenaId: 'helios_core', wave: 1, mode: 'swarm', ruleset: 'swarm' });
    assert.ok(plan && plan.error == null, 'production wave planner returns a live Swarm plan');
    const first = plan.packages[0];
    assert.equal(first.enemyId, 'wasp_swarmer');
    state.spawnBudget = undefined;
    sim.helpers.spawnBudget = makeBudgetApi(state);
    const receipt = materializeWaveBatch(registry.ctx, { ownerId: 'survival-wave:wave-1',
      enemyId: first.enemyId, count: first.count, seed: 4242, wave: 1, packageIndex: 0,
      batchIndex: 0, gateGroup: first.gateGroup, distance: plan.swarm.spawnDistance, swarm: true });
    assert.equal(receipt.admitted, first.count, 'the complete first authored wave package enters through its production materializer');
    const target = state.entities.get(receipt.spawnedIds[0]);
    assert.equal(target.data.runCohort, 'survival');
    assert.equal(target.data.runWave, 1);
    assert.equal(target.data.ai.forcePlayerTarget, true);
    state.player.targetId = target.id;
    const initial = { x: target.pos.x, z: target.pos.z };
    state.physicsRuntime ||= {};
    state.physicsRuntime.diagnostics = { backend: 'rapier-dynamic', sg02Ready: true };
    native.syncFromEntities(state.entityList);
    for (let i = 0; i < m02Case.warmupTicks; i++) {
      sim.step(1 / 60);
      native.syncFromEntities(state.entityList);
      native.step(1 / 60, state.tick);
    }
    assert.equal(target.alive, true);
    assert.ok(Math.hypot(target.pos.x - initial.x, target.pos.z - initial.z) > 4,
      `the production AI/flight/Rapier path moved the admitted hostile before the command (start=${JSON.stringify(initial)} end=${JSON.stringify(target.pos)} intent=${JSON.stringify(target.data.intent)} ai=${JSON.stringify(target.data.ai)} diagnostics=${JSON.stringify(sim.helpers.inspectAIPorts?.())})`);
    const distance = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
    assert.ok(distance >= m02Case.minRange && distance <= m02Case.maxRange,
      `ordinary first-wave target distance ${distance.toFixed(1)} WU is inside the selected live lock band`);
    player.rot = Math.atan2(target.pos.z - player.pos.z, target.pos.x - player.pos.x);
    assert.equal(heroManeuverReadiness(state).status, 'armed', heroManeuverReadiness(state).reason);
    player.data = { ...(player.data || {}), derived: getDerivedStats('ship_kestrel', ['wpn_pulse_laser_s', 'mod_boomerang_run']) };
    player.physicsBody = { schemaVersion: 1, dynamic: true, shape: 'ball', radius: player.radius,
      mass: player.mass, inertiaY: 3200 };
    target.physicsBody = { schemaVersion: 1, dynamic: true, shape: 'ball', radius: target.radius,
      mass: 1000, inertiaY: 1 };
    native.syncFromEntities(state.entityList);
    const flight = Object.create(flightV3);
    flight.init({ state, bus: sim.bus, helpers: { getEntity: id => state.entities.get(id) } });
    const anchor = { x: player.pos.x, z: player.pos.z };
    let releasePose = null;
    let releaseTargetPose = null;
    let releaseElapsed = null;
    let releasePayload = null;
    let releasedBombVelocity = null;
    const dashEvents = [];
    sim.bus.on('ship:dash', event => dashEvents.push(event));
    sim.bus.on('bombs:dropped', payload => {
      releasePose = { x: player.pos.x, z: player.pos.z };
      releaseTargetPose = { x: target.pos.x, z: target.pos.z, rot: target.rot,
        vel: { x: target.vel?.x || 0, z: target.vel?.z || 0 } };
      releaseElapsed = liveManeuvers._run?.elapsed ?? null;
      releasePayload = payload;
      const bomb = state.entities.get(payload.bombId);
      releasedBombVelocity = { x: bomb?.vel?.x, z: bomb?.vel?.z };
    });
    const acceptedReadiness = heroManeuverReadiness(state);
    assert.equal(acceptedReadiness.status, 'armed');
    assert.ok(Math.abs(acceptedReadiness.cost - 111.2) < 1e-8,
      'the full 520 WU phase return envelope is reserved up front');
    assert.ok(Math.abs(acceptedReadiness.energyRequired - 196.2) < 1e-8,
      'readiness includes one Kestrel dash and its 1.5 second boost pulse');
    command(state);
    sim.step(1 / 60);
    assert.equal(liveManeuvers._run?.targetId, target.id,
      'the normal Bomb command accepts the live wave cohort, not a test-only static dummy');
    assert.equal(state.flightRuntime.heroManeuverStatus.phase, 'bank');
    let maxAnchorDistance = 0;
    const bankSamples = [];
    const originalTargetPos = { x: target.pos.x, z: target.pos.z };
    for (let i = 0; i < 900 && liveManeuvers._run; i++) {
      sim.step(1 / 60);
      flight._stepCraft(player, state.input, 1 / 60, state, true);
      native.syncFromEntities(state.entityList);
      native.step(1 / 60, state.tick);
      maxAnchorDistance = Math.max(maxAnchorDistance,
        Math.hypot(player.pos.x - anchor.x, player.pos.z - anchor.z));
      if (i % 60 === 59) bankSamples.push({ sec: (i + 1) / 60,
        player: { x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1) },
        target: { x: +target.pos.x.toFixed(1), z: +target.pos.z.toFixed(1) },
        targetRot: +target.rot.toFixed(2), phase: state.flightRuntime.heroManeuverStatus.phase });
    }
    assert.equal(liveManeuvers._run, null, 'the accepted bank reaches a terminal outcome');
    const bankTargetTravel = Math.hypot(target.pos.x - originalTargetPos.x, target.pos.z - originalTargetPos.z);
    assert.ok(bankTargetTravel > 4,
      `the target continues moving under the real wave AI during the bank (travel=${bankTargetTravel.toFixed(1)}, alive=${target.alive}, hull=${target.hull}, terminal=${state.flightRuntime.heroManeuverStatus.phase}/${state.flightRuntime.heroManeuverStatus.reason})`);
    assert.equal(state.bombs.rack.cells[0].count, 3,
      `a normal wave-1 M02 sortie must commit one canonical bomb (terminal=${state.flightRuntime.heroManeuverStatus.phase}, reason=${state.flightRuntime.heroManeuverStatus.reason}, player=${JSON.stringify(player.pos)}, target=${JSON.stringify(target.pos)}, targetRot=${target.rot}, targetTravel=${Math.hypot(target.pos.x - originalTargetPos.x, target.pos.z - originalTargetPos.z).toFixed(1)}, maxAnchor=${maxAnchorDistance.toFixed(1)}, samples=${JSON.stringify(bankSamples)})`);
    assert.ok(releasePose && releaseTargetPose, 'bomb release records the live player and target poses');
    assert.equal(releasePayload?.ownerId, player.id);
    assert.ok(Math.abs(releasedBombVelocity.x - releasePayload.vel.x) < 1e-8
      && Math.abs(releasedBombVelocity.z - releasePayload.vel.z) < 1e-8,
    'the spawned canonical bomb keeps the physical release velocity before the later phase return');
    assert.ok(releaseElapsed > 4.4 && releaseElapsed <= 8,
      `physical attack commits during the bounded sortie (${releaseElapsed?.toFixed(2)} s)`);
    assert.equal(dashEvents.length, 1, 'the bank burst uses exactly one canonical V3 dash impulse');
    const dx = releasePose.x - releaseTargetPose.x, dz = releasePose.z - releaseTargetPose.z;
    const releaseDistance = Math.hypot(dx, dz);
    const targetSpeed = Math.hypot(releaseTargetPose.vel.x, releaseTargetPose.vel.z);
    const facing = targetSpeed >= 12
      ? { x: releaseTargetPose.vel.x / targetSpeed, z: releaseTargetPose.vel.z / targetSpeed }
      : { x: Math.cos(releaseTargetPose.rot), z: Math.sin(releaseTargetPose.rot) };
    const rearDot = (dx / releaseDistance) * -facing.x + (dz / releaseDistance) * -facing.z;
    assert.ok(rearDot >= 0.65 && releaseDistance >= 52 && releaseDistance <= 132,
      `release pose must be behind the live target (distance=${releaseDistance.toFixed(1)}, rearDot=${rearDot.toFixed(2)})`);
    assert.ok(maxAnchorDistance <= 520, `physical bank exceeded its paid return envelope: ${maxAnchorDistance.toFixed(1)} WU`);
    assert.ok(Math.hypot(player.pos.x - anchor.x, player.pos.z - anchor.z) < 2,
      'the physical sortie returns through the certified phase landing');
    assert.equal(state.flightRuntime.heroManeuverIntent, null, 'the physical control lease is cleared on return');
    assert.equal(state.flightRuntime.heroManeuverBoost, null, 'the bank does not leak a boost request into the next frame');
  } finally {
    native.dispose();
    sim.dispose();
  }
});

test('manual override returns control at the real pose without releasing the reserved bomb', () => {
  const s = prepareScenario();
  try {
    const { state, maneuvers, player, events } = s;
    command(state);
    maneuvers.update(1 / 60, state);
    const energyAfterAccept = player.boost.energy;
    player.pos.x = 8;
    state.input.moveZ = 1;
    state.tick += 1;
    state.simTime += 0.05;
    maneuvers.update(0.05, state);
    assert.equal(maneuvers._run, null);
    assert.equal(state.flightRuntime.heroManeuverIntent, null);
    assert.equal(events('dropped').length, 0);
    assert.equal(player.pos.x, 8, 'interruption never snaps to the original anchor');
    assert.equal(player.boost.energy, energyAfterAccept, 'accepted cost is not charged a second time');
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('a loaded bomb still cycling refuses the command before phase energy is spent', () => {
  const s = prepareScenario();
  try {
    const { state, maneuvers, player, events } = s;
    const toasts = [];
    s.bus.on('toast', payload => toasts.push(payload));
    state.bombs.cooldowns.bomb_frag = state.simTime + 4;
    const energy = player.boost.energy;
    command(state);
    maneuvers.update(1 / 60, state);
    assert.equal(maneuvers._run, null);
    assert.equal(player.boost.energy, energy);
    assert.equal(state.bombs.rack.cells[0].count, 4);
    assert.equal(events('dropped').length, 0);
    assert.equal(state.input.actions.dropBomb, false);
    assert.ok(toasts.some(payload => payload.text.includes('bomb payload cycling')));
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('phase cooldown blocks a fresh run before its reserve is charged', () => {
  const s = prepareScenario();
  try {
    s.player._phaseBlink = { readyAt: s.state.simTime + 5 };
    const energy = s.player.boost.energy;
    assert.equal(heroManeuverReadiness(s.state).reason, 'phase_recharging');
    command(s.state);
    s.maneuvers.update(1 / 60, s.state);
    assert.equal(s.maneuvers._run, null);
    assert.equal(s.player.boost.energy, energy);
    assert.equal(reservePhaseBlinkEnergy(s.player, 140, s.state.simTime), null,
      'the canonical reservation owner independently enforces Veil cooldown');
    assert.equal(s.player.boost.energy, energy);
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('the bank dash must be fitted and ready before M02 reserves energy', () => {
  const s = prepareScenario();
  try {
    const energy = s.player.boost.energy;
    s.player.boost.dashCdT = 0.5;
    assert.equal(heroManeuverReadiness(s.state).reason, 'dash_recharging');
    command(s.state);
    s.maneuvers.update(1 / 60, s.state);
    assert.equal(s.maneuvers._run, null);
    assert.equal(s.player.boost.energy, energy, 'a cooling dash is rejected without taking the return reserve');

    s.player.boost.dashCdT = 0;
    s.player.boost.dashImpulse = 0;
    assert.equal(heroManeuverReadiness(s.state).reason, 'dash_drive_unavailable');
    command(s.state);
    s.maneuvers.update(1 / 60, s.state);
    assert.equal(s.maneuvers._run, null);
    assert.equal(s.player.boost.energy, energy, 'a hull without the required physical dash stays uncharged');

    s.player.boost.dashImpulse = 150;
    s.player.boost.energy = 196;
    assert.equal(heroManeuverReadiness(s.state).reason, 'needs_197_total_energy');
    assert.match(heroManeuverReadiness(s.state).text, /needs 197 cap/,
      'the refusal names the total phase plus bank budget');
    command(s.state);
    s.maneuvers.update(1 / 60, s.state);
    assert.equal(s.maneuvers._run, null);
    assert.equal(s.player.boost.energy, 196, 'insufficient total budget is refused before any debit');
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('combat momentum stays usable when the predicted bank fits its priced return envelope', () => {
  const s = prepareScenario();
  try {
    s.player.vel.x = 50;
    assert.equal(heroManeuverReadiness(s.state).status, 'armed');
    s.player.vel.x = 100;
    assert.equal(heroManeuverReadiness(s.state).reason, 'slow_before_banking',
      'the physical return envelope remains a real cap above the supported combat speed');
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('target life loss before release aborts ordnance and returns only to a live certified anchor', () => {
  const s = prepareScenario();
  try {
    const { state, target, maneuvers, player, events } = s;
    command(state);
    maneuvers.update(1 / 60, state);
    const reused = { ...target, occupantGeneration: target.occupantGeneration + 1, alive: true };
    target.alive = false;
    state.entities.set(target.id, reused);
    state.entityList = state.entityList.map(entity => entity === target ? reused : entity);
    tick(state, maneuvers);
    assert.equal(maneuvers._run, null);
    assert.equal(events('dropped').length, 0);
    assert.equal(player.flags.noInterp, true);
    assert.equal(state.flightRuntime.heroManeuverStatus.phase, 'target_lost');
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('a moving locked target stays bound to the paid return envelope; post-release loss keeps the bomb live', () => {
  const beforeRelease = prepareScenario();
  try {
    const phases = [];
    beforeRelease.bus.on('ship:phaseBlink', event => phases.push(event));
    command(beforeRelease.state);
    beforeRelease.maneuvers.update(1 / 60, beforeRelease.state);
    beforeRelease.target.pos.x += 25;
    for (let i = 0; i < 60 && beforeRelease.maneuvers._run; i++) tick(beforeRelease.state, beforeRelease.maneuvers);
    advanceToCanonicalBombRelease(beforeRelease);
    assert.equal(beforeRelease.maneuvers._run?.attackCommitted, true);
    for (let i = 0; i < 180 && beforeRelease.maneuvers._run; i++) tick(beforeRelease.state, beforeRelease.maneuvers);
    assert.equal(beforeRelease.maneuvers._run, null);
    assert.equal(beforeRelease.events('dropped').length, 1,
      'normal hostile pursuit does not abort the accepted physical bank before its bomb release');
    assert.equal(phases.length, 1);
    assert.deepEqual(phases[0].to, { x: 0, z: 0 });
  } finally {
    beforeRelease.maneuvers.destroy();
    beforeRelease.close();
  }

  const afterRelease = prepareScenario();
  try {
    command(afterRelease.state);
    afterRelease.maneuvers.update(1 / 60, afterRelease.state);
    advanceToCanonicalBombRelease(afterRelease);
    assert.equal(afterRelease.maneuvers._run.attackCommitted, true);
    const bombId = afterRelease.maneuvers._run.bombEntityId;
    afterRelease.target.alive = false;
    afterRelease.target.hull = 0;
    tick(afterRelease.state, afterRelease.maneuvers);
    assert.equal(afterRelease.maneuvers._run, null);
    assert.equal(afterRelease.events('dropped').length, 1);
    assert.equal(afterRelease.state.entities.get(bombId)?.alive, true,
      'target loss after the attack commit does not erase canonical ordnance');
  } finally {
    afterRelease.maneuvers.destroy();
    afterRelease.close();
  }
});

test('modal and death teardown release the lease without releasing the reserved bomb', () => {
  const s = prepareScenario();
  try {
    const { state, maneuvers, events, bus, player } = s;
    command(state);
    maneuvers.update(1 / 60, state);
    state.ui.screenStack.push('pause');
    tick(state, maneuvers);
    assert.equal(maneuvers._run, null);
    assert.equal(events('dropped').length, 0);
    assert.equal(state.flightRuntime.heroManeuverIntent, null);
  } finally {
    s.maneuvers.destroy();
    s.close();
  }

  const second = prepareScenario();
  try {
    command(second.state);
    second.maneuvers.update(1 / 60, second.state);
    second.bus.emit('player:death', { playerId: second.player.id });
    assert.equal(second.maneuvers._run, null);
    assert.equal(second.events('dropped').length, 0);
    assert.equal(second.state.flightRuntime.heroManeuverIntent, null);
  } finally {
    second.maneuvers.destroy();
    second.close();
  }
});

test('late return obstruction refuses phase adoption and leaves the pilot at the actual position', () => {
  const s = prepareScenario();
  try {
    const { state, maneuvers, player, helpers, events } = s;
    const phaseEvents = [];
    s.bus.on('ship:phaseBlink', payload => phaseEvents.push(payload));
    command(state);
    maneuvers.update(1 / 60, state);
    advanceToCanonicalBombRelease(s);
    const before = { x: player.pos.x, z: player.pos.z };
    helpers.spawnEntity({ type: 'asteroid', pos: before, radius: 300, collides: true, hull: 100, hullMax: 100 });
    for (let i = 0; i < 180 && maneuvers._run; i++) tick(state, maneuvers);
    assert.equal(maneuvers._run, null);
    assert.equal(state.flightRuntime.heroManeuverStatus.phase, 'return_blocked');
    assert.deepEqual({ x: player.pos.x, z: player.pos.z }, before);
    assert.equal(phaseEvents.length, 0);
    assert.equal(events('dropped').length, 1, 'the already committed bomb remains a real live entity');
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('Crucible rail names the live lock, rebindable Bomb command, and current refusal', () => {
  const s = prepareScenario();
  try {
    const line = () => crucibleCombatLines(s.state).find(row => row.id === 'boomerang-bomb-run');
    assert.match(line().text, /4\/Y.*ready.*bomb_frag/i);
    s.state.player.targetId = null;
    s.state.tick = 6;
    s.state.simTime += 0.1;
    s.maneuvers.update(1 / 60, s.state);
    assert.equal(line().status, 'cooldown');
    assert.match(line().text, /lock a hostile/);
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('the readiness refusal and live maneuver status use the worker-owned readmodel', () => {
  const s = prepareScenario();
  try {
    const readiness = heroManeuverReadiness(s.state);
    assert.match(readiness.text, /197 cap/);
    assert.equal(readiness.energyRequired, 196.2);
    command(s.state);
    s.maneuvers.update(1 / 60, s.state);
    const readout = s.state.heroManeuverReadModel;
    assert.equal(readout.phase, 'bank');
    assert.equal(readout.targetId, s.target.id);
    assert.equal(readout.targetName, 'Hostile ' + s.target.id);
    assert.ok(Math.abs(readout.cost - 111.2) < 1e-8);
    assert.ok(Math.abs(readout.bankBoostCost - 85) < 1e-8);
    assert.ok(Math.abs(readout.energyRequired - 196.2) < 1e-8);
    assert.equal(crucibleCombatLines(s.state).find(row => row.id === 'boomerang-bomb-run').text,
      `Boomerang Run · ${readout.targetName} · physical bank · bomb reserved`);
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});

test('Boomerang terminal outcome remains projected briefly, with bomb commitment and readable reason', () => {
  const s = prepareScenario();
  try {
    command(s.state);
    s.maneuvers.update(1 / 60, s.state);
    s.maneuvers._finish('attack_region_missed', 'rear_attack_region_not_reached');
    const model = s.state.heroManeuverReadModel;
    assert.equal(model.phase, 'attack_region_missed');
    assert.equal(model.status, 'blocked');
    assert.equal(model.attackCommitted, false);
    assert.equal(model.energyRequired, 196.2);
    assert.match(model.text, /attack region missed · no bomb released/);

    s.state.tick = Math.ceil((s.state.tick + 180) / 6) * 6;
    s.maneuvers.update(0, s.state);
    assert.equal(s.state.heroManeuverReadModel.phase, 'ready',
      'fresh readiness replaces the terminal result after its brief reading window');
  } finally {
    s.maneuvers.destroy();
    s.close();
  }
});
