// Row 467 RC-MISSION-VOICE — missions with a voice. Pins:
//   * bounty marks: a killed name never returns (500-roll audit), factions fit the sector,
//     ≥24 opening lines;
//   * heists: one unique method each + a Case File projected from the observed ledger, a cased
//     row opens a third method;
//   * payday: the payer's own receipt line on completion;
//   * retry: a second attempt changes the room — retryWatch on the offer, pickets on the lane.
//
// Clause Gambit (add "cargo intact" — raises pay, enforced) was landed earlier under RC-467 and
// is covered by test/contract-clauses*.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rollBountyMark, bountyMarkHail, markFactionPoolFor, MARK_HAIL_LINES, MARK_NAMES,
} from '../src/data/bountyMarks.js';
import {
  buildHeistOffer, buildBreakawayOffer, buildCounterweightOffer,
  heistCaseFile, heistMethodsFor, HEIST_CASE_FILE,
} from '../src/data/heistMission.js';
import { missionPaydayLine } from '../src/systems/missions.js';
import { createHeistRecord, heistMissionRuntime, HEIST_CUE_TEXT } from '../src/missions/heistMissionRuntime.js';
import { SECTORS } from '../src/data/sectors.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

const SEED = 4242;

// ── bounty marks ─────────────────────────────────────────────────────────────

test('a killed mark never returns in 500 rolls; every other field stays deterministic', () => {
  const sectorId = 'sector_ceres_belt';
  const sectorDef = SECTOR_BY_ID.get(sectorId);
  // Kill the first name each roll would deal, then re-roll — the replacement must differ.
  for (let i = 0; i < 500; i++) {
    const offerId = `m_bounty_${i}`;
    const first = rollBountyMark({ seed: SEED, offerId, sectorId, riskTier: 2, sectorDef });
    const again = rollBountyMark({
      seed: SEED, offerId, sectorId, riskTier: 2, sectorDef, exclude: [first.name],
    });
    assert.notEqual(again.name, first.name, `offer ${offerId} resurrected ${first.name}`);
    assert.equal(again.archetype, first.archetype, 'exclusion must not shift the hull roll');
    assert.equal(again.id, first.id);
  }
});

test('marks take factions that fit the sector, not a hardcoded flag', () => {
  const ceres = SECTOR_BY_ID.get('sector_ceres_belt');
  const tethys = SECTOR_BY_ID.get('sector_tethys_junction');
  const poolCeres = markFactionPoolFor('sector_ceres_belt', ceres);
  const poolTethys = markFactionPoolFor('sector_tethys_junction', tethys);
  assert.ok(poolCeres.includes('faction_dmc'), 'belt marks ride for flags present in the belt');
  assert.ok(poolTethys.includes('faction_mts') || poolTethys.includes('faction_scn'));
  const mark = rollBountyMark({
    seed: SEED, offerId: 'm_x', sectorId: 'sector_ceres_belt', riskTier: 1, sectorDef: ceres,
  });
  assert.ok(poolCeres.includes(mark.factionId), `mark's flag ${mark.factionId} absent from the belt`);
});

test('the writ wall has at least 24 opening lines and every line is a person speaking', () => {
  assert.ok(MARK_HAIL_LINES.length >= 24, `${MARK_HAIL_LINES.length} lines < 24`);
  for (const line of MARK_HAIL_LINES) {
    assert.ok(typeof line === 'string' && line.length > 10);
    assert.ok(!line.includes('{name}'), 'no token interpolation — the sender field carries the name');
  }
  // The seeded pick is stable across save/load: same (seed, mission) → same line.
  assert.equal(bountyMarkHail(SEED, 'm_9'), bountyMarkHail(SEED, 'm_9'));
});

// ── heist methods + case file ────────────────────────────────────────────────

test('each heist row names its own method pair and a third only opens once cased', () => {
  const kinds = ['capsule_run', 'third_shift', 'counterweight'];
  const seen = new Set();
  for (const kind of kinds) {
    const open = heistMethodsFor(kind, false);
    const cased = heistMethodsFor(kind, true);
    assert.equal(open.length, 2, `${kind} shows its own way in plus one alternate`);
    assert.equal(cased.length, 3, `${kind}'s quiet way opens on a full-enough case file`);
    for (const line of open) { assert.ok(!seen.has(line)); seen.add(line); }
  }
  // Every case-file fact id names a real observable fact.
  for (const kind of kinds) {
    for (const factId of HEIST_CASE_FILE[kind].factIds) {
      assert.ok(typeof factId === 'string' && factId.length > 3);
    }
  }
});

