import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SHIPS } from '../src/data/ships.js';
import { TECH_NODES } from '../src/data/tech.js';
import {
  CAREER_IDS,
  CAREER_COHORT_SCHEMA,
  CAREER_BANDS,
  SEED_SETS,
  runCareerCohorts,
  runCareerStrategy,
  assessLoadoutViability,
  proveSaveContinueEquivalence,
  blockNondeterminism,
  restoreNondeterminism,
} from '../src/balance/careerCohorts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'test', 'fixtures', 'm3-career-cohorts', 'cohort-report.v2.json');
const CAMPAIGN = path.join(ROOT, '.campaign', 'm3-career-cohorts', 'cohort-report.v2.json');

test('production role-hull and combat-basics costs are pre-task values (no retune)', () => {
  const pelican = SHIPS.find((s) => s.id === 'ship_pelican');
  const mule = SHIPS.find((s) => s.id === 'ship_mule');
  const wasp = SHIPS.find((s) => s.id === 'ship_wasp');
  const tech = TECH_NODES.find((n) => n.id === 'tech_combat_basics');
  assert.equal(pelican.price, 15_000);
  assert.equal(mule.price, 35_000);
  assert.equal(wasp.price, 28_000);
  assert.deepEqual(tech.cost, { credits: 6000, rp: 10 });
});

test('starter and mid loadouts remain viable and identity-distinct', () => {
  const kits = new Set();
  for (const career of CAREER_IDS) {
    assert.equal(assessLoadoutViability(career, 'starter').viable, true);
    assert.equal(assessLoadoutViability(career, 'mid').viable, true);
    kits.add(assessLoadoutViability(career, 'starter').roleKitId);
  }
  assert.equal(kits.size, 3);
});

test('nine independent cells: each horizon has its own earnedValue rate', () => {
  const report = runCareerCohorts({
    horizonsMin: [30, 60, 90],
    includeFailure: true,
    multiSeed: false, // multi-seed covered in dedicated test for runtime
  });
  assert.equal(report.schema, CAREER_COHORT_SCHEMA);
  assert.equal(report.table.length, 9);

  for (const career of CAREER_IDS) {
    const r30 = report.cells[career][30];
    const r60 = report.cells[career][60];
    const r90 = report.cells[career][90];
    assert.ok(r30 && r60 && r90, `${career} cells present`);
    assert.equal(r30.horizonMin, 30);
    assert.equal(r60.horizonMin, 60);
    assert.equal(r90.horizonMin, 90);
    assert.ok(Number.isFinite(r30.creditsPerMin));
    assert.ok(Number.isFinite(r60.creditsPerMin));
    assert.ok(Number.isFinite(r90.creditsPerMin));
    assert.ok(
      r30.endingCapital !== r90.endingCapital
      || r30.completedLoops !== r90.completedLoops,
      `${career} 30m and 90m must be independent outcomes`,
    );
    assert.ok(r30.completedLoops > 0 || r30.completedContracts > 0, `${career} 30m progress`);
    assert.ok(r60.completedLoops > 0 || r60.completedContracts > 0, `${career} 60m progress`);
    assert.ok(r90.completedLoops > 0 || r90.completedContracts > 0, `${career} 90m progress`);
  }

  assert.equal(report.cross.ok, true);
  assert.ok(report.cross.disparity);
  assert.equal(report.cross.bands, undefined);
  assert.equal(report.reloadProof.claimed, true);
  assert.equal(report.reloadProof.ok, true, JSON.stringify(report.reloadProof));
});

test('three independent seeds per career at 30 minutes', () => {
  blockNondeterminism();
  try {
    for (const career of CAREER_IDS) {
      const seeds = SEED_SETS[career];
      assert.equal(seeds.length, 3, `${career} seed set size`);
      const digests = [];
      for (const seed of seeds) {
        const r = runCareerStrategy(career, {
          horizonMin: 30, seed, forceDeathAtLoop: -1,
        });
        assert.ok(r.completedLoops > 0 || r.completedContracts > 0, `${career}@${seed} progress`);
        assert.ok(Number.isFinite(r.endingCapital));
        digests.push(`${r.endingCapital}:${r.completedLoops}:${r.earnedValue}`);
      }
      // Seeds must not all collapse to the exact same trajectory.
      assert.ok(new Set(digests).size >= 2, `${career} seeds must diversify outcomes`);
    }
  } finally {
    restoreNondeterminism();
  }
});

test('save serialize→load→continue equivalence at mid-run boundary', () => {
  blockNondeterminism();
  try {
    const proof = proveSaveContinueEquivalence({
      careerId: 'prospector',
      midMin: 15,
      fullMin: 30,
    });
    assert.equal(proof.claimed, true);
    assert.equal(proof.roundTripOk, true, proof.error);
    assert.equal(proof.continueEqual, true, JSON.stringify({ a: proof.continueA, b: proof.continueB }));
    assert.equal(proof.ok, true, proof.error);
    assert.match(proof.seam, /save\.(serializeData|_restore)/i);
  } finally {
    restoreNondeterminism();
  }
});

