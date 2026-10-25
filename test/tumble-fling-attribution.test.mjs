// Hull-burst overhaul, slice A, packet 1: a hull the player knocked loose keeps the player's
// credit for the whole flight (docs/plans/2026-09-29-hull-burst-physics-overhaul-design.md §3, §7).
//
// The bug this pins: impulse provenance lives 180 ticks (3 s) and the tumble system's own RCS scan
// deletes stale records every tick, so a hull flung hard enough to coast 3.5 s was blamed on the
// hull itself when it finally met a rock — no player kill, no loot. Measured on the real runtime by
// scripts/lib/bench/scenarios/feel.fling_scene.mjs (attribution.long).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import {
  HITSTUN_IMPULSE_EVENT,
  IMPULSE_PROVENANCE_MAX_AGE_TICKS,
  holdImpulseProvenance,
  readRecentImpulseProvenance,
  recordImpulseProvenance,
} from '../src/combat/impulseKernel.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createBus } from '../src/core/eventBus.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';

const ENTITY = () => ({ id: 2, type: 'ship' });
const RECORD = (over = {}) => ({ actorId: 1, weaponId: 'wpn_x', tag: 'concussion_slug', appliedTick: 100, magnitude: 500, ...over });

test('a held provenance record outlives the 3 s window; an unheld one does not', () => {
  const plain = ENTITY();
  recordImpulseProvenance(plain, RECORD());
  assert.ok(readRecentImpulseProvenance(plain, 100 + IMPULSE_PROVENANCE_MAX_AGE_TICKS), 'still fresh at exactly the window');
  assert.equal(readRecentImpulseProvenance(plain, 100 + IMPULSE_PROVENANCE_MAX_AGE_TICKS + 1), null,
    'an unheld record dies one tick past the window (existing law)');

  const held = ENTITY();
  recordImpulseProvenance(held, RECORD());
  const holdTick = 100 + 400;
  assert.ok(holdImpulseProvenance(held, holdTick, 100));
  assert.equal(readRecentImpulseProvenance(held, 100 + IMPULSE_PROVENANCE_MAX_AGE_TICKS + 1).actorId, 1,
    'the hold keeps the record past the window');
  assert.equal(readRecentImpulseProvenance(held, holdTick).actorId, 1, 'and through the hold tick itself');
  assert.equal(readRecentImpulseProvenance(held, holdTick + 1), null, 'then it expires normally, and the read clears it');
});

test('a hold never touches appliedTick, never shortens, and never invents a record', () => {
  const entity = ENTITY();
  assert.equal(holdImpulseProvenance(entity, 999, 50), null, 'no record, no hold: it never creates attribution');
  recordImpulseProvenance(entity, RECORD({ appliedTick: 50, magnitude: 100 }));
  const first = holdImpulseProvenance(entity, 600, 50);
  assert.equal(first.appliedTick, 50,
    'appliedTick is what the RCS-disruptor latch reads; re-stamping it would re-arm that latch every tick');
  const second = holdImpulseProvenance(entity, 400, 60);
  assert.equal(second.holdUntilTick, 600, 'a shorter hold never shortens the existing one');
  assert.equal(Object.isFrozen(second), true, 'records stay immutable');
});

test('a hold never revives a record that is already dead (drones are never scanned, so nothing else clears theirs)', () => {
  const drone = { id: 7, type: 'drone' };
  recordImpulseProvenance(drone, RECORD());
  // 900 ticks later a hull-on-hull tumble begins on the same drone: the 15-second-old hit is not its cause.
  assert.equal(holdImpulseProvenance(drone, 1300, 1000), null, 'a stale record is not extended');
  assert.equal(readRecentImpulseProvenance(drone, 1000), null, 'and it is gone, not merely unheld');
});

test('a fresh record is extended only when it is this tumble\'s cause; a hull already held extends on any tumble', () => {
  const unrelated = ENTITY();
  recordImpulseProvenance(unrelated, RECORD({ appliedTick: 100 }));
  // An NPC ram at tick 200 tumbles the hull; the fresh record is the player's old weak hit (tick 100).
  assert.equal(holdImpulseProvenance(unrelated, 500, 200, 195), null,
    'the ram is not the record\'s hit: the player does not inherit credit for an unrelated shove');
  assert.equal(readRecentImpulseProvenance(unrelated, 250).holdUntilTick, undefined, 'and nothing was held');

  const cause = ENTITY();
  recordImpulseProvenance(cause, RECORD({ appliedTick: 100 }));
  assert.equal(holdImpulseProvenance(cause, 400, 100, 100).holdUntilTick, 400, 'the record that caused the tumble is held');
  // A rock bounce at tick 250 extends the tumble; the hull is already held, so the credit extends with it.
  assert.equal(holdImpulseProvenance(cause, 520, 250, 999).holdUntilTick, 520,
    'a further tumble mid-flight (a rock, a second hull) extends the same credit, whatever its own cause');
});