test('the board offer projects the observed ledger into the Case File', () => {
  // Uncased: two methods, the file reads dark.
  const cold = buildHeistOffer({ epoch: 0 });
  assert.equal(cold.params.methods.length, 2);
  assert.equal(cold.params.caseFile.cased, false);
  assert.match(cold.description, /METHODS:/);
  assert.match(cold.description, /CASE FILE 0\/4/);
  // Cased: three observed facts → the quiet method posts.
  const observed = {
    launcher_schedule: { atTick: 10, method: 'scan', detail: 'x' },
    catcher_receiver: { atTick: 20, method: 'watch', detail: 'x' },
    crew_route: { atTick: 30, method: 'follow', detail: 'x' },
  };
  const hot = buildHeistOffer({ epoch: 0, observed });
  assert.equal(hot.params.methods.length, 3);
  assert.equal(hot.params.caseFile.cased, true);
  assert.match(hot.description, /known: launch cadence, the lawful receiver, the crew route/);
  assert.match(hot.description, /dark: the fence/);
});

test('third-shift and counterweight rows carry their own methods and case files', () => {
  const shift = buildBreakawayOffer({ epoch: 0 });
  assert.equal(shift.params.methods.length, 2);
  assert.match(shift.description, /fork under a hundred/);
  const watch = buildCounterweightOffer({ epoch: 0 });
  assert.equal(watch.params.methods.length, 2);
  assert.match(watch.description, /cradle/);
  const caseFile = heistCaseFile('counterweight', { crew_route: { atTick: 1 } });
  assert.equal(caseFile.learned, 1);
  assert.equal(caseFile.cased, false);
});

// ── retry changes the room ───────────────────────────────────────────────────

test('a recovery offer carries retryWatch and the room reads changed', () => {
  const retry = buildHeistOffer({ epoch: 0, attempt: 1, sourceMissionId: 'm_1' });
  assert.equal(retry.params.retryWatch, true);
  assert.match(retry.description, /pickets|company holding the corridor/i);
  // First pass keeps its untouched room.
  const first = buildHeistOffer({ epoch: 0 });
  assert.equal(first.params.retryWatch, undefined);
});

test('a retry record earns the pressure lane; a first-attempt record does not', () => {
  const first = createHeistRecord({ missionId: 'm_a', attempt: 0 });
  assert.equal(first.pressureSpawned, undefined, 'untouched record shape — save-golden safe');
  const retry = createHeistRecord({ missionId: 'm_b', attempt: 1 });
  assert.equal(retry.pressureSpawned, false);
  assert.deepEqual(retry.pressureEntityIds, []);
  // The retry launch speaks the changed room.
  assert.match(HEIST_CUE_TEXT.launched_retry, /pickets/i);
});

test('_spawnPressure leaves a first-attempt capsule run untouched and arms a retry', () => {
  const bus = { emit() {}, on() {} };
  const ctx = {
    state: { tick: 100, rng: () => 0.5, playerId: 'player' },
    bus,
    helpers: {
      spawnEntity: (spec) => ({ id: `e_${spec.typeId}`, data: spec.data || {} }),
      spawnBudget: {
        request: (n) => n, bindEntity: () => {}, releaseSome: () => {},
      },
    },
  };
  const capsule = { id: 'cap1', pos: { x: 0, z: 0 } };
  const first = createHeistRecord({ missionId: 'm_first', attempt: 0 });
  assert.equal(heistMissionRuntime._spawnPressure(ctx, first, capsule), 0);
  const retry = createHeistRecord({ missionId: 'm_retry', attempt: 1 });
  assert.equal(heistMissionRuntime._spawnPressure(ctx, retry, capsule), 2);
  assert.equal(retry.pressureSpawned, true);
  // One bounded picket — a second call does not repost it.
  assert.equal(heistMissionRuntime._spawnPressure(ctx, retry, capsule), 0);
});

// ── payday receipt ───────────────────────────────────────────────────────────

test('the payday line speaks in the payer\'s own voice', () => {
  assert.equal(missionPaydayLine({ type: 'delivery' }, 500), null, 'plain jobs keep plain pay');
  assert.equal(
    missionPaydayLine({ heist: { settledOutcome: 'fenced_success' } }, 1800),
    'PAYDAY 1800 cr — the fence settles fast and forgets your face.',
  );
  assert.equal(
    missionPaydayLine({ heist: { settledOutcome: 'lawful_arrival_observed' } }, 960),
    'PAYDAY 960 cr — logged, receipted, and paid on the tick.',
  );
  assert.equal(
    missionPaydayLine({ counterweight: {} }, 700),
    'PAYDAY 700 cr — the yard paid for what actually crossed.',
  );
  assert.equal(
    missionPaydayLine(
      { type: 'bounty_hunt', storyTarget: { role: 'board_writ', name: 'Vess Arando' } }, 920),
    'PAYDAY 920 cr — the wall crossed Vess Arando off.',
  );
  // Receipt hygiene: every line is one middot at most — the HUD admit filter drops denser text.
  for (const m of [{ heist: { settledOutcome: 'fenced_success' } }, { counterweight: {} }]) {
    const line = missionPaydayLine(m, 100);
    assert.ok((line.match(/·/g) || []).length <= 1);
  }
});
