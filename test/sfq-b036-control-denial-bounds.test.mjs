// SFQ-B036 — bound control denial without removing power.
// Chain hitstun diminishing returns (0.65^n), a 5.0 s continuous helm-loss ceiling, and
// recovery protection: a sub-shove graze (u < 0.30) during the 0.9 s stabilization window
// cannot re-tumble the ship, and after massline:recovered the next hit is full strength.
// Seed 4242. Light NPC hull (mass 16, cruise 105) so one shove-class hit is the 4 s beat.
import test from 'node:test';
import assert from 'node:assert/strict';

import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import * as impulseKernel from '../src/combat/impulseKernel.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createBus } from '../src/core/eventBus.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { isRecovering, readTumbleStatus } from '../src/combat/tumbleStatus.js';

const { resolveHitstunLaw, HITSTUN_IMPULSE_EVENT } = impulseKernel;
const CHAIN = () => impulseKernel.HITSTUN_CHAIN_LAW;

const SEED = 4242;
const CRUISE = 105;
const LIGHT_MASS = 16;
const SHOVE_DELTA_V = 0.30 * CRUISE; // k = 0.30 -> 4 s shove beat on equal masses
const GRAZE_DELTA_V = 0.20 * CRUISE; // k = 0.20 -> u = 0.20 (sub-shove, above the 0.14 floor)

function hitPayload(victimId, deltaV, tick) {
  return {
    source: 'gun',
    victimId,
    attackerId: 1,
    attackerMass: LIGHT_MASS,
    victimMass: LIGHT_MASS,
    deltaV,
    dirX: 1,
    dirZ: 0,
    hitSide: 1,
    tick,
  };
}

function lightNpc(id = 2) {
  return {
    id, type: 'ship', alive: true, team: 1, factionId: 'faction_test_1',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 14,
    mass: LIGHT_MASS, combatSpeed: CRUISE,
    hull: 5000, hullMax: 5000, armorHp: 0, armorMax: 0, armorFlat: 0,
    shield: 0, shieldMax: 0, cap: 100, capMax: 100, capRegen: 5,
    lastDamageT: -1e9, flags: {},
    data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship', intent: { fire: false, moveX: 0, moveZ: 0 } },
  };
}

function harness() {
  const player = { ...lightNpc(1), team: 0, isPlayer: true, mass: 18 };
  const victim = lightNpc(2);
  const bus = createBus();
  const helpers = { combatPhysics: { applyImpulse: () => true } };
  const state = {
    tick: 0, simTime: 0, mode: 'flight', playerId: 1,
    entities: new Map([[player.id, player], [victim.id, victim]]),
    entityList: [player, victim],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: SEED },
  };
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } });
  const registry = { get: (name) => (name === 'combat' ? { kernel } : null) };
  const tumble = Object.create(tumbleStates);
  tumble.init({ state, bus, helpers, registry });
  return { player, victim, bus, state, kernel, tumble };
}

function withFlags(fn) {
  const prev = { weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences, tumbleFling: COMBAT_FLAGS.tumbleFling };
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  COMBAT_FLAGS.tumbleFling = true;
  try { return fn(); } finally { Object.assign(COMBAT_FLAGS, prev); }
}

function fire(h, deltaV) {
  h.bus.emit(HITSTUN_IMPULSE_EVENT, hitPayload(h.victim.id, deltaV, h.state.tick | 0));
  h.state.tick = (h.state.tick | 0) + 1;
  h.state.simTime = h.state.tick / 60;
  h.kernel.prePhysics(1 / 60);
}

function seek(h, simTime) {
  h.state.tick = Math.round(simTime * 60);
  h.state.simTime = h.state.tick / 60;
}

test('chain law values: 0.65 decay, 5.0 s ceiling, 0.30 recovery floor', () => {
  const law = CHAIN();
  assert.ok(law, 'HITSTUN_CHAIN_LAW must be exported');
  assert.equal(law.decayPerChain, 0.65);
  assert.equal(law.maxChainDurationS, 5.0);
  assert.equal(law.recoveryReentryMinU, 0.30);
  assert.ok(Object.isFrozen(law));
});

test('chained hits decay by 0.65^n tick-quantized; first hit is untouched', () => {
  const base = { deltaV: SHOVE_DELTA_V, victimCruise: CRUISE, attackerMass: LIGHT_MASS, victimMass: LIGHT_MASS, shove: true };
  const d0 = resolveHitstunLaw(base);
  assert.equal(d0.durationS, 4, `first shove hit must stay the 4 s beat, got ${d0.durationS}`);
  assert.equal('chainCount' in d0, false, 'first hit stays bit-identical (no chainCount field)');
  const durations = [d0.durationS];
  for (let n = 1; n <= 3; n++) {
    const chained = resolveHitstunLaw({ ...base, chainCount: n });
    const expected = Math.ceil(d0.durationS * Math.pow(0.65, n) * 60 - 1e-12) / 60;
    assert.equal(chained.chainCount, n, `chained receipt carries chainCount ${n}`);
    assert.equal(chained.durationS, expected, `chain ${n} must be 0.65^${n} of first hit (got ${chained.durationS}, want ${expected})`);
    durations.push(chained.durationS);
  }
  assert.ok(durations[1] < durations[0], `chain 1 (${durations[1]}) must add strictly less than first hit (${durations[0]})`);
  assert.ok(durations[2] < durations[1], `chain 2 (${durations[2]}) must add strictly less than chain 1 (${durations[1]})`);
  assert.ok(durations[3] < durations[2], `chain 3 (${durations[3]}) must add strictly less than chain 2 (${durations[2]})`);
});

