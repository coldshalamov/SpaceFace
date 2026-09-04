// The hitstun instrument must measure the real path, not a stand-in.
// It does not pin today's unmet feel targets — those belong on the bench bars.

import test from 'node:test';
import assert from 'node:assert/strict';

import { WEAPONS } from '../src/data/weapons.js';
import {
  HITSTUN_IMPULSE_EVENT,
  HITSTUN_LAW,
  hitstunAttackerMassForCollision,
  resolveHitstunLaw,
  signedHitSide,
} from '../src/combat/impulseKernel.js';
import {
  buildB11Bars,
  HEAVY_GUN_SCALE_K,
  HITSTUN_HULLS,
  HITSTUN_SOURCES,
  MATCHED_K_BAND,
  MATCHED_U_BAND,
  MEASURABLE_SPIN_RAD_PER_S,
  runHitstunCells,
  selectCausalHitstunEvent,
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
  assert.equal(typeof buildB11Bars, 'function');
});

test('the hitstun law is the Wasp/Kestrel reference and zeros the heavy gun-scale case', () => {
  const equalMassLight = resolveHitstunLaw({
    deltaV: 0.30 * 95,
    victimCruise: 95,
    attackerMass: 16,
    victimMass: 16,
  });
  assert.equal(equalMassLight.k, 0.30);
  assert.equal(equalMassLight.mF, 1);
  assert.equal(equalMassLight.durationS, 1, `world-body light T must be 1.00 s, got ${equalMassLight.durationS}`);

  const reference = resolveHitstunLaw({
    deltaV: 0.30 * 95,
    victimCruise: 95,
    attackerMass: 18,
    victimMass: 16,
  });
  assert.ok(Math.abs(reference.u - 0.318198) < 1e-4, `reference u was ${reference.u}`);
  assert.ok(reference.durationS >= 1, `Kestrel/Wasp reference T must be at least 1 s, got ${reference.durationS}`);
  assert.ok(reference.entrySpin > 0);

  const heavy = resolveHitstunLaw({
    deltaV: 0.06,
    victimCruise: 1,
    attackerMass: 2.2 * 2.2,
    victimMass: 1,
  });
  assert.ok(Math.abs(heavy.u - 0.132) < 1e-9, `heavy u was ${heavy.u}`);
  assert.equal(heavy.durationS, 0);
  assert.equal(heavy.entrySpin, 0);
  assert.ok(MATCHED_U_BAND.target > MATCHED_U_BAND.lo);
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

  // The raw tick includes the hostile's own thrust. The approved force table raises Pulse to
  // 84 momentum, so that contamination no longer dominates by 10x. The authored impulse check
  // below still rejects substituting the raw tick for the causal result; retain both observations.
  assert.ok(
    Math.abs(m.starterDeltaVFractionOfCruise - expected) <= 1e-3,
    `"Light ships are ammunition." The starter gun's shove must be the impulse it carries `
    + `(${expected}), not the victim's own thrust: bar reads ${m.starterDeltaVFractionOfCruise}, `
    + `raw one-tick delta reads ${m.starterDeltaVRawTick / m.cruiseSpeed}`,
  );
  assert.ok(
    Number.isFinite(m.starterDeltaVRawTick) && m.starterDeltaVRawTick >= 0,
    'the raw one-tick delta must remain a finite observation alongside the causal result',
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

test('hitstun curve instruments torque telemetry, mass-ratio bar, and gyro bar', LONG, async () => {
  const result = await runHitstunCells(GRID);
  const cells = (result.cells || []).filter((c) => c && c.measured === true);
  assert.equal(cells.length, 6, 'need 6 measured gun cells');

  for (const c of cells) {
    assert.ok(Number.isFinite(c.peakTorqueHelmLoss), `peakTorqueHelmLoss must be finite (${c.hullId})`);
    assert.ok(Number.isFinite(c.peakTorque), `peakTorque must be finite (${c.hullId})`);
    assert.ok(Number.isFinite(c.zeroTorqueDurationS), `zeroTorqueDurationS (helm-loss window) must be finite (${c.hullId})`);
    if (c.recoveryTorqueObserved) {
      assert.ok(Number.isFinite(c.peakTorqueRecovery), `observed recovery torque must be finite (${c.hullId})`);
    } else {
      assert.equal(c.peakTorqueRecovery, null, `recovery torque not observed after entry must not read as 0 Nm (${c.hullId})`);
    }
    if (c.recoveryObserved) {
      assert.ok(Number.isFinite(c.zeroTorqueRecoveryS), `zeroTorqueRecoveryS must be finite when helm recovery was observed (${c.hullId})`);
    } else {
      assert.equal(c.zeroTorqueRecoveryS, null, `recovery window must be unmeasured when recovery was not observed (${c.hullId})`);
    }
    assert.equal(
      c.angularProduction,
      true,
      `gun gyro evidence must traverse production damage.applyImpulse (${c.hullId})`,
    );
  }

  const bars = buildB11Bars(result.cells, result.notes);
  const mass = barByLabel(bars, /mass-ratio scaling/);
  const gyro = barByLabel(bars, /hidden gyro/);
  assert.ok(mass, 'mass-ratio bar must be emitted even when it is unmet or unmeasured');
  if (mass.unmeasured) {
    assertUnmeasuredBar(mass);
  } else {
    assert.ok(Number.isFinite(mass.value));
  }
  assertUnmeasuredBar(gyro, 'gyro bar must not pass a gun-only partial grid');
  assert.match(String(gyro.note), /rope_throw/);
  assert.match(String(gyro.note), /well_fling/);
  assert.match(String(gyro.note), /collision/);
  assert.equal(String(gyro.note).includes('gun and rope_throw command 0 Nm'), false);

  for (const c of cells) {
    assert.equal(
      c.angularProduction,
      true,
      `gun cell must claim production angular evidence (${c.hullId} kIntended=${c.kIntended})`,
    );
  }

  const collisionRun = await runHitstunCells({
    seed: SEED,
    sources: ['collision'],
    hulls: ['ship_wasp'],
    levels: [0.30],
  });
  const colCell = collisionRun.cells[0];
  assert.equal(colCell.measured, true, 'collision cell must be measured');
  assert.ok(colCell.k > 0, 'collision cell must measure real delta-v');
  if (colCell.recoveryTorqueObserved) {
    assert.ok(Number.isFinite(colCell.peakTorqueRecovery), 'observed collision recovery torque must be finite');
    if (colCell.entrySpinRadPerS >= MEASURABLE_SPIN_RAD_PER_S) {
      assert.ok(
        colCell.peakTorqueRecovery > 0,
        'measurable collision spin must recover with commanded torque, not a hidden gyro',
      );
      assert.equal(colCell.recoveryOpposesSpin, true);
    }
  } else {
    assert.equal(colCell.peakTorqueRecovery, null, 'collision recovery torque not observed must not read as 0 Nm');
  }

  const wellRun = await runHitstunCells({
    seed: SEED,
    sources: ['well_fling'],
    hulls: ['ship_wasp'],
    levels: [0.30],
  });
  const wellCell = wellRun.cells[0];
  assert.equal(wellCell.measured, true, 'well_fling must measure the production field path');
  assert.equal(wellCell.unmeasured, undefined);
  assert.ok(Number.isFinite(wellCell.k) && wellCell.k >= 0, 'well cell must measure real delta-v');
  assert.ok(Number.isFinite(wellCell.helmLossDurationS));
});

test('B11 bars fail closed on missing sources, intended-k, and unobserved recovery', () => {
  const spinning = {
    measured: true,
    recoveryObserved: true,
    recoveryTorqueObserved: true,
    recoveryOpposesSpin: true,
    recoveredAtTick: 80,
    peakTorqueRecovery: 12,
    peakTorqueHelmLoss: 0,
    peakTorque: 12,
    helmLossDurationS: 1.2,
    entrySpinRadPerS: 2.4,
    hullMass: 16,
    zeroTorqueDurationS: 0.4,
    zeroTorqueRecoveryS: 0,
    angularProduction: true,
  };

  const emptyBars = buildB11Bars([]);
  for (const bar of emptyBars) {
    assertUnmeasuredBar(bar);
  }

  const gunOnly = HITSTUN_HULLS.map((hullId, i) => fakeCell({
    ...spinning,
    source: 'gun',
    hullId,
    hullMass: 16 + i * 40,
    kIntended: 0.30,
    k: 0.30,
    helmLossDurationS: 1.5 - i * 0.2,
  }));
  const gyroPartial = barByLabel(buildB11Bars(gunOnly), /hidden gyro/);
  assertUnmeasuredBar(gyroPartial, 'prior defect: filter(Boolean) let a one-source grid pass the all-sources gyro bar');
  for (const source of HITSTUN_SOURCES) {
    if (source === 'gun') continue;
    assert.match(String(gyroPartial.note), new RegExp(source));
  }

  const gunOnlyHeavy = fakeCell({
    source: 'gun',
    hullId: 'ship_atlas',
    k: HEAVY_GUN_SCALE_K,
    helmLossDurationS: 0,
  });
  const heavyGunOnly = barByLabel(buildB11Bars([gunOnlyHeavy]), /all sources/);
  assertUnmeasuredBar(heavyGunOnly, 'prior defect: a single atlas gun cell passed the all-sources heavy bar');
  for (const source of HITSTUN_SOURCES) {
    if (source === 'gun') continue;
    assert.match(String(heavyGunOnly.note), new RegExp(source));
  }

  const completeHeavy = HITSTUN_SOURCES.map((source) => fakeCell({
    source,
    hullId: 'ship_atlas',
    k: 0.05,
    helmLossDurationS: 0,
  }));
  const heavyComplete = barByLabel(buildB11Bars(completeHeavy), /all sources/);
  assert.equal(heavyComplete.unmeasured, undefined);
  assert.equal(heavyComplete.met, true, 'a complete four-source low-k atlas grid with zero helm-loss must be able to meet the heavy bar');
  assert.equal(heavyComplete.value, 0);

  const completeHeavyFail = HITSTUN_SOURCES.map((source) => fakeCell({
    source,
    hullId: 'ship_atlas',
    k: 0.05,
    helmLossDurationS: source === 'collision' ? 1.5 : 0,
  }));
  const heavyCompleteFail = barByLabel(buildB11Bars(completeHeavyFail), /all sources/);
  assert.equal(heavyCompleteFail.unmeasured, undefined);
  assert.equal(heavyCompleteFail.met, false);
  assert.equal(heavyCompleteFail.value, 1.5);

  const intendedOutsideBand = HITSTUN_HULLS.map((hullId, i) => fakeCell({
    source: 'gun',
    hullId,
    hullMass: 16 + i * 40,
    kIntended: 0.30,
    k: 0.05,
    helmLossDurationS: 2 - i * 0.4,
    recoveryObserved: true,
    peakTorqueRecovery: 8,
    entrySpinRadPerS: 2,
  }));
  const massIntended = barByLabel(buildB11Bars(intendedOutsideBand), /mass-ratio scaling/);
  assertUnmeasuredBar(massIntended, 'prior defect: kIntended === 0.30 established the mass clause while measured k sat at 0.05');
  assert.match(String(massIntended.note), /measured-k band/);
  assert.ok(
    intendedOutsideBand[0].k < MATCHED_K_BAND.lo,
    'fixture measured k is outside the documented band',
  );

  const missingHull = buildB11Bars(gunOnly.filter((c) => c.hullId !== 'ship_atlas'));
  const massMissing = barByLabel(missingHull, /mass-ratio scaling/);
  assertUnmeasuredBar(massMissing);
  assert.match(String(massMissing.note), /ship_atlas/);

  const unobserved = fakeCell({
    source: 'rope_throw',
    hullId: 'ship_wasp',
    k: 0.30,
    kIntended: 0.30,
    helmLossDurationS: 6,
    entrySpinRadPerS: 3,
    recoveryObserved: false,
    recoveredAtTick: null,
    peakTorqueRecovery: null,
    zeroTorqueRecoveryS: null,
  });
  assert.equal(unobserved.peakTorqueRecovery, null);
  const gyroUnobserved = barByLabel(buildB11Bars([
    ...HITSTUN_SOURCES.map((source) => fakeCell({
      ...spinning,
      source,
      hullId: 'ship_wasp',
      k: 0.30,
      helmLossDurationS: source === 'rope_throw' ? 6 : 1.2,
      recoveryObserved: source !== 'rope_throw',
      recoveryTorqueObserved: source !== 'rope_throw',
      recoveryOpposesSpin: source !== 'rope_throw',
      peakTorqueRecovery: source === 'rope_throw' ? null : 12,
      recoveredAtTick: source === 'rope_throw' ? null : 80,
    })),
  ]), /hidden gyro/);
  assertUnmeasuredBar(gyroUnobserved, 'prior defect: peakTorqueRecovery 0 meant recovery was never observed');
  assert.match(String(gyroUnobserved.note), /rope_throw/);
  assert.match(String(gyroUnobserved.note), /unmeasured/);

  const allSpinning = HITSTUN_SOURCES.map((source) => fakeCell({
    ...spinning,
    source,
    hullId: 'ship_wasp',
    k: 0.30,
  }));
  const gyroAll = barByLabel(buildB11Bars(allSpinning), /hidden gyro/);
  assert.equal(gyroAll.unmeasured, undefined);
  assert.equal(gyroAll.met, true, 'a complete four-source spinning grid with commanded torque must be able to meet the gyro bar');

  const fabricatedGun = fakeCell({
    ...spinning,
    source: 'gun',
    k: 0.30,
    angularProduction: false,
  });
  const spinningOthers = HITSTUN_SOURCES.filter((s) => s !== 'gun').map((source) => fakeCell({
    ...spinning,
    source,
    k: 0.30,
  }));
  const gyroFabricated = barByLabel(buildB11Bars([fabricatedGun, ...spinningOthers]), /hidden gyro/);
  assertUnmeasuredBar(gyroFabricated, 'gun spin that did not traverse production damage/impulse must not judge the gyro clause');
  assert.match(String(gyroFabricated.note), /production damage\/impulse path/);

  const zeroSpinGun = fakeCell({
    ...spinning,
    source: 'gun',
    k: 0.30,
    entrySpinRadPerS: 0,
    peakTorqueRecovery: 0,
    angularProduction: true,
  });
  const gyroZeroSpin = barByLabel(buildB11Bars([zeroSpinGun, ...spinningOthers]), /hidden gyro/);
  assert.match(String(gyroZeroSpin.note), /gun/);
  assert.equal(
    String(gyroZeroSpin.note).includes('gun and rope_throw command 0 Nm'),
    false,
    'notes must come from data, not a hardcoded claim about unrun sources',
  );
  assert.equal(gyroZeroSpin.met, true, 'zero-spin gun with 0 Nm is a zero-error controller when the other claimed sources recover with torque');
});

test('real-path light k>=0.30 helm lasts a full second and heavy gun-scale is exactly 0', { timeout: 180_000 }, async () => {
  const result = await runHitstunCells({
    seed: SEED,
    sources: HITSTUN_SOURCES.slice(),
    hulls: ['ship_wasp', 'ship_atlas'],
    levels: [0.30, HEAVY_GUN_SCALE_K],
  });
  const cells = (result.cells || []).filter((c) => c && c.measured === true);
  assert.ok(cells.length >= 8, `need measured light and heavy cells, got ${cells.length}`);

  for (const source of HITSTUN_SOURCES) {
    const light = cells.filter((c) => c.source === source && c.hullId === 'ship_wasp' && c.k >= 0.30);
    assert.ok(light.length, `need a measured light ${source} cell at k >= 0.30`);
    for (const c of light) {
      assert.ok(
        c.helmLossDurationS >= 1,
        `${source} light helm must last >= 1.000 s at k=${c.k}, got ${c.helmLossDurationS}`,
      );
    }
    const heavy = cells.filter((c) => c.source === source && c.hullId === 'ship_atlas' && c.k <= HEAVY_GUN_SCALE_K);
    for (const c of heavy) {
      assert.equal(
        c.helmLossDurationS,
        0,
        `${source} atlas at k=${c.k} must keep the helm, got ${c.helmLossDurationS}`,
      );
    }
  }
});

test('static terrain uses a light combatant reference mass so Atlas keeps helm and Wasp loses it at the same ΔV', () => {
  const atlas = resolveHitstunLaw({
    deltaV: 40,
    victimCruise: 85,
    attackerMass: 1_000_000,
    victimMass: 200,
    worldBody: true,
  });
  assert.equal(atlas.worldBody, true);
  assert.ok(Math.abs(atlas.mF - Math.sqrt(HITSTUN_LAW.worldRefMass / 200)) < 1e-9);
  assert.ok(atlas.u < HITSTUN_LAW.uFloor, `Atlas terrain u was ${atlas.u}`);
  assert.equal(atlas.durationS, 0, 'heavy hull keeps helm on world-body slam ΔV');

  const wasp = resolveHitstunLaw({
    deltaV: 40,
    victimCruise: 105,
    attackerMass: 1_000_000,
    victimMass: 16,
    worldBody: true,
  });
  assert.ok(wasp.durationS > 0, 'light hull still loses helm at the same world ΔV');
  assert.equal(hitstunAttackerMassForCollision({ type: 'asteroid', mass: 1_000_000 }), HITSTUN_LAW.worldRefMass);
  assert.equal(hitstunAttackerMassForCollision({ type: 'ship', mass: 24 }), 24);
});

test('signed well/collision hitSide is geometric, not an entity-id parity bit', () => {
  const even = { id: 2, pos: { x: 0, z: 0 }, rot: 0, radius: 8 };
  assert.equal(
    signedHitSide(even, { x: -12, z: 0 }, { pos: { x: 0, z: 6 } }, even.id),
    -1,
    'a -X impulse on the +Z flank must be -1 even when the id would have normalized to +1',
  );
  assert.equal(
    signedHitSide(even, { x: 12, z: 0 }, { pos: { x: 0, z: 6 } }, even.id),
    1,
  );
});

test('causal B11 measurement ignores a foreign collision event on rope and well cells', LONG, async () => {
  const injectForeign = ({ host, victim }) => {
    host.bus.emit(HITSTUN_IMPULSE_EVENT, {
      source: 'collision',
      victimId: victim.id,
      attackerId: null,
      attackerMass: 200,
      victimMass: 16,
      deltaV: 3,
      dirX: 1,
      dirZ: 0,
      hitSide: 1,
      worldBody: true,
      tick: host.state.tick | 0,
    });
    host.bus.emit(HITSTUN_IMPULSE_EVENT, {
      source: 'collision',
      victimId: 'not-the-victim',
      attackerId: null,
      attackerMass: 200,
      victimMass: 16,
      deltaV: 40,
      dirX: 1,
      dirZ: 0,
      hitSide: 1,
      worldBody: true,
      tick: host.state.tick | 0,
    });
  };

  const stolen = selectCausalHitstunEvent([
    { victimId: 9, source: 'collision', deltaV: 3 },
    { victimId: 9, source: 'well', deltaV: 22 },
  ], { victimId: 9, source: 'well_fling' });
  assert.equal(stolen && stolen.source, 'well');
  assert.equal(stolen.deltaV, 22);
  assert.equal(
    selectCausalHitstunEvent([{ victimId: 9, source: 'collision', deltaV: 3 }], { victimId: 9, source: 'rope_throw' }),
    null,
    'Massline throw must not bind a collision hitstun event',
  );

  const rope = await runHitstunCells({
    seed: SEED,
    sources: ['rope_throw'],
    hulls: ['ship_wasp'],
    levels: [0.30],
    beforeCell: injectForeign,
  });
  const ropeCell = rope.cells[0];
  assert.equal(ropeCell.measured, true, 'rope cell must still measure after a foreign collision event');
  assert.ok(
    ropeCell.k > 0.2,
    `rope must keep authored ΔV, not steal collision ΔV=3 (k=${ropeCell.k})`,
  );

  const well = await runHitstunCells({
    seed: SEED,
    sources: ['well_fling'],
    hulls: ['ship_wasp'],
    levels: [0.30],
    beforeCell: injectForeign,
  });
  const wellCell = well.cells[0];
  assert.equal(wellCell.measured, true, 'well cell must still measure after a foreign collision event');
  assert.ok(
    wellCell.k !== 3 / wellCell.cruiseSpeed,
    `well must not bind the injected collision ΔV=3 (k=${wellCell.k})`,
  );
});

function fakeCell(overrides = {}) {
  return {
    source: 'gun',
    hullId: 'ship_wasp',
    hullMass: 16,
    cruiseSpeed: 210,
    kIntended: 0.30,
    k: 0.30,
    measured: true,
    helmLossDurationS: 1.2,
    entrySpinRadPerS: 2,
    helmOwner: 'none',
    recoveredAtTick: 80,
    recoveryObserved: true,
    recoveryTorqueObserved: true,
    recoveryOpposesSpin: true,
    peakTorqueHelmLoss: 0,
    peakTorqueRecovery: 4,
    peakTorque: 4,
    zeroTorqueDurationS: 0.4,
    zeroTorqueRecoveryS: 0.1,
    angularProduction: false,
    ...overrides,
  };
}

function assertUnmeasuredBar(bar, message = 'unmeasured bar must carry no numeric measurement') {
  assert.equal(bar.met, false, message);
  assert.equal(bar.unmeasured, true, message);
  assert.equal(bar.value, null, `${message}: value must be null, not a numeric zero`);
  assert.match(String(bar.note), /UNMEASURED/);
}

function barByLabel(bars, pattern) {
  const bar = (bars || []).find((b) => pattern.test(b && b.label));
  assert.ok(bar, `expected a bar matching ${pattern}`);
  return bar;
}
