// check-cruise.mjs — acceptance harness for the cruise travel tier (spec2/02 §1, §5.4).
// Drives the real cruise system deterministically (no browser) and asserts: 3.0 s charge, the
// charging→engaged event order, the ×4/×2.5/×0.25 cruising multipliers, instant drop on damage,
// mass-lock drop (entity radius ≥ 60 within 180 wu) with a negative control, manual re-toggle drop,
// charge cancel on fire/boost, the weapons-blocked-during-cruise guard, and the query helpers.
//
// This is the standalone check the wave-2 cruise brief mandated (package.json check:cruise pointed at
// a file that was never committed). Report-only; touches no goldens.
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { WEAPONS } from '../src/data/weapons.js';
import { cruise, isCruising, isCharging, cruiseChargeProgress, cruiseMultipliers } from '../src/systems/cruise.js';
import { weapons } from '../src/systems/weapons.js';

const DT = 1 / 60;

function makeBus() {
  const handlers = {};
  const events = [];
  return {
    events,
    on(name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); },
    emit(name, payload) { events.push({ name, payload }); (handlers[name] || []).forEach((fn) => fn(payload)); },
    cruiseEvents() { return events.filter((e) => /^cruise:/.test(e.name)); },
    lastDropped() {
      const d = events.filter((e) => e.name === 'cruise:dropped');
      return d.length ? d[d.length - 1].payload : null;
    },
  };
}

function makeState() {
  const player = { id: 'p1', alive: true, pos: { x: 0, z: 0 }, radius: 8 };
  const entities = new Map([['p1', player]]);
  return {
    mode: 'flight',
    playerId: 'p1',
    entities,
    entityList: [player],
    player: { cruise: { phase: 'off', t: 0 } },
    input: { actions: { cruise: false } },
  };
}

function makeCruise(state, bus) {
  const c = Object.create(cruise);
  c.init({ state, bus, helpers: {} });
  return c;
}

function makeWeaponsHarness(phase) {
  const bus = makeBus();
  const state = makeState();
  const player = state.entities.get('p1');
  const spawned = [];

  Object.assign(player, {
    type: 'ship',
    team: 0,
    factionId: 'player',
    rot: 0,
    vel: { x: 0, z: 0 },
    flags: {},
    cap: 100,
    data: {
      derived: { cap: 100 },
      combat: {},
      weapons: [{
        defId: 'wpn_pulse_laser_s',
        slotIndex: 0,
        facing: 'front',
        facingAngle: 0,
        gimbalArc: 0,
        muzzleOffset: [0.8, 0],
        spreadDeg: 0,
      }],
    },
  });
  state.meta = { seed: 12345 };
  state.simTime = 0;
  state.combat = { beams: [], threatTables: new Map() };
  state.input.fire = true;
  state.input.aimAngle = 0;
  state.player.cruise = { phase, t: phase === 'charging' ? 1 : 0, stumbleT: 0 };
  state.entityList = [player];
  state.entityIndex = { ships: [player], weaponShips: [player], projectiles: [] };

  const helpers = {
    getEntity: (id) => state.entities.get(id),
    spawnEntity: (entity) => {
      const spawnedEntity = { id: `projectile-${spawned.length + 1}`, alive: true, ...entity };
      spawned.push(spawnedEntity);
      state.entities.set(spawnedEntity.id, spawnedEntity);
      state.entityList.push(spawnedEntity);
      state.entityIndex.projectiles.push(spawnedEntity);
      return spawnedEntity;
    },
    hash32,
    mulberry32,
  };
  const w = Object.create(weapons);
  w.init({ state, bus, helpers });
  return { bus, state, weaponsSystem: w, player, spawned };
}

// A V toggle press: one rising edge, then release. Fires exactly one edge into cruise.update.
function pulseCruise(c, state) {
  state.input.actions.cruise = true;
  c.update(DT, state);
  state.input.actions.cruise = false;
}

// Charge from off to cruising; returns ticks elapsed (including the pulse tick).
function chargeToCruising(c, state) {
  pulseCruise(c, state);
  assert.equal(state.player.cruise.phase, 'charging', 'V from off must start charging');
  let ticks = 1;
  while (state.player.cruise.phase === 'charging' && ticks < 1200) { c.update(DT, state); ticks++; }
  assert.equal(state.player.cruise.phase, 'cruising', 'charge must complete to cruising');
  return ticks;
}

console.log('--- CRUISE ACCEPTANCE ---');

// 1. Charge time = 3.0 ± 0.05 s.
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  const ticks = chargeToCruising(c, state);
  const elapsed = ticks * DT;
  assert.ok(elapsed >= 2.95 && elapsed <= 3.05, `charge time ${elapsed.toFixed(3)}s must be 3.0 ±0.05`);
  console.log(`Check 1 PASSED: charge time ${elapsed.toFixed(3)}s (target 3.0 ±0.05).`);
}

// 2. Event order on a clean charge is exactly charging → engaged, engaged carries playerId.
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  chargeToCruising(c, state);
  const names = bus.cruiseEvents().map((e) => e.name);
  assert.deepEqual(names, ['cruise:charging', 'cruise:engaged'], 'clean charge must emit charging then engaged, nothing else');
  const engaged = bus.events.find((e) => e.name === 'cruise:engaged');
  assert.equal(engaged.payload.playerId, 'p1', 'cruise:engaged must carry playerId');
  console.log('Check 2 PASSED: event order charging -> engaged.');
}

// 3. Cruising multipliers: maxSpeed ×4.0, accel ×2.5, turn ×0.25 (inert while off).
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  assert.deepEqual(cruiseMultipliers(state), { maxSpeed: 1, accel: 1, turn: 1 }, 'multipliers inert while off');
  chargeToCruising(c, state);
  assert.deepEqual(cruiseMultipliers(state), { maxSpeed: 4.0, accel: 2.5, turn: 0.25 }, 'cruising multipliers must be 4/2.5/0.25');
  console.log('Check 3 PASSED: cruising multipliers 4.0 / 2.5 / 0.25.');
}

