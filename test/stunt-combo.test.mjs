// test/stunt-combo.test.mjs — Combo meter and scoring (PQ-146.01).
//
// Done when:
//   - equal-kill physics tape score >= 2x gun tape (seeded print below)
//   - the free Pulse cannot top the physics board (scoring only; damage untouched)
//   - combo state lives in the stunt module; crucible.js reads it for display
//   - chain window, rarity/mass multipliers, bank-on-quiet all hold deterministically

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bankActive,
  bankIfQuiet,
  chainFactor,
  CHAIN_STEP,
  COMBO_BANK_QUIET_TICKS,
  COMBO_WINDOW_TICKS,
  comboKills,
  comboSummary,
  comboTotal,
  createComboState,
  GUN_KILL_SCORE,
  isPulseWeapon,
  killPoints,
  massFactor,
  MAX_CHAIN_MULT,
  PULSE_KILL_SCORE,
  rarityFactor,
  recordKill,
  recordTrick,
  recordTrickKill,
  STUNT_COMBO_SCHEMA_VERSION,
  trickPoints,
} from '../src/systems/stuntCombo.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { createBus } from '../src/core/eventBus.js';
import {
  comboLead,
  comboRows,
  comboTrickLines,
  stuntComboFor,
} from '../src/ui/screens/crucible.js';

function trick(overrides = {}) {
  return {
    trickId: 'collateral',
    name: 'Collateral',
    rarity: 'uncommon',
    baseScore: 200,
    actorId: 'player',
    targetId: 'victim_1',
    secondaryIds: ['hurled_1'],
    metrics: {},
    causeChain: [
      { step: 1, type: 'primary_action', entityId: 'player', targetId: 'hurled_1' },
      { step: 2, type: 'secondary_collision', entityId: 'hurled_1', targetId: 'victim_1' },
    ],
    tick: 0,
    ...overrides,
  };
}

test('combo schema and tuning constants', () => {
  assert.equal(STUNT_COMBO_SCHEMA_VERSION, 1);
  assert.ok(COMBO_WINDOW_TICKS > 0);
  assert.ok(COMBO_BANK_QUIET_TICKS >= COMBO_WINDOW_TICKS);
  assert.equal(CHAIN_STEP, 0.25);
  assert.equal(MAX_CHAIN_MULT, 4);
  assert.equal(PULSE_KILL_SCORE, GUN_KILL_SCORE, 'all guns have fair base kill pay');
});

test('rarity multiplier orders common < uncommon < rare < legendary', () => {
  const base = trick({ metrics: {}, tick: 0 });
  const c = trickPoints({ ...base, rarity: 'common' }, 1);
  const u = trickPoints({ ...base, rarity: 'uncommon' }, 1);
  const r = trickPoints({ ...base, rarity: 'rare' }, 1);
  const l = trickPoints({ ...base, rarity: 'legendary' }, 1);
  assert.ok(c < u && u < r && r < l, `expected ordering, got ${c} < ${u} < ${r} < ${l}`);
  assert.equal(rarityFactor({ rarity: 'bogus' }), 1);
});

test('mass multiplier rewards hurled mass up to a 2x cap', () => {
  assert.equal(massFactor(trick({ metrics: { mass: 20 } })), 1);
  assert.equal(massFactor(trick({ metrics: { mass: 10 } })), 1);
  const heavy = massFactor(trick({ metrics: { mass: 60 } }));
  assert.equal(heavy, 2);
  const mid = massFactor(trick({ metrics: { mass: 40 } }));
  assert.ok(mid > 1 && mid < 2, `expected between 1 and 2, got ${mid}`);
  // No mass recorded: momentum exchange still pays, never zero, never above cap.
  const mom = massFactor(trick({ metrics: { exchangedMomentum: 3000 } }));
  assert.ok(mom >= 1 && mom <= 2);
  assert.equal(massFactor(trick({ metrics: {} })), 1);
});

test('chain multiplier grows per step and caps', () => {
  assert.equal(chainFactor(1), 1);
  assert.equal(chainFactor(2), 1.25);
  assert.equal(chainFactor(5), 2);
  assert.equal(chainFactor(13), MAX_CHAIN_MULT);
  assert.equal(chainFactor(40), MAX_CHAIN_MULT);
  const base = trick({});
  assert.ok(trickPoints(base, 3) > trickPoints(base, 2));
  assert.equal(trickPoints(base, 13), trickPoints(base, 40));
});

