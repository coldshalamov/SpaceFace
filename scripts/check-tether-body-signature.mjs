import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RECIPES } from '../src/data/audioRecipes.js';
import { getPresentationRecipe, PRESENTATION_RECIPES } from '../src/presentation/cueRecipes.js';
import { SIGNATURE_AUDIO_CUE_BY_ID, getSignatureRecipe, validateSignatureRecipes } from '../src/presentation/cueRecipesSignatures.js';
import { PRESENTATION_AUDIO_CUE_BY_ID } from '../src/systems/presentationAdapters.js';
import {
  SIGNATURE_CAPTIONS,
  SIGNATURE_TITLES,
  TETHER_CUT_WHIPCRACK_EVENTS,
  buildMassGroanCue,
  buildTetherCutCue,
  massGroanGainForMass,
  resolveTetherCutSignature,
  tetherCutTensionRatio,
} from '../src/systems/signatureAdapters.js';

const report = validateSignatureRecipes();
assert(report.ok, report.issues.join('\n'));

const shippedBreak = getPresentationRecipe('tether.break');
assert(shippedBreak, 'shipped tether.break presentation cue must remain present');
assert.equal(PRESENTATION_AUDIO_CUE_BY_ID['tether.break'], 'presentation.tether.break',
  'shipped tether break audio cue must remain wired');

const shippedSnap = RECIPES.find((recipe) => recipe.id === 'sfx.tetherSnap');
assert(shippedSnap, 'AUD-05 must reuse the shipped sfx.tetherSnap family');
assert.deepEqual(shippedSnap.layers, ['sfx_tether_crack', 'sfx_tether_twang'],
  'shipped tether snap should still be the crack plus twang layer');

const whipcrack = getSignatureRecipe('tether.cut_whipcrack');
const groan = getSignatureRecipe('mass.groan');
assert(whipcrack, 'tether.cut_whipcrack signature must exist');
assert(groan, 'mass.groan signature must exist');
assert.equal(SIGNATURE_AUDIO_CUE_BY_ID['tether.cut_whipcrack'], 'presentation.tether.cut_whipcrack');
assert.equal(SIGNATURE_AUDIO_CUE_BY_ID['mass.groan'], 'presentation.mass.groan');
assert.equal(PRESENTATION_RECIPES['tether.cut_whipcrack'], undefined,
  'AUD-05 signatures must stay out of the shipped SG-08 presentation recipe table');
assert.equal(PRESENTATION_RECIPES['mass.groan'], undefined,
  'AUD-05 mass groan must stay additive until a runtime adapter consumes it');

assert.deepEqual(whipcrack.sourceEvents, TETHER_CUT_WHIPCRACK_EVENTS,
  'whipcrack must listen only to release/break cut-edge events');
assert.equal(whipcrack.extends, 'tether.break', 'whipcrack should extend the shipped break semantics');
assert.deepEqual(whipcrack.reuses, ['sfx.tetherSnap'], 'whipcrack must reuse the shipped snap SFX');
assert(whipcrack.tensionThreshold >= 0.65 && whipcrack.tensionThreshold <= 0.85,
  'whipcrack tension threshold should gate taut cuts, not every cut');
assert(whipcrack.importance < shippedBreak.importance,
  'whipcrack must not outrank the critical tether.break cue');
assert.equal(whipcrack.budgets.draw, 0);
assert.equal(whipcrack.budgets.voice, 0);
assert.equal(whipcrack.budgets.spawn, 0);

assert.equal(groan.mode, 'continuous');
assert.equal(groan.sourceEvent, 'tether:strain');
assert.deepEqual(groan.layersWith, ['tether.strain']);
assert.equal(groan.budgets.draw, 0);
assert.equal(groan.budgets.voice, 0);
assert.equal(groan.budgets.spawn, 0);
assert(groan.gainCurve.fullMass > groan.gainCurve.minMass, 'groan gain curve must have a real mass range');
assert(groan.releaseFadeMs >= 200, 'release fade should be audible enough to prevent a hard cutoff');

assert.equal(SIGNATURE_TITLES['tether.cut_whipcrack'], 'TAUT CUT');
assert.equal(SIGNATURE_CAPTIONS['tether.cut_whipcrack'], 'Taut line cut.');
assert.equal(SIGNATURE_TITLES['mass.groan'], 'HEAVY TOW');
assert.equal(SIGNATURE_CAPTIONS['mass.groan'], 'Heavy mass under tow.');
assert.deepEqual(Object.keys(SIGNATURE_TITLES).sort(), Object.keys(SIGNATURE_CAPTIONS).sort(),
  'signature captions/titles should stay in parity as AUD packets add ids');

assert.equal(resolveTetherCutSignature({ sourceEvent: 'tether:released', tensionRatio: whipcrack.tensionThreshold - 0.01 }), null,
  'slack release just below threshold must remain soft');
assert.equal(resolveTetherCutSignature({ sourceEvent: 'tether:released', tensionRatio: whipcrack.tensionThreshold }),
  'tether.cut_whipcrack',
  'cut exactly at the threshold should be the first taut whipcrack');