test('constraint: unaffordable toll denies travel; action time advances; hunter owns weapons; damage persists', () => {
  blockNondeterminism();
  try {
    const hunter = runCareerStrategy('hunter', {
      horizonMin: 45, forceDeathAtLoop: 6, seed: 0xC0B0_B002,
    });
    assert.ok((hunter.time.actionS || 0) > 0, 'hunter action time advances');
    assert.ok((hunter.time.travelS || 0) > 0, 'hunter travel time advances');
    assert.ok(!(hunter.ownedWeapons || []).includes('wpn_autocannon_s')
      || (hunter.equipment.purchases || []).some((p) => p.id === 'wpn_autocannon_s'),
    'autocannon only if purchased');
    assert.ok(!((hunter.defects || []).includes('used_unowned_autocannon')));
    // Hunter settles bounties through missions board authority, not MISSION_TUNING grant.
    assert.ok((hunter.authorityReceipts || []).some((a) => a.type === 'bounty_hunt'
      && /missions/i.test(a.authority)), 'bounty authority path');
    assert.ok(!(hunter.adaptersUsed || []).some((a) => /bounty_reward/i.test(a.code)),
      'no bounty reward adapter');
    if (hunter.deaths > 0) {
      const deathLoop = (hunter.loops || []).find((l) => l.outcome === 'death_recovery');
      assert.ok(deathLoop, 'death recovery logged');
      assert.ok(deathLoop.readiness < 0.99, 'respawn is not full heal');
    }

    const hauler = runCareerStrategy('hauler', {
      horizonMin: 30, forceDeathAtLoop: -1, seed: 0xC0B0_A001,
    });
    assert.ok((hauler.time.actionS || 0) > 0, 'hauler market actions advance action time');
    assert.ok((hauler.time.simS || 0) >= (hauler.time.actionS || 0), 'action is subset of sim time');
    assert.ok(Array.isArray(hauler.bottlenecks));
  } finally {
    restoreNondeterminism();
  }
});

test('deterministic 30-minute re-runs match per career', () => {
  blockNondeterminism();
  try {
    for (const career of CAREER_IDS) {
      const a = runCareerStrategy(career, { horizonMin: 30, forceDeathAtLoop: -1 });
      const b = runCareerStrategy(career, { horizonMin: 30, forceDeathAtLoop: -1 });
      assert.equal(a.endingCapital, b.endingCapital, `${career} capital`);
      assert.equal(a.completedLoops, b.completedLoops, `${career} loops`);
      assert.equal(a.creditsPerMin, b.creditsPerMin, `${career} independent rate`);
      assert.equal(a.earnedValue, b.earnedValue, `${career} earnedValue`);
    }
  } finally {
    restoreNondeterminism();
  }
});

test('authority matrix documents live missions+save; no balance retune claim', () => {
  const report = runCareerCohorts({
    horizonsMin: [30, 60, 90],
    includeFailure: true,
    multiSeed: false,
  });
  assert.ok(report.authorityMatrix.live.some((s) => /missions/i.test(s)));
  assert.ok(report.authorityMatrix.live.some((s) => /save/i.test(s)));
  assert.ok(report.authorityMatrix.adapter_warning.some((s) => /combat TTK|mine TTK/i.test(s)));
  assert.ok(!report.authorityMatrix.adapter_warning.some((s) => /bounty rewards/i.test(s)),
    'bounty must not remain adapter');
  assert.match(report.authorityMatrix.balanceTuning, /none/i);
  assert.equal(report.ok, true, JSON.stringify({
    cross: report.cross,
    reload: report.reloadProof,
    fails: Object.fromEntries(CAREER_IDS.flatMap((c) =>
      [30, 60, 90].map((m) => [`${c}@${m}`, report.cells[c][m].assertionFails]))),
  }));
});

test('gate script writes campaign + fixture reports and exits 0', () => {
  const stdout = execFileSync(process.execPath, ['scripts/check-m3-career-cohorts.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.match(stdout, /\[check-m3-career-cohorts\] PASS/);
  assert.equal(existsSync(REPORT), true);
  assert.equal(existsSync(CAMPAIGN), true);
  assert.equal(existsSync(path.join(ROOT, 'result.json')), false, 'root result.json must not exist');
  const json = JSON.parse(readFileSync(REPORT, 'utf8'));
  assert.equal(json.gate, 'check-m3-career-cohorts');
  assert.equal(json.ok, true);
  assert.equal(json.schema, CAREER_COHORT_SCHEMA);
  assert.equal(json.table.length, 9);
  assert.equal(json.reloadProof.ok, true);
  assert.equal(json.reloadProof.claimed, true);
  assert.equal(json.multiSeedOk, true);
  assert.equal('elapsedMs' in json, false, 'tracked fixture must not churn on wall-clock runtime');
});
