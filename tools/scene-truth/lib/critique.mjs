import { analyzeWitness, highFails } from './detectors.mjs';
import {
  evaluateBenign,
  evaluateFaults,
  healthyWitness,
  pixelDriftReview,
} from './faults.mjs';
import { SCENE_TRUTH_TOLERANCE } from './constants.mjs';

function attempt(id, ok, detail) {
  return { id, ok: ok === true, detail };
}

/**
 * Adversarial pass that tries to make the detector lie:
 * miss a planted fault, fail a benign contact, or treat pixel drift as a break.
 */
export function runCritique() {
  const faultRows = evaluateFaults().map((row) => ({
    id: row.id,
    expect: row.expect,
    detected: row.high.some((issue) => issue.kind === row.expect),
    kinds: [...new Set(row.high.map((issue) => issue.kind))],
  }));
  const benignRows = evaluateBenign().map((row) => ({
    id: row.id,
    highCount: row.high.length,
    kinds: [...new Set(row.high.map((issue) => issue.kind))],
  }));
  const drift = pixelDriftReview();
  const healthy = healthyWitness();
  const shuffled = {
    ...healthy,
    objects: [...healthy.objects].reverse(),
  };
  const missingPlayer = {
    ...healthy,
    objects: healthy.objects.filter((object) => object.isPlayer !== true),
  };
  const nanPose = structuredClone(healthy);
  nanPose.objects[0].pos = { x: Number.NaN, z: 0 };
  const duplicate = structuredClone(healthy);
  duplicate.objects.push({ ...duplicate.objects[0] });

  const attempts = [
    ...faultRows.map((row) => attempt(row.id, row.detected, row.detected
      ? `detected ${row.expect}`
      : `expected ${row.expect}, saw ${row.kinds.join(', ') || 'nothing'}`)),
    ...benignRows.map((row) => attempt(row.id, row.highCount === 0, row.highCount
      ? `false high: ${row.kinds.join(', ')}`
      : 'allowed')),
    attempt('pixel-drift-review', drift && drift.failBuild === false && drift.confidence === 'review',
      'pixel hash change stays a review item'),
    attempt('order-independent', highFails(analyzeWitness(healthy)).length === highFails(analyzeWitness(shuffled)).length,
      'object order does not change the high-fail count'),
    attempt('missing-player', highFails(analyzeWitness(missingPlayer)).some((issue) => issue.kind === 'entity-missing'),
      'a witness with no player fails closed'),
    attempt('nan-pose', highFails(analyzeWitness(nanPose)).some((issue) => issue.kind === 'bad-bounds'),
      'a non-finite pose is bad bounds'),
    attempt('duplicate-id', highFails(analyzeWitness(duplicate)).some((issue) => issue.kind === 'bad-initialization'),
      'a duplicate object id is bad initialization'),
    attempt('tolerance-not-widened', SCENE_TRUTH_TOLERANCE.pixelDriftFailsBuild === false
      && SCENE_TRUTH_TOLERANCE.scaleMismatchRatio === 1.35
      && SCENE_TRUTH_TOLERANCE.vfxHideCoverage === 0.8
      && SCENE_TRUTH_TOLERANCE.loadToFirstDrawMs === 1500
      && SCENE_TRUTH_TOLERANCE.flightPlaneStickFraction === 0.12,
      'tolerances stay on the flight-plane stick and the published ratios'),
  ];
  const ok = attempts.every((row) => row.ok);
  const failed = attempts.filter((row) => !row.ok).map((row) => row.id);
  return {
    ok,
    attempts,
    faults: faultRows,
    benign: benignRows,
    drift,
    summary: ok
      ? `Critique tried ${attempts.length} ways to disprove the detector. Planted faults were caught, benign contacts were allowed, and pixel drift stayed a review item.`
      : `Critique failed: ${failed.join(', ')}.`,
  };
}
