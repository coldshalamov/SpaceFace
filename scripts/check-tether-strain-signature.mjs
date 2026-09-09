import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CRITICAL_SLICE_EVENT_IDS } from '../src/presentation/cueSchema.js';
import { getPresentationRecipe, PRESENTATION_RECIPES } from '../src/presentation/cueRecipes.js';
import { PRESENTATION_AUDIO_CUE_BY_ID } from '../src/systems/presentationAdapters.js';
import {
  SIGNATURE_AUDIO_CUE_BY_ID,
  SIGNATURE_RECIPES,
  TETHER_STRAIN_BUCKETS,
  bucketTetherStrainDerivative,
  buildTetherStrainCue,
  getSignatureRecipe,
  tetherStrainDerivative,
  validateSignatureRecipes,
} from '../src/presentation/cueRecipesSignatures.js';

const report = validateSignatureRecipes();
assert(report.ok, report.issues.join('\n'));

const nearBreak = getPresentationRecipe('tether.near_break');
assert(nearBreak, 'shipped tether.near_break cue must exist');
assert.equal(PRESENTATION_AUDIO_CUE_BY_ID['tether.near_break'], 'presentation.tether.near_break',
  'near-break warning must keep its shipped alert cue');
assert(CRITICAL_SLICE_EVENT_IDS.includes('tether.near_break'), 'near-break remains the critical threshold ping');

const strain = getSignatureRecipe('tether.strain');
assert(strain, 'tether strain signature recipe must exist');
assert.equal(SIGNATURE_AUDIO_CUE_BY_ID['tether.strain'], 'presentation.tether.strain');
assert.equal(PRESENTATION_RECIPES['tether.strain'], undefined,
  'signature recipe must not be smuggled into the shipped SG-08 recipe table');
assert(!CRITICAL_SLICE_EVENT_IDS.includes('tether.strain'),
  'continuous strain signature must not pretend to be a critical slice cue');
assert.deepEqual(strain.layersWith, ['tether.near_break'], 'strain tone must layer beside the near-break alert');
assert.equal(strain.budgets.draw, 0, 'AUD-02 backend half must have no render/draw budget');
assert.equal(strain.budgets.voice, 0, 'AUD-02 is audio signature, not voice/bark work');
assert.equal(strain.budgets.spawn, 0, 'AUD-02 must not spawn anything');

assert.equal(TETHER_STRAIN_BUCKETS.length, 3, 'derivative must bucket into exactly three audible steps');
for (let i = 1; i < TETHER_STRAIN_BUCKETS.length; i++) {
  assert(TETHER_STRAIN_BUCKETS[i].playbackRate > TETHER_STRAIN_BUCKETS[i - 1].playbackRate,
    'playback rate should rise with strain derivative');
  assert(TETHER_STRAIN_BUCKETS[i].gain > TETHER_STRAIN_BUCKETS[i - 1].gain,
    'gain should rise with strain derivative');
  assert(TETHER_STRAIN_BUCKETS[i].importance > TETHER_STRAIN_BUCKETS[i - 1].importance,
    'importance should rise with strain derivative');
}
assert(TETHER_STRAIN_BUCKETS.at(-1).importance < nearBreak.importance,
  'continuous high strain must stay below the near-break threshold ping priority');

assert.equal(bucketTetherStrainDerivative(-0.3).id, 'low', 'letting off the line should drop to the low tone');
assert.equal(bucketTetherStrainDerivative(0.1).id, 'low');
assert.equal(bucketTetherStrainDerivative(0.3).id, 'medium');
assert.equal(bucketTetherStrainDerivative(0.8).id, 'high');

const derivative = tetherStrainDerivative(0.2, 0.56, 0.6);
assert(Math.abs(derivative - 0.6) < 1e-9, 'derivative should be strain delta over dt');

const heavyRise = buildTetherStrainCue({
  active: true,
  previousStrain: 0.2,
  currentStrain: 0.62,
  dtSeconds: 0.6,
  targetId: 42,
  sourceId: 1,
  simTimeMs: 1200,
});
assert.equal(heavyRise.id, 'tether.strain');
assert.equal(heavyRise.audioId, 'presentation.tether.strain');
assert.equal(heavyRise.bucket, 'high');
assert.equal(heavyRise.targetId, 42);
assert.equal(heavyRise.sourceEvent, 'tether:strain');
assert(heavyRise.playbackRate > 1.2, 'heavy rising pull should pitch up');
assert(heavyRise.gain > 0.4, 'heavy rising pull should become audible');
assert(heavyRise.importance < nearBreak.importance, 'near-break alert still owns the threshold moment');

const lettingOff = buildTetherStrainCue({
  active: true,
  previousStrain: 0.72,
  currentStrain: 0.5,
  dtSeconds: 0.5,
});
assert.equal(lettingOff.bucket, 'low', 'letting off should drop back to the low tone');
assert(lettingOff.playbackRate < heavyRise.playbackRate, 'letting off should lower pitch');
assert(lettingOff.gain < heavyRise.gain, 'letting off should lower gain');

assert.equal(buildTetherStrainCue({ active: false, previousStrain: 0.1, currentStrain: 0.7, dtSeconds: 0.2 }), null,
  'inactive tether must not emit a strain signature');

const source = readFileSync(new URL('../src/presentation/cueRecipesSignatures.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'signature helper must stay deterministic and presentation-backend-free');
assert.doesNotMatch(source, /from ['"].*cueRecipes|from ['"].*audioSystem|from ['"].*attachments/,
  'signature helper must not import no-touch owners');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['check:tether-strain-signature'], 'node scripts/check-tether-strain-signature.mjs',
  'package.json must expose the AUD-02 check');

console.log(JSON.stringify({
  schema: 'spaceface.tetherStrainSignatureCheck.v1',
  ok: true,
  signatureId: strain.id,
  audioId: strain.audioId,
  nearBreakImportance: nearBreak.importance,
  buckets: TETHER_STRAIN_BUCKETS.map((bucket) => ({
    id: bucket.id,
    derivative: [bucket.minDerivativePerSecond, bucket.maxDerivativePerSecond],
    playbackRate: bucket.playbackRate,
    gain: bucket.gain,
    importance: bucket.importance,
  })),
  heavyRise,
  lettingOff,
}, null, 2));
