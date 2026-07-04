// Acceptance check for design/spec2/02_FLIGHT_CAMERA_JUICE.md.
// Headless: uses only sim/data modules (no renderer/DOM). Verifies the contract surface that
// headless systems can observe: bus events, state constants, profile multipliers, and cue tables.

import fs from 'node:fs';
import { cruise, isCruising, cruiseMultipliers } from '../src/systems/cruise.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { resolveFlightProfile } from '../src/core/flightDynamics.js';
import { COMBAT_CUE_IDS, WEAPON_CUE_TABLES, resolveWeaponCueTable } from '../src/data/combatDefs.js';
import { createGameState } from '../src/core/gameState.js';

function makeBus() {
  const listeners = {};
  return {
    on(name, fn) {
      (listeners[name] ||= []).push(fn);
      return fn;
    },
    emit(name, payload) {
      for (const fn of listeners[name] || []) fn(payload);
    },
    listeners,
  };
}

function makeState(extra = {}) {
  const state = createGameState(1);
  state.mode = 'flight';
  state.playerId = 'player1';
  state.player = state.player || {};
  state.player.cruise = { phase: 'off', t: 0 };
  state.entities = new Map();
  state.entities.set('player1', {
    id: 'player1', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, hull: 100, shield: 100, armorHp: 100,
    maxSpeed: 120, thrust: 40, drag: 1.2, turnRate: 3,
    flags: {},
  });
  return Object.assign(state, extra);
}

