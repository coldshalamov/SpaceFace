import assert from 'node:assert/strict';
import test from 'node:test';

import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { DOOR_PUBLIC_STARTERS, SURVIVAL_UNLOCK_CATALOG } from '../src/data/survivalUnlocks.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { buildSlotList, fits, getDerivedStats } from '../src/systems/ships.js';
import { isStarterAvailable, validateUnlockCatalog } from '../src/systems/survivalUnlocks.js';
import {
  buildCrucibleRetryRequest, clearCrucibleSetup, crucibleSetupFor,
  CRUCIBLE_DEFAULT_STARTER_ID, lastCrucibleSetup, requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';
import { PHASE_BLINK, phaseBlinkCommitCost } from '../src/data/phaseBlink.js';
import { stepPhaseBlink } from '../src/systems/phaseBlink.js';
import { crucibleCombatLines } from '../src/ui/crucibleCombatReadout.js';
import { COMBAT_LAB_SURFACE_STARTERS } from '../src/data/combatLab.js';

test('Veil Step is a public legal Crucible package and leaves the default kit unchanged', () => {
  assert.equal(CRUCIBLE_DEFAULT_STARTER_ID, 'ricochet_runner');
  const starter = COMBAT_LAB_STARTER_PACKAGES.find((entry) => entry.id === 'veil_step');
  assert.ok(starter);
  assert.equal(starter.hullId, 'ship_kestrel');
  assert.deepEqual(starter.loadout, [
    { slotIndex: 0, defId: 'wpn_pulse_laser_s' },
    { slotIndex: 5, defId: 'mod_veil_step' },
  ]);
  const hull = SHIPS.find((entry) => entry.id === starter.hullId);
  const utilitySlot = buildSlotList(hull)[5];
  const blink = MODULES.find((entry) => entry.id === 'mod_veil_step');
  assert.equal(utilitySlot.type, 'utility');
  assert.equal(fits(utilitySlot, blink), true);
  const fittings = Array(buildSlotList(hull).length).fill(null);
  for (const item of starter.loadout) fittings[item.slotIndex] = item.defId;
  assert.equal(getDerivedStats(starter.hullId, fittings).phaseBlink, true,
    'the production fitting derivation enables the live V3 Veil input path');

  assert.ok(DOOR_PUBLIC_STARTERS.includes(starter.id));
  assert.ok(COMBAT_LAB_SURFACE_STARTERS.some((entry) => entry.id === starter.id),
    'the generated package picker includes the new choice');
  assert.equal(isStarterAvailable(null, starter.id), true, 'fresh Crucible profiles can select it');
  const unlock = SURVIVAL_UNLOCK_CATALOG.find((entry) => entry.id === 'unlock_kit_veil_step');
  assert.equal(unlock.defaultUnlocked, true);
  assert.deepEqual(unlock.grants.starters, ['veil_step']);
  assert.equal(validateUnlockCatalog().ok, true);

  const launch = crucibleSetupFor({ starterId: 'veil_step', seed: 4242 });
  assert.equal(launch.ok, true, launch.issues?.map((issue) => issue.message).join('; '));
  assert.equal(launch.value.hullId, 'ship_kestrel');
  assert.deepEqual(launch.value.loadout, starter.loadout);

  clearCrucibleSetup();
  const emitted = [];
  assert.equal(requestCrucibleRun({ emit: (name, payload) => emitted.push({ name, payload }) }, launch), true);
  assert.equal(lastCrucibleSetup().hullId, starter.hullId);
  assert.deepEqual(lastCrucibleSetup().loadout, starter.loadout);
  assert.deepEqual(buildCrucibleRetryRequest().setup.loadout, starter.loadout,
    'the selected Veil kit survives the same-run retry snapshot');
  assert.ok(emitted.some((event) => event.name === 'game:new'));
  clearCrucibleSetup();
});

function player(energy) {
  return {
    id: 'pilot', alive: true, type: 'ship', radius: 14, rot: 0,
    pos: { x: 0, y: 0, z: 0 }, prevPos: { x: 0, y: 0, z: 0 },
    boost: { energy, max: 200 },
  };
}

function stateFor(ship) {
  return {
    mode: 'flight', simTime: 10, tick: 600, playerId: ship.id,
    entityList: [ship], entities: new Map([[ship.id, ship]]),
    run: { kind: 'survival', ruleset: 'swarm', phase: 'active' },
    ui: { screenStack: [] },
    player: { activeShipIndex: 0, ownedShips: [{ fittings: ['wpn_pulse_laser_s', 'mod_veil_step'] }] },
    settings: { gameplay: { controlScheme: 'pilot' }, controls: { bindings: {} } },
  };
}

function recordingBus() {
  const events = [];
  return { events, emit(name, payload) { events.push({ name, payload }); } };
}

test('Veil Step keeps its last affordable preview and commits only when the capacitor can pay', () => {
  const ship = player(42);
  const state = stateFor(ship);
  const bus = recordingBus();
  const start = { ...ship.pos };

  for (let tick = 0; tick < 90; tick += 1) {
    const result = stepPhaseBlink({ entity: ship, held: true, dt: 1 / 60, state, bus, now: 10 + tick / 60 });
    assert.equal(result.busy, true);
    assert.deepEqual(ship.pos, start, 'preview never moves the physical hull');
    assert.ok(ship.boost.energy + 1e-8 >= phaseBlinkCommitCost(ship._phaseBlink.dist),
      'aim drain preserves enough energy to pay for the shown landing');
  }
  assert.ok(ship._phaseBlink.aiming);
  assert.ok(ship._phaseBlink.dist >= PHASE_BLINK.minCommit);
  assert.ok(bus.events.some((event) => event.name === 'toast' && event.payload.text.includes('energy limit')));
  const result = stepPhaseBlink({ entity: ship, held: false, dt: 1 / 60, state, bus, now: 12 });
  assert.equal(result.committed, true, 'release commits the last affordable preview');
  assert.ok(ship.pos.x > 0, 'the hull arrives ahead on the phase axis');
  assert.ok(ship.boost.energy >= 0);
  assert.equal(ship.flags.noInterp, true, 'release publishes the canonical physics pose-resync flag');
  assert.ok(bus.events.some((event) => event.name === 'ship:phaseBlink'));
});

test('Veil Step refuses an unaffordable release without changing position and explains why', () => {
  const ship = player(200);
  const state = stateFor(ship);
  const bus = recordingBus();
  const start = { ...ship.pos };
  stepPhaseBlink({ entity: ship, held: true, dt: 0.25, state, bus, now: 10 });
  ship.boost.energy = 0;

  const result = stepPhaseBlink({ entity: ship, held: false, dt: 1 / 60, state, bus, now: 10.25 });
  assert.equal(result.committed, false);
  assert.deepEqual(ship.pos, start, 'a failed energy check does not snap the ship');
  assert.equal(bus.events.some((event) => event.name === 'ship:phaseBlink'), false);
  assert.ok(bus.events.some((event) => event.name === 'toast' && event.payload.text.includes('needs more energy')));
});

test('Crucible readout names the Veil hold/release binding and current energy refusal', () => {
  const ship = player(20);
  const state = stateFor(ship);
  const line = () => crucibleCombatLines(state).find((entry) => entry.id === 'veil-step');
  assert.equal(line().status, 'cooldown');
  assert.match(line().text, /hold L-Shift\/R-Shift to aim · release to jump · needs 42 energy/);

  ship.boost.energy = 70;
  ship._phaseBlink = { aiming: true, active: true, dist: 120, readyAt: 0 };
  assert.equal(line().status, 'armed');
  assert.match(line().text, /120 WU · release to jump/);
  ship.boost.energy = 1;
  assert.equal(line().status, 'cooldown');
  assert.match(line().text, /needs 48 energy to release/);
});