test('a follow-up hit from the same actor keeps a running hold; a different actor replaces the record outright', () => {
  const entity = ENTITY();
  recordImpulseProvenance(entity, RECORD({ appliedTick: 100 }));
  holdImpulseProvenance(entity, 365, 100, 100);
  // A no-stun plink from the same player at tick 160 must not drop the flight credit.
  recordImpulseProvenance(entity, RECORD({ appliedTick: 160, magnitude: 20 }));
  assert.equal(readRecentImpulseProvenance(entity, 350).holdUntilTick, 365, 'same actor: the hold rides through');

  recordImpulseProvenance(entity, RECORD({ actorId: 9, weaponId: 'wpn_y', tag: 'missile_detonation', appliedTick: 200, magnitude: 150 }));
  const read = readRecentImpulseProvenance(entity, 300);
  assert.equal(read.actorId, 9, 'the newer actor is the cause');
  assert.equal(read.holdUntilTick, undefined, 'and the old hold does not leak onto their record');
});

function harness() {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, isPlayer: true,
    pos: { x: -600, z: 220 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 10, mass: 18,
    hull: 500, hullMax: 500, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, armorFlat: 0,
    cap: 100, capMax: 100, capRegen: 5, lastDamageT: -1e9, flags: {},
    data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship' },
  };
  const victim = {
    ...player, id: 2, team: 1, isPlayer: false, mass: 16, pos: { x: -400, z: 0 },
    data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship', intent: { fire: false, moveX: 0, moveZ: 0 } },
  };
  const bus = createBus();
  const helpers = { combatPhysics: { applyImpulse: () => true } };
  const state = {
    tick: 100, simTime: 100 / 60, mode: 'flight', playerId: 1,
    entities: new Map([[player.id, player], [victim.id, victim]]),
    entityList: [player, victim],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 47 },
  };
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } });
  const system = Object.create(tumbleStates);
  system.init({ state, bus, helpers, registry: { get: (name) => (name === 'combat' ? { kernel } : null) } });
  return { player, victim, bus, state, kernel, system };
}

function step(h, dt = 1 / 60) {
  h.state.tick += 1;
  h.state.simTime += dt;
  h.kernel.prePhysics(dt);
  h.system.update(dt, h.state);
}

/** The way damage.js lands a weapon hit: record the provenance, then publish the hitstun event. */
function gunHit(h, { deltaV = 250 } = {}) {
  const appliedTick = h.state.tick;
  recordImpulseProvenance(h.victim, {
    actorId: h.player.id, weaponId: 'wpn_concussion_cannon_m', tag: 'concussion_slug', appliedTick, magnitude: 600,
  });
  h.bus.emit(HITSTUN_IMPULSE_EVENT, {
    source: 'gun', victimId: h.victim.id, attackerId: h.player.id, attackerMass: 18, victimMass: h.victim.mass,
    deltaV, dirX: -1, dirZ: 0, hitSide: 1, tick: appliedTick,
    provenance: { actorId: h.player.id, weaponId: 'wpn_concussion_cannon_m', tag: 'concussion_slug', appliedTick },
  });
  return appliedTick;
}

function withFlags(flags, fn) {
  const previous = { weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences, tumbleFling: COMBAT_FLAGS.tumbleFling };
  Object.assign(COMBAT_FLAGS, flags);
  try { return fn(); } finally { Object.assign(COMBAT_FLAGS, previous); }
}

