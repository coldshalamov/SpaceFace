import test from 'node:test';
import assert from 'node:assert/strict';

import { weapons } from '../src/systems/weapons.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { WEAPONS } from '../src/data/weapons.js';

const WPN = new Map(WEAPONS.map((d) => [d.id, d]));

function harness() {
  const events = [];
  const state = {
    mode: 'flight',
    tick: 20,
    simTime: 20 / 60,
    playerId: null,
    player: {},
    input: {},
    combat: { beams: [] },
    entities: new Map(),
    entityList: [],
    entityIndex: { ships: [], weaponShips: [], projectiles: [] },
  };
  const system = Object.create(weapons);
  let nextId = 0;
  system.state = state;
  system.bus = { emit: (id, payload) => events.push({ id, payload }) };
  system.helpers = {
    getEntity: (id) => state.entities.get(id) || null,
    spawnEntity: (spec) => {
      const ent = { ...spec, id: `p${nextId++}`, alive: true };
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      return ent;
    },
    hash32: (...args) => {
      let h = 2166136261 >>> 0;
      for (const a of args) {
        for (const ch of String(a)) {
          h ^= ch.codePointAt(0);
          h = Math.imul(h, 16777619) >>> 0;
        }
      }
      return h >>> 0;
    },
  };
  system._byId = WPN;
  system._beamFiring = new Set();
  system._beamFiringPrev = new Set();
  system._beamActiveMeta = new Map();
  return { state, system, events };
}

function enemyShip(id, weaponMounts, pos = { x: 0, z: 0 }) {
  return {
    id, type: 'ship', team: 1, alive: true,
    pos: { ...pos }, vel: { x: 0, z: 0 }, rot: 0, radius: 14,
    cap: 200, capMax: 200,
    data: { weapons: weaponMounts, combat: {} },
  };
}

function mountOf(spec, defId) {
  return spec.data.weapons.find((w) => w.defId === defId);
}

test('enemy spawn resolution preserves authored mount roles', () => {
  const spec = makeEnemySpawnSpec('mine_layer_jackal', 5, { x: 0, z: 0 });
  const autocannon = mountOf(spec, 'wpn_autocannon_s');
  const rack = mountOf(spec, 'wpn_missile_rack_m');
  const flak = mountOf(spec, 'wpn_flak_turret_s');
  assert.ok(autocannon && rack && flak, 'expected three resolved mounts');
  assert.equal(rack.occasional, true);
  assert.equal(flak.defensiveOnly, true);
  assert.equal(autocannon.occasional, undefined);
  assert.equal(autocannon.defensiveOnly, undefined);
});

test('occasional window is deterministic, periodic, and not always-on', () => {
  const { state, system } = harness();
  const w = { defId: 'wpn_plasma_cannon_m', occasional: true, slotIndex: 0 };
  const e = enemyShip('e_occ', [w]);
  const def = WPN.get('wpn_plasma_cannon_m');
  const verdict = (t) => {
    state.simTime = t;
    return system._mountRoleOpen(e, w, def, state);
  };
  const opens = [];
  for (let t = 0; t < 24; t += 0.25) if (verdict(t)) opens.push(t);
  assert.ok(opens.length > 0, 'window never opened');
  assert.ok(opens.length < 24 / 0.25, 'window never closed');
  // Same simTime → same verdict (no ambient drift), and the window repeats every 12 s.
  for (const t of [0.5, 5.5, 10.5]) assert.equal(verdict(t), verdict(t + 12), `period broke at ${t}`);
  assert.equal(verdict(1.0), verdict(1.0), 'same-tick verdict must be stable');
});

