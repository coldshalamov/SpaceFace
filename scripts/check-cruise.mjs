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
    simTime: 0,
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
  while (state.player.cruise.phase === 'charging' && ticks < 1200) {
    c.update(DT, state); state.simTime += DT; ticks++;
  }
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

// 4. Meaningful damage drops instantly with reason 'damage'; chip damage does not.
//    (TUNING_JOBS #2 / GAMEPLAY_FLOW_RISKS §3.1: penetration, shield break, or applied ≥ 25.)
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  chargeToCruising(c, state);
  // Chip: a small packet fully soaked by the shield must NOT drop the tier.
  bus.emit('combat:damage', { targetId: 'p1', amount: 6, applied: 6, shieldDamage: 6 });
  assert.equal(state.player.cruise.phase, 'cruising', 'chip damage soaked by shields must not drop cruise');
  // Penetrating hit: any armor/hull damage is a real hit.
  bus.emit('combat:damage', { targetId: 'p1', amount: 30, applied: 30, hullDamage: 30 });
  assert.equal(state.player.cruise.phase, 'off', 'a hull hit must drop cruise instantly');
  assert.equal(bus.lastDropped().reason, 'damage', "drop reason must be 'damage'");
  assert.equal(state.player.cruise.stumbleT, 0.5, 'a real drop must arm the yaw stumble');
  console.log('Check 4 PASSED: meaningful damage drops cruise; chip does not.');
}

// 4a. Every meaningful leg, isolated: armor penetration, shield break, the amount-only fallback,
//     a non-weapon origin (hazards/reentry are never chip), an EMP payload, and a control weapon
//     (the hit IS the verb even when the damage number is tiny). And the negative: a small
//     packet from an ordinary gun stays chip.
{
  const cases = [
    { label: 'armor penetration', payload: { applied: 20, armorDamage: 20 }, drops: true },
    { label: 'shield break', payload: { applied: 8, shieldDamage: 8, brokeShield: true }, drops: true },
    { label: 'amount-only fallback ≥25', payload: { amount: 30 }, drops: true },
    { label: 'non-weapon origin (radiation)', payload: { applied: 2, origin: { kind: 'hazard_radiation' } }, drops: true },
    { label: 'emp payload', payload: { applied: 4, emp: true }, drops: true },
    { label: 'control weapon (momentum sink)', payload: { applied: 3, weaponId: 'wpn_momentum_sink_s' }, drops: true },
    { label: 'snarl web-catch (ion)', payload: { applied: 3, weaponId: 'wpn_snarl_s' }, drops: true },
    { label: 'emergent origin (cook-off)', payload: { applied: 15, origin: { kind: 'emergent' } }, drops: true },
    { label: 'raw magnitude under mercy scaling', payload: { rawTotal: 60, amount: 60, applied: 13.5, shieldDamage: 13.5, weaponId: 'wpn_railgun_m' }, drops: true },
    { label: 'ordinary gun chip', payload: { applied: 6, shieldDamage: 6, weaponId: 'wpn_pulse_laser_s' }, drops: false },
    { label: 'single beam tick alone', payload: { applied: 2.7, rawTotal: 5.4, shieldDamage: 2.7, weaponId: 'wpn_heavy_beam_l' }, drops: false },
  ];
  for (const tc of cases) {
    const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
    chargeToCruising(c, state);
    bus.emit('combat:damage', { targetId: 'p1', ...tc.payload });
    assert.equal(state.player.cruise.phase, tc.drops ? 'off' : 'cruising',
      `${tc.label}: expected ${tc.drops ? 'drop' : 'hold'}, got ${state.player.cruise.phase}`);
  }
  console.log('Check 4a PASSED: all meaningful legs + chip negative control.');
}

