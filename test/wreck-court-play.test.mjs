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
  createWreckCourtSystem,
} from '../src/systems/wreckCourt.js';
import { WRECK_COURT_ENTRY_CASE, WRECK_COURT_EVIDENCE, caseDef, materializeCase } from '../src/data/wreckCourt/index.js';
import { jitterSource, runIncident, segmentBlocked } from '../src/data/wreckCourt/physics.js';
import { ballisticFit } from '../src/data/wreckCourt/reconstruct.js';

const SEED = 40404;
const SEED_B = 909;

test('live court reuses a body contact sample for history and crushing', () => {
  const session = openCourt({ caseId: WRECK_COURT_ENTRY_CASE, seed: SEED });
  const player = { id: 'player', alive: true, pos: { ...session.player } };
  const state = { entities: new Map([[player.id, player]]), playerId: player.id, simTime: session.simTime };
  session.uid = 'contact-sample-test';
  session.live = true;
  const counts = new Map();
  for (const body of session.bodies) {
    body.entityId = `live:${body.id}`;
    state.entities.set(body.entityId, { id: body.entityId, alive: true,
      pos: { x: body.x, z: body.z }, vel: { x: body.vx, z: body.vz }, rot: body.heading,
      data: { wreckCourt: { uid: session.uid, bodyId: body.id } } });
  }
  const system = createWreckCourtSystem();
  system.ctx = { state, helpers: { combatPhysics: { sampleSolidContacts(id) {
    counts.set(id, (counts.get(id) || 0) + 1);
    return [{ normalImpulse: 1, relativeVelocity: { x: 0, z: 0 } }];
  } } } };
  system.session = session;
  system.observe();
  assert.equal(counts.size, session.bodies.length);
  assert.equal([...counts.values()].every(count => count === 1), true);
  assert.equal(session.bodies.every(body => body.historySpoiled), true);
});

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

test('the seven placed answers are produced by the step', () => {
  const kinds = (caseId) => proofTruth(openCourt({ caseId, seed: SEED })).events.map((e) => e.kind);
  assert.ok(kinds('wc_faked_collision').includes('coat'));
  assert.ok(kinds('wc_faked_collision').includes('thrust'));
  assert.equal(kinds('wc_industrial_overload').includes('patch'), false);
  assert.ok(kinds('wc_industrial_overload').includes('split'));
  assert.ok(kinds('wc_ambush_as_accident').includes('groove'));
  assert.equal(kinds('wc_ambush_as_accident').includes('patch'), false);
  assert.ok(kinds('wc_abandoned_tow').includes('tether'));
  assert.equal(kinds('wc_abandoned_tow').includes('fuel'), false);
  assert.ok(kinds('wc_massline_snap').includes('impulse'));
  assert.ok(kinds('wc_massline_snap').includes('shed'));
  assert.equal(kinds('wc_massline_snap').includes('patch'), false);
  assert.ok(kinds('wc_cookoff_chain').includes('shed'));
  assert.equal(kinds('wc_cookoff_chain').includes('patch'), false);
  assert.ok(kinds('wc_ricochet_blame').includes('reflect'));
  assert.equal(kinds('wc_ricochet_blame').includes('patch'), false);
  assert.ok(kinds('wc_clamp_shear').includes('shear'));
  assert.equal(kinds('wc_clamp_shear').includes('untether'), false);

  const cook = openCourt({ caseId: 'wc_cookoff_chain', seed: SEED });
  const pods = cook.bodies.filter((b) => b.id.startsWith('pod_')).sort((a, b) => a.x - b.x);
  assert.equal(pods.length, 4);
  assert.ok(pods.every((p) => p.bornAt > 1));
  const gaps = [];
  for (let i = 1; i < pods.length; i += 1) gaps.push(pods[i].bornAt - pods[i - 1].bornAt);
  assert.ok(gaps.every((g) => g > 0.6));

  const fake = openCourt({ caseId: 'wc_faked_collision', seed: SEED });
  assert.ok(fake.bodies.every((b) => b.scar && b.scar.material === 'polymer_coat'));
  const tow = openCourt({ caseId: 'wc_abandoned_tow', seed: SEED });
  const cable = tow.bodies.find((b) => b.id === 'cable_end');
  const tug = tow.bodies.find((b) => b.id === 'tug');
  assert.equal(cable.scar.material, 'tensile_neck');
  assert.equal(tug.fuel, 0);
  const snap = openCourt({ caseId: 'wc_massline_snap', seed: SEED });
  assert.equal(snap.bodies.find((b) => b.id === 'skiff').integrity, 0);
  assert.equal(snap.bodies.find((b) => b.id === 'cable').scar.material, 'tensile_neck');
  const ambush = openCourt({ caseId: 'wc_ambush_as_accident', seed: SEED });
  assert.ok(ambush.bodies.find((b) => b.id === 'rock').scar.faces.some((f) => f.kind === 'groove'));
  const rico = openCourt({ caseId: 'wc_ricochet_blame', seed: SEED });
  assert.ok(rico.bodies.find((b) => b.id === 'plate').scar.faces.some((f) => f.kind === 'plate'));
});