test('with tumbleFling on, the credit survives the real failure path: 300 ticks of the tumble system\'s own per-tick scan', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    const h = harness();
    const hitTick = gunHit(h);
    step(h); // the tumble status lands on the next kernel tick
    const tumble = readTumbleStatus(h.state, h.victim);
    assert.ok(tumble, 'the hit puts the hull into a tumble');
    const flightTicks = Math.ceil((tumble.data.until - tumble.data.startedAt) * 60);
    assert.ok(flightTicks > IMPULSE_PROVENANCE_MAX_AGE_TICKS,
      `the fixture must fly longer than the 3 s window to mean anything (${flightTicks} ticks)`);
    // Run the system's own update: _tickRcsLatches reads (and destructively clears) stale records
    // every tick, which is what used to delete the credit at 3 s.
    while (h.state.tick < hitTick + IMPULSE_PROVENANCE_MAX_AGE_TICKS + 5) step(h);
    const record = readRecentImpulseProvenance(h.victim, h.state.tick);
    assert.ok(record, 'the credit outlives the 3 s window while the hull is still flying loose');
    assert.equal(record.actorId, h.player.id);
    assert.equal(record.tag, 'concussion_slug');
    assert.ok(readTumbleStatus(h.state, h.victim), 'and the hull is still tumbling at that point');
    // It does not outlive the flight plus the recovery beat.
    while (h.state.tick < hitTick + flightTicks + 60 + 5) step(h);
    assert.equal(readRecentImpulseProvenance(h.victim, h.state.tick), null,
      'the hold ends with the tumble and its recovery beat');
  });
});

test('with tumbleFling off (the frozen 47-A profile) nothing changes: the record still dies at 3 s', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: false }, () => {
    const h = harness();
    const hitTick = gunHit(h);
    step(h);
    assert.ok(readTumbleStatus(h.state, h.victim));
    while (h.state.tick < hitTick + IMPULSE_PROVENANCE_MAX_AGE_TICKS + 20) step(h);
    assert.equal(readRecentImpulseProvenance(h.victim, h.state.tick), null,
      'flag off: the old three-second life, byte-for-byte');
  });
});

test('a rock bounce mid-flight extends the tumble AND the credit; a rock hit with no live record credits nobody', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    const h = harness();
    const hitTick = gunHit(h, { deltaV: 130 });
    step(h);
    const before = readRecentImpulseProvenance(h.victim, h.state.tick).holdUntilTick;
    assert.ok(before > hitTick, 'the first tumble holds the credit');
    // 60 ticks into the flight a rock bounce lands: a world-body hit with the same provenance.
    while (h.state.tick < hitTick + 60) step(h);
    h.bus.emit(HITSTUN_IMPULSE_EVENT, {
      source: 'collision', victimId: h.victim.id, attackerId: 3, attackerMass: 16, victimMass: h.victim.mass,
      deltaV: 150, dirX: 1, dirZ: 0, hitSide: 1, worldBody: true, tick: h.state.tick,
      provenance: { actorId: 1, weaponId: 'wpn_concussion_cannon_m', tag: 'concussion_slug', appliedTick: hitTick },
    });
    step(h);
    const after = readRecentImpulseProvenance(h.victim, h.state.tick).holdUntilTick;
    assert.ok(after > before, `the bounce extended the credit with the tumble (${before} -> ${after})`);

    // A rock hit on a hull nobody knocked loose has no record to extend, and none is invented.
    const cold = harness();
    cold.bus.emit(HITSTUN_IMPULSE_EVENT, {
      source: 'collision', victimId: cold.victim.id, attackerId: 3, attackerMass: 16, victimMass: cold.victim.mass,
      deltaV: 150, dirX: -1, dirZ: 0, hitSide: 1, worldBody: true, tick: cold.state.tick,
    });
    assert.equal(readRecentImpulseProvenance(cold.victim, cold.state.tick + 5), null, 'no record, no invented credit');
  });
});

// ── X-08 (row 566): a thrown ROCK (or wreck or pod) is the thrower's kill — the credit widened
// from ships/drones to every body the sling can launch, with its own 240-tick flight hold and a
// second provenance point on deliberate tether:released.

import { COMBAT_FLAGS as X08_FLAGS, MASSLINE2_FLAGS as X08_ML } from '../src/data/featureFlags.js';
import {
  readRecentImpulseProvenance as x08Read,
  recordImpulseProvenance as x08Record,
} from '../src/combat/impulseKernel.js';
import { createCombatKernel as x08Kernel } from '../src/combat/kernel.js';
import { collisionConsequences as x08Collisions } from '../src/systems/collisionConsequences.js';
import { THROW_CREDIT_HOLD_TICKS, THROW_CREDIT_MIN_SPEED_WU } from '../src/systems/tumbleStates.js';
import { createSimulation as x08Sim } from '../src/core/sim.js';
import { lawSecurity as x08Law } from '../src/systems/lawSecurity.js';
import { heat as x08Heat } from '../src/systems/heat.js';

