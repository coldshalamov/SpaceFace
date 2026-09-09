import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PRIORITY_DUCK_THRESHOLD } from '../src/audio/cuePriorityBus.js';
import { SIGNATURE_RECIPES, validateSignatureRecipes } from '../src/presentation/cueRecipesSignatures.js';
import {
  CAPTIONS_SIGNATURES,
  SIGNATURE_CAPTION_IMPORTANCE_THRESHOLD,
  SIGNATURE_CAPTIONS,
  SIGNATURE_TITLES,
  buildSignatureCaptionCue,
  captionForSignature,
  shouldCaptionSignature,
  signatureCaptionAudit,
  titleForSignature,
} from '../src/systems/signatureAdapters.js';

const report = validateSignatureRecipes();
assert(report.ok, report.issues.join('\n'));
assert.equal(SIGNATURE_CAPTION_IMPORTANCE_THRESHOLD, PRIORITY_DUCK_THRESHOLD,
  'signature captions must inherit the same importance gate as the priority bus');
assert.equal(CAPTIONS_SIGNATURES, SIGNATURE_CAPTIONS,
  'signature captions should live beside the signature adapters, not in shipped presentationAdapters');

const signatureIds = Object.keys(SIGNATURE_RECIPES).sort();
const expectedAudIds = [
  'customs.scan',
  'mass.groan',
  'mining.seam_chime',
  'mining.vent_bonus',
  'sensor.lock',
  'sensor.scan',
  'tether.cut_whipcrack',
  'tether.strain',
];
assert.deepEqual(signatureIds, expectedAudIds,
  'AUD-02..06 signature id set should be explicit for caption parity');

for (const id of signatureIds) {
  const caption = captionForSignature(id);
  const title = titleForSignature(id);
  assert(caption, `${id} must have a signature caption`);
  assert(title, `${id} must have a signature title`);
  assert(caption.length <= 32, `${id} caption should stay short enough for one caption line`);
  assert(!/[!?]{2,}/.test(caption), `${id} caption should stay calm, not bark-like`);
}

const audit = signatureCaptionAudit();
assert.deepEqual(audit.ids, expectedAudIds);
assert.deepEqual(audit.missingCaptionIds, [], 'audit should list zero signature cues without captions');
assert.deepEqual(audit.criticalMissingCaptionIds, [], 'audit should list zero critical signature cues without captions');
assert.deepEqual(audit.criticalIds, ['sensor.lock'],
  'sensor.lock is the only base-importance critical signature so far');

assert.equal(shouldCaptionSignature('sensor.scan'), false,
  'plain scan is below the priority bus and should not spam captions');
assert.equal(buildSignatureCaptionCue({ id: 'sensor.scan', nowMs: 1000 }), null,
  'low-importance signature should not emit caption payloads');

const lockCaption = buildSignatureCaptionCue({ id: 'sensor.lock', nowMs: 1400 });
assert.equal(lockCaption.id, 'sensor.lock');
assert.equal(lockCaption.caption, 'Weapons lock.');
assert.equal(lockCaption.title, 'WEAPONS LOCK');
assert.equal(lockCaption.assertive, true);
assert.equal(lockCaption.importance, SIGNATURE_RECIPES['sensor.lock'].importance);
assert(lockCaption.importance >= PRIORITY_DUCK_THRESHOLD);

const dynamicCutCaption = buildSignatureCaptionCue({
  id: 'tether.cut_whipcrack',
  importance: 0.84,
  sourceEvent: 'tether:released',
  nowMs: 1800,
});
assert.equal(dynamicCutCaption.caption, 'Taut line cut.',
  'dynamic high-importance signature cues should reuse their caption line');
assert.equal(dynamicCutCaption.sourceEvent, 'tether:released');

const customsHighCaption = buildSignatureCaptionCue({
  id: 'customs.scan',
  importance: 0.82,
  sourceEvent: 'player:scannedByPatrol',
});
assert.equal(customsHighCaption.caption, 'Customs sweep.',
  'customs sweep should have a caption when elevated above the gate');
assert.equal(buildSignatureCaptionCue({ id: 'customs.scan' }), null,
  'base customs scan stays below the high-importance caption gate');

const adaptersSource = readFileSync(new URL('../src/systems/presentationAdapters.js', import.meta.url), 'utf8');
assert.match(adaptersSource, /const CAPTIONS = Object\.freeze/,
  'shipped presentationAdapters CAPTIONS map should still exist');
assert.doesNotMatch(adaptersSource, /CAPTIONS_SIGNATURES|SIGNATURE_CAPTIONS|tether\.cut_whipcrack|mining\.vent_bonus/,
  'AUD-07 must not edit or smuggle signature captions into presentationAdapters');

const signatureAdapterSource = readFileSync(new URL('../src/systems/signatureAdapters.js', import.meta.url), 'utf8');
assert.match(signatureAdapterSource, /CAPTIONS_SIGNATURES/,
  'signature caption map should live in signatureAdapters');
assert.doesNotMatch(signatureAdapterSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'signature caption helpers must stay deterministic and backend-free');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['check:critical-signature-captions'], 'node scripts/check-critical-signature-captions.mjs',
  'package.json must expose the AUD-07 check');

console.log(JSON.stringify({
  schema: 'spaceface.criticalSignatureCaptionsCheck.v1',
  ok: true,
  threshold: SIGNATURE_CAPTION_IMPORTANCE_THRESHOLD,
  ids: signatureIds,
  criticalIds: audit.criticalIds,
  lockCaption,
  dynamicCutCaption,
  customsHighCaption,
}, null, 2));
