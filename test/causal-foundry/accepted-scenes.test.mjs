import test from 'node:test';
import assert from 'node:assert/strict';

import { ACCEPTED_SCENES } from '../../src/data/causalFoundry/accepted.js';
import { PRESENTATION_IDS, PRESENTATION_SCENES } from '../../src/data/causalFoundry/presentation.js';
import { resolveEntityProfile } from '../../src/testing/lab/entityProfiles.js';
import { runLabScenario } from '../../src/testing/lab/runScenario.js';
import { proveScene } from '../../tools/causal-foundry/proofs.js';

const DROPPED = [
  'cf.static-reel', 'cf.diagonal-reel', 'cf.cross-reel', 'cf.reciprocal-close',
  'cf.offset-orbit', 'cf.fast-coast-tether', 'cf.tow-swing',
  'cf.glancing-pod', 'cf.head-on-pod', 'cf.choose-ram', 'cf.ram-or-brake',
  'cf.incoming-pod', 'cf.twin-kick',
  'cf.wasp-wound', 'cf.fire-and-coast',
  'cf.settle-pair', 'cf.turn-burn', 'cf.save-continuation',
];

test('thirty accepted scenes are distinct couplings', { timeout: 180000 }, async () => {
  assert.equal(ACCEPTED_SCENES.length, 30);
  assert.ok(ACCEPTED_SCENES.filter((scene) => scene.failure).length >= 5);
  assert.ok(ACCEPTED_SCENES.filter((scene) => scene.variety).length >= 15);
  assert.equal(PRESENTATION_IDS.length, 10);
  const ids = new Set(ACCEPTED_SCENES.map((scene) => scene.id));
  for (const id of DROPPED) assert.equal(ids.has(id), false, id);

  const proofs = [];
  const failures = [];
  for (const scene of ACCEPTED_SCENES) {
    const proof = await proveScene(scene);
    proofs.push({ scene, proof });
    const problems = [];
    if (!proof.verdict.accepted) problems.push(`gates ${proof.verdict.reasons.join('|')} happened=${(proof.report.happened || []).join('+')} :: ${proof.primary.error || ''}`);
    if (!proof.repeatOk) problems.push(`repeat ${proof.primary.traceHash} vs ${proof.repeat.traceHash}`);
    if (proof.expectFailures.length) problems.push(`expect ${proof.expectFailures.join('; ')}`);
    if (proof.contrastFailures.length) problems.push(`contrast ${proof.contrastFailures.join('; ')}`);
    if (scene.variety && proof.varietyFailures.length) problems.push(`variety ${proof.varietyFailures.join('; ')}`);
    if (scene.failure && proof.failureGaps.length) problems.push(`failure ${proof.failureGaps.join('; ')}`);
    if ((proof.report.happened || []).includes('massline.latch')) problems.push('pre-seeded latch fired');
    if (!proof.primary.systems.includes('physics')) problems.push('lab bundle missing physics');
    const operable = scene.primary && (
      scene.primary.hold || scene.primary.reelFrom != null || scene.primary.payoutFrom != null
      || scene.primary.tap != null || scene.primary.fire || scene.primary.boost
      || Math.abs(scene.primary.moveZ || 0) > 0 || Math.abs(scene.primary.turnIntent || 0) > 0
      || (scene.player && (Math.abs(scene.player.vx || 0) + Math.abs(scene.player.vz || 0) > 0))
    );
    if (!operable) problems.push('no operable control');
    if (problems.length) {
      const s = proof.primary.summary;
      failures.push(`${scene.id} [${proof.verdict.signature}] ${problems.join(' || ')} disp=${s.playerDisp.toFixed(1)} end=${s.endSpeed.toFixed(1)} reel=${s.reelDrop.toFixed(1)} ten=${s.maxTension.toFixed(0)} ang=${s.maxAngular.toFixed(2)} x=${s.playerX.toFixed(1)} cut=${s.cut}`);
    }
  }

  assert.equal(failures.length, 0, failures.join('\n'));
  const signatures = proofs.map((row) => row.proof.verdict.signature);
  const dupes = signatures.filter((key, index) => signatures.indexOf(key) !== index);
  assert.deepEqual(dupes, [], `duplicate couplings ${dupes.join(' ; ')}`);
  assert.equal(new Set(proofs.map((row) => row.proof.primary.traceHash)).size, 30);

  for (const card of PRESENTATION_SCENES) {
    const found = proofs.find((row) => row.scene.id === card.id);
    assert.ok(found && found.scene.presentation === true, card.id);
    assert.ok(card.controls.length > 0, card.id);
    for (const profile of card.profiles) resolveEntityProfile(profile);
    const pub = await runLabScenario(found.proof.primaryDoc);
    assert.equal(pub.certifying, true, card.id);
    assert.equal(pub.ok, true, `${card.id} ${pub.error || JSON.stringify(pub.oracle && pub.oracle.failed)}`);
    assert.equal(pub.traceHash, found.proof.primary.traceHash, card.id);
  }
});
