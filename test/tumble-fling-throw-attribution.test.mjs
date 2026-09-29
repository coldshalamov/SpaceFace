// Hull-burst overhaul, slice A: a hull the player THROWS with the Massline is the player's kill.
//
// Owner, 2026-09-29: "you get a good throw on 3 enemies and they blast into an asteroid field and
// they burst, and there's shiny winnings that come out of them and accelerate towards you." The
// rope throw wrote no impulse-provenance record (only weapon hits, bombs, impulse charges and the
// like do), so a hostile hull thrown into a rock died with `killerId === the hull itself`: no
// player kill, no kill-burst loot. Measured on the real runtime by feel.fling_scene throwShort
// (flight 1.2 s) and throwLong (flight 3.9 s), before and after this change.
//
// The seam is tumbleStates._onThrow, which already runs on `massline:throw`: under
// `combat.tumbleFling` it now leaves the same kind of record a gun hit leaves, and the existing
// flight hold carries it for the whole tumble plus recovery beat. The frozen 47-A profile (flag
// off) writes nothing, so its throws are byte-identical.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMBAT_FLAGS, MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import {
  IMPULSE_PROVENANCE_MAX_AGE_TICKS,
  readRecentImpulseProvenance,
  recordImpulseProvenance,
} from '../src/combat/impulseKernel.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createBus } from '../src/core/eventBus.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';

const HULL = (id, team, x, mass = 16) => ({
  id, type: 'ship', alive: true, team, factionId: `faction_test_${team}`,
  pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 12, mass,
  hull: 30, hullMax: 30, armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
  cap: 100, capMax: 100, capRegen: 5, lastDamageT: -1e9, flags: {},
  data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship', intent: { fire: false, moveX: 0, moveZ: 0 } },
});

const ROCK = (id, x) => ({
  id, type: 'asteroid', alive: true, team: null,
  pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 40, mass: 5000,
  hull: 4000, hullMax: 4000, flags: {}, data: {},
});

function harness() {
  const player = { ...HULL(1, 0, -600, 18), isPlayer: true, hull: 500, hullMax: 500 };
  const thrown = HULL(2, 1, -400);
  const rock = ROCK(3, -760);
  const bus = createBus();
  const helpers = { combatPhysics: { applyImpulse: () => true } };
  const state = {
    tick: 100, simTime: 100 / 60, mode: 'flight', playerId: 1,
    entities: new Map([[player.id, player], [thrown.id, thrown], [rock.id, rock]]),
    entityList: [player, thrown, rock],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 47 },
  };
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } });
  const registry = { get: (name) => (name === 'combat' ? { kernel } : null) };
  const tumble = Object.create(tumbleStates);
  tumble.init({ state, bus, helpers, registry });
  const collisions = Object.create(collisionConsequences);
  collisions.init({ state, bus, helpers, registry });
  return { player, thrown, rock, bus, state, kernel, tumble, collisions };
}

function withFlags(flags, fn) {
  const previousCombat = { weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences, tumbleFling: COMBAT_FLAGS.tumbleFling };
  const previousMassline = { enabled: MASSLINE2_FLAGS.enabled, tumble: MASSLINE2_FLAGS.tumble };
  Object.assign(COMBAT_FLAGS, { weaponImpulseConsequences: true, tumbleFling: true, ...flags });
  Object.assign(MASSLINE2_FLAGS, { enabled: true, tumble: true });
  try { return fn(); } finally {
    Object.assign(COMBAT_FLAGS, previousCombat);
    Object.assign(MASSLINE2_FLAGS, previousMassline);
  }
}

function step(h, dt = 1 / 60) {
  h.state.tick += 1;
  h.state.simTime += dt;
  h.kernel.prePhysics(dt);
  h.tumble.update(dt, h.state);
}

/** What masslineThrow emits the moment the pilot's release cuts the line. */
function throwHull(h, { payloadSpeed = 90, payloadId = h.thrown.id } = {}) {
  const tick = h.state.tick;
  h.bus.emit('massline:throw', {
    releaseId: `massline:throw:${tick}:${payloadId}`, payloadId, aimTargetId: h.rock.id, aimSynthetic: false,
    payloadSpeed, mode: 'snap', tick, time: h.state.simTime,
  });
  return tick;
}

/** The solver's contact receipt for the thrown hull meeting the rock face at speed. */
function meetRock(h, { closing = 90 } = {}) {
  const events = [];
  const damage = [];
  h.bus.on('combat:collisionConsequence', (payload) => events.push(payload));
  h.bus.on('combat:damage', (payload) => damage.push(payload));
  h.bus.emit('physics:impact', {
    consequenceKernelVersion: 1, aId: h.thrown.id, bId: h.rock.id, impulse: 16 * closing, dp: 16 * closing, tick: h.state.tick,
    pos: { x: -720, z: 0 }, normal: { x: -1, z: 0 }, preSolveClosingSpeed: closing,
  });
  return { events, damage };
}

test('flag on: the throw leaves a player-owned record on the thrown hull, the same kind a gun hit leaves', () => {
  withFlags({}, () => {
    const h = harness();
    const tick = throwHull(h);
    const record = readRecentImpulseProvenance(h.thrown, h.state.tick);
    assert.ok(record, 'the throw wrote an impulse record on the thrown hull');
    assert.equal(record.actorId, h.player.id, 'the thrower is the actor');
    assert.equal(record.tag, 'massline_throw');
    assert.equal(record.weaponId, 'massline', 'the rope family weapon id, so the ram/flail identity check still reads it as rope');
    assert.equal(record.appliedTick, tick);
    assert.ok(record.magnitude > 0, 'and it carries the momentum thrown');
  });
});