test('an occasional mount holds fire while closed and fires inside its window', () => {
  const { state, system, events } = harness();
  const w = {
    defId: 'wpn_plasma_cannon_m', occasional: true, slotIndex: 0,
    facing: 'front', gimbalArc: 0.4, muzzleOffset: [0.8, 0],
    _cooldown: 0, _heat: 0,
  };
  const e = enemyShip('e_occ', [w]);
  const def = WPN.get('wpn_plasma_cannon_m');

  // Find a closed tick and an open tick for this mount's seeded phase.
  let closedT = null, openT = null;
  for (let t = 0; t < 48 && (closedT == null || openT == null); t += 0.1) {
    state.simTime = t;
    const open = system._mountRoleOpen(e, w, def, state);
    if (open && openT == null) openT = t;
    if (!open && closedT == null) closedT = t;
  }
  assert.ok(closedT != null && openT != null, 'could not find both window phases');

  state.simTime = closedT;
  events.length = 0;
  system._serviceShip(e, true, false, 1 / 60, state, 0, null);
  assert.equal(events.filter((v) => v.id === 'combat:fire').length, 0, 'closed window must not fire');

  state.simTime = openT;
  events.length = 0;
  system._serviceShip(e, true, false, 1 / 60, state, 0, null);
  assert.ok(events.some((v) => v.id === 'combat:fire'), 'open window must fire');
});

test('a defensiveOnly mount only answers inside its own close envelope', () => {
  const { state, system, events } = harness();
  const w = {
    defId: 'wpn_flak_turret_s', defensiveOnly: true, slotIndex: 0,
    facing: 'turret', gimbalArc: Math.PI, muzzleOffset: [0.8, 0],
    _cooldown: 0, _heat: 0,
  };
  const e = enemyShip('e_def', [w]);
  const def = WPN.get('wpn_flak_turret_s');
  const range = def.range; // 240 — envelope is 0.8× = 192 WU
  const far = { id: 'tgt', type: 'ship', alive: true, pos: { x: range + 200, z: 0 }, vel: { x: 0, z: 0 }, radius: 12 };
  const near = { id: 'tgt', type: 'ship', alive: true, pos: { x: 150, z: 0 }, vel: { x: 0, z: 0 }, radius: 12 };

  // Kited target outside the envelope: no permission, no fire.
  e.data.combat.targetId = 'tgt';
  state.entities.set('tgt', far);
  assert.equal(system._mountRoleOpen(e, w, def, state), false, 'far target must not open the mount');
  events.length = 0;
  system._serviceShip(e, true, false, 1 / 60, state, 0, null);
  assert.equal(events.filter((v) => v.id === 'combat:fire').length, 0);

  // Cornered: target inside the envelope answers.
  state.entities.set('tgt', near);
  assert.equal(system._mountRoleOpen(e, w, def, state), true, 'near target must open the mount');
  events.length = 0;
  system._serviceShip(e, true, false, 1 / 60, state, 0, null);
  assert.ok(events.some((v) => v.id === 'combat:fire'), 'cornered flak must fire');

  // Dead target closes the mount again.
  near.alive = false;
  assert.equal(system._mountRoleOpen(e, w, def, state), false, 'dead target must close the mount');
});

test('an occasional homing rack only builds missile lock inside its window', () => {
  const { state, system } = harness();
  const w = {
    defId: 'wpn_missile_rack_m', occasional: true, slotIndex: 0,
    tracking: 'homing', lockTimeS: 1.2, _cooldown: 0, _heat: 0,
  };
  const e = enemyShip('e_lock', [w]);
  const tgt = { id: 'tgt', type: 'ship', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 12 };
  state.entities.set('tgt', tgt);
  e.data.combat.targetId = 'tgt';
  const def = WPN.get('wpn_missile_rack_m');

  let closedT = null, openT = null;
  for (let t = 0; t < 48 && (closedT == null || openT == null); t += 0.1) {
    state.simTime = t;
    const open = system._mountRoleOpen(e, w, def, state);
    if (open && openT == null) openT = t;
    if (!open && closedT == null) closedT = t;
  }
  assert.ok(closedT != null && openT != null);

  // Inside the window the lock builds; the player's MISSILE LOCK warn lives on this progress.
  e.data.combat.lockProgress = 0;
  state.simTime = openT;
  for (let i = 0; i < 90; i++) { state.simTime += 1 / 60; system._tickLock(e, 1 / 60, state); }
  assert.equal(e.data.combat.lockTarget, 'tgt');
  assert.ok((e.data.combat.lockProgress || 0) > 0, 'lock should build inside the window');

  // Between windows the lock decays and the warn re-arms for the next volley.
  state.simTime = closedT;
  e.data.combat.lockProgress = 0.8;
  for (let i = 0; i < 120; i++) { state.simTime += 1 / 60; system._tickLock(e, 1 / 60, state); }
  assert.equal(e.data.combat.lockTarget, null, 'closed-window rack must drop the lock');
});

