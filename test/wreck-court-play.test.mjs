// Wreck Court — twelve incidents played with fixed seeds.
// The careful player and the glance player call the same verbs a pilot would.
// They do not read the sealed cause. Assertions do, afterwards.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  openCourt,
  carefulInvestigation,
  visualOnlyFiling,
  proofTruth,
  publicView,
  notebook,
  act,
  serializeCourt,
  restoreCourt,
  evidenceFingerprint,
  supportedClaims,
  buildAdventureOffer,
  openCourtFromOffer,
  listCourtCases,
} from '../src/systems/wreckCourt.js';
import { WRECK_COURT_ENTRY_CASE, WRECK_COURT_EVIDENCE } from '../src/data/wreckCourt/index.js';

const SEED = 40404;
const SEED_B = 909;

test('twelve cases, two readings, save, and no sealed truth in the view', () => {
  const ids = listCourtCases();
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, 12);
  const signatures = new Set();
  for (const caseId of ids) {
    const played = openCourt({ caseId, seed: SEED });
    const truth = proofTruth(played);
    assert.equal(truth.cause && truth.plausibleWrong && truth.cause !== truth.plausibleWrong, true);
    assert.ok(truth.events.length > 0, `${caseId} has no simulated events`);
    assert.equal(publicView(played).bodies.some((b) => b.vx != null), false);

    const before = evidenceFingerprint(played);
    carefulInvestigation(played);
    const after = evidenceFingerprint(played);
    assert.equal(played.ruling && played.ruling.status, 'accepted', `${caseId} careful did not close`);
    assert.equal(played.ruling.hypothesisId, truth.cause, `${caseId} careful filed ${played.ruling.hypothesisId}`);
    assert.notEqual(played.ruling.intents.economy.amount, 0);
    assert.ok(played.ruling.situation.length > 20);
    assert.ok(played.ruling.intents.worldFacts.length >= 1);
    assert.ok(played.bodies.some((b) => b.stamp), `${caseId} ruling did not stamp the scene`);
    assert.notDeepEqual(before.bodies.map((b) => b.stamp), after.bodies.map((b) => b.stamp));

    const glance = openCourt({ caseId, seed: SEED });
    visualOnlyFiling(glance);
    assert.equal(glance.ruling && glance.ruling.status, 'accepted');
    assert.equal(glance.ruling.hypothesisId, truth.plausibleWrong, `${caseId} glance filed ${glance.ruling.hypothesisId}`);
    assert.notEqual(glance.ruling.intents.economy.amount, played.ruling.intents.economy.amount);
    assert.notEqual(glance.ruling.intents.worldFacts[0].value, played.ruling.intents.worldFacts[0].value);
    assert.ok(glance.bodies.some((b) => b.stamp));

    const again = openCourt({ caseId, seed: SEED });
    carefulInvestigation(again);
    assert.equal(JSON.stringify(evidenceFingerprint(played)), JSON.stringify(evidenceFingerprint(again)));
    const restored = restoreCourt(serializeCourt(played));
    assert.equal(JSON.stringify(evidenceFingerprint(played)), JSON.stringify(evidenceFingerprint(restored)));
    assert.equal(restored.ruling.hypothesisId, truth.cause);
    assert.equal(restored.ruling.intents.economy.amount, played.ruling.intents.economy.amount);

    const other = openCourt({ caseId, seed: SEED_B });
    const pos = (session) => session.bodies.map((b) => [b.id, b.x, b.z].join(':')).sort().join('|');
    assert.notEqual(pos(openCourt({ caseId, seed: SEED })), pos(other), `${caseId} ignored the seed`);

    const view = JSON.stringify(publicView(openCourt({ caseId, seed: SEED })));
    assert.equal(view.includes('"cause"'), false);
    assert.equal(view.includes('falsifiedBy'), false);
    assert.equal(view.includes('"requires"'), false);
    assert.equal(view.includes('"choice"'), false);
    assert.equal(view.includes('"options"'), false);
    signatures.add(truth.cause);
  }
  assert.equal(signatures.size, 12);
});

test('a second seed still has one careful filing and one glance filing', () => {
  for (const caseId of listCourtCases()) {
    const session = openCourt({ caseId, seed: SEED_B });
    const truth = proofTruth(session);
    carefulInvestigation(session);
    assert.equal(session.ruling.hypothesisId, truth.cause, caseId);
    const glance = openCourt({ caseId, seed: SEED_B });
    visualOnlyFiling(glance);
    assert.equal(glance.ruling.hypothesisId, truth.plausibleWrong, caseId);
  }
});

