// NXB-012 — a countermeasure breaks ONE particular lock, and a broken guidance lineage can
// never be re-inherited by a recycled entity id.
//
//   * Two attackers holding locks on the player: one deploy clears only the defeated lineage —
//     the survivor keeps its progress and can legitimately finish its own reacquisition.
//   * The defeated lineage is the lock whose missile is already inbound, else the furthest
//     progressed — and the deploy event names which shooter's lock it broke.
//   * Lock progress is stamped with the target's occupant generation; a recycled id resets the
//     lineage instead of inheriting near-complete lock.
//   * A missile in flight whose target id got recycled cannot re-home onto the new occupant —
//     it adopts the divert vocabulary on its last course and stays a physical round.
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { weapons } from '../src/systems/weapons.js';

const DT = 1 / 60;

function makeBus() {
  const handlers = {};
  return {
    on(name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); },
    emit(name, payload) { for (const fn of handlers[name] || []) fn(payload); },
  };
}

function ship(id, over = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: -200, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0, // facing +x — the player at origin is dead in the 25° lock cone
    radius: 8,
    data: {
      weapons: [{ defId: 'wpn_missile_rack_m', slotIndex: 0 }],
      combat: { targetId: 1 },
      fittings: [],
      ...over.data,
    },
    ...over,
  };
}

function boot() {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    flags: {},
    cap: 100,
    occupantGeneration: 5,
    data: {
      fittings: ['mod_chaff_dispenser_m'],
      weapons: [],
      combat: {},
      derived: { cap: 100 },
    },
  };
  const entities = new Map([[1, player]]);
  const state = {
    mode: 'flight',
    playerId: 1,
    tick: 120,
    simTime: 2,
    meta: { seed: 11 },
    rng: () => 0,
    player: {},
    input: { fire: false, deployCountermeasure: false, actions: {} },
    combat: { beams: [] },
    entities,
    entityList: [player],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ships: [player],
      weaponShips: [],
      projectiles: [],
    },
  };
  const bus = makeBus();
  const deployed = [];
  bus.on('countermeasure:deployed', (p) => deployed.push(p));
  const helpers = {
    getEntity: (id) => state.entities.get(id),
    spawnEntity() { return null; },
    hash32,
    mulberry32,
  };
  const cm = Object.create(countermeasures);
  cm.init({ state, bus, helpers });
  const guns = Object.create(weapons);
  guns.init({ state, bus, helpers });
  return { state, bus, cm, guns, player, deployed, entities };
}

function track(state, ...entities) {
  for (const e of entities) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
    state.entityIndex.ships.push(e);
    if (e.type === 'ship') state.entityIndex.weaponShips.push(e);
    if (e.type === 'projectile') state.entityIndex.projectiles.push(e);
  }
}

test('one deploy defeats only one lock lineage — the survivor keeps its progress', () => {
  const { state, cm, player, deployed } = boot();
  const a = ship(40);
  const b = ship(41);
  a.data.combat.lockTarget = player.id; a.data.combat.lockProgress = 1.0;
  a.data.combat.lockTargetGeneration = 5;
  b.data.combat.lockTarget = player.id; b.data.combat.lockProgress = 0.6;
  b.data.combat.lockTargetGeneration = 5;
  // The break answers a live lineage: A's seeker is already inbound, so A is the eligible lock.
  const missile = {
    id: 20, type: 'projectile', alive: true,
    pos: { x: -120, z: 0 }, vel: { x: 90, z: 0 }, rot: 0, radius: 1,
    data: { kind: 'missile', ownerId: a.id, targetId: player.id, targetGeneration: 5, turnRate: 2.8 },
  };
  track(state, a, b, missile);

  state.input.deployCountermeasure = true;
  cm.update(DT, state);

  assert.equal(deployed.length, 1, 'one deploy emits one event');
  assert.equal(deployed[0].brokenLockShipId, a.id,
    'the lineage behind the inbound round is the one the chaff defeats');
  assert.equal(a.data.combat.lockTarget, null, 'the defeated lock is cleared');
  assert.equal(a.data.combat.lockProgress, 0, 'the defeated lock keeps no progress');
  assert.equal(a.data.combat.lockSuppressTargetId, player.id,
    'the broken lineage is pinned against instant reacquisition');
  assert.equal(b.data.combat.lockTarget, player.id,
    "the second attacker's lock is untouched by the same deploy");
  assert.equal(b.data.combat.lockProgress, 0.6, 'the survivor keeps its acquisition progress');
});

test('a shooter with a live inbound missile is the lock the deploy answers', () => {
  const { state, cm, player, deployed } = boot();
  const a = ship(40);
  const b = ship(41);
  // B is further along in acquisition, but A already put a seeker on the hull — that lineage
  // produced the threat this deploy answers.
  a.data.combat.lockTarget = player.id; a.data.combat.lockProgress = 1.0;
  a.data.combat.lockTargetGeneration = 5;
  b.data.combat.lockTarget = player.id; b.data.combat.lockProgress = 1.0;
  b.data.combat.lockTargetGeneration = 5;
  const missile = {
    id: 20, type: 'projectile', alive: true,
    pos: { x: -120, z: 0 }, vel: { x: 90, z: 0 }, rot: 0, radius: 1,
    data: { kind: 'missile', ownerId: a.id, targetId: player.id, targetGeneration: 5, turnRate: 2.8 },
  };
  track(state, a, b, missile);

  state.input.deployCountermeasure = true;
  cm.update(DT, state);

  assert.equal(deployed[0].brokenLockShipId, a.id,
    'the inbound missile names the defeated lineage, not the other attacker');
  assert.equal(a.data.combat.lockTarget, null);
  assert.equal(b.data.combat.lockTarget, player.id, 'the bystander lock survives');
});

