import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.mjs';
import { readTensionPolicy, tensionAccrualScale, tensionCandidateRank, tensionPacingBlockReason } from '../../src/ai/tensionPolicy.js';
import { loadEncounterConsumer } from '../../../fixture/loadEncounterConsumer.mjs';

const combat = { id: 'fight', deck: 'combat', tier: 'minor', pressureCost: 20, script: 'fixture' };
const civilian = { id: 'civil', deck: 'civilian', tier: 'ambient', pressureCost: 10, script: 'fixture' };
const major = { ...combat, id: 'major', tier: 'major' };
const catalog = { fight: combat, civil: civilian, major };
const loaded = await loadEncounterConsumer({ catalog });
const actual = loaded.exports;
function ready() { const h = boot(); for (let t = 0; t <= 200; t++) h.step(t);
  actual.advanceSessionRhythm(h.state.encounterDirector, h.state, 200); return h; }

test('policy lease expires and invalid/disabled policies restore neutral read behavior', () => {
  const h = ready(); assert(readTensionPolicy(h.state, 200));
  assert.equal(readTensionPolicy(h.state, 204), null); assert.equal(readTensionPolicy(h.state, 199), null);
  assert.equal(tensionAccrualScale(h.state, 'combat', 204), 1);
  h.state.tensionDirector.policy.combatRate = NaN; assert.equal(readTensionPolicy(h.state, 200), null);
});

test('read port clamps malicious numeric values without opening new authority', () => {
  const h = ready(); h.state.tensionDirector.policy.combatRate = 1e9;
  h.state.tensionDirector.policy.civilianRate = -99;
  assert.equal(tensionAccrualScale(h.state, 'combat'), 1.25);
  assert.equal(tensionAccrualScale(h.state, 'civilian'), .65);
});

test('actual campaign gate blocks unsolicited combat in recovery but still admits civilian ambient', () => {
  const h = boot(); h.player.hull = 20; h.step(0);
  actual.advanceSessionRhythm(h.state.encounterDirector, h.state, 0);
  assert.equal(actual.encounterPacingBlockReason(h.state.encounterDirector, h.state, combat, 0), 'tension_recovery');
  assert.equal(actual.encounterPacingBlockReason(h.state.encounterDirector, h.state, civilian, 0), null);
});

test('actual legacy rhythm stays byte-equivalent in behavior when no tension policy is installed', () => {
  const h = boot(); delete h.state.tensionDirector;
  const row = actual.advanceSessionRhythm(h.state.encounterDirector, h.state, 0);
  assert.equal(row.phase, 'travel'); assert.equal(row.changed, true);
  const later = actual.advanceSessionRhythm(h.state.encounterDirector, h.state, 76);
  assert.equal(later.phase, 'curiosity');
});

test('actual session-rhythm owner adopts intent without the controller cross-writing it', () => {
  const h = ready(); h.state.encounterDirector.sessionRhythm = { phase: 'quiet', enteredAt: 100, dwellS: 1 };
  const before = JSON.stringify(h.state.tensionDirector);
  const row = actual.advanceSessionRhythm(h.state.encounterDirector, h.state, 200);
  assert.equal(row.phase, 'tension'); assert.equal(row.changed, true);
  assert.equal(JSON.stringify(h.state.tensionDirector), before);
  const held = actual.advanceSessionRhythm(h.state.encounterDirector, h.state, 201);
  assert.equal(held.changed, false); assert.equal(held.dwellS, 1);
});

test('actual quota, cooldown, pressure and live-combat gates remain mandatory', () => {
  const h = ready(); const d = h.state.encounterDirector;
  assert.equal(actual.encounterPacingBlockReason(d, h.state, combat, 200), null);
  d.cooldowns.fight = 300; assert.equal(actual.encounterPacingBlockReason(d, h.state, combat, 200), 'cooldown'); delete d.cooldowns.fight;
  d.pressure.combat = 0; assert.equal(actual.encounterPacingBlockReason(d, h.state, combat, 200), 'pressure'); d.pressure.combat = 140;
  d.window = [{ t: 150, tier: 'minor' }, { t: 160, tier: 'minor' }];
  assert.equal(actual.encounterPacingBlockReason(d, h.state, combat, 200), 'minor_quota'); d.window = [];
  d.live.fight = { deck: 'combat', tier: 'minor', ids: [], startedAt: 180 };
  assert.equal(actual.encounterPacingBlockReason(d, h.state, combat, 200), 'combat_busy'); d.live = {};
  h.state.player.flags.docked = true; assert.equal(actual.encounterPacingBlockReason(d, h.state, combat, 200), 'docked');
  h.state.player.flags.docked = false; h.state.onboarding = { active: true, finished: false };
  assert.equal(actual.encounterPacingBlockReason(d, h.state, combat, 200), 'tutorial');
});