test('same-def mounts on different slots do not volley in lockstep', () => {
  const { state, system } = harness();
  const mounts = [0, 1, 2, 3].map((slotIndex) => ({ defId: 'wpn_plasma_cannon_m', occasional: true, slotIndex }));
  const e = enemyShip('e_multi', mounts);
  const def = WPN.get('wpn_plasma_cannon_m');
  const phases = mounts.map((w) => {
    system._mountRoleOpen(e, w, def, state); // seeds w._occPhase
    return w._occPhase;
  });
  assert.ok(new Set(phases).size > 1, 'a count:N rack that volleys in lockstep is the defect this unit removed');
});

test('a defensiveOnly mount with no live target stays closed', () => {
  const { state, system } = harness();
  const w = { defId: 'wpn_flak_turret_s', defensiveOnly: true, slotIndex: 0 };
  const e = enemyShip('e_idle', [w]);
  const def = WPN.get('wpn_flak_turret_s');
  assert.equal(e.data.combat.targetId, undefined);
  assert.equal(system._mountRoleOpen(e, w, def, state), false, 'a defensive mount answers its target — no target, no fire');
});

test('a missile lock completes inside an open occasional window', () => {
  const { state, system } = harness();
  const w = {
    defId: 'wpn_missile_rack_m', occasional: true, slotIndex: 0,
    tracking: 'homing', lockTimeS: 1.2, _cooldown: 0, _heat: 0,
  };
  const e = enemyShip('e_lockdone', [w]);
  const tgt = { id: 'tgt', type: 'ship', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 12 };
  state.entities.set('tgt', tgt);
  e.data.combat.targetId = 'tgt';
  const def = WPN.get('wpn_missile_rack_m');
  // Open the window and hold the cone for the authored 1.2 s lock.
  let t = 0;
  for (; t < 48; t += 0.1) { state.simTime = t; if (system._mountRoleOpen(e, w, def, state)) break; }
  for (let i = 0; i < 90; i++) { state.simTime += 1 / 60; system._tickLock(e, 1 / 60, state); }
  assert.ok((e.data.combat.lockProgress || 0) >= 1, 'the warn/launch path needs a completed lock, not just buildup');
  assert.equal(e.data.combat.lockTarget, 'tgt');
});

test('an authored slower lockTimeS is honored, not clamped to 1.2 s', () => {
  const { state, system } = harness();
  const w = {
    defId: 'wpn_torpedo_l', slotIndex: 0,
    tracking: 'homing', lockTimeS: 2.5, _cooldown: 0, _heat: 0,
  };
  const e = enemyShip('e_slowlock', [w]);
  const tgt = { id: 'tgt', type: 'ship', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 12 };
  state.entities.set('tgt', tgt);
  e.data.combat.targetId = 'tgt';
  for (let i = 0; i < 72; i++) { state.simTime += 1 / 60; system._tickLock(e, 1 / 60, state); }
  assert.ok((e.data.combat.lockProgress || 0) < 1,
    'a 2.5 s rack locking in 1.2 s gives the player a warn window shorter than authored');
  for (let i = 0; i < 90; i++) { state.simTime += 1 / 60; system._tickLock(e, 1 / 60, state); }
  assert.ok((e.data.combat.lockProgress || 0) >= 1, 'the authored 2.5 s lock still completes');
});

test('flag-less legacy mounts ignore the role gate', () => {
  const { state, system, events } = harness();
  const w = {
    defId: 'wpn_plasma_cannon_m', slotIndex: 0,
    facing: 'front', gimbalArc: 0.4, muzzleOffset: [0.8, 0],
    _cooldown: 0, _heat: 0,
  };
  const e = enemyShip('e_plain', [w]);
  for (const t of [0.5, 7.25, 11.9, 13.3]) {
    state.simTime = t;
    w._cooldown = 0;
    events.length = 0;
    system._serviceShip(e, true, false, 1 / 60, state, 0, null);
    assert.ok(events.some((v) => v.id === 'combat:fire'), `legacy mount must fire at t=${t}`);
  }
});
