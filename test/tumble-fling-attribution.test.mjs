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
