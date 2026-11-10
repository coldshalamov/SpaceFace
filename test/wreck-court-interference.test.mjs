// Four replays where the player disturbs the scene before investigating.
// The sealed cause stops being supportable. The notebook is not the pristine one.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  openCourt,
  carefulInvestigation,
  visualOnlyFiling,
  proofTruth,
  act,
  evidenceFingerprint,
  supportedClaims,
  serializeCourt,
  restoreCourt,
} from '../src/systems/wreckCourt.js';

const SEED = 40404;

function pristine(caseId) {
  const session = openCourt({ caseId, seed: SEED });
  carefulInvestigation(session);
  return session;
}

test('towing the matched hull before sampling spoils the kinematics', () => {
  const session = openCourt({ caseId: 'wc_faked_collision', seed: SEED });
  const hull = session.bodies.find((b) => b.id === 'hull_a');
  act(session, { verb: 'position', x: hull.x + 30, z: hull.z });
  const towed = act(session, { verb: 'tow', targetId: 'hull_a', heading: 1.1, seconds: 8 });
  assert.equal(towed.ok, true);
  assert.equal(towed.spoiled, true);
  carefulInvestigation(session);
  const traj = session.notebook.measurements['scan:hull_a:trajectory'];
  assert.equal(traj.spoiled, true);
  assert.equal(supportedClaims(session).includes(proofTruth(session).cause), false);
  assert.equal(session.ruling, null);
  const clean = pristine('wc_faked_collision');
  assert.notEqual(JSON.stringify(evidenceFingerprint(session)), JSON.stringify(evidenceFingerprint(clean)));
  assert.equal(clean.ruling.hypothesisId, 'staged_nudge');
  const restored = restoreCourt(serializeCourt(session));
  assert.equal(JSON.stringify(evidenceFingerprint(session)), JSON.stringify(evidenceFingerprint(restored)));
});

test('cooking the sealed pod removes the ejection proof', () => {
  const session = openCourt({ caseId: 'wc_smuggling_cleanup', seed: SEED });
  const pod = session.bodies.find((b) => b.id === 'pod');
  act(session, { verb: 'position', x: pod.x + 16, z: pod.z });
  const burned = act(session, { verb: 'scan', targetId: 'pod', mode: 'spectro' });
  assert.equal(burned.destroyed, 'pod');
  assert.equal(pod.destroyed, true);
  assert.equal(pod.cargo, null);
  carefulInvestigation(session);
  assert.equal(supportedClaims(session).includes('pre_ejection_scuttle'), false);
  assert.equal(session.ruling, null);
  const glance = openCourt({ caseId: 'wc_smuggling_cleanup', seed: SEED });
  visualOnlyFiling(glance);
  assert.equal(glance.ruling.hypothesisId, 'pirate_strike');
  const clean = pristine('wc_smuggling_cleanup');
  assert.equal(clean.ruling.hypothesisId, 'pre_ejection_scuttle');
  assert.equal(clean.bodies.find((b) => b.id === 'pod').destroyed, false);
  assert.notEqual(
    JSON.stringify(evidenceFingerprint(session).bodies.find((b) => b.id === 'pod')),
    JSON.stringify(evidenceFingerprint(clean).bodies.find((b) => b.id === 'pod')),
  );
});

test('pushing the rock along the hauler scar crushes the hidden skiff', () => {
  const session = openCourt({ caseId: 'wc_ambush_as_accident', seed: SEED });
  assert.equal(session.revealed.shooter, undefined);
  act(session, { verb: 'position', x: 90, z: 16 });
  act(session, { verb: 'scan', targetId: 'hauler', mode: 'visual' });
  const scar = session.notebook.measurements['scan:hauler:visual'].data.scar;
  const heading = Math.atan2(scar.nz, scar.nx);
  const towed = act(session, { verb: 'moveObstruction', targetId: 'rock', heading, seconds: 18 });
  assert.equal(towed.ok, true);
  assert.ok(towed.crushed.includes('shooter'));
  assert.equal(session.bodies.find((b) => b.id === 'shooter').destroyed, true);
  carefulInvestigation(session);
  assert.equal(supportedClaims(session).includes('ambush_from_cover'), false);
  assert.equal(session.ruling, null);
  const clean = pristine('wc_ambush_as_accident');
  assert.equal(clean.ruling.hypothesisId, 'ambush_from_cover');
  assert.equal(clean.bodies.find((b) => b.id === 'shooter').destroyed, false);
  const restored = restoreCourt(serializeCourt(session));
  assert.equal(restored.bodies.find((b) => b.id === 'shooter').destroyed, true);
  assert.equal(restored.ruling, null);
});

test('a spectro burn in the pod train breaks the cook order', () => {
  const session = openCourt({ caseId: 'wc_cookoff_chain', seed: SEED });
  const pod = session.bodies.find((b) => b.id === 'pod_1');
  act(session, { verb: 'position', x: pod.x, z: pod.z + 18 });
  const burned = act(session, { verb: 'scan', targetId: 'pod_1', mode: 'spectro' });
  assert.equal(burned.destroyed, 'pod_1');
  carefulInvestigation(session);
  assert.equal(supportedClaims(session).includes('sympathetic_cookoff'), false);
  assert.equal(session.ruling, null);
  const clean = pristine('wc_cookoff_chain');
  assert.equal(clean.ruling.hypothesisId, 'sympathetic_cookoff');
  assert.notEqual(
    clean.bodies.filter((b) => b.destroyed).length,
    session.bodies.filter((b) => b.destroyed).length,
  );
  const glance = openCourt({ caseId: 'wc_cookoff_chain', seed: SEED });
  visualOnlyFiling(glance);
  assert.equal(glance.ruling.hypothesisId, 'escort_missile_rake');
  assert.notEqual(glance.ruling.intents.economy.amount, clean.ruling.intents.economy.amount);
});
