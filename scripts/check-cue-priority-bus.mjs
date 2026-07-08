import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CRITICAL_SLICE_EVENT_IDS,
} from '../src/presentation/cueSchema.js';
import {
  PRESENTATION_AUDIO_CUE_BY_ID,
} from '../src/systems/presentationAdapters.js';
import {
  getPresentationRecipe,
} from '../src/presentation/cueRecipes.js';
import {
  PRIORITY_DUCK_DB,
  PRIORITY_DUCK_DURATION_MS,
  PRIORITY_DUCK_TARGETS,
  PRIORITY_DUCK_THRESHOLD,
  PRIORITY_DUCK_UNAFFECTED_TARGETS,
  createCuePriorityBus,
  dbToGain,
  duckGainForTarget,
  isPriorityCue,
  isPriorityDuckTarget,
  priorityDuckEnvelopeForCue,
} from '../src/audio/cuePriorityBus.js';

assert.equal(PRIORITY_DUCK_THRESHOLD, 0.8, 'priority threshold must match AUD-01');
assert.equal(PRIORITY_DUCK_DURATION_MS, 250, 'priority duck should last about 250 ms');
assert.deepEqual(PRIORITY_DUCK_TARGETS, ['weaponLoop', 'engineLoop'], 'only weapon/engine loop roles may duck');
assert(PRIORITY_DUCK_UNAFFECTED_TARGETS.includes('music'), 'music/global ducking must remain owned by _duckMusic');
assert(dbToGain(PRIORITY_DUCK_DB) > 0 && dbToGain(PRIORITY_DUCK_DB) < 1, 'fixed dB duck must attenuate');

assert(CRITICAL_SLICE_EVENT_IDS.includes('shield.collapse'), 'shield collapse must remain a critical slice cue');
assert.equal(
  PRESENTATION_AUDIO_CUE_BY_ID['shield.collapse'],
  'presentation.shield.collapse',
  'shield collapse must route through the shipped SG-08 audio adapter id',
);
const shieldRecipe = getPresentationRecipe('shield.collapse');
assert(shieldRecipe && shieldRecipe.importance >= PRIORITY_DUCK_THRESHOLD,
  'shipped shield collapse recipe must qualify for priority ducking');

assert.equal(isPriorityCue({ importance: 0.79 }), false, 'below-threshold cue must not duck');
assert.equal(isPriorityCue({ importance: 0.8 }), true, 'threshold cue must duck');

const ignored = priorityDuckEnvelopeForCue({ id: 'ui.hover', importance: 0.79 }, 500);
assert.equal(ignored, null, 'low-importance cues should not create an envelope');

const envelope = priorityDuckEnvelopeForCue({
  id: 'shield.collapse',
  audioId: 'presentation.shield.collapse',
  importance: shieldRecipe.importance,
  playerRelevance: 1,
}, 1000);
assert(envelope, 'shield collapse should create a priority envelope');
assert.equal(envelope.startMs, 1000);
assert.equal(envelope.endMs, 1250);
assert.equal(envelope.durationMs, 250);
assert.deepEqual(envelope.targets, ['weaponLoop', 'engineLoop']);

assert.equal(isPriorityDuckTarget({ role: 'weaponLoop', loop: true }), true);
assert.equal(isPriorityDuckTarget({ role: 'engineLoop', loop: true }), true);
assert.equal(isPriorityDuckTarget({ busName: 'combat', category: 'weapon', loop: true, recipeId: 'sfx_wpn_beam_laser' }), true);
assert.equal(isPriorityDuckTarget({ busName: 'engine', category: 'engine', loop: true }), true);
assert.equal(isPriorityDuckTarget({ busName: 'combat', category: 'weapon', loop: false }), false,
  'one-shot combat cues must not be ducked as if they were weapon loops');
assert.equal(isPriorityDuckTarget({ role: 'critical', critical: true, busName: 'combat' }), false,
  'critical cue itself must never be ducked');
assert.equal(isPriorityDuckTarget('combat'), false, 'whole combat bus must not be a duck target');
assert.equal(isPriorityDuckTarget('music'), false, 'music must not be a duck target here');