assert.equal(buildTetherCutCue({ sourceEvent: 'tether:released', tensionRatio: 0.24, targetId: 'crate' }), null,
  'cutting a slack line should not fire the premium whipcrack');
assert.equal(buildTetherCutCue({ sourceEvent: 'tether:attached', tensionRatio: 1.0 }), null,
  'non-cut tether events must not fire the whipcrack');

const tautRelease = buildTetherCutCue({
  sourceEvent: 'tether:released',
  tensionRatio: 0.93,
  targetId: 'wreck-17',
  sourceId: 'player',
  nowMs: 1800,
});
assert.equal(tautRelease.id, 'tether.cut_whipcrack');
assert.equal(tautRelease.audioId, 'presentation.tether.cut_whipcrack');
assert.equal(tautRelease.caption, 'Taut line cut.');
assert.equal(tautRelease.sourceEvent, 'tether:released');
assert.equal(tautRelease.targetId, 'wreck-17');
assert(tautRelease.tensionRatio > whipcrack.tensionThreshold);
assert(tautRelease.gain > 0.4, 'taut cut should have an audible crack gain');
assert(tautRelease.reuses.includes('sfx.tetherSnap'), 'taut cut should declare shipped snap reuse');

const tautBreak = buildTetherCutCue({
  sourceEvent: 'tether:broke',
  tension: 92,
  maxTension: 100,
  targetId: 'wreck-18',
});
assert.equal(tautBreak.id, 'tether.cut_whipcrack');
assert.equal(tautBreak.sourceEvent, 'tether:broke');
assert.equal(tetherCutTensionRatio({ tension: 92, maxTension: 100 }), 0.92);
assert(tautBreak.gain >= tautRelease.gain - 0.01,
  'a taut break should be at least as loud as a taut release fixture');

assert.equal(massGroanGainForMass(0), 0);
assert.equal(massGroanGainForMass(groan.gainCurve.minMass), 0,
  'zero/low mass should remain silent');
assert.equal(buildMassGroanCue({ active: true, towedMass: 0 }), null,
  'zero towed mass must not drone');
assert.equal(buildMassGroanCue({ active: true, towedMass: groan.gainCurve.minMass }), null,
  'mass at the minimum threshold must still be silent');

const mediumTow = buildMassGroanCue({ active: true, towedMass: 800, targetId: 'hulk-small', nowMs: 2400 });
const heavyTow = buildMassGroanCue({ active: true, towedMass: 2000, targetId: 'hulk-heavy', nowMs: 2600 });
const wreckTow = buildMassGroanCue({ active: true, towedMass: 1e6, targetId: 'hulk-wreck', nowMs: 2800 });
assert.equal(mediumTow.id, 'mass.groan');
assert.equal(heavyTow.id, 'mass.groan');
assert.equal(mediumTow.caption, 'Heavy mass under tow.');
assert(heavyTow.gain > mediumTow.gain, 'heavier tow should produce a louder groan');
assert(heavyTow.playbackRate < mediumTow.playbackRate, 'heavier tow should pitch the groan lower');
assert.equal(wreckTow.gain, groan.gainCurve.maxGain, 'wreck-scale masses should clamp to the max groan gain');
assert.equal(wreckTow.releaseFadeMs, groan.releaseFadeMs);
assert.equal(buildMassGroanCue({ active: false, towedMass: 2000 }), null,
  'inactive/released tether should fade to silence instead of droning forever');
assert.equal(buildMassGroanCue({ released: true, towedMass: 2000 }), null,
  'released tether should not keep emitting mass groan');

const adapterSource = readFileSync(new URL('../src/systems/signatureAdapters.js', import.meta.url), 'utf8');
assert.doesNotMatch(adapterSource, /from ['"].*(attachments|audioSystem)/,
  'AUD-05 adapter must not import no-touch owners');
assert.doesNotMatch(adapterSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'AUD-05 adapter must stay deterministic and backend-free');

const recipeSource = readFileSync(new URL('../src/presentation/cueRecipesSignatures.js', import.meta.url), 'utf8');
assert.doesNotMatch(recipeSource, /from ['"].*(attachments|audioSystem)/,
  'AUD-05 signature data must not import no-touch owners');
assert.doesNotMatch(recipeSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'AUD-05 signature data must stay deterministic and backend-free');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['check:tether-body-signature'], 'node scripts/check-tether-body-signature.mjs',
  'package.json must expose the AUD-05 check');

console.log(JSON.stringify({
  schema: 'spaceface.tetherBodySignatureCheck.v1',
  ok: true,
  whipcrack: {
    audioId: whipcrack.audioId,
    threshold: whipcrack.tensionThreshold,
    sourceEvents: whipcrack.sourceEvents,
    tautRelease,
    tautBreak,
  },
  groan: {
    audioId: groan.audioId,
    gainCurve: groan.gainCurve,
    mediumTow,
    heavyTow,
    wreckTow,
  },
}, null, 2));