const X08_WASP = (id, x) => ({
  id, type: 'ship', alive: true, team: 1, factionId: 'faction_test_1',
  pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 12, mass: 16,
  hull: 30, hullMax: 30, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, armorFlat: 0,
  cap: 100, capMax: 100, capRegen: 5, lastDamageT: -1e9, flags: {},
  data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship', intent: { fire: false, moveX: 0, moveZ: 0 } },
});
const X08_BODY = (id, type, x, speed = 90) => ({
  id, type, alive: true, team: null,
  pos: { x, z: 0 }, vel: { x: speed, z: 0 }, rot: 0, angVel: 0, radius: 20, mass: 400,
  hull: 4000, hullMax: 4000, flags: {}, data: { oreHP: 400, oreHPMax: 400 },
});

function x08Harness(movingType = 'asteroid') {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, isPlayer: true,
    pos: { x: -800, z: 220 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 10, mass: 18,
    hull: 500, hullMax: 500, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, armorFlat: 0,
    cap: 100, capMax: 100, capRegen: 5, lastDamageT: -1e9, flags: {},
    data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship' },
  };
  const thrown = X08_BODY(2, movingType, -200);
  const wasp = X08_WASP(3, 0);
  const bus = createBus();
  const helpers = { combatPhysics: { applyImpulse: () => true } };
  const state = {
    tick: 100, simTime: 100 / 60, mode: 'flight', playerId: 1,
    entities: new Map([[player.id, player], [thrown.id, thrown], [wasp.id, wasp]]),
    entityList: [player, thrown, wasp],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 47 },
  };
  const kernel = x08Kernel({ state, bus, helpers, registry: { get: () => null } });
  const system = Object.create(tumbleStates);
  system.init({ state, bus, helpers, registry: { get: (n) => (n === 'combat' ? { kernel } : null) } });
  const collisions = Object.create(x08Collisions);
  collisions.init({ state, bus, helpers, registry: { get: (n) => (n === 'combat' ? { kernel } : null) } });
  return { player, thrown, wasp, bus, state, kernel, system, collisions };
}

function x08WithFlags(fn) {
  const prev = { tumbleFling: X08_FLAGS.tumbleFling, weaponImpulseConsequences: X08_FLAGS.weaponImpulseConsequences };
  const prevMl = { enabled: X08_ML.enabled, tumble: X08_ML.tumble };
  Object.assign(X08_FLAGS, { tumbleFling: true, weaponImpulseConsequences: true });
  Object.assign(X08_ML, { enabled: true, tumble: true });
  try { return fn(); } finally { Object.assign(X08_FLAGS, prev); Object.assign(X08_ML, prevMl); }
}

function x08Throw(h, { speed = 90, payloadId = h.thrown.id } = {}) {
  h.bus.emit('massline:throw', {
    releaseId: `massline:throw:${h.state.tick}:${payloadId}`, payloadId,
    aimTargetId: h.wasp.id, aimSynthetic: false, payloadSpeed: speed,
    mode: 'snap', tick: h.state.tick, time: h.state.simTime,
  });
}

/** The solver's receipt for the thrown mass meeting the wasp at speed. */
function x08MeetWasp(h, { closing = 90 } = {}) {
  const killed = [];
  const damage = [];
  const consequences = [];
  h.bus.on('entity:killed', (p) => killed.push(p));
  h.bus.on('combat:damage', (p) => damage.push(p));
  h.bus.on('combat:collisionConsequence', (p) => consequences.push(p));
  h.bus.emit('physics:impact', {
    consequenceKernelVersion: 1, aId: h.thrown.id, bId: h.wasp.id,
    impulse: 400 * closing, dp: 400 * closing, tick: h.state.tick,
    pos: { x: 0, z: 0 }, normal: { x: -1, z: 0 }, preSolveClosingSpeed: closing,
  });
  return { killed, damage, consequences };
}

