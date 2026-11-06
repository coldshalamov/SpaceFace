// inf-defeat-situation — the after-action sheet names the killer ("Destroyed by …") but never
// said the SITUATION the hull died in. When the law's hunt was live at death, the sheet's
// sortie line now carries it: the wanted band, the escape clock it rode, and — only on a real
// receipt — the convicting incident it traced to, through the same no-false-witness helper as
// the flight alert. Heat is frozen at death (it decays only in flight), so the clause reads
// the situation AT death; a clean or sub-threshold sheet gets no clause at all.

import test from 'node:test';
import assert from 'node:assert/strict';

import { deathSituationClause } from '../src/ui/screens/gameOver.js';
import { heatLevelFor, heatClearSecondsForLevel } from '../src/systems/heat.js';

const SEED = 4242;

function state(heat, incident = null) {
  return {
    meta: { seed: SEED },
    player: { heat, credits: 1000, ...(incident ? { heatLastIncident: incident } : {}) },
  };
}

const CONVICTION = {
  kind: 'unlawful_kill',
  incidentReceiptId: 'receipt-1',
  affected: 'hauler_7',
  affectedLabel: 'Honest Weight',
  witnessCount: 2,
  jurisdiction: 'station_helios',
  evidenceClass: 'witness',
  at: 100,
};

test('a live hunt is named with its band and escape clock', () => {
  const heat = 0.3; // level 2 → bounty band
  const clause = deathSituationClause(state(heat));
  assert.ok(clause.includes('hunt live'), 'the situation opens with the hunt itself');
  assert.ok(clause.includes('bounty'), 'the band the hull died under is named');
  const clearS = heatClearSecondsForLevel(heatLevelFor(heat));
  assert.ok(clause.includes(`clears in ${Math.ceil(clearS)}s`), 'the escape clock rides the clause');
  assert.equal(heatLevelFor(heat), 2);
});

test('the conviction is traced without inventing a witness', () => {
  const clause = deathSituationClause(state(0.2, CONVICTION));
  assert.ok(clause.includes('traced to'), 'a recorded receipt is traced');
  assert.ok(clause.includes('KILL'), 'the kind is named');
  assert.ok(clause.includes('HONEST WEIGHT'), 'the recorded party label is spoken, never the raw handle');
  assert.ok(clause.includes('2 WITNESSES'), 'the law’s own witness basis rides along');
  assert.ok(!clause.includes('hauler_7'), 'the raw entity handle is never printed');
});

test('a clean or sub-threshold death is not dressed as a hunted one', () => {
  assert.equal(deathSituationClause(state(0)), '', 'clean sheet: no clause');
  assert.equal(deathSituationClause(state(0.14, CONVICTION)), '', 'suspicion is not a hunt, receipt or not');
  assert.equal(deathSituationClause(null), '', 'no player, no clause');
  assert.equal(deathSituationClause({}), '', 'no heat, no clause');
  assert.equal(deathSituationClause({ player: { heat: Number.NaN } }), '', 'a torn scalar answers nothing');
});

test('the frozen heat is the situation at death, not a later decayed sheet', () => {
  // heat decays only in flight; over the open sheet it never moves, so whatever the pilot
  // reads here is the sheet they died under — the clause reads it verbatim.
  const hot = deathSituationClause(state(0.65)); // level 4 → nets
  assert.ok(hot.includes('nets'), 'a nets-band death reads the nets band');
  const cooler = deathSituationClause(state(0.16));
  assert.ok(cooler.includes('fine/scan'), 'a scan-band death reads the scan band');
  assert.notEqual(hot, cooler, 'different bands never share a clause');
});
