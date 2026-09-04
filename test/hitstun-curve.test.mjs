// The hitstun instrument must measure the real path, not a stand-in.
// It does not pin today's unmet feel targets — those belong on the bench bars.

import test from 'node:test';
import assert from 'node:assert/strict';

import { WEAPONS } from '../src/data/weapons.js';
import {
  runHitstunCells,
  scenario,
} from '../scripts/lib/bench/scenarios/feel.hitstun_curve.mjs';
import { scenario as shoveScenario } from '../scripts/lib/bench/scenarios/feel.shove_magnitude.mjs';

const STARTER_WEAPON_ID = 'wpn_pulse_laser_s';

const SEED = 4242;
const LONG = { timeout: 60_000 };
const GRID = {
  seed: SEED,
  sources: ['gun'],
  hulls: ['ship_wasp', 'ship_drifter', 'ship_atlas'],
  levels: [0.30, 1.30],
};

function cellNumbers(cells) {
  return (cells || []).map((c) => ({
    source: c.source,
    hullId: c.hullId,
    hullMass: c.hullMass,
    cruiseSpeed: c.cruiseSpeed,
    kIntended: c.kIntended,
    k: c.k,
    helmLossDurationS: c.helmLossDurationS,
    entrySpinRadPerS: c.entrySpinRadPerS,
    helmOwner: c.helmOwner,
    measured: c.measured,
  }));
}

test('feel.hitstun_curve exports the contracted scenario shape', () => {
  assert.equal(scenario.id, 'feel.hitstun_curve');
  assert.equal(typeof scenario.label, 'string');
  assert.equal(typeof scenario.run, 'function');
});

test('the instrument measures the real path and is deterministic on a fixed seed', LONG, async () => {
  const a = await runHitstunCells(GRID);
  const b = await runHitstunCells(GRID);
  const cells = (a.cells || []).filter((c) => c && c.measured === true);
  assert.equal(
    cells.length,
    6,
    'Light ships are ammunition.',
  );
  for (const cell of cells) {
    assert.ok(Number.isFinite(cell.k), `measured k must be finite (${cell.hullId} kIntended=${cell.kIntended})`);
    assert.ok(Number.isFinite(cell.helmLossDurationS), `helmLossDurationS must be finite (${cell.hullId})`);
    assert.ok(Number.isFinite(cell.entrySpinRadPerS), `entrySpinRadPerS must be finite (${cell.hullId})`);
  }

  const light = cells.filter((c) => c.hullId === 'ship_wasp').sort((x, y) => x.k - y.k);
  assert.ok(light.length >= 2, 'need two light-hull gun cells');
  for (let i = 1; i < light.length; i++) {
    assert.ok(
      light[i].helmLossDurationS + 1e-9 >= light[i - 1].helmLossDurationS,
      `helm-loss must be non-decreasing in k (${light[i - 1].k} -> ${light[i].k}: ${light[i - 1].helmLossDurationS} -> ${light[i].helmLossDurationS})`,
    );
  }

  const proof = a.realPathProof;
  assert.ok(proof, 'metrics.realPathProof is required');
  assert.equal(proof.sg02Ready, true, 'SG-02 dynamic authority must be ready — a stand-in would report false');
  assert.equal(proof.backend, 'rapier-dynamic', 'physics must report the rapier-dynamic backend');
  assert.equal(proof.physicsBackend, 'rapier-dynamic', 'gameplay physicsBackend must read rapier-dynamic');
  assert.equal(
    proof.contactCaptureEnabled,
    true,
    'SG-02 must capture contact impacts, or the bench measures contact physics with the consequence path silently switched off',
  );

  assert.deepEqual(
    cellNumbers(a.cells),
    cellNumbers(b.cells),
    'fixed seeds or it did not happen — the same seed must produce the same cell numbers',
  );
});

test("the shove bars report the delta-V the HIT caused, not the victim's own thrust", LONG, async () => {
  const run = await shoveScenario.run(SEED);
  const m = run.metrics;

  assert.equal(m.realPathProof.sg02Ready, true, 'a stand-in would report sg02Ready false');
  assert.equal(m.realPathProof.backend, 'rapier-dynamic', 'physics must be the real authority');

  const starterDef = WEAPONS.find((w) => w.id === STARTER_WEAPON_ID);
  assert.ok(starterDef, 'the starter pulse must exist in the weapon table');
  const expected = starterDef.impulsePerHit / m.victimMass / m.cruiseSpeed;

  // The trap this pins (FORCE lane, 2026-09-04): the raw one-tick velocity change of an AI hostile
  // is dominated by its OWN thrust (3.05 WU/s on a wasp). Only the concussion cannon authors
  // npcCounterthrustDelayS, so only its raw delta happens to equal its impulse; measured raw, the
  // starter pulse read 1.5 % of cruise for a gun that imparts 0.015 % - a 100x lie that PQ-137.05
  // would then have tuned against.
  assert.ok(
    Math.abs(m.starterDeltaVFractionOfCruise - expected) <= 1e-3,
    `"Light ships are ammunition." The starter gun's shove must be the impulse it carries `
    + `(${expected}), not the victim's own thrust: bar reads ${m.starterDeltaVFractionOfCruise}, `
    + `raw one-tick delta reads ${m.starterDeltaVRawTick / m.cruiseSpeed}`,
  );
  assert.ok(
    m.starterDeltaVRawTick > 10 * m.starterDeltaV,
    'the raw one-tick delta must still be reported and must still be the contaminated number, '
    + 'so the correction stays auditable',
  );
  assert.ok(
    m.controlTickDeltaV > 0,
    "the no-weapon control arm must measure the victim's own thrust over the same tick",
  );

  const shoveExpected = m.impulseMagnitude / m.victimMass / m.cruiseSpeed;
  assert.ok(
    Math.abs(m.deltaVFractionOfCruise - shoveExpected) <= 0.01 * shoveExpected,
    `"Shoot weapons where it'd blast enemies away and into things." The shove weapon's delta-V must `
    + `be the impulse it carries (${shoveExpected}), got ${m.deltaVFractionOfCruise}`,
  );
});
