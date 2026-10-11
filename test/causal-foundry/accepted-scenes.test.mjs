import test from 'node:test';
import assert from 'node:assert/strict';

import { ACCEPTED_SCENES } from '../../src/data/causalFoundry/accepted.js';
import { PRESENTATION_IDS, PRESENTATION_READS } from '../../src/data/causalFoundry/presentation.js';
import { resolveEntityProfile } from '../../src/testing/lab/entityProfiles.js';
import { runLabScenario } from '../../src/testing/lab/runScenario.js';
import { compareSaveLoad } from '../../src/testing/lab/saveLoadCompare.js';
import { proveScene } from '../../tools/causal-foundry/proofs.js';

test('thirty accepted scenes are distinct, repeatable, and causal', { timeout: 180000 }, async () => {
  assert.equal(ACCEPTED_SCENES.length, 30);
  assert.equal(new Set(ACCEPTED_SCENES.map((scene) => scene.layout)).size, 30);
  assert.ok(ACCEPTED_SCENES.filter((scene) => scene.failure).length >= 5);
  assert.ok(ACCEPTED_SCENES.filter((scene) => scene.variety).length >= 15);
  assert.ok(PRESENTATION_IDS.length >= 10);

  const hashes = new Set();
  const failures = [];
  let saveDoc = null;
  let publicDoc = null;
  let publicHash = null;

  for (const scene of ACCEPTED_SCENES) {
    const proof = await proveScene(scene);
    const problems = [];
    if (!proof.verdict.accepted) problems.push(`gates ${proof.verdict.reasons.join('|')} :: ${proof.primary.error || ''}`);
    if (!proof.repeatOk) problems.push(`repeat ${proof.primary.traceHash} vs ${proof.repeat.traceHash}`);
    if (proof.expectFailures.length) problems.push(`expect ${proof.expectFailures.join('; ')}`);
    if (proof.contrastFailures.length) problems.push(`contrast ${proof.contrastFailures.join('; ')}`);
    if (scene.variety && proof.varietyFailures.length) problems.push(`variety ${proof.varietyFailures.join('; ')}`);
    const movedBody = (proof.primary.summary.others || []).some((body) => body.disp > 5 || body.hullDrop > 5 || body.speed > 8);
    if (scene.failure && proof.primary.summary.playerDisp <= 10 && !movedBody) problems.push('failure reset to the start');
    if (!proof.primary.systems.includes('physics')) problems.push('lab bundle missing physics');
    if (problems.length) failures.push(`${scene.id}: ${problems.join(' || ')} disp=${proof.primary.summary.playerDisp} rest=${proof.primary.summary.restDelta} reel=${proof.primary.summary.reelDrop} ten=${proof.primary.summary.maxTension} ang=${proof.primary.summary.maxAngular} cut=${proof.primary.summary.cut} x=${proof.primary.summary.playerX}`);
    if (proof.primary.traceHash) hashes.add(proof.primary.traceHash);
    if (scene.id === 'cf.save-continuation') saveDoc = proof.primaryDoc;
    if (scene.id === 'cf.reel-berth') {
      publicDoc = proof.primaryDoc;
      publicHash = proof.primary.traceHash;
    }
  }

  assert.equal(failures.length, 0, failures.join('\n'));
  assert.equal(hashes.size, 30);

  for (const id of PRESENTATION_IDS) {
    const scene = ACCEPTED_SCENES.find((row) => row.id === id);
    assert.ok(scene && scene.presentation === true, id);
    const card = PRESENTATION_READS[id];
    assert.equal(card.newMeshes, 0);
    assert.equal(card.camera, 'top-down XZ');
    for (const profile of card.profiles) resolveEntityProfile(profile);
  }

  const pub = await runLabScenario(publicDoc);
  assert.equal(pub.certifying, true);
  assert.equal(pub.traceHash, publicHash);

  const saved = await compareSaveLoad(saveDoc, { saveLoadAt: 30 });
  assert.equal(saved.ok, true, saved.reason || saved.detail || saved.status);
});