test('chain window extends inside, banks and restarts outside', () => {
  const combo = createComboState();
  recordTrick(combo, trick({ tick: 100 }));
  recordTrick(combo, trick({ tick: 100 + COMBO_WINDOW_TICKS }));
  assert.equal(combo.activeCount, 2);
  assert.equal(combo.banked, 0);
  recordTrick(combo, trick({ tick: 100 + COMBO_WINDOW_TICKS + COMBO_WINDOW_TICKS + 1 }));
  assert.equal(combo.activeCount, 1);
  assert.ok(combo.banked > 0, 'the expired chain must bank before the fresh one starts');
});

test('bank on quiet is idempotent and tick-driven', () => {
  const combo = createComboState();
  assert.equal(bankIfQuiet(combo, 9999), 0);
  recordTrick(combo, trick({ tick: 50 }));
  assert.equal(bankIfQuiet(combo, 51), 0);
  const live = comboTotal(combo);
  assert.ok(live > 0);
  const banked = bankIfQuiet(combo, 50 + COMBO_BANK_QUIET_TICKS);
  assert.equal(banked, live);
  assert.equal(combo.activeCount, 0);
  assert.equal(bankActive(combo), 0);
});

test('gun kills pay flat and fairly, tricks never double-pay', () => {
  assert.equal(killPoints('wpn_autocannon_m'), GUN_KILL_SCORE);
  assert.equal(killPoints('wpn_concussion_cannon_m'), GUN_KILL_SCORE);
  assert.equal(killPoints(undefined), GUN_KILL_SCORE);
  assert.equal(killPoints('wpn_pulse_laser_s'), PULSE_KILL_SCORE);
  assert.equal(killPoints('wpn_pulse_laser_m'), PULSE_KILL_SCORE);
  assert.equal(killPoints('unique_mirrorjaw_pulse'), PULSE_KILL_SCORE);
  assert.ok(isPulseWeapon('wpn_pulse_laser_s'));
  assert.ok(!isPulseWeapon('wpn_autocannon_m'));
  assert.ok(!isPulseWeapon(null));

  const combo = createComboState();
  const before = comboTotal(combo);
  recordKill(combo, { weaponId: 'wpn_pulse_laser_s', tick: 10 });
  assert.equal(comboTotal(combo) - before, PULSE_KILL_SCORE);
  assert.equal(combo.pulseKills, 1);
  recordTrickKill(combo);
  assert.equal(combo.trickKills, 1);
  assert.equal(comboKills(combo), 2);
});

test('comboSummary is a read-only snapshot, null when empty', () => {
  assert.equal(comboSummary(null), null);
  assert.equal(comboSummary(createComboState()), null);
  const combo = createComboState();
  recordTrick(combo, trick({ tick: 5 }));
  const snap = comboSummary(combo);
  assert.ok(snap);
  assert.equal(snap.totalScore, comboTotal(combo));
  assert.equal(snap.bestChain, 1);
  assert.equal(snap.lastTricks.length, 1);
  snap.totalScore = -1;
  assert.ok(comboTotal(combo) > 0, 'mutating the snapshot must not touch live state');
});

// --- Seeded headless scenario: equal-kill physics tape vs gun tape ---------------------------
// Seed 14601. Fixed ticks, no RNG, no wall clock. The physics tape chains three named
// tricks (razor release, wrecking ball, collateral) around 4 kills; the gun tape scores
// the same 4 kills with plain fire; the Pulse tape scores them with the free Pulse.
const SCENARIO_SEED = 14601;