test('actual accrual applies bounded cadence multipliers while retaining the pool cap', () => {
  const h = boot(); h.step(0); const d = h.state.encounterDirector; d.pressure = { combat: 0, civilian: 0 };
  const host = { player: () => h.player, _currentSectorId: () => 'sector_test', cargoValue: () => 0 };
  actual.encounterDirector._accrue.call(host, d, h.state, 1);
  assert(Math.abs(d.pressure.combat - (.25 + .22 * .5 + .5 * .5) * .15) < 1e-12);
  assert(d.pressure.civilian > 0);
  d.pressure.combat = 139.99; actual.encounterDirector._accrue.call(host, d, h.state, 10);
  assert.equal(d.pressure.combat, 140);
});

test('actual pump prioritizes context but invokes normal gates before the existing fire seam', () => {
  const h = ready(); const d = h.state.encounterDirector;
  d.pending = [
    { encounterId: 'c', shapeId: 'fight', dueAt: 195, defers: 0 },
    { encounterId: 'v', shapeId: 'civil', dueAt: 195, defers: 0 },
  ];
  h.state.tensionDirector.policy.preference = 1;
  const fired = [];
  const host = Object.assign(Object.create(actual.encounterDirector), {
    state: h.state, _gatesPass: () => true, _spawnAdmissionAvailable: () => true,
    _fire: (_dir, _state, item) => fired.push(item.shapeId),
  });
  host._pump(d, h.state, 200); assert.deepEqual(fired, ['civil']);
  host._spawnAdmissionAvailable = () => false; host._pump(d, h.state, 200);
  assert.deepEqual(fired, ['civil']); assert.equal(d.pending.length, 1);
});

test('preference is bounded, respects overdue age and exact no-policy ordering', () => {
  const h = ready(); h.state.tensionDirector.policy.preference = 1;
  assert(tensionCandidateRank(h.state, { shapeId: 'fight', dueAt: 140 }, combat, 200)
    < tensionCandidateRank(h.state, { shapeId: 'civil', dueAt: 190 }, civilian, 200));
  delete h.state.tensionDirector;
  assert.equal(tensionCandidateRank(h.state, { dueAt: 193 }, combat, 200), 193);
});

test('major beats are held for a commitment window, not admitted during curiosity', () => {
  const h = boot(); for (let t = 0; t <= 100; t++) h.step(t);
  assert.equal(tensionPacingBlockReason(h.state.encounterDirector, h.state, major, 100), 'tension_reserve');
  for (let t = 101; t <= 200; t++) h.step(t);
  assert.equal(tensionPacingBlockReason(h.state.encounterDirector, h.state, major, 200), null);
});

test('fractional-second undocking has a valid protective lease before the next 1 Hz decision', () => {
  const h = ready(); const sequence = h.state.tensionDirector.sequence, activeS = h.state.tensionDirector.activeS;
  h.state.player.flags.docked = true; h.step(200.1, .1);
  h.state.player.flags.docked = false; h.step(200.2, .1);
  const policy = readTensionPolicy(h.state, 200.2);
  assert(policy, 'resume must not temporarily fall back to the permissive legacy gate');
  assert.equal(policy.allowCombat, false);
  assert.equal(policy.reason, 'reentry_grace');
  assert.equal(h.state.tensionDirector.sequence, sequence);
  assert.equal(h.state.tensionDirector.activeS, activeS);
  actual.advanceSessionRhythm(h.state.encounterDirector, h.state, 200.2);
  assert.equal(actual.encounterPacingBlockReason(h.state.encounterDirector, h.state, combat, 200.2), 'tension_recovery');
});

test('readiness veto also reaches the existing tactical rhythm reader, not only the spawn gate', () => {
  const h = ready(); h.player.hull = 40; h.step(201);
  assert.equal(h.state.tensionDirector.phase, 'build');
  assert.equal(h.state.tensionDirector.policy.allowCombat, false);
  assert.equal(h.state.tensionDirector.policy.rhythmPhase, 'quiet');
  const host = { emit() {} };
  actual.encounterDirector._tickSessionRhythm.call(host, h.state.encounterDirector, h.state, 201);
  assert.equal(loaded.publishedRhythm(), 'quiet', 'the tactical director must see respite during the readiness veto');
});