// 4. Damage drops instantly with reason 'damage'.
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  chargeToCruising(c, state);
  bus.emit('combat:damage', { targetId: 'p1', amount: 5 });
  assert.equal(state.player.cruise.phase, 'off', 'damage must drop cruise instantly');
  assert.equal(bus.lastDropped().reason, 'damage', "drop reason must be 'damage'");
  console.log('Check 4 PASSED: damage drops cruise (reason damage).');
}

// 5. Mass-lock drops within 1 tick with reason 'masslock'; negatives (small/far) do NOT drop.
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  chargeToCruising(c, state);
  const heavy = { id: 's1', alive: true, pos: { x: 100, z: 0 }, radius: 70 }; // radius >=60, dist 100 < 180
  state.entities.set('s1', heavy); state.entityList.push(heavy);
  c.update(DT, state);
  assert.equal(state.player.cruise.phase, 'off', 'mass-lock (radius>=60 within 180wu) must drop cruise');
  assert.equal(bus.lastDropped().reason, 'masslock', "drop reason must be 'masslock'");

  // Negative controls: too small (radius 59) and too far (200 wu) must NOT drop.
  const bus2 = makeBus(); const st2 = makeState(); const c2 = makeCruise(st2, bus2);
  chargeToCruising(c2, st2);
  const small = { id: 'small', alive: true, pos: { x: 100, z: 0 }, radius: 59 };
  const far = { id: 'far', alive: true, pos: { x: 200, z: 0 }, radius: 90 };
  st2.entities.set('small', small); st2.entityList.push(small);
  st2.entities.set('far', far); st2.entityList.push(far);
  c2.update(DT, st2);
  assert.equal(st2.player.cruise.phase, 'cruising', 'sub-threshold radius / out-of-range mass must NOT drop cruise');
  console.log('Check 5 PASSED: mass-lock drop + negative controls.');
}

// 6. Manual re-toggle drops with reason 'manual'.
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  chargeToCruising(c, state);
  pulseCruise(c, state); // second V press while cruising
  assert.equal(state.player.cruise.phase, 'off', 'a second V toggle must drop cruise');
  assert.equal(bus.lastDropped().reason, 'manual', "manual drop reason must be 'manual'");
  console.log('Check 6 PASSED: manual re-toggle drops cruise (reason manual).');
}

// 7. Charge cancels on fire and on boost (mid-charge).
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  pulseCruise(c, state); c.update(DT, state);
  assert.equal(state.player.cruise.phase, 'charging', 'setup: charging');
  bus.emit('combat:fire', { ownerId: 'p1' });
  assert.equal(state.player.cruise.phase, 'off', 'firing during charge must cancel the charge');

  const bus2 = makeBus(); const st2 = makeState(); const c2 = makeCruise(st2, bus2);
  pulseCruise(c2, st2); c2.update(DT, st2);
  assert.equal(st2.player.cruise.phase, 'charging', 'setup: charging');
  bus2.emit('ship:boostStart', { shipId: 'p1' });
  assert.equal(st2.player.cruise.phase, 'off', 'boosting during charge must cancel the charge');
  console.log('Check 7 PASSED: fire and boost cancel a charge.');
}

// 8. Weapons are blocked during cruise (charging or cruising). Drive the real weapons system so this
//    proves behavior, not merely source text.
{
  const off = makeWeaponsHarness('off');
  off.weaponsSystem.update(DT, off.state);
  assert.equal(off.spawned.length, 1, 'control: player weapon must fire while cruise is off');
  assert.equal(off.bus.events.filter((e) => e.name === 'combat:fire').length, 1,
    'control: firing while cruise is off must emit combat:fire');
  const starter = WEAPONS.find((def) => def.id === 'wpn_pulse_laser_s');
  assert.equal(off.player.cap, 100 - starter.energyCost,
    'control: firing while cruise is off must spend the live starter capacitor cost');

  for (const phase of ['charging', 'cruising']) {
    const h = makeWeaponsHarness(phase);
    h.weaponsSystem.update(DT, h.state);
    assert.equal(h.spawned.length, 0, `player weapon must not spawn projectiles while cruise is ${phase}`);
    assert.equal(h.bus.events.filter((e) => e.name === 'combat:fire').length, 0,
      `player weapon must not emit combat:fire while cruise is ${phase}`);
    assert.equal(h.player.cap, 100, `player weapon must not spend capacitor while cruise is ${phase}`);
  }
  console.log('Check 8 PASSED: real weapons update blocks player fire during charge/cruise.');
}

// 9. Query helpers reflect phase; charge progress is monotonic 0→1.
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  assert.equal(isCharging(state), false); assert.equal(isCruising(state), false);
  assert.equal(cruiseChargeProgress(state), 0, 'progress 0 while off');
  pulseCruise(c, state);
  assert.equal(isCharging(state), true, 'isCharging true while charging');
  let prev = -1, monotonic = true;
  while (state.player.cruise.phase === 'charging') {
    const p = cruiseChargeProgress(state);
    if (p < prev) monotonic = false;
    prev = p;
    c.update(DT, state);
  }
  assert.ok(monotonic, 'charge progress must be monotonic 0->1');
  assert.equal(isCruising(state), true, 'isCruising true after charge');
  assert.equal(cruiseChargeProgress(state), 0, 'progress resets to 0 once cruising (not charging)');
  console.log('Check 9 PASSED: query helpers + monotonic charge progress.');
}

console.log('--- ALL CRUISE CHECKS PASSED ---');
