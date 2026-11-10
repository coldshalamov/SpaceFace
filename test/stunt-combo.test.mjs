import test from 'node:test';
import assert from 'node:assert/strict';
import { createComboState, recordTrick, recordKill, bankActive, bankIfQuiet, comboSummary, recordBridge, settleCrash, resetRound, advanceCombo, massFactor } from '../src/systems/stuntCombo.js';
import { admitStuntThreat, allocateStyle } from '../src/combat/stuntScoring.js';
const act = (trickId, episodeId, tick = 0, extra = {}) => ({ trickId, episodeId, tick, rootTick: tick, name: trickId,
  victimLives: [{ lifeId: episodeId, threatClass: 'fodder', dead: true }], metrics: {}, ...extra });

test('worked A: three primary families bank 460 style plus 300 neutral base score', () => {
  const c = createComboState();
  for (const [id, episode, tick] of [['rock_discovery', 'a', 0], ['bolas', 'b', 180], ['bank_job', 'c', 360]]) {
    recordTrick(c, act(id, episode, tick)); recordKill(c, { lifeId: episode, weaponId: 'wpn_pulse_laser_s' });
  }
  assert.equal(c.activePoints, 230);
  assert.equal(comboSummary(c).activeMultiplier, 2);
  assert.equal(bankActive(c), 460);
  assert.equal(c.banked, 760);
  assert.equal(c.bestLine.acts.length, 3);
  assert.equal(bankActive(c), 0);
});
test('worked B: fodder lifetime caps a spectacular signature at 100', () => {
  const c = createComboState();
  const a = act('slingshot_golf', 's', 0, { metrics: { payloadMass: 80, playerDryHullMass: 20, usefulDeltaV: 100, referenceCruise: 100 } });
  assert.equal(massFactor(a), 1.5);
  assert.equal(recordTrick(c, a), 100);
  assert.equal(bankActive(c), 100);
});
test('worked C: repeats retain fractions until one final floor and never raise multiplier', () => {
  const c = createComboState();
  for (let i = 0; i < 3; i++) recordTrick(c, act('rock_discovery', `r${i}`, i * 90));
  assert.equal(c.activePoints, 87.5);
  assert.equal(comboSummary(c).activeMultiplier, 1);
  assert.equal(bankActive(c), 87);
});
test('Razor Bolas collateral has one primary, deterministic proportional allocations and bounded amendment', () => {
  const c = createComboState();
  const a = act('bolas', 'one', 0, { metrics: { payloadMass: 80, playerDryHullMass: 20, usefulDeltaV: 100, referenceCruise: 100 },
    victimLives: ['a', 'b', 'c'].map(lifeId => ({ lifeId, threatClass: 'fodder', dead: true })),
    modifiers: { razorRelease: 'razor', collateralCount: 3 } });
  assert.equal(recordTrick(c, a), 185);
  assert.equal(recordTrick(c, a), 0);
  assert.equal(c.activeCount, 1);
  assert.equal(bankActive(c), 185);
  assert.equal(recordTrick(c, { ...a, modifiers: { ...a.modifiers, collateralCount: 4 } }), 0);
  const allocation = allocateStyle(185, ['c', 'b', 'a'].map(lifeId => ({ lifeId, available: 100 })));
  assert.deepEqual(allocation.map(x => x.lifeId), ['a', 'b', 'c']);
  assert.equal(allocation.reduce((n, a) => n + a.points, 0), 185);
});
test('nonlethal half-budget then death unlocks only remainder, including save round-trip', () => {
  let c = createComboState();
  assert.equal(recordTrick(c, act('bolas', 'first', 0, { victimLives: [{ lifeId: 0, threatClass: 'fodder', dead: false }] })), 50);
  bankActive(c); c = JSON.parse(JSON.stringify(c));
  assert.equal(recordTrick(c, act('bank_job', 'second', 120, { victimLives: [{ lifeId: 0, threatClass: 'boss', dead: true }] })), 50, 'later boss claim cannot promote admitted fodder');
  assert.equal(recordTrick(c, act('one_two', 'third', 180, { victimLives: [{ lifeId: 0, threatClass: 'fodder', dead: true }] })), 0);
  assert.equal(c.activeCount, 1);
});
test('two other distinct paid IDs restore repetition; modifiers and zero-budget acts do not', () => {
  const c = createComboState();
  assert.equal(recordTrick(c, act('rock_discovery', 'r1')), 50);
  assert.equal(recordTrick(c, act('rock_discovery', 'r2', 20)), 25);
  assert.equal(recordTrick(c, act('collateral', 'm', 30)), 0);
  recordTrick(c, act('bolas', 'b', 40)); recordTrick(c, act('bank_job', 'j', 50));
  assert.equal(recordTrick(c, act('rock_discovery', 'r3', 60)), 50);
});
test('quiet requires explicit safe physical context; bridges require useful setup and are bounded', () => {
  const c = createComboState(); recordTrick(c, act('bolas', 'b'));
  assert.equal(bankIfQuiet(c, 120), 0, 'silence is not evidence of quiet');
  assert.equal(recordBridge(c, { tick: 200, setupId: 0, kind: 'loaded_constraint', liveHostile: true, displacementLengths: 1 }), true);
  assert.equal(recordBridge(c, { tick: 201, setupId: 0, kind: 'close_shave', preventedInterception: true }), false);
  assert.equal(recordBridge(c, { tick: 202, setupId: 1, kind: 'bank_contact', liveDescendant: true, validTarget: true }), true);
  assert.equal(recordBridge(c, { tick: 203, setupId: 2, kind: 'close_shave', preventedInterception: true }), false);
  assert.equal(c.deadlineTick, 480);
  assert.equal(bankIfQuiet(c, 220, { incomingInterception: false, loadedManipulation: false }), 0);
  assert.equal(bankIfQuiet(c, 339, { incomingInterception: false, loadedManipulation: false }), 0);
  assert.equal(bankIfQuiet(c, 340, { incomingInterception: false, loadedManipulation: false }), 90);
});
test('pending descendant bounded by root horizon; pressure timeout retains full multiplier', () => {
  const c = createComboState(); recordTrick(c, act('rock_discovery', 'a')); recordTrick(c, act('bolas', 'b', 30));
  assert.equal(bankIfQuiet(c, 330, { pendingUntilTick: 10000 }), 0);
  assert.equal(bankIfQuiet(c, 510, { pendingUntilTick: 10000 }), 210);
});
test('escape has finite shared threat budget and only one escape multiplier contribution', () => {
  const c = createComboState();
  const escape = (name, id, threat, tick) => act(name, id, tick, { pureEscape: true, threatEpisodeId: threat, victimLives: [] });
  assert.equal(recordTrick(c, escape('kickstart', 'k', 'pursuit', 0)), 40);
  assert.equal(recordTrick(c, escape('needle_thread', 'n', 'pursuit', 20)), 0);
  assert.equal(recordTrick(c, escape('needle_thread', 'n2', 'other', 30)), 40);
  recordTrick(c, act('rock_discovery', 'r', 40));
  assert.equal(comboSummary(c).activeMultiplier, 1.5);
  assert.equal(bankActive(c), 93, 'combat 50 + capped escape 12.5, times 1.5, final floor');
});
test('hard crash and death settle at one without touching previous banks; postmortem remains bounded', () => {
  const c = createComboState(); recordKill(c, { lifeId: 'kill' });
  recordTrick(c, act('rock_discovery', 'a')); recordTrick(c, act('bolas', 'b', 30));
  assert.equal(settleCrash(c, { tick: 31, deltaVCruise: .3, helmLossSeconds: .2, entryHullLossFraction: .1 }), 0);
  assert.equal(settleCrash(c, { tick: 32, deltaVCruise: .3, helmLossSeconds: 1 }), 140);
  assert.equal(c.banked, 240);
  settleCrash(c, { tick: 40, playerDeath: true });
  assert.equal(recordTrick(c, act('bank_job', 'new', 50)), 0);
  assert.equal(recordTrick(c, act('bank_job', 'launched', 50, { rootTick: 35 })), 90);
  assert.equal(bankActive(c), 90);
  assert.equal(c.carry, 0);
});
test('safe carry decays only in active simulation, has next-round protection and is consumed once', () => {
  const c = createComboState(); recordTrick(c, act('rock_discovery', 'a')); recordTrick(c, act('bolas', 'b', 30));
  resetRound(c, 100); assert.equal(c.carry, .5);
  advanceCombo(c, 1000, { intermission: true }); assert.equal(c.carry, .5);
  resetRound(c, 1000, { begin: true }); advanceCombo(c, 1299); assert.equal(c.carry, .5);
  advanceCombo(c, 1360); assert.equal(c.carry, .25);
  recordTrick(c, act('bank_job', 'next', 1360)); assert.equal(c.carry, 0);
  assert.equal(comboSummary(c).activeMultiplier, 1.25);
});
test('threat admission and death aliases are immutable, numeric ID zero is retained', () => {
  const entity = { id: 0, data: { runCohort: 'survival', threatClass: 'elite' } };
  const first = admitStuntThreat(entity, 'one'); entity.data.threatClass = 'boss';
  assert.equal(admitStuntThreat(entity, 'two'), first); assert.equal(first.baseScore, 600);
  const c = createComboState();
  assert.equal(recordKill(c, { lifeId: 0, threatClass: 'elite', weaponId: 'wpn_pulse_laser_s' }), 600);
  assert.equal(recordKill(c, { lifeId: 0, threatClass: 'elite' }), 0);
  assert.equal(recordKill(c, { lifeId: 1, playerOwned: false }), 0);
});
