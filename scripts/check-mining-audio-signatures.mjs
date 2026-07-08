import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RECIPES } from '../src/data/audioRecipes.js';
import { SIGNATURE_AUDIO_CUE_BY_ID, getSignatureRecipe, validateSignatureRecipes } from '../src/presentation/cueRecipesSignatures.js';
import {
  MINING_SEAM_BASELINE_YIELD_MULT,
  MINING_SEAM_CHIME_THROTTLE_MS,
  SIGNATURE_CAPTIONS,
  SIGNATURE_TITLES,
  buildMiningSeamCue,
  buildMiningVentBonusCue,
  miningSeamRichnessDelta,
  resolveMiningSeamSignature,
  resolveMiningVentBonusSignature,
  shouldThrottleMiningSeam,
} from '../src/systems/signatureAdapters.js';

const report = validateSignatureRecipes();
assert(report.ok, report.issues.join('\n'));

const audioIds = new Set(RECIPES.map((recipe) => recipe.id));
for (const id of ['sfx_mining_impact', 'sfx_core_bell', 'sfx_vent_chime']) {
  assert(audioIds.has(id), `AUD-06 must reuse shipped ${id}`);
}

const seam = getSignatureRecipe('mining.seam_chime');
const vent = getSignatureRecipe('mining.vent_bonus');
assert(seam, 'mining.seam_chime signature must exist');
assert(vent, 'mining.vent_bonus signature must exist');
assert.equal(SIGNATURE_AUDIO_CUE_BY_ID['mining.seam_chime'], 'presentation.mining.seam_chime');
assert.equal(SIGNATURE_AUDIO_CUE_BY_ID['mining.vent_bonus'], 'presentation.mining.vent_bonus');
assert.equal(seam.sourceEvent, 'mining:seamHit');
assert.equal(vent.sourceEvent, 'weapons:vent');
assert.equal(vent.requiresPhase, 'end');
assert.deepEqual(seam.reuses, ['sfx_mining_impact', 'sfx_core_bell']);
assert.deepEqual(vent.reuses, ['sfx_vent_chime']);
assert.equal(seam.throttleMs, 500, 'seam signature should mirror the existing 0.5 s seam throttle');
assert.equal(MINING_SEAM_CHIME_THROTTLE_MS, 500);
assert.equal(MINING_SEAM_BASELINE_YIELD_MULT, 0.35);
assert.equal(seam.budgets.draw, 0);
assert.equal(seam.budgets.voice, 0);
assert.equal(seam.budgets.spawn, 0);
assert.equal(vent.budgets.draw, 0);
assert.equal(vent.budgets.voice, 0);
assert.equal(vent.budgets.spawn, 0);
assert.equal(SIGNATURE_TITLES['mining.seam_chime'], 'RICH SEAM');
assert.equal(SIGNATURE_CAPTIONS['mining.seam_chime'], 'Rich seam hit.');
assert.equal(SIGNATURE_TITLES['mining.vent_bonus'], 'CLEAN VENT');
assert.equal(SIGNATURE_CAPTIONS['mining.vent_bonus'], 'Clean vent bonus.');
assert.deepEqual(Object.keys(SIGNATURE_TITLES).sort(), Object.keys(SIGNATURE_CAPTIONS).sort(),
  'signature captions/titles should stay in parity as AUD packets add ids');

const miningSource = readFileSync(new URL('../src/systems/mining.js', import.meta.url), 'utf8');
assert.match(miningSource, /SEAM_YIELD_OFF\s*=\s*0\.35/,
  'mining dull-rock baseline should remain the helper baseline');
assert.match(miningSource, /SEAM_HIT_EVENT_INTERVAL\s*=\s*0\.5/,
  'mining seam event throttle should remain 0.5 s');
