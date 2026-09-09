// test/sector-identity.test.mjs — PQ-143.00.
//
// THE VISION SENTENCE THESE ASSERTIONS SERVE (design/VISION.md Part II, "Every place needs a reason
// to exist"):
//
//   "A player recognises Ceres from thirty seconds of activity and Helios from thirty seconds of
//    different activity — not from a colour grade."
//
// The prose is design/SECTOR_IDENTITY.md; the measurement is
// scripts/lib/bench/scenarios/world.sector_identity.mjs; this file is the ratchet. It pins two
// separable things:
//
//   1. THE RULE — `columnDiffers()` must keep meaning "a viewer would notice", not "the numbers are
//      unequal". These cases run on hand-built signatures, cost nothing, and are what stops a later
//      edit from quietly making the bar easy to clear.
//   2. THE BAR — the real runtime, at seed 4242, must still read as two different places on at least
//      four of the eight columns, and must do it deterministically.
//
// The bar case boots the production runtime twice for thirty simulated seconds each, so it is slow
// (~2 min). That is why it is a `node --test` case and NOT part of `check:baseline`.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IDENTITY_COLUMNS,
  IDENTITY_SECTOR_IDS,
  OBSERVE_SECONDS,
  REQUIRED_DIFFERING_COLUMNS,
  columnDiffers,
  compareSignatures,
  measureSectorIdentity,
} from '../scripts/lib/bench/scenarios/world.sector_identity.mjs';

const SEED = 4242;

// ── 1. The rule ───────────────────────────────────────────────────────────────────────────────────

test('a column with the same life in both places does not read as identity', () => {
  const a = { counts: { hauler: 2 }, dominant: 'hauler', present: ['hauler'] };
  const b = { counts: { hauler: 2 }, dominant: 'hauler', present: ['hauler'] };
  assert.equal(columnDiffers('verb', a, b).differs, false);
});

test('"seventeen versus fourteen" is not a way of life', () => {
  // TRAP 3. Same kinds, same leader, merely different amounts — a viewer sees the same place busier,
  // not a different place.
  const a = { counts: { hauler: 17, tender: 3 }, dominant: 'hauler', present: ['hauler', 'tender'] };
  const b = { counts: { hauler: 14, tender: 2 }, dominant: 'hauler', present: ['hauler', 'tender'] };
  assert.equal(columnDiffers('verb', a, b).differs, false);
});

test('a different dominant activity reads as a different place', () => {
  const a = { counts: { salvor: 3, miner: 1 }, dominant: 'salvor', present: ['salvor', 'miner'] };
  const b = { counts: { hauler: 3, tender: 1 }, dominant: 'hauler', present: ['hauler', 'tender'] };
  const verdict = columnDiffers('verb', a, b);
  assert.equal(verdict.differs, true);
  assert.ok(verdict.why.length > 0, 'a verdict must carry the sentence a reviewer would say');
});

test('a HOLE is not identity: an empty column against one lonely category reads as SAME', () => {
  // The failure this guards: a sector whose hulls the bench simply could not see scored as "differs"
  // against a sector showing a single thing, and the verdict flipped the moment one hauler wandered
  // into the ring. Thinness must not be reported as a way of life.
  const furnished = { counts: { hauler: 1 }, dominant: 'hauler', present: ['hauler'] };
  const empty = { counts: {}, dominant: null, present: [] };
  assert.equal(columnDiffers('ships', furnished, empty).differs, false);
});

test('an empty column against a genuinely furnished one does read as identity', () => {
  const furnished = {
    counts: { ship_pelican: 2, ship_bastion: 1, ship_mule: 1 },
    dominant: 'ship_pelican',
    present: ['ship_pelican', 'ship_bastion', 'ship_mule'],
  };
  const empty = { counts: {}, dominant: null, present: [] };
  assert.equal(columnDiffers('ships', furnished, empty).differs, true);
});

test('two empty columns are never a difference', () => {
  const empty = { counts: {}, dominant: null, present: [] };
  assert.equal(columnDiffers('aftermath', empty, { ...empty }).differs, false);
});

test('rhythm needs a margin a person would feel, not a decimal', () => {
  const near = { phaseChangesPerMin: 22, workEventsPerMin: 22, workShare: 0.42 };
  const alsoNear = { phaseChangesPerMin: 16, workEventsPerMin: 18, workShare: 0.48 };
  assert.equal(columnDiffers('rhythm', near, alsoNear).differs, false, 'a 6/min gap is not a rhythm');

  const busy = { phaseChangesPerMin: 40, workEventsPerMin: 40, workShare: 0.8 };
  const slow = { phaseChangesPerMin: 5, workEventsPerMin: 4, workShare: 0.2 };
  assert.equal(columnDiffers('rhythm', busy, slow).differs, true);
});