function driveTape(kind) {
  const bus = createBus();
  const state = { playerId: 'player', stunts: null, tick: 0, simTime: 0, mode: 'flight' };
  stuntGrammar.init({ bus, state });
  try {
    bus.emit('run:started', {});
    if (kind === 'physics') {
      bus.emit('tether:releaseRated', {
        tick: 100, sourceId: 'player', targetId: 'rock_A', classification: 'razor',
        releaseScore: 0.92, angularSpeed: 4.5, tangentialSpeed: 42.0,
      });
      bus.emit('tether:whipImpact', {
        tick: 160, sourceId: 'player', targetId: 'rock_A', victimId: 'raider_1',
        relSpeed: 58.5, mass: 45.0, momentum: 2632.5,
      });
      bus.emit('combat:hitstunImpulse', {
        tick: 220, actorId: 'player', victimId: 'raider_2',
        weaponId: 'wpn_concussion_cannon_m', deltaV: 25.0,
      });
      bus.emit('combat:collisionConsequence', {
        tick: 240, targetId: 'raider_3', otherId: 'raider_2', surface: 'craft',
        deltaV: 18.0, exchangedMomentum: 950, provenance: { actorId: 'player' },
      });
      // 4 kills: two plain concussion kills, two trick-adjacent (tow-kill + crush).
      bus.emit('entity:killed', { tick: 300, id: 'raider_1', killerId: 'player', weaponId: 'wpn_concussion_cannon_m' });
      bus.emit('tether:attached', { tick: 320, sourceId: 'player', targetId: 'ore_pod', isTow: true, relSpeed: 10 });
      bus.emit('entity:killed', { tick: 340, id: 'raider_2', killerId: 'player', cause: 'ship_collision' });
      bus.emit('entity:killed', { tick: 360, id: 'raider_3', killerId: 'player', weaponId: 'wpn_concussion_cannon_m' });
      bus.emit('entity:killed', { tick: 380, id: 'raider_4', killerId: 'player', weaponId: 'wpn_concussion_cannon_m' });
    } else if (kind === 'gun') {
      for (let i = 0; i < 4; i += 1) {
        bus.emit('entity:killed', { tick: 300 + i * 20, id: `raider_${i}`, killerId: 'player', weaponId: 'wpn_autocannon_m' });
      }
    } else {
      for (let i = 0; i < 4; i += 1) {
        bus.emit('entity:killed', { tick: 300 + i * 20, id: `raider_${i}`, killerId: 'player', weaponId: 'wpn_pulse_laser_s' });
      }
    }
    state.tick = 100000;
    stuntGrammar.update(state, 1 / 60);
    const combo = state.stunts.combo;
    bankActive(combo);
    return { score: comboTotal(combo), kills: comboKills(combo), bestChain: combo.bestChain };
  } finally {
    stuntGrammar.destroy();
  }
}

test('seeded scenario: executed tricks add style; base kills pay equally across guns', () => {
  const physics = driveTape('physics');
  const gun = driveTape('gun');
  const pulse = driveTape('pulse');

  console.log(`[stunt-combo scenario seed ${SCENARIO_SEED}] physics tape: score=${physics.score} kills=${physics.kills} bestChain=${physics.bestChain}`);
  console.log(`[stunt-combo scenario seed ${SCENARIO_SEED}] gun tape: score=${gun.score} kills=${gun.kills}`);
  console.log(`[stunt-combo scenario seed ${SCENARIO_SEED}] pulse tape: score=${pulse.score} kills=${pulse.kills}`);
  console.log(`[stunt-combo scenario seed ${SCENARIO_SEED}] ratio physics/gun=${(physics.score / gun.score).toFixed(2)}x`);

  assert.equal(physics.kills, 4);
  assert.equal(gun.kills, 4);
  assert.equal(pulse.kills, 4);
  assert.ok(physics.bestChain >= 3, `physics tape must chain, got bestChain=${physics.bestChain}`);
  assert.ok(
    physics.score > gun.score,
    `the executed multi-stage tricks (${physics.score}) add style to base kill pay (${gun.score})`,
  );
  assert.equal(pulse.score, gun.score);
});

test('crucible combo builders read the stunt snapshot and stay null-safe', () => {
  assert.equal(stuntComboFor(null), null);
  assert.equal(stuntComboFor({}), null);
  assert.equal(stuntComboFor({ state: {} }), null);
  assert.equal(stuntComboFor({ state: { stunts: { combo: createComboState() } } }), null);

  const combo = createComboState();
  recordTrick(combo, trick({ name: 'Wrecking Ball', trickId: 'wrecking_ball', rarity: 'uncommon', baseScore: 250, metrics: { mass: 45 }, tick: 160 }));
  recordKill(combo, { weaponId: 'wpn_pulse_laser_s', tick: 300 });
  const ctx = { state: { stunts: { combo } } };
  const summary = stuntComboFor(ctx);
  assert.ok(summary);
  assert.ok(summary.totalScore > 0);

  const lead = comboLead(summary);
  assert.ok(lead.length > 0, 'the band carries a sentence, not just figures');
  const rows = comboRows(summary);
  assert.ok(rows.some(([k]) => k === 'Combo score'));
  assert.ok(rows.some(([k]) => k === 'Pulse kills'), 'a Pulse kill is named, never hidden');
  const lines = comboTrickLines(summary);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].name, 'Wrecking Ball');

  assert.equal(comboLead(null), '');
  assert.deepEqual(comboRows(null), []);
  assert.deepEqual(comboTrickLines(null), []);
});
