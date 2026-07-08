import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RECIPES } from '../src/data/audioRecipes.js';
import { PRIORITY_DUCK_THRESHOLD } from '../src/audio/cuePriorityBus.js';
import {
  SIGNATURE_AUDIO_CUE_BY_ID,
  getSignatureRecipe,
  validateSignatureRecipes,
} from '../src/presentation/cueRecipesSignatures.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import {
  SENSOR_SIGNATURE_DEBOUNCE_MS,
  SIGNATURE_CAPTIONS,
  SIGNATURE_TITLES,
  buildSensorSignatureCue,
  captionForSignature,
  resolveSensorSignature,
  shouldDebounceSensorSignature,
  titleForSignature,
} from '../src/systems/signatureAdapters.js';

const report = validateSignatureRecipes();
assert(report.ok, report.issues.join('\n'));

assert(RECIPES.some((recipe) => recipe.id === 'sfx_lock_acquired'),
  'AUD-03 must reuse the shipped lock-acquired recipe family');

const scan = getSignatureRecipe('sensor.scan');
const lock = getSignatureRecipe('sensor.lock');
assert(scan, 'sensor.scan signature must exist');
assert(lock, 'sensor.lock signature must exist');
assert.equal(SIGNATURE_AUDIO_CUE_BY_ID['sensor.scan'], 'presentation.sensor.scan');
assert.equal(SIGNATURE_AUDIO_CUE_BY_ID['sensor.lock'], 'presentation.sensor.lock');
assert(lock.importance > scan.importance, 'weapons lock must be higher importance than benign scan');
assert(lock.importance >= PRIORITY_DUCK_THRESHOLD, 'weapons lock should qualify for the priority bus');
assert.equal(scan.budgets.draw, 0);
assert.equal(lock.budgets.draw, 0);
assert(scan.tones.length >= 2 && lock.tones.length >= 2, 'scan and lock must each be at least two-tone sweeps');
assert(lock.tones[1].playbackRate > scan.tones[1].playbackRate,
  'lock doublet should land sharper than scan sweep');
assert(lock.tones[1].gain > scan.tones[1].gain,
  'lock doublet should be louder than scan sweep');

assert.equal(SIGNATURE_CAPTIONS['sensor.scan'], 'Scanned.');
assert.equal(SIGNATURE_CAPTIONS['sensor.lock'], 'Weapons lock.');
assert.equal(captionForSignature('sensor.scan'), 'Scanned.');
assert.equal(captionForSignature('sensor.lock'), 'Weapons lock.');
assert.equal(titleForSignature('sensor.scan'), 'SCAN SWEEP');
assert.equal(titleForSignature('sensor.lock'), 'WEAPONS LOCK');
assert.deepEqual(Object.keys(SIGNATURE_TITLES).sort(), Object.keys(SIGNATURE_CAPTIONS).sort(),
  'signature captions/titles should stay in parity');

const state = {
  playerId: 1,
  simTime: 4.25,
  entities: new Map([
    [1, { id: 1, team: 0, pos: { x: 0, z: 0 } }],
  ]),
  world: {
    currentSectorId: 'sector_safe',
    sectors: { sector_safe: { security: 1, tier: 0 } },
    activeSector: { gates: [] },
  },
};
const neutral = { id: 2, team: 2, data: { ai: { passive: true, archetype: 'trader' } } };
const hostile = { id: 3, team: 1, data: { ai: { hostileTeams: [0], archetype: 'pirate' } } };

assert.equal(isHostileToPlayer(neutral, 0, state), false, 'control neutral should be scanner-neutral');
assert.equal(isHostileToPlayer(hostile, 0, state), true, 'control hostile should be scanner-hostile');
assert.equal(resolveSensorSignature(neutral, state), 'sensor.scan');
assert.equal(resolveSensorSignature(hostile, state), 'sensor.lock');

const scanCue = buildSensorSignatureCue({ contact: neutral, state, nowMs: 1200 });
assert.equal(scanCue.id, 'sensor.scan');
assert.equal(scanCue.caption, 'Scanned.');
assert.equal(scanCue.hostile, false);
assert.equal(scanCue.targetId, 2);
assert.equal(scanCue.sourceEvent, 'scan:pulse');

const lockCue = buildSensorSignatureCue({ contact: hostile, state, nowMs: 1300 });
assert.equal(lockCue.id, 'sensor.lock');
assert.equal(lockCue.caption, 'Weapons lock.');
assert.equal(lockCue.hostile, true);
assert.equal(lockCue.targetId, 3);
assert(lockCue.importance > scanCue.importance, 'hostile lock cue should be higher priority');

let predicateCalls = 0;
const factionBait = { id: 4, team: 1, factionId: 'faction_pirates', data: { ai: { passive: true } } };
const baitCue = buildSensorSignatureCue({
  contact: factionBait,
  state,
  nowMs: 1500,
  isHostileToPlayer: () => {
    predicateCalls++;
    return false;
  },
});
assert.equal(predicateCalls, 1, 'adapter must ask the hostility predicate');
assert.equal(baitCue.id, 'sensor.scan',
  'faction-looking contacts must not become weapons locks when the scanner predicate says neutral');

const previous = { id: 'sensor.scan', targetId: hostile.id, startedAtMs: 1000, untilMs: 2000 };
assert.equal(shouldDebounceSensorSignature(previous, 'sensor.lock', 1500, hostile.id), true);
assert.equal(buildSensorSignatureCue({ contact: hostile, state, nowMs: 1500, previous }), null,
  'hostility flip inside the sweep debounce must not emit both tones');
assert.equal(buildSensorSignatureCue({ contact: hostile, state, nowMs: 2001, previous }).id, 'sensor.lock',
  'hostility resolved after debounce may emit the lock tone');
assert.equal(SENSOR_SIGNATURE_DEBOUNCE_MS, 1000, 'debounce should cover the <=1s blind A/B window');

const adapterSource = readFileSync(new URL('../src/systems/signatureAdapters.js', import.meta.url), 'utf8');
assert.match(adapterSource, /scannerIsHostileToPlayer/, 'adapter should route through scanner hostility');
assert.doesNotMatch(adapterSource, /factionId/, 'adapter must not infer hostility from faction ids');
assert.doesNotMatch(adapterSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'signature adapter must stay deterministic and DOM/WebAudio-free');

const recipeSource = readFileSync(new URL('../src/presentation/cueRecipesSignatures.js', import.meta.url), 'utf8');
assert.doesNotMatch(recipeSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'signature recipes must stay deterministic and backend-free');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['check:sensor-signatures'], 'node scripts/check-sensor-signatures.mjs',
  'package.json must expose the AUD-03 check');

console.log(JSON.stringify({
  schema: 'spaceface.sensorSignaturesCheck.v1',
  ok: true,
  debounceMs: SENSOR_SIGNATURE_DEBOUNCE_MS,
  scan: {
    audioId: scan.audioId,
    importance: scan.importance,
    caption: scanCue.caption,
    tones: scan.tones,
  },
  lock: {
    audioId: lock.audioId,
    importance: lock.importance,
    caption: lockCue.caption,
    tones: lock.tones,
  },
}, null, 2));