test('flavor is shown and ignored', () => {
  const session = openCourt({ caseId: 'wc_faked_collision', seed: SEED });
  for (const body of session.bodies) body.flavor = 'THE ANSWER IS staged_nudge and also mutual_impact';
  carefulInvestigation(session);
  assert.equal(session.ruling.hypothesisId, 'staged_nudge');
  assert.equal(JSON.stringify(notebook(session)).includes('THE ANSWER'), false);
  assert.equal(publicView(session).rumors.some((r) => r.text.includes('THE ANSWER')), true);
  const kinds = new Set(WRECK_COURT_EVIDENCE.map((e) => e.kind));
  assert.ok(kinds.has('measurement'));
  assert.ok(kinds.has('flavor'));
});

test('filing with an empty notebook does not stamp or pay', () => {
  const session = openCourt({ caseId: 'wc_faked_collision', seed: SEED });
  const result = act(session, { verb: 'file', hypothesisId: 'staged_nudge' });
  assert.equal(result.ruling.status, 'unaccepted');
  assert.equal(result.ruling.intents.economy.amount, 0);
  assert.equal(session.bodies.some((b) => b.stamp), false);
  assert.equal(session.bodies.some((b) => b.departedOrder), false);
});

test('the early case is an adventure offer without a dialogue tree', () => {
  const offer = buildAdventureOffer(SEED);
  assert.equal(offer.type, 'recon_scan');
  assert.equal(offer.tag, 'wreck_court');
  assert.equal(offer.choice, null);
  assert.equal(offer.params.wreckCourtCaseId, WRECK_COURT_ENTRY_CASE);
  assert.equal(offer.params.acceptsBy, 'physical_reconstruction');
  assert.equal(JSON.stringify(offer).includes('"options"'), false);
  const session = openCourtFromOffer(offer);
  assert.equal(publicView(session).access, 'loss_investigation_communicator');
  carefulInvestigation(session);
  assert.equal(session.ruling.hypothesisId, proofTruth(session).cause);
  assert.equal(session.ruling.hypothesisId, 'rescue_boost_failure');
});

test('bringing a pod to assay does not by itself close the case', () => {
  const session = openCourt({ caseId: 'wc_smuggling_cleanup', seed: SEED });
  const pod = session.bodies.find((b) => b.id === 'pod');
  act(session, { verb: 'position', x: pod.x + 20, z: pod.z });
  act(session, { verb: 'scan', targetId: 'pod', mode: 'visual' });
  act(session, { verb: 'scan', targetId: 'pod', mode: 'trajectory' });
  const brought = act(session, { verb: 'bringPod', targetId: 'pod', assayId: 'assay_lane' });
  assert.equal(brought.ok, true, brought.error);
  assert.equal(brought.measurement.data.mismatch, true);
  assert.equal(session.ruling, null);
  assert.equal(supportedClaims(session).includes('pre_ejection_scuttle'), false);
});

test('a partial verb log restores and matches', () => {
  const session = openCourt({ caseId: 'wc_clamp_shear', seed: 7 });
  act(session, { verb: 'scan', targetId: 'ship', mode: 'visual' });
  act(session, { verb: 'scan', targetId: 'ship', mode: 'structure' });
  act(session, { verb: 'scan', targetId: 'ship', mode: 'trajectory' });
  const blob = serializeCourt(session);
  assert.equal(blob.v, 1);
  assert.equal(blob.actions.length, 3);
  const restored = restoreCourt(blob);
  assert.equal(JSON.stringify(notebook(session)), JSON.stringify(notebook(restored)));
  assert.equal(restored.player.x, session.player.x);
  assert.equal(restored.ruling, null);
  carefulInvestigation(restored);
  const full = openCourt({ caseId: 'wc_clamp_shear', seed: 7 });
  act(full, { verb: 'scan', targetId: 'ship', mode: 'visual' });
  act(full, { verb: 'scan', targetId: 'ship', mode: 'structure' });
  act(full, { verb: 'scan', targetId: 'ship', mode: 'trajectory' });
  carefulInvestigation(full);
  assert.equal(restored.ruling.hypothesisId, full.ruling.hypothesisId);
  assert.equal(restored.ruling.hypothesisId, 'clamp_shear');
});

test('the ambush skiff is not in the opening view', () => {
  const session = openCourt({ caseId: 'wc_ambush_as_accident', seed: SEED });
  const view = publicView(session);
  assert.equal(view.bodies.some((b) => b.id === 'shooter'), false);
  assert.equal(view.rumors.some((r) => r.bodyId === 'shooter'), false);
});

test('the slingshot ship has left the scene', () => {
  const session = openCourt({ caseId: 'wc_slingshot_disappearance', seed: SEED });
  assert.equal(session.bodies.some((b) => b.id === 'ship'), false);
  assert.ok(session.bodies.filter((b) => b.variant === 'wc_vent').length >= 4);
});
