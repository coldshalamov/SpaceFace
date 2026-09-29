// Hull-burst overhaul, slice A, packet 5: a flung hull knocks the next hull loose.
//
// Owner, 2026-09-29: "you get a good throw on 3 enemies and they blast into an asteroid field and
// they burst" and, for the design, "a tumbling ship ... can knock others into tumbles. Its damage is
// what it hits while tumbling, attributed to the player." Before this, craft-on-craft consequences
// read only the FIRST solver tick's momentum exchange: a flung Wasp meeting a second Wasp at 110 WU/s
// registered ~12 WU/s of knock and ~0.7 damage (feel.fling_scene chain arm), so flinging enemies into
// each other did nothing. Under `combat.tumbleFling`, when the STRIKER is loose (tumbling or
// recovering) the struck hull's knock is (1 + e) * closing * mStriker / (mStriker + mTarget), and the
// credit for the striker's flight chains onto the struck hull so its own flight is still the player's.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import {
  HITSTUN_IMPULSE_EVENT,
  PROJECTILE_HULL_LAW,
  readRecentImpulseProvenance,
  recordImpulseProvenance,
  resolveCollisionConsequence,
} from '../src/combat/impulseKernel.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createBus } from '../src/core/eventBus.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';

const HULL = (id, team, x, mass = 16) => ({
  id, type: 'ship', alive: true, team, factionId: `faction_test_${team}`,
  pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 14, mass,
  hull: 500, hullMax: 500, armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
  cap: 100, capMax: 100, capRegen: 5, lastDamageT: -1e9, flags: {},
  data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship', intent: { fire: false, moveX: 0, moveZ: 0 } },
});

test('the projectile-hull law: knock = (1 + e) * closing * mStriker / (mStriker + mTarget), and it only ever raises the solver\'s reading', () => {
  const target = HULL(4, 1, -60);
  const other = HULL(2, 1, -20);
  const base = { target, other, exchangedMomentum: 16 * 12, tick: 10, provenance: { actorId: 1, weaponId: 'w', tag: 'concussion_slug', appliedTick: 5 } };
  const solverOnly = resolveCollisionConsequence(base);
  assert.equal(solverOnly.deltaV, 12, 'no strike: exactly the first-tick exchange, as before');
  assert.equal(solverOnly.projectileKnock, undefined);

  const strike = resolveCollisionConsequence({ ...base, projectileStrike: { strikerMass: 16, closingSpeed: 110 } });
  const expected = (1 + PROJECTILE_HULL_LAW.restitution) * 110 * 16 / (16 + 16);
  assert.ok(Math.abs(strike.deltaV - expected) < 1e-9, `knock ${strike.deltaV} == ${expected} (0.8 x closing for equal masses)`);
  assert.equal(strike.projectileKnock, true);
  assert.ok(strike.impactDamage > solverOnly.impactDamage * 20, `a real hit now does real damage (${strike.impactDamage} vs ${solverOnly.impactDamage})`);
  assert.equal(strike.control, 'tumble', 'and it takes the helm');

  // A striker much lighter than its target barely knocks it; a graze under the floor does nothing.
  const light = resolveCollisionConsequence({ ...base, projectileStrike: { strikerMass: 2, closingSpeed: 110 } });
  assert.ok(light.deltaV < strike.deltaV, 'the knock scales with the striker\'s share of the mass');
  const graze = resolveCollisionConsequence({ ...base, projectileStrike: { strikerMass: 16, closingSpeed: PROJECTILE_HULL_LAW.minClosingSpeed - 1 } });
  assert.equal(graze.deltaV, 12, 'a brush under the closing floor is left to the solver reading');
  // It never LOWERS a bigger solver reading.
  const hard = resolveCollisionConsequence({ ...base, exchangedMomentum: 16 * 200, projectileStrike: { strikerMass: 16, closingSpeed: 110 } });
  assert.equal(hard.deltaV, 200);
  assert.equal(hard.projectileKnock, undefined);
});

function harness() {
  const player = { ...HULL(1, 0, -600), isPlayer: true, mass: 18 };
  const striker = HULL(2, 1, -400);
  const victim = { ...HULL(4, 1, -540), hull: 30, hullMax: 30 };
  const bus = createBus();
  const helpers = { combatPhysics: { applyImpulse: () => true } };
  const state = {
    tick: 100, simTime: 100 / 60, mode: 'flight', playerId: 1,
    entities: new Map([[player.id, player], [striker.id, striker], [victim.id, victim]]),
    entityList: [player, striker, victim],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 47 },
  };
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } });
  const registry = { get: (name) => (name === 'combat' ? { kernel } : null) };
  const tumble = Object.create(tumbleStates);
  tumble.init({ state, bus, helpers, registry });
  const collisions = Object.create(collisionConsequences);
  collisions.init({ state, bus, helpers, registry });
  return { player, striker, victim, bus, state, kernel, tumble, collisions };
}