test('X-08 a thrown asteroid that kills a hostile inside the hold is the player\'s kill', () => {
  x08WithFlags(() => {
    const h = x08Harness();
    x08Throw(h);
    h.state.tick += 120; // +120 ticks of flight
    const { killed, damage } = x08MeetWasp(h);
    const kill = killed.find((k) => k.targetId === h.wasp.id || k.entityId === h.wasp.id);
    const routed = damage.find((d) => d.targetId === h.wasp.id);
    assert.ok(routed || kill, 'the contact produced killing damage for the wasp');
    assert.equal((routed || kill).attackerId ?? kill.killerId, h.player.id,
      'the thrown rock\'s kill is attributed to the thrower');
    assert.ok(killed.length <= 1, 'one kill, one receipt');
  });
});

test('X-08 the hold carries the rock\'s credit 230 ticks, not 260', () => {
  x08WithFlags(() => {
    const h = x08Harness();
    x08Throw(h);
    h.state.tick += THROW_CREDIT_HOLD_TICKS - 10;
    assert.equal(x08Read(h.thrown, h.state.tick).actorId, h.player.id,
      'still held inside the 240-tick flight hold');
    h.state.tick += 30; // past the hold
    assert.equal(x08Read(h.thrown, h.state.tick), null, 'a drifting rock past the hold bills nobody');
  });
});

test('X-08 a deliberate sling cut of a fast rock is a throw; a slow set-down is not', () => {
  x08WithFlags(() => {
    const fast = x08Harness();
    fast.thrown.vel = { x: 40, z: 0 }; // ≥25 wu/s
    fast.bus.emit('tether:released', { targetId: fast.thrown.id });
    const rec = x08Read(fast.thrown, fast.state.tick);
    assert.ok(rec, 'a ≥25 wu/s cut writes the same throw record');
    assert.equal(rec.actorId, fast.player.id);
    assert.equal(rec.tag, 'massline_throw');
    const slow = x08Harness();
    slow.thrown.vel = { x: 10, z: 0 }; // below the throw floor
    slow.bus.emit('tether:released', { targetId: slow.thrown.id });
    assert.equal(x08Read(slow.thrown, slow.state.tick), null, 'a set-down bills nobody');
  });
});

test('X-08 a thrown payload pod and a thrown wreck both carry the credit', () => {
  x08WithFlags(() => {
    for (const type of ['payload', 'wreck']) {
      const h = x08Harness(type);
      x08Throw(h);
      const rec = x08Read(h.thrown, h.state.tick);
      assert.ok(rec, `a thrown ${type} carries the thrower's record`);
      assert.equal(rec.actorId, h.player.id);
      assert.equal(rec.holdUntilTick, h.state.tick + THROW_CREDIT_HOLD_TICKS,
        `a thrown ${type} gets the flight hold (never tumbles)`);
    }
  });
});
test('X-08 a thrown-rock lawful kill in a witness radius files the player and prices heat', () => {
  x08WithFlags(() => {
    const sim = x08Sim({ seed: 4242, systems: [x08Law, x08Heat] });
    try {
      const { state, bus } = sim;
      state.mode = 'flight';
      state.world.currentSectorId = 'sector_helios_prime';
      const pilot = sim.spawn({ type: 'ship', team: 0, pos: { x: 200, z: 10 }, radius: 8, hull: 500, hullMax: 500 });
      state.playerId = pilot.id;
      state.player.heat = 0;
      const lawful = sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 300, z: 40 }, radius: 10, hull: 1, hullMax: 30,
        data: { ai: { lawful: true, archetype: 'patrol_lawman' } } });
      // A lawful witness inside the response radius — without one the kill is unwitnessed.
      sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 320, z: 60 }, radius: 9, hull: 100, hullMax: 100,
        data: { ai: { lawful: true, archetype: 'patrol_lawman' } } });
      const incidents = [];
      bus.on('law:incident', (p) => incidents.push(p));
      bus.emit('entity:killed', {
        id: lawful.id, type: 'ship', factionId: 'faction_scn', factionLawful: true,
        killerId: pilot.id, attackerId: pilot.id,
        cause: 'impact', weaponId: 'massline', pos: { x: 300, z: 40 },
      });
      assert.ok(state.player.heat > 0, 'a witnessed lawful kill by the player rock prices heat');
      // Unwitnessed: no heat.
      const before = state.player.heat;
      const quiet = sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 6000, z: 6000 }, radius: 10, hull: 1, hullMax: 30,
        data: { ai: { lawful: true, archetype: 'patrol_lawman' } } });
      bus.emit('entity:killed', {
        id: quiet.id, type: 'ship', factionId: 'faction_scn', factionLawful: true,
        killerId: pilot.id, attackerId: pilot.id,
        cause: 'impact', weaponId: 'massline', pos: { x: 6000, z: 6000 },
      });
      assert.equal(state.player.heat, before, 'an unwitnessed lawful kill files no heat');
    } finally { sim.dispose(); }
  });
});