test('flag on: a thrown hull that meets a rock inside 3 s is the player\'s kill', () => {
  withFlags({}, () => {
    const h = harness();
    throwHull(h);
    step(h); // the tumble lands
    assert.ok(readTumbleStatus(h.state, h.thrown), 'the throw takes the hull\'s helm');
    for (let i = 0; i < 60; i++) step(h); // a 1 s flight
    const { events, damage } = meetRock(h);
    const onHull = events.find((e) => e.targetId === h.thrown.id);
    assert.ok(onHull, 'the rock contact produced a consequence for the thrown hull');
    assert.equal(onHull.provenance.actorId, h.player.id, 'the contact is attributed to the thrower');
    assert.equal(onHull.provenance.tag, 'massline_throw');
    assert.equal(onHull.targetKilled, true, 'a Wasp-sized hull dies on a rock at 90 WU/s');
    assert.ok(damage.some((d) => d.targetId === h.thrown.id && d.attackerId === h.player.id),
      'and the killing damage was routed with the player as the attacker (entity:killed.killerId)');
  });
});

test('flag on: the credit survives a flight LONGER than the 3 s window (the tumble system\'s own per-tick scan runs the whole way)', () => {
  withFlags({}, () => {
    const h = harness();
    // A hard enough throw takes the helm for the 3.5 s cap (the real Wasp throws in feel.fling_scene
    // all measure 3.5 s); the fixture hull has no propulsion profile, so it needs the speed to get there.
    const tick = throwHull(h, { payloadSpeed: 400 });
    step(h);
    const tumble = readTumbleStatus(h.state, h.thrown);
    assert.ok(tumble, 'the hull is tumbling');
    const flightTicks = Math.ceil((tumble.data.until - tumble.data.startedAt) * 60);
    assert.ok(flightTicks > IMPULSE_PROVENANCE_MAX_AGE_TICKS,
      `the fixture must fly longer than the 3 s window to mean anything (${flightTicks} ticks)`);
    // A flight of 3.5 s: past the 180-tick record life, before the hold ends.
    while (h.state.tick < tick + IMPULSE_PROVENANCE_MAX_AGE_TICKS + 30) step(h);
    assert.ok(readTumbleStatus(h.state, h.thrown), 'still flying loose');
    const { events } = meetRock(h);
    const onHull = events.find((e) => e.targetId === h.thrown.id);
    assert.equal(onHull.provenance.actorId, h.player.id, 'a rock met after 3.5 s of flight is still the thrower\'s');
    assert.equal(onHull.targetKilled, true);
    // It does not outlive the flight plus the recovery beat.
    const h2 = harness();
    const t2 = throwHull(h2, { payloadSpeed: 400 });
    step(h2);
    const until = Math.ceil((readTumbleStatus(h2.state, h2.thrown).data.until - h2.state.simTime) * 60);
    while (h2.state.tick < t2 + until + 60 + 10) step(h2);
    assert.equal(readRecentImpulseProvenance(h2.thrown, h2.state.tick), null, 'the hold ends with the tumble and its recovery beat');
  });
});

test('flag off (the frozen 47-A profile): nothing is written, so the old blame-the-hull result stands', () => {
  withFlags({ tumbleFling: false }, () => {
    const h = harness();
    const announced = [];
    h.bus.on('massline:tumbled', (payload) => announced.push(payload));
    throwHull(h);
    assert.equal(readRecentImpulseProvenance(h.thrown, h.state.tick), null, 'no record on the thrown hull');
    assert.equal(announced.length, 1, 'the tumble itself still happens exactly as before');
    assert.equal(Object.hasOwn(announced[0].provenance, 'appliedTick'), false,
      'the announced provenance is byte-identical to the pre-change shape: no appliedTick key');
    for (let i = 0; i < 60; i++) step(h);
    const { events } = meetRock(h);
    const onHull = events.find((e) => e.targetId === h.thrown.id);
    assert.notEqual(onHull && onHull.provenance.actorId, h.player.id, 'flag off: the rock kill is not credited to the player');
  });
});

test('only a live non-player ship or drone carries the credit: a dead hull, the player, a cargo pod and a missing player get no record', () => {
  withFlags({}, () => {
    const h = harness();
    h.thrown.alive = false;
    throwHull(h);
    assert.equal(readRecentImpulseProvenance(h.thrown, h.state.tick), null, 'a dead hull is not thrown');

    const own = harness();
    throwHull(own, { payloadId: own.player.id });
    assert.equal(readRecentImpulseProvenance(own.player, own.state.tick), null, 'the player is never their own throw');

    const pod = harness();
    pod.thrown.type = 'payload';
    throwHull(pod);
    assert.equal(readRecentImpulseProvenance(pod.thrown, pod.state.tick), null, 'a cargo pod is not a hull: its credit is the stunt path\'s business');

    const nobody = harness();
    nobody.state.playerId = null;
    throwHull(nobody);
    assert.equal(readRecentImpulseProvenance(nobody.thrown, nobody.state.tick), null, 'no player, no credit to give');
  });
});

test('the latest cause wins: a throw replaces a hull\'s older record from another actor and inherits nothing from it', () => {
  withFlags({}, () => {
    const h = harness();
    recordImpulseProvenance(h.thrown, { actorId: 9, weaponId: 'wpn_other', tag: 'concussion_slug', appliedTick: h.state.tick - 5, magnitude: 100 });
    throwHull(h);
    const record = readRecentImpulseProvenance(h.thrown, h.state.tick);
    assert.equal(record.actorId, h.player.id, 'the thrower is now the cause');
    assert.equal(record.tag, 'massline_throw');
  });
});