const bus = createCuePriorityBus();
const applied = bus.applyCue({
  id: 'shield.collapse',
  audioId: 'presentation.shield.collapse',
  importance: shieldRecipe.importance,
  playerRelevance: 1,
}, 1000);
assert(applied, 'priority bus should accept the critical cue');
assert.equal(bus.gainFor({ role: 'weaponLoop', loop: true }, 1100), applied.duckGain);
assert.equal(bus.gainFor({ role: 'engineLoop', loop: true }, 1100), applied.duckGain);
assert.equal(bus.gainFor({ busName: 'combat', category: 'weapon', loop: true, recipeId: 'sfx_wpn_beam_laser' }, 1100), applied.duckGain);
assert.equal(bus.gainFor({ busName: 'engine', category: 'engine', loop: true }, 1100), applied.duckGain);
assert.equal(bus.gainFor({ role: 'critical', critical: true, busName: 'combat' }, 1100), 1);
assert.equal(bus.gainFor('combat', 1100), 1);
assert.equal(bus.gainFor('music', 1100), 1);
assert.equal(bus.gainFor('sfx', 1100), 1);
assert.equal(bus.gainFor('ui', 1100), 1);
assert.equal(bus.gainFor('ambient', 1100), 1);
assert.equal(bus.gainFor('comms', 1100), 1);
assert.equal(bus.gainFor({ role: 'weaponLoop', loop: true }, 1251), 1, 'duck must recover after the envelope');

const snapshot = bus.mixSnapshot(1100);
assert.equal(snapshot.weaponLoop, applied.duckGain);
assert.equal(snapshot.engineLoop, applied.duckGain);
assert.equal(snapshot.criticalCue, 1);
assert.equal(snapshot.combat, 1);
assert.equal(snapshot.music, 1);
assert.equal(snapshot.sfx, 1);
assert.equal(snapshot.ui, 1);
assert.equal(snapshot.ambient, 1);
assert.equal(snapshot.comms, 1);
assert.equal(snapshot.master, 1);

const exactThresholdBus = createCuePriorityBus();
assert(exactThresholdBus.applyCue({ id: 'threshold.test', importance: 0.8 }, 0),
  'exactly-threshold cues should create a duck envelope');
const lowBus = createCuePriorityBus();
assert.equal(lowBus.applyCue({ id: 'low.test', importance: 0.7999 }, 0), null);
assert.equal(lowBus.gainFor({ role: 'weaponLoop', loop: true }, 10), 1,
  'below-threshold cues should leave loop gains alone');

assert.equal(duckGainForTarget({ role: 'weaponLoop', loop: true }, envelope, 999), 1);
assert.equal(duckGainForTarget({ role: 'weaponLoop', loop: true }, envelope, 1000), envelope.duckGain);
assert.equal(duckGainForTarget({ role: 'weaponLoop', loop: true }, envelope, 1249), envelope.duckGain);
assert.equal(duckGainForTarget({ role: 'weaponLoop', loop: true }, envelope, 1250), 1);

const source = readFileSync(new URL('../src/audio/cuePriorityBus.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'priority bus must remain deterministic and DOM/WebAudio-free');
assert.doesNotMatch(source, /audioSystem|presentationAdapters|cueSchema/,
  'priority bus should not import or couple to no-touch runtime modules');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['check:cue-priority-bus'], 'node scripts/check-cue-priority-bus.mjs',
  'package.json must expose the AUD-01 check');

console.log(JSON.stringify({
  schema: 'spaceface.cuePriorityBusCheck.v1',
  ok: true,
  threshold: PRIORITY_DUCK_THRESHOLD,
  durationMs: PRIORITY_DUCK_DURATION_MS,
  duckDb: PRIORITY_DUCK_DB,
  duckGain: applied.duckGain,
  shieldImportance: shieldRecipe.importance,
  targets: PRIORITY_DUCK_TARGETS,
  unaffected: PRIORITY_DUCK_UNAFFECTED_TARGETS,
}, null, 2));