function withFlags(flags, fn) {
  const previous = { weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences, tumbleFling: COMBAT_FLAGS.tumbleFling };
  Object.assign(COMBAT_FLAGS, flags);
  try { return fn(); } finally { Object.assign(COMBAT_FLAGS, previous); }
}

/** The player blasts the striker loose, then it meets the victim: the hull-on-hull contact. */
function flingIntoVictim(h, { closing = 110 } = {}) {
  const hitTick = h.state.tick;
  recordImpulseProvenance(h.striker, { actorId: 1, weaponId: 'wpn_concussion_cannon_m', tag: 'concussion_slug', appliedTick: hitTick, magnitude: 600 });
  h.bus.emit(HITSTUN_IMPULSE_EVENT, {
    source: 'gun', victimId: 2, attackerId: 1, attackerMass: 18, victimMass: 16, deltaV: 250, dirX: -1, dirZ: 0, hitSide: 1, tick: hitTick,
    provenance: { actorId: 1, weaponId: 'wpn_concussion_cannon_m', tag: 'concussion_slug', appliedTick: hitTick },
  });
  h.state.tick += 1; h.state.simTime += 1 / 60; h.kernel.prePhysics(1 / 60); // the tumble lands
  assert.ok(readTumbleStatus(h.state, h.striker), 'the striker is loose');
  h.state.tick += 40; h.state.simTime += 40 / 60; // it flies 40 ticks and meets the victim
  const events = [];
  h.bus.on('combat:collisionConsequence', (payload) => events.push(payload));
  h.bus.emit('physics:impact', {
    consequenceKernelVersion: 1, aId: 2, bId: 4, impulse: 16 * 12, dp: 16 * 12, tick: h.state.tick,
    pos: { x: -470, z: 0 }, normal: { x: -1, z: 0 }, preSolveClosingSpeed: closing,
  });
  return { events, hitTick };
}

test('flag on: the struck hull is knocked loose, hurt by the real closing speed, and the kill is the player\'s', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    const h = harness();
    const { events } = flingIntoVictim(h);
    const onVictim = events.find((e) => e.targetId === 4);
    assert.ok(onVictim, 'the contact produced a consequence for the struck hull');
    assert.equal(onVictim.projectileKnock, true, 'the projectile-hull law applied');
    assert.ok(onVictim.deltaV > 80, `knocked at ~0.8 x 110 (got ${onVictim.deltaV})`);
    assert.equal(onVictim.targetKilled, true, 'a flung hull now kills a Wasp-sized hull on contact');
    assert.equal(onVictim.provenance.actorId, 1, 'and it is attributed to whoever flung the striker: the player');
    // The struck hull got its own fresh record so ITS flight is still the player's.
    const record = readRecentImpulseProvenance(h.victim, h.state.tick);
    assert.ok(record && record.actorId === 1, 'the credit chains onto the struck hull');
  });
});

test('the chained credit outlives 3 s on the struck hull too (a live one, not killed by the contact)', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    const h = harness();
    h.victim.hull = 5000; h.victim.hullMax = 5000; // survives, so its own tumble runs
    // A hard strike (250 WU/s closing, knock ~200) puts the struck hull into the 3.5 s stun cap.
    const { events } = flingIntoVictim(h, { closing: 250 });
    assert.equal(events.find((e) => e.targetId === 4).targetKilled, false);
    const tumble = readTumbleStatus(h.state, h.victim);
    assert.ok(tumble, 'the struck hull is tumbling');
    assert.ok((tumble.data.until - tumble.data.startedAt) * 60 > 190, 'and its flight is longer than the 3 s window');
    const record = readRecentImpulseProvenance(h.victim, h.state.tick + 190);
    assert.ok(record && record.actorId === 1, 'more than three seconds on, a rock kill of the struck hull is still the player\'s');
  });
});

test('flag off (the frozen 47-A profile): the old first-tick reading, no chained credit', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: false }, () => {
    const h = harness();
    const { events } = flingIntoVictim(h);
    const onVictim = events.find((e) => e.targetId === 4);
    assert.ok(onVictim);
    assert.equal(onVictim.projectileKnock, undefined, 'no projectile law');
    assert.ok(onVictim.deltaV < 20, `just the solver reading (got ${onVictim.deltaV})`);
    assert.equal(readRecentImpulseProvenance(h.victim, h.state.tick), null, 'and no record is written on the struck hull');
  });
});