test('law and crime are told apart by WHO is flying, not only by how many', () => {
  const beatPatrol = {
    lawfulHullsPeak: 1, lawEventsPerMin: 0, kinds: [], present: ['patrol/faction_scn/job:patrol'],
  };
  const standingGuard = {
    lawfulHullsPeak: 1, lawEventsPerMin: 0, kinds: [], present: ['ship/faction_scn/doctrine:official'],
  };
  const verdict = columnDiffers('law', beatPatrol, standingGuard);
  assert.equal(verdict.differs, true, 'one hull each, but a different enforcer is a different place');
  assert.ok(verdict.why.join(' ').includes('enforcers'));
});

test('compareSignatures scores every one of the eight columns', () => {
  const flat = {
    verb: { counts: {}, dominant: null, present: [] },
    rhythm: { phaseChangesPerMin: 0, workEventsPerMin: 0, workShare: null },
    law: { lawfulHullsPeak: 0, lawEventsPerMin: 0, kinds: [], present: [] },
    crime: { hostileHullsPeak: 0, crimeEventsPerMin: 0, kinds: [], present: [] },
    ships: { counts: {}, dominant: null, present: [] },
    structures: { counts: {}, dominant: null, present: [] },
    affordance: { counts: {}, dominant: null, present: [] },
    aftermath: { counts: {}, dominant: null, present: [] },
  };
  const result = compareSignatures({ columns: flat }, { columns: flat });
  assert.equal(Object.keys(result.columns).length, IDENTITY_COLUMNS.length);
  assert.equal(result.differingColumns, 0, 'two identical empty worlds are the same place');
  assert.equal(result.met, false);
});

// ── 2. The bar, on the real runtime ───────────────────────────────────────────────────────────────

test('Helios and Ceres read as different places across a 30 s watch of each', { timeout: 600_000 }, async () => {
  const result = await measureSectorIdentity(SEED);

  // Staging first. Every previous version of this measurement failed HERE, not in the world: the
  // census ring ended up in deep space and printed a clean table of zeros that looked like a finding.
  // If the bench is not actually watching simulated hulls, the column count below means nothing.
  for (const sectorId of IDENTITY_SECTOR_IDS) {
    const sig = result.signatures[sectorId];
    assert.ok(sig, `${sectorId} produced no signature`);
    assert.ok(
      sig.staging.censusActors > 0,
      `${sectorId}: nothing with a job or a role was standing in the pocket — the bench is blind, not the sector empty`,
    );
    assert.ok(
      sig.staging.bodiedFraction > 0,
      `${sectorId}: not one counted actor held a physics body — this is a census of scenery, not of a simulated place`,
    );
    assert.ok(
      sig.staging.anchor.source.startsWith('station:'),
      `${sectorId}: the watch must stand at the sector's own pocket station, not fall back to the player`,
    );
  }

  const { comparison } = result;
  assert.ok(
    comparison.differingColumns >= REQUIRED_DIFFERING_COLUMNS,
    `"A player recognises Ceres from thirty seconds of activity and Helios from thirty seconds of `
    + `different activity — not from a colour grade." Only ${comparison.differingColumns} of `
    + `${IDENTITY_COLUMNS.length} columns read differently across ${OBSERVE_SECONDS}s `
    + `(need ${REQUIRED_DIFFERING_COLUMNS}): [${comparison.differingColumnNames.join(', ')}]`,
  );

  // The columns the table claims are true today. Naming them keeps a future regression from hiding
  // behind the total: losing `verb` and gaining `crime` is not the same table.
  for (const column of ['verb', 'ships', 'structures', 'affordance']) {
    assert.equal(
      comparison.columns[column].differs,
      true,
      `design/SECTOR_IDENTITY.md claims "${column}" separates Helios from Ceres; it no longer does`,
    );
  }

  // THE production change. Fleeing hulls still carry a job kind, so the column count can stay green
  // while Ceres is empty. Work share is work/(work+transit); 100% flee makes it null.
  const ceres = result.signatures.sector_ceres_belt;
  assert.ok(
    ceres.columns.rhythm.workShare > 0,
    `"the world does boring jobs on screen" — Ceres work share is ${ceres.columns.rhythm.workShare}; `
    + 'a policeman standing over the yard was emptying it (PQ-143.00)',
  );
  assert.ok(
    (ceres.columns.verb.present || []).includes('hauler')
      && (ceres.columns.verb.present || []).includes('tender'),
    `Ceres must still be hauling and tending, not only filing job kinds while they cower: [${(ceres.columns.verb.present || []).join(', ')}]`,
  );
});

test('the same seed reads the same way twice', { timeout: 900_000 }, async () => {
  // Law 7 of CANONICAL_BUILD_MAP §1.3: "Randomness in a bench is how agents lose the ability to test."
  const first = await measureSectorIdentity(SEED);
  const second = await measureSectorIdentity(SEED);
  assert.deepEqual(
    second.comparison,
    first.comparison,
    'two runs of seed 4242 disagreed — the signature is not deterministic and no number from it can be trusted',
  );
  for (const sectorId of IDENTITY_SECTOR_IDS) {
    assert.deepEqual(second.signatures[sectorId].columns, first.signatures[sectorId].columns);
  }
});