// 4b. The harasser bar: chip hits every 0.6 s never stall the charge and never drop cruise,
//     and never arm the stumble. Cruise-denied time under pure chip fire is ~0.
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  const chip = { targetId: 'p1', amount: 6, applied: 6, shieldDamage: 6 };
  pulseCruise(c, state);
  // Harass through the whole charge: a chip packet every 36 ticks (0.6 s).
  let ticks = 0;
  while (state.player.cruise.phase === 'charging' && ticks < 1200) {
    c.update(DT, state); state.simTime += DT; ticks++;
    if (ticks % 36 === 0) bus.emit('combat:damage', chip);
  }
  assert.equal(state.player.cruise.phase, 'cruising', 'chip harasser must not stall the charge');
  assert.equal(state.player.cruise.stumbleT, 0, 'chip harasser must never arm the stumble');
  // Now cruising: 5 s of chip fire at the same cadence — cruise must survive all of it.
  for (let i = 0; i < 300; i++) {
    c.update(DT, state); state.simTime += DT;
    if (i % 36 === 0) bus.emit('combat:damage', chip);
  }
  assert.equal(state.player.cruise.phase, 'cruising', 'sustained chip fire must not drop cruise');
  assert.equal(state.player.cruise.stumbleT, 0, 'sustained chip fire must not arm the stumble');
  // A heavy absorbed packet (applied ≥ 25, shields soak it all) is still a real hit.
  bus.emit('combat:damage', { targetId: 'p1', amount: 40, applied: 40, shieldDamage: 40 });
  assert.equal(state.player.cruise.phase, 'off', 'a heavy absorbed hit must drop cruise');
  console.log('Check 4b PASSED: harasser bar — charge completes and cruise holds under chip fire.');
}

// 4c. Stumble re-arm cooldown: a second drop inside 1.5 s does not re-arm the yaw stumble;
//     the authored snare bypasses the cooldown.
{
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  chargeToCruising(c, state);
  const realHit = { targetId: 'p1', applied: 30, hullDamage: 30 };
  bus.emit('combat:damage', realHit);
  assert.equal(state.player.cruise.stumbleT, 0.5, 'first drop arms the stumble');
  // Let the stumble decay ~0.3 s, then re-enter cruising without waiting out the cooldown.
  for (let i = 0; i < 18; i++) c.update(DT, state);
  const decayed = state.player.cruise.stumbleT;
  assert.ok(decayed < 0.5 && decayed > 0, `stumble should have decayed, got ${decayed}`);
  state.player.cruise.phase = 'cruising';
  bus.emit('combat:damage', realHit);
  assert.equal(state.player.cruise.phase, 'off', 'second real hit still drops cruise');
  assert.ok(state.player.cruise.stumbleT <= decayed,
    `drop inside the cooldown must not re-arm stumble (got ${state.player.cruise.stumbleT}, was ${decayed})`);
  // Snare bypasses the cooldown entirely.
  state.player.cruise.phase = 'cruising';
  bus.emit('cruise:snareRequest', {});
  assert.equal(state.player.cruise.phase, 'off', 'snare still drops cruise');
  assert.equal(state.player.cruise.stumbleT, 0.5, 'snare always arms the stumble');
  console.log('Check 4c PASSED: stumble re-arm cooldown + snare bypass.');
}

// 4d. Sustained-pressure window: continuous emitters ship per-tick packets (dmg×dt) that each
//     read as chip, but a heavy beam held on the hull is denial — the rolling applied-damage
//     window must drop cruise, while a sparse plink cadence under the same cadence cap must not.
{
  // Heavy beam L: 160 authored dps ≈ 2.7 applied per tick on the default profile.
  const bus = makeBus(); const state = makeState(); const c = makeCruise(state, bus);
  chargeToCruising(c, state);
  let droppedAt = -1;
  for (let i = 0; i < 120; i++) {
    c.update(DT, state); state.simTime += DT;
    bus.emit('combat:damage', { targetId: 'p1', rawTotal: 5.4, applied: 2.7, shieldDamage: 2.7, weaponId: 'wpn_heavy_beam_l' });
    if (state.player.cruise.phase === 'off' && droppedAt < 0) droppedAt = i;
  }
  assert.ok(droppedAt >= 0 && droppedAt <= 90,
    `sustained heavy beam must drop cruise within ~1.5 s, droppedAt tick ${droppedAt}`);
  assert.equal(bus.lastDropped().reason, 'damage', 'beam drop reason must be damage');
  console.log(`Check 4d PASSED: sustained beam pressure drops cruise (tick ${droppedAt}).`);
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