assert.match(miningSource, /bus\.emit\('mining:seamHit'/,
  'mining must still expose the seam-hit event reused by AUD-06');

const audioSource = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
assert.match(audioSource, /_onSeamHit\(p\)/, 'audioSystem still has the shipped seam hit hook');
assert.match(audioSource, /sfx_mining_impact/, 'audioSystem seam hook still reuses mining impact');
assert.match(audioSource, /_onVentBonus\(p\)/, 'audioSystem still has the shipped vent bonus hook');
assert.match(audioSource, /sfx_vent_chime/, 'audioSystem vent hook still reuses vent chime');

assert.equal(miningSeamRichnessDelta({ yieldMult: 0.35 }), 0);
assert.equal(miningSeamRichnessDelta({ yieldMult: 1, baselineYieldMult: 0.35 }), 0.65);
assert.equal(resolveMiningSeamSignature({ sourceEvent: 'mining:tick', yieldMult: 1 }), null,
  'ordinary mining ticks must not fire the seam reward');
assert.equal(resolveMiningSeamSignature({ sourceEvent: 'mining:seamHit', yieldMult: 0.72 }), null,
  'weak seam delta below threshold must stay a dull impact');
assert.equal(resolveMiningSeamSignature({ sourceEvent: 'mining:seamHit', yieldMult: 1 }), 'mining.seam_chime');

const richSeam = buildMiningSeamCue({
  sourceEvent: 'mining:seamHit',
  yieldMult: 1,
  baselineYieldMult: 0.35,
  asteroidId: 'ast-rich',
  nowMs: 1000,
});
assert.equal(richSeam.id, 'mining.seam_chime');
assert.equal(richSeam.audioId, 'presentation.mining.seam_chime');
assert.equal(richSeam.caption, 'Rich seam hit.');
assert.equal(richSeam.richnessDelta, 0.65);
assert.equal(richSeam.untilMs, 1500);
assert(richSeam.playbackRate > 1.15, 'rich seam should pitch above the dull impact');
assert(richSeam.reuses.includes('sfx_core_bell'), 'rich seam should layer the bell family');

const implicitSeam = buildMiningSeamCue({ sourceEvent: 'mining:seamHit', asteroidId: 'ast-implicit', nowMs: 1600 });
assert.equal(implicitSeam.id, 'mining.seam_chime',
  'a real seamHit event may stand in for the live seam multiplier');

const previousSeam = { id: 'mining.seam_chime', startedAtMs: 1000, untilMs: 1500 };
assert.equal(shouldThrottleMiningSeam(previousSeam, 1200), true);
assert.equal(buildMiningSeamCue({ sourceEvent: 'mining:seamHit', yieldMult: 1, nowMs: 1200, previous: previousSeam }), null,
  'seam chime must not mush every impact inside the 0.5 s throttle');
assert.equal(buildMiningSeamCue({ sourceEvent: 'mining:seamHit', yieldMult: 1, nowMs: 1501, previous: previousSeam }).id,
  'mining.seam_chime',
  'a later seam hit after the throttle may ring again');

assert.equal(resolveMiningVentBonusSignature({ sourceEvent: 'weapons:vent', phase: 'start', clean: true, browserEligible: true }), null,
  'vent bonus should wait for the clean end phase');
assert.equal(resolveMiningVentBonusSignature({ sourceEvent: 'weapons:vent', phase: 'end', clean: false, browserEligible: true }), null,
  'dirty vent should not get the reward chime');
assert.equal(resolveMiningVentBonusSignature({ sourceEvent: 'weapons:vent', phase: 'end', clean: true, browserEligible: false }), null,
  'headless/deterministic path must not emit the bonus chime');
assert.equal(resolveMiningVentBonusSignature({
  sourceEvent: 'weapons:vent',
  phase: 'end',
  ownerId: 'npc',
  playerId: 'player',
  clean: true,
  browserEligible: true,
}), null, 'NPC vent should not claim the player mining reward');

const cleanVent = buildMiningVentBonusCue({
  sourceEvent: 'weapons:vent',
  phase: 'end',
  ownerId: 'player',
  playerId: 'player',
  clean: true,
  forced: true,
  browserEligible: true,
  nowMs: 2400,
});
assert.equal(cleanVent.id, 'mining.vent_bonus');
assert.equal(cleanVent.audioId, 'presentation.mining.vent_bonus');
assert.equal(cleanVent.caption, 'Clean vent bonus.');
assert.equal(cleanVent.reuses[0], 'sfx_vent_chime');
assert(cleanVent.tones[2].playbackRate > cleanVent.tones[0].playbackRate,
  'vent bonus should be an ascending arpeggio');

const adapterSource = readFileSync(new URL('../src/systems/signatureAdapters.js', import.meta.url), 'utf8');
assert.doesNotMatch(adapterSource, /from ['"].*(audioSystem|systems\/mining|systems\\\\mining)/,
  'AUD-06 adapter must not import no-touch owners');
assert.doesNotMatch(adapterSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'AUD-06 adapter must stay deterministic and backend-free');

const recipeSource = readFileSync(new URL('../src/presentation/cueRecipesSignatures.js', import.meta.url), 'utf8');
assert.doesNotMatch(recipeSource, /from ['"].*(audioSystem|systems\/mining|systems\\\\mining)/,
  'AUD-06 signature data must not import no-touch owners');
assert.doesNotMatch(recipeSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'AUD-06 signature data must stay deterministic and backend-free');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['check:mining-audio-signatures'], 'node scripts/check-mining-audio-signatures.mjs',
  'package.json must expose the AUD-06 check');

console.log(JSON.stringify({
  schema: 'spaceface.miningAudioSignaturesCheck.v1',
  ok: true,
  seam: {
    audioId: seam.audioId,
    reuses: seam.reuses,
    throttleMs: seam.throttleMs,
    richSeam,
    implicitSeam,
  },
  vent: {
    audioId: vent.audioId,
    reuses: vent.reuses,
    cleanVent,
  },
}, null, 2));