test('a recovering ship refuses a sub-shove graze at the law level', () => {
  const graze = { deltaV: GRAZE_DELTA_V, victimCruise: CRUISE, attackerMass: LIGHT_MASS, victimMass: LIGHT_MASS, shove: true };
  const open = resolveHitstunLaw(graze);
  assert.ok(open.durationS > 0, `fixture sanity: the graze stuns in the open (got ${open.durationS})`);
  assert.ok(open.u < 0.30 && open.u > 0.14, `fixture sanity: graze u must sit between floor and beat gate (got ${open.u})`);
  const refused = resolveHitstunLaw({ ...graze, recovering: true });
  assert.equal(refused.durationS, 0, 'a graze inside the stabilization window must not re-tumble');
  assert.equal(refused.entrySpin, 0);
  assert.equal(refused.shoveBeatS, 0);
});

test('four chained shove hits add strictly less each and never exceed 5.0 s continuous', () => {
  withFlags(() => {
    const h = harness();
    try {
      const spans = [];
      const added = [];
      // Hit 1 at t = 0.
      fire(h, SHOVE_DELTA_V);
      let status = readTumbleStatus(h.state, h.victim);
      assert.ok(status, 'the first shove hit must take the helm');
      let prevUntil = status.data.until;
      spans.push(prevUntil - status.data.startedAt);
      added.push(prevUntil - 0);
      // Hits 2-4 spaced so each would extend an undecayed chain: t = 2, 4, 4.5 s.
      for (const at of [2, 4, 4.5]) {
        seek(h, at);
        fire(h, SHOVE_DELTA_V);
        status = readTumbleStatus(h.state, h.victim);
        assert.ok(status, `chained hit at t=${at} must keep a live tumble`);
        const span = status.data.until - status.data.startedAt;
        spans.push(span);
        added.push(status.data.until - prevUntil);
        prevUntil = status.data.until;
      }
      assert.ok(added[1] > 0, `second hit must still extend the tumble (added ${added[1]})`);
      assert.ok(added[1] < added[0], `second hit adds ${added[1]}, strictly less than first hit ${added[0]}`);
      assert.ok(added[2] < added[1], `third hit adds ${added[2]}, strictly less than second hit ${added[1]}`);
      assert.ok(added[3] <= added[2], `fourth hit adds ${added[3]}, no more than third hit ${added[2]}`);
      for (const span of spans) {
        assert.ok(span <= 5.0 + 1e-9, `continuous helm loss never exceeds the 5.0 s ceiling (got ${span})`);
      }
      status = readTumbleStatus(h.state, h.victim);
      assert.equal(status.data.chainCount, 3, 'four hits record chain 0,1,2,3');
    } finally {
      h.tumble.destroy();
    }
  });
});

test('a graze inside the 0.9 s window is refused without clearing recovery; after recovered the next hit is full', () => {
  withFlags(() => {
    const h = harness();
    try {
      const recoveredEvents = [];
      h.bus.on('massline:recovered', (p) => recoveredEvents.push(p));
      fire(h, SHOVE_DELTA_V);
      let status = readTumbleStatus(h.state, h.victim);
      assert.ok(status, 'setup: the opening hit tumbles');
      const firstSpan = status.data.until - status.data.startedAt;
      assert.equal(firstSpan, 4, `setup: first hit is the full 4 s beat (got ${firstSpan})`);
      // Run past the helm loss into stabilization.
      seek(h, status.data.until + 1 / 60);
      h.tumble.update(1 / 60, h.state);
      assert.equal(readTumbleStatus(h.state, h.victim), null, 'the opening ends');
      assert.equal(isRecovering(h.state, h.victim), true, 'the ship is stabilizing');
      const recoveringUntil = h.victim.data.recoveringUntil;
      assert.ok(Number.isFinite(recoveringUntil), 'the window is stamped');
      // A sub-shove graze inside the window: refused, recovery untouched.
      h.bus.emit(HITSTUN_IMPULSE_EVENT, hitPayload(h.victim.id, GRAZE_DELTA_V, h.state.tick | 0));
      assert.equal(readTumbleStatus(h.state, h.victim), null, 'the graze must not re-tumble a stabilizing ship');
      assert.equal(isRecovering(h.state, h.victim), true, 'stabilization survives the graze');
      assert.equal(h.victim.data.recoveringUntil, recoveringUntil, 'the window is not cleared or shortened');
      // Close the window recognizably, then the next hit is a full first hit again.
      seek(h, recoveringUntil + 1 / 60);
      h.tumble.update(1 / 60, h.state);
      assert.equal(isRecovering(h.state, h.victim), false, 'the window closes');
      assert.ok(recoveredEvents.length >= 1, 'massline:recovered fires');
      fire(h, SHOVE_DELTA_V);
      status = readTumbleStatus(h.state, h.victim);
      assert.ok(status, 'the next hit after recovery tumbles again');
      assert.equal(status.data.chainCount, 0, 'the chain resets after recovery');
      assert.equal(status.data.until - status.data.startedAt, firstSpan, 'and it lands the full first-hit duration again');
    } finally {
      h.tumble.destroy();
    }
  });
});