test('X-08 a rock-on-rock contact pays nothing; a rebound to the player self-bills nothing', () => {
  x08WithFlags(() => {
    const h = x08Harness();
    const wall = X08_BODY(9, 'asteroid', 200);
    h.state.entities.set(wall.id, wall); h.state.entityList.push(wall);
    x08Throw(h);
    const killed = [];
    h.bus.on('entity:killed', (p) => killed.push(p));
    h.bus.emit('physics:impact', {
      consequenceKernelVersion: 1, aId: h.thrown.id, bId: wall.id,
      impulse: 400 * 90, dp: 400 * 90, tick: h.state.tick,
      pos: { x: 200, z: 0 }, normal: { x: -1, z: 0 }, preSolveClosingSpeed: 90,
    });
    assert.equal(killed.length, 0, 'a rock that hits a rock kills nobody');
    const killed2 = [];
    h.bus.on('entity:killed', (p) => killed2.push(p));
    h.bus.emit('physics:impact', {
      consequenceKernelVersion: 1, aId: h.thrown.id, bId: h.player.id,
      impulse: 400 * 40, dp: 400 * 40, tick: h.state.tick,
      pos: { x: -800, z: 220 }, normal: { x: -1, z: 0 }, preSolveClosingSpeed: 40,
    });
    const selfKill = killed2.find((k) => (k.targetId ?? k.entityId) === h.player.id);
    assert.equal(selfKill, undefined, 'a rebound into the player produces no self-kill receipt');
  });
});

test('X-08 an involuntary tether:broke stamps no record', () => {
  x08WithFlags(() => {
    const h = x08Harness();
    h.thrown.vel = { x: 60, z: 0 };
    h.bus.emit('tether:broke', { targetId: h.thrown.id, reason: 'strain' });
    assert.equal(x08Read(h.thrown, h.state.tick), null, 'a break is not a throw');
  });
});

test('X-08 constants: the throw floor matches the standing 25 wu/s and the hold is 4 s', () => {
  assert.equal(THROW_CREDIT_MIN_SPEED_WU, 25);
  assert.equal(THROW_CREDIT_HOLD_TICKS, 240);
});

test('X-08 review: a throw\'s own tether:released echo keeps its record; a later re-cut earns a fresh hold', () => {
  x08WithFlags(() => {
    const h = x08Harness();
    const throwTick = h.state.tick;
    x08Throw(h);
    h.thrown.vel = { x: 90, z: 0 };
    h.state.tick += 1; // reconcile echo of the same cut
    h.bus.emit('tether:released', { targetId: h.thrown.id });
    const echoed = x08Read(h.thrown, h.state.tick);
    assert.equal(echoed.appliedTick, throwTick, 'the echo is the same release, not a second stamp');
    assert.equal(echoed.holdUntilTick, throwTick + THROW_CREDIT_HOLD_TICKS);
    // Caught again and cut loose 200 ticks later: the new release holds 240 ticks from ITS cut.
    h.state.tick = throwTick + 200;
    h.thrown.vel = { x: 40, z: 0 };
    h.bus.emit('tether:released', { targetId: h.thrown.id });
    const recut = x08Read(h.thrown, h.state.tick);
    assert.equal(recut.appliedTick, throwTick + 200);
    assert.equal(recut.holdUntilTick, throwTick + 200 + THROW_CREDIT_HOLD_TICKS,
      'a re-cut inside the old hold is not short-changed to the old throw\'s expiry');
    h.state.tick = throwTick + 300; // past the first throw's hold, inside the re-cut's
    assert.equal(x08Read(h.thrown, h.state.tick)?.actorId, h.player.id);
  });
});