const checks = [];
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
  } catch (e) {
    checks.push({ name, ok: false, error: e.message });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function approx(a, b, eps = 0.0001, msg) { if (Math.abs(a - b) > eps) throw new Error(msg || `${a} ≉ ${b}`); }

// --- Cruise state machine ---
check('cruise: V press starts charging', () => {
  const bus = makeBus();
  const state = makeState({ input: { actions: { cruise: true } } });
  const c = Object.create(cruise); c.init({ state, bus, helpers: {} });
  c.update(0, state);
  assert(state.player.cruise.phase === 'charging', 'phase should be charging');
  assert(bus.listeners['cruise:charging'] && bus.listeners['cruise:charging'].length > 0, 'charging listener registered');
});

check('cruise: 3.0 s charge completes', () => {
  const bus = makeBus();
  const state = makeState({ input: { actions: { cruise: true } } });
  const events = [];
  bus.on('cruise:engaged', (p) => events.push(p));
  const c = Object.create(cruise); c.init({ state, bus, helpers: {} });
  state.input.actions.cruise = true;
  c.update(0, state); // edge starts charge
  state.input.actions.cruise = false;
  c.update(3.0, state); // complete charge
  assert(state.player.cruise.phase === 'cruising', 'phase should be cruising after 3s');
  assert(events.length === 1, 'cruise:engaged emitted once');
});

check('cruise: manual V drops', () => {
  const bus = makeBus();
  const state = makeState();
  const events = [];
  bus.on('cruise:dropped', (p) => events.push(p));
  const c = Object.create(cruise); c.init({ state, bus, helpers: {} });
  state.player.cruise.phase = 'cruising';
  state.input.actions.cruise = true;
  c.update(0, state);
  assert(state.player.cruise.phase === 'off', 'manual toggle drops cruise');
  assert(events.some((e) => e.reason === 'manual'), 'drop reason is manual');
});

check('cruise: damage drops', () => {
  const bus = makeBus();
  const state = makeState();
  const events = [];
  bus.on('cruise:dropped', (p) => events.push(p));
  const c = Object.create(cruise); c.init({ state, bus, helpers: {} });
  state.player.cruise.phase = 'cruising';
  bus.emit('combat:damage', { targetId: 'player1' });
  assert(state.player.cruise.phase === 'off', 'damage drops cruise');
  assert(events.some((e) => e.reason === 'damage'), 'drop reason is damage');
});

check('cruise: mass-lock drops', () => {
  const bus = makeBus();
  const state = makeState();
  const events = [];
  bus.on('cruise:dropped', (p) => events.push(p));
  const c = Object.create(cruise); c.init({ state, bus, helpers: {} });
  state.player.cruise.phase = 'cruising';
  state.entityList = [
    { id: 'cap', alive: true, radius: 70, pos: { x: 100, z: 100 } },
  ];
  c.update(0.016, state);
  assert(state.player.cruise.phase === 'off', 'mass-lock drops cruise');
  assert(events.some((e) => e.reason === 'masslock'), 'drop reason is masslock');
});

check('cruise: no mass-lock outside range', () => {
  const bus = makeBus();
  const state = makeState();
  const c = Object.create(cruise); c.init({ state, bus, helpers: {} });
  state.player.cruise.phase = 'cruising';
  state.entityList = [
    { id: 'cap', alive: true, radius: 70, pos: { x: 500, z: 0 } },
  ];
  c.update(0.016, state);
  assert(state.player.cruise.phase === 'cruising', 'distant capital does not mass-lock');
});

// --- Flight multipliers ---
check('propulsionCatalog: cruising multiplies player profile', () => {
  const state = makeState();
  state.player.cruise.phase = 'cruising';
  const entity = { id: 'player1', flightClass: 'fighter', mass: 18, driveId: 'drive_reaction_s' };
  const profile = resolvePropulsionProfile(entity, state);
  const base = resolvePropulsionProfile(entity, null);
  approx(profile.maxSpeed, (base.maxSpeed || 0) * 4, 0.01, 'maxSpeed ×4');
  approx(profile.mainAccel, base.mainAccel * 2.5, 0.01, 'mainAccel ×2.5');
  approx(profile.maxYawRate, base.maxYawRate * 0.25, 0.01, 'maxYawRate ×0.25');
});

check('propulsionCatalog: NPC not multiplied', () => {
  const state = makeState();
  state.player.cruise.phase = 'cruising';
  const entity = { id: 'npc1', flightClass: 'fighter', mass: 18, driveId: 'drive_reaction_s' };
  const profile = resolvePropulsionProfile(entity, state);
  const base = resolvePropulsionProfile(entity, null);
  approx(profile.maxSpeed, base.maxSpeed || 0, 0.01, 'NPC maxSpeed unchanged');
});

check('flightDynamics: cruising multiplies legacy profile', () => {
  const state = makeState();
  state.player.cruise.phase = 'cruising';
  const entity = { id: 'player1', maxSpeed: 120, thrust: 40, drag: 1.2, turnRate: 3 };
  const profile = resolveFlightProfile(entity, state);
  const base = resolveFlightProfile(entity, null);
  approx(profile.maxSpeed, base.maxSpeed * 4, 0.01, 'legacy maxSpeed ×4');
  approx(profile.mainAccel, base.mainAccel * 2.5, 0.01, 'legacy mainAccel ×2.5');
  approx(profile.maxYawRate, base.maxYawRate * 0.25, 0.01, 'legacy maxYawRate ×0.25');
});

// --- Camera defaults ---
check('gameState: default camera zoom is 88 wu', () => {
  const s = createGameState(1);
  assert(s.camera.zoom === 88, `expected 88, got ${s.camera.zoom}`);
});

check('gameState: default lookAhead is 26 wu', () => {
  const s = createGameState(1);
  assert(s.camera.lookAhead === 26, `expected 26, got ${s.camera.lookAhead}`);
});

// --- Combat cue tables ---
check('combatDefs: juice cue IDs registered', () => {
  const required = [
    'combat.damage.shield', 'combat.damage.armor', 'combat.damage.hull', 'combat.damage.kill',
    'cruise.charging', 'cruise.engaged', 'cruise.dropped',
    'ai.telegraph', 'ai.flee', 'ai.formation_broken',
    'presentation.tether.attach', 'presentation.tether.break',
  ];
  for (const id of required) assert(COMBAT_CUE_IDS.includes(id), `missing cue ${id}`);
});

check('combatDefs: weapon cue tables exist', () => {
  assert(WEAPON_CUE_TABLES && typeof WEAPON_CUE_TABLES === 'object', 'WEAPON_CUE_TABLES exported');
  const table = resolveWeaponCueTable('wpn_pulse_laser', [{ id: 'wpn_pulse_laser', damageType: 'energy', size: 'S' }]);
  assert(table && table.muzzle && table.impact && table.cueId, 'resolved table has cues');
});

// --- Weapons guard ---
check('weapons.js: cruise blocks player fire', () => {
  // We verify by reading the source guard instead of spinning up the full weapons system.
  const src = fs.readFileSync(new URL('../src/systems/weapons.js', import.meta.url), 'utf8');
  assert(src.includes('cruise.phase === \'charging\''), 'weapons guard checks charging');
  assert(src.includes('cruise.phase === \'cruising\''), 'weapons guard checks cruising');
});

// --- Damage flags ---
check('damage.js: emits armorHit/hullHit on player', () => {
  // Verify source includes the new flags and gates them to player.
  const src = fs.readFileSync(new URL('../src/combat/damage.js', import.meta.url), 'utf8');
  assert(src.includes('armorHit:'), 'armorHit flag present');
  assert(src.includes('hullHit:'), 'hullHit flag present');
  assert(src.includes('isPlayer'), 'flags keyed to isPlayer');
});

// --- VFX cue emission ---
check('vfx.js: subscribes to juice events and emits cues', () => {
  const src = fs.readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert(src.includes("add('cruise:charging'"), 'vfx listens cruise:charging');
  assert(src.includes("add('ai:flee'"), 'vfx listens ai:flee');
  assert(src.includes("add('tether:attached'"), 'vfx listens tether:attached');
  assert(src.includes("add('tether:broken'"), 'vfx listens tether:broken');
  assert(src.includes("_emitJuiceCue('combat.damage.shield'"), 'shield cue emitted');
  assert(src.includes("_emitJuiceCue('cruise.engaged'"), 'cruise engaged cue emitted');
});

// --- Feel durations ---
check('feel.js: kill-cam and hit-stop tunables', () => {
  const src = fs.readFileSync(new URL('../src/render/feel.js', import.meta.url), 'utf8');
  assert(src.includes('HS_KILL_FREEZE = 0.55'), 'kill freeze 0.55s');
  assert(src.includes('HS_KILL_SLOW = 0.35'), 'kill slow 0.35s');
  assert(src.includes('HS_SHIELD_BREAK = 0.22'), 'shield break 0.22s');
  assert(src.includes('HS_ARMOR_HIT = 0.10'), 'armor/hull hit 0.10s');
  assert(src.includes('HS_DEATH = 0.90'), 'player death 0.90s');
  assert(src.includes("bus.emit('camera:kill'"), 'camera:kill emitted');
});

// --- Camera kill-cam ---
check('camera.js: killCam method and pushZoom', () => {
  const src = fs.readFileSync(new URL('../src/render/camera.js', import.meta.url), 'utf8');
  assert(src.includes('killCam()'), 'camera has killCam');
  assert(src.includes('pushZoom(0.25'), 'kill-cam dolly +25%');
});

async function run() {
  // --- Summary ---
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(c.ok ? `✓ ${c.name}` : `✗ ${c.name}: ${c.error}`);
  }
  if (failed.length) {
    console.log(`\n${failed.length}/${checks.length} checks failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${checks.length} juice-contract checks passed.`);
}
run().catch((e) => { console.error(e); process.exit(1); });