test('clamp shear faces are written when the line parts', () => {
  const seed = 40404;
  const def = caseDef('wc_clamp_shear');
  const spawned = def.build({ seed, j: jitterSource(seed, def.id) });
  for (const body of spawned.bodies) assert.equal(body.scar, null, `${body.id} spawned with a scar`);
  const tetherEvent = spawned.events.find((e) => e.kind === 'tether');
  assert.equal(tetherEvent.breakForce < 1e6, true);
  const full = runIncident({ bodies: spawned.bodies, events: spawned.events, until: spawned.until });
  const line = full.tethers[0];
  assert.equal(line.broken, true);
  assert.ok(line.brokeAt, 'the clamp released on a timer instead of the break force');
  const shear = full.events.find((e) => e.kind === 'shear');
  assert.ok(shear && shear.t > 2);
  assert.equal(full.events.some((e) => e.kind === 'untether'), false);
  const ship = full.bodies.find((b) => b.id === 'ship');
  const pylon = full.bodies.find((b) => b.id === 'pylon');
  assert.ok(ship.scar.faces.some((f) => f.kind === 'shear'));
  assert.ok(pylon.scar.faces.some((f) => f.kind === 'shear'));
  assert.ok(ship.vx > 12);

  const session = openCourt({ caseId: 'wc_clamp_shear', seed });
  const read = act(session, { verb: 'scan', targetId: 'ship', mode: 'structure' });
  assert.equal(read.measurement.data.facesStation, true);

  const bare = def.build({ seed, j: jitterSource(seed, def.id) });
  bare.events = bare.events.filter((e) => !['tether', 'thrust', 'thrust_heading', 'untether'].includes(e.kind));
  const stripped = runIncident({ bodies: bare.bodies, events: bare.events, until: bare.until });
  const quiet = openCourt({ caseId: 'wc_clamp_shear', seed });
  quiet.bodies = stripped.bodies;
  quiet.notebook = { measurements: Object.create(null) };
  for (const body of quiet.bodies) quiet.revealed[body.id] = true;
  const missed = act(quiet, { verb: 'scan', targetId: 'ship', mode: 'structure' });
  assert.equal(missed.ok, true, missed.error);
  assert.equal(missed.measurement.data.facesStation, false);
});

test('internal overload stays an internal release', () => {
  for (const seed of [4, 286, 40404]) {
    const session = openCourt({ caseId: 'wc_industrial_overload', seed });
    carefulInvestigation(session);
    assert.equal(session.ruling && session.ruling.hypothesisId, 'internal_overload', `seed ${seed}`);
  }
  for (let seed = 0; seed < 400; seed += 1) {
    const scene = materializeCase('wc_industrial_overload', seed);
    const plates = scene.bodies.filter((b) => b.transponderGroup === 'barge');
    const fit = ballisticFit(plates.map((b) => ({ x: b.x, z: b.z, vx: b.vx, vz: b.vz, mass: b.mass })));
    assert.equal(plates.length >= 5, true, String(seed));
    assert.equal(fit.residual < 48, true, `${seed} residual ${fit.residual}`);
    assert.equal(fit.spreadSpeed > 12, true, `${seed} spread ${fit.spreadSpeed}`);
  }
  const spec = caseDef('wc_industrial_overload').build({ seed: 40404, j: jitterSource(40404, 'wc_industrial_overload') });
  spec.events = spec.events.filter((e) => e.kind !== 'split');
  const stripped = runIncident({ bodies: spec.bodies, events: spec.events, until: spec.until });
  assert.equal(stripped.bodies.some((b) => b.id === 'barge'), true);
  assert.equal(stripped.bodies.some((b) => b.id.startsWith('barge_')), false);
  assert.equal(stripped.bodies.find((b) => b.id === 'tender').integrity, 1);
});

test('the necked cable sits on the far side of the rock', () => {
  const seed = 40404;
  const session = openCourt({ caseId: 'wc_massline_snap', seed });
  const cable = session.bodies.find((b) => b.id === 'cable');
  const skiff = session.bodies.find((b) => b.id === 'skiff');
  const rock = session.bodies.find((b) => b.id === 'rock');
  assert.equal(session.player.x, 260);
  assert.equal(session.player.z, 200);
  assert.ok(Math.hypot(cable.x - skiff.x, cable.z - skiff.z) > skiff.radius + cable.radius);
  assert.equal(segmentBlocked(session.player.x, session.player.z, cable.x, cable.z, rock), true);
  assert.equal(cable.scar && cable.scar.material, 'tensile_neck');
  const spec = caseDef('wc_massline_snap').build({ seed, j: jitterSource(seed, 'wc_massline_snap') });
  spec.events = spec.events.filter((e) => e.kind !== 'impulse' && e.kind !== 'shed');
  const stripped = runIncident({ bodies: spec.bodies, events: spec.events, until: spec.until });
  assert.equal(stripped.bodies.find((b) => b.id === 'skiff').integrity, 1);
  assert.equal(stripped.bodies.some((b) => b.id === 'cable'), false);
});

test('the slingshot ship has left the scene', () => {
  const session = openCourt({ caseId: 'wc_slingshot_disappearance', seed: SEED });
  assert.equal(session.bodies.some((b) => b.id === 'ship'), false);
  assert.ok(session.bodies.filter((b) => b.variant === 'wc_vent').length >= 4);
});