// X-08 review 2 — the lawful-kill leg above emits entity:killed by hand. This drives the REAL
// seam: a thrown rock's physics:impact through collisionConsequences + the combat kernel, whose
// own entity:killed reaches lawSecurity and heat. A witnessed lawful hull ended by the player's
// rock charges lawful_kill and prices heat; the same rock unthrown (or past its hold) bills nobody.
function x08LawfulRockScene({ thrown, flightTicks = 60 }) {
  const sim = x08Sim({ seed: 4242, systems: [x08Law, x08Heat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const pilot = sim.spawn({ type: 'ship', team: 0, pos: { x: -400, z: 10 }, radius: 8, hull: 500, hullMax: 500 });
  state.playerId = pilot.id;
  state.player.heat = 0;
  // Rock surface touches the victim (20 + 10 = 30 wu apart) so it never occludes the witness.
  const rock = sim.spawn({ type: 'asteroid', pos: { x: 270, z: 40 }, vel: { x: 90, z: 0 }, radius: 20, mass: 400,
    hull: 4000, hullMax: 4000, data: { oreHP: 400, oreHPMax: 400 } });
  const lawful = sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 300, z: 40 }, radius: 10, mass: 16,
    hull: 1, hullMax: 30, data: { ai: { lawful: true, archetype: 'patrol_lawman' } } });
  sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 320, z: 60 }, radius: 9, hull: 100, hullMax: 100,
    data: { ai: { lawful: true, archetype: 'patrol_lawman' } } });
  const helpers = { ...sim.helpers, combatPhysics: { applyImpulse: () => true } };
  const kernel = x08Kernel({ state, bus, helpers, registry: { get: () => null } });
  const registry = { get: (n) => (n === 'combat' ? { kernel } : null) };
  Object.create(tumbleStates).init({ state, bus, helpers, registry });
  Object.create(x08Collisions).init({ state, bus, helpers, registry });
  const killed = [];
  const adjudicated = [];
  bus.on('entity:killed', (p) => killed.push(p));
  bus.on('law:killedAdjudicated', (p) => adjudicated.push(p));
  if (thrown) {
    bus.emit('massline:throw', { releaseId: `massline:throw:${state.tick}:${rock.id}`, payloadId: rock.id,
      aimTargetId: lawful.id, aimSynthetic: false, payloadSpeed: 90, mode: 'snap', tick: state.tick, time: state.simTime });
  }
  state.tick += flightTicks;
  bus.emit('physics:impact', { consequenceKernelVersion: 1, aId: rock.id, bId: lawful.id,
    impulse: 400 * 90, dp: 400 * 90, tick: state.tick, pos: { x: 290, z: 40 }, normal: { x: -1, z: 0 },
    preSolveClosingSpeed: 90 });
  return { sim, state, pilot, lawful, killed, adjudicated };
}

test('X-08 review 2: a real thrown-rock contact that ends a witnessed lawful hull charges the player and prices heat', () => {
  x08WithFlags(() => {
    const s = x08LawfulRockScene({ thrown: true });
    try {
      assert.equal(s.lawful.alive, false, 'the rock contact killed the lawful hull');
      const kill = s.killed.find((k) => k.id === s.lawful.id);
      assert.ok(kill, 'the kernel emitted the real entity:killed');
      assert.equal(kill.killerId, s.pilot.id, 'the real kill receipt names the thrower');
      const verdict = s.adjudicated.find((a) => a.victimEntityId === s.lawful.id);
      assert.ok(verdict, 'lawSecurity adjudicated the kill');
      assert.equal(verdict.outcome, 'charged');
      assert.equal(verdict.kind, 'lawful_kill');
      assert.equal(verdict.witnessed, true);
      assert.ok(s.state.player.heat > 0, 'heat priced off the real path');
    } finally { s.sim.dispose(); }
  });
});

test('X-08 review 2: the same real contact from an unthrown rock, or past the hold, bills the player nothing', () => {
  x08WithFlags(() => {
    for (const opts of [{ thrown: false }, { thrown: true, flightTicks: THROW_CREDIT_HOLD_TICKS + 30 }]) {
      const s = x08LawfulRockScene(opts);
      try {
        const kill = s.killed.find((k) => k.id === s.lawful.id);
        assert.notEqual(kill && kill.killerId, s.pilot.id, `no player kill receipt (${JSON.stringify(opts)})`);
        assert.equal(s.adjudicated.some((a) => a.victimEntityId === s.lawful.id && a.outcome === 'charged'), false);
        assert.equal(s.state.player.heat, 0, `no heat (${JSON.stringify(opts)})`);
      } finally { s.sim.dispose(); }
    }
  });
});