test('a recycled target id cannot inherit a stale lock lineage', () => {
  const { state, guns, player } = boot();
  const a = ship(40);
  track(state, a);
  const combat = a.data.combat;

  // Build the lock honestly over several ticks inside the cone on the real target.
  for (let i = 0; i < 4; i++) guns._tickLock(a, 0.6, state);
  assert.equal(combat.lockTarget, player.id);
  assert.equal(combat.lockTargetGeneration, player.occupantGeneration,
    'the lock carries the occupant it was built on');
  assert.equal(combat.lockProgress, 1, 'sanity: the lock completed before the recycle');
  const progressBefore = combat.lockProgress;

  // The id recycles: the same number now binds a different occupant.
  const newOccupant = {
    ...player, occupantGeneration: 9,
    pos: { x: 0, z: 0 }, alive: true,
  };
  state.entities.set(player.id, newOccupant);

  guns._tickLock(a, 0.6, state);
  assert.equal(combat.lockTarget, player.id, 'the new occupant is still a valid target');
  assert.equal(combat.lockTargetGeneration, 9, 'the lineage restamps to the live occupant');
  assert.ok(combat.lockProgress < progressBefore,
    `stale progress must not transfer — got ${combat.lockProgress} vs ${progressBefore}`);
  assert.ok(combat.lockProgress <= 0.6 / 1.2 + 1e-6,
    'the new lineage earns only what this tick observed');
});

test('an empty-sky deploy is refused as no_lock, distinct from a cooldown', () => {
  const { state, bus, cm } = boot();
  const denied = [];
  const alerts = [];
  bus.on('countermeasure:denied', (p) => denied.push(p));
  bus.on('alert', (p) => alerts.push(p));

  state.input.deployCountermeasure = true;
  cm.update(DT, state);

  assert.equal(denied.length, 1, 'an empty deploy is refused, never silently spent');
  assert.equal(denied[0].reason, 'no_lock', 'no inbound lock is its own reason, not cooldown');
  assert.ok(alerts.some((a) => /NO INCOMING LOCK/.test(a.text)),
    'the alert names the case without a debug log');
  const cmState = state.entities.get(1).data.cm;
  assert.equal(cmState.cooldownT || 0, 0, 'a refused deploy does not start the cooldown');
  assert.ok(!cmState.effect, 'a refused deploy spawns no cloud');

  // Control: the same refusal vocabulary still distinguishes a real cooldown.
  denied.length = 0;
  const lockers = ship(40);
  lockers.data.combat.lockTarget = 1; lockers.data.combat.lockProgress = 1.0;
  track(state, lockers);
  state.input.deployCountermeasure = true;
  cm.update(DT, state); // succeeds — real threat
  state.input.deployCountermeasure = true;
  cm.update(DT, state); // refused — now on cooldown
  assert.equal(denied[0] && denied[0].reason, 'cooldown',
    'cooldown stays its own reason after a real deploy');
});

test('a missile whose target id recycled flies its last course instead of re-homing', () => {
  const { state, guns, player } = boot();
  const missile = {
    id: 20, type: 'projectile', alive: true,
    pos: { x: -120, z: 0 }, vel: { x: 90, z: 0 }, rot: 0, radius: 1,
    data: { kind: 'missile', ownerId: 40, targetId: player.id, targetGeneration: 5, turnRate: 2.8, projSpeed: 90 },
  };
  track(state, missile);

  // Recycle the id under the seeker: generation 9 is not the body it locked — and it is parked
  // off-axis so a re-home would visibly curve the round downward.
  state.entities.set(player.id, { ...player, occupantGeneration: 9, pos: { x: 60, z: -300 } });

  guns._steerHoming(DT, state);
  assert.equal(missile.alive, true, 'broken guidance stays a physical projectile, not a deletion');
  assert.equal(missile.vel.z, 0, 'the stale lineage does not turn toward the new occupant');
  guns._steerHoming(DT, state);
  guns._steerHoming(DT, state);
  assert.equal(missile.vel.z, 0, 'repeated ticks still cannot re-home onto the recycled id');
  assert.equal(missile.data.targetId, player.id, 'the round keeps its last target id — it just cannot guide on it');

  // Control case: a fresh round locking the live occupant still steers at it.
  const fresh = {
    id: 21, type: 'projectile', alive: true,
    pos: { x: -120, z: -40 }, vel: { x: 90, z: 0 }, rot: 0, radius: 1,
    data: { kind: 'missile', ownerId: 40, targetId: player.id, targetGeneration: 9, turnRate: 2.8, projSpeed: 90 },
  };
  track(state, fresh);
  guns._steerHoming(DT, state);
  assert.ok(fresh.vel.z < 0, `a matching generation turns toward the live occupant — got vz ${fresh.vel.z}`);
});
