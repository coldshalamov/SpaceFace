import assert from 'node:assert/strict';

import { RECIPES, MUSIC_STEMS } from '../src/data/audioRecipes.js';
import { CRITICAL_SLICE_EVENT_IDS } from '../src/presentation/cueSchema.js';
import { PRESENTATION_RECIPES, getPresentationRecipe } from '../src/presentation/cueRecipes.js';
import { createBus } from '../src/core/eventBus.js';
import {
  PRESENTATION_AUDIO_CUE_BY_ID,
  presentationAdapters,
} from '../src/systems/presentationAdapters.js';
import {
  AUDIO_RECIPE_BY_ID,
  MAX_AUDIO_VOICES,
  audioRecipeBasePeak,
  resolveAudioCueRecipeId,
} from '../src/audio/audioSystem.js';
import { applyEnvelope } from '../src/audio/synth.js';

const SAMPLE_RATE_HZ = 120;
const MASTER_GAIN = linearGain(0.55);
const SFX_BUS_GAIN = linearGain(0.7);
const MUSIC_BUS_GAIN = linearGain(0.6);
const MASTER_HEADROOM_LIMIT = 0.72;
const CRITICAL_MIN_MASTER_PEAK = 0.012;
const CRITICAL_MIN_MIX_SHARE = 0.18;

const WORST_COMBAT_TIMELINE = Object.freeze([
  { t: 0.00, cueId: 'tether.attach' },
  { t: 0.10, cueId: 'shield.collapse' },
  { t: 0.18, cueId: 'subsystem.disabled' },
  { t: 0.28, cueId: 'tether.near_break' },
  { t: 0.36, cueId: 'tether.break' },
  { t: 0.48, cueId: 'scenario.objective.priority_split' },
]);

const COMBAT_BED = Object.freeze([
  { t: 0.04, recipeId: 'sfx_wpn_pulse_laser', gain: 0.85, label: 'player pulse' },
  { t: 0.12, recipeId: 'sfx_mining_impact', gain: 0.6, label: 'shield hit' },
  { t: 0.20, recipeId: 'sfx_wpn_autocannon', gain: 0.85, label: 'scavenger autocannon' },
  { t: 0.30, recipeId: 'sfx_mining_impact', gain: 0.6, label: 'hull hit' },
  { t: 0.42, recipeId: 'sfx_wpn_pulse_laser', gain: 0.85, label: 'escort pulse' },
]);

assert.equal(RECIPES.length, Object.keys(AUDIO_RECIPE_BY_ID).length, 'audio recipe lookup should cover every authored recipe');

for (const [cueId, recipe] of Object.entries(PRESENTATION_RECIPES)) {
  assert(PRESENTATION_AUDIO_CUE_BY_ID[cueId], `${cueId} must map to a semantic audio cue`);
  const audioCueId = PRESENTATION_AUDIO_CUE_BY_ID[cueId];
  const recipeId = resolveAudioCueRecipeId(audioCueId);
  assert(AUDIO_RECIPE_BY_ID[recipeId], `${cueId} semantic audio cue must resolve to a concrete recipe`);
  assert(Number.isFinite(recipe.budgets.voices), `${cueId} must declare an SG-08 voice budget`);
}

for (const cueId of CRITICAL_SLICE_EVENT_IDS) {
  assert(WORST_COMBAT_TIMELINE.some((entry) => entry.cueId === cueId), `${cueId} must appear in the worst-combat mix profile`);
}

assertOneShotEnvelopeIsFinite('sfx_ui_alert');
assertOneShotEnvelopeIsFinite('sfx_jump_charge');
assert.equal(
  applyEnvelope(fakeAudioParam(), 0, 0.1, AUDIO_RECIPE_BY_ID.sfx_wpn_beam_laser.gainEnvelope, true).stopAt,
  Infinity,
  'held loop voices should still stay held until explicitly released',
);

const voices = collectPresentationVoices();
for (const bed of COMBAT_BED) voices.push(makeVoice({
  source: 'combat-bed',
  cueId: bed.label,
  semanticId: bed.recipeId,
  recipeId: bed.recipeId,
  gain: bed.gain,
  start: bed.t,
  duck: false,
}));

for (const entry of WORST_COMBAT_TIMELINE) {
  const recipe = getPresentationRecipe(entry.cueId);
  const eventVoices = voices.filter((voice) => voice.cueId === entry.cueId && nearlyEqual(voice.start, entry.t));
  assert(eventVoices.length > 0, `${entry.cueId} must emit audible mix voices`);
  assert(
    eventVoices.length <= recipe.budgets.voices,
    `${entry.cueId} emits ${eventVoices.length} audible voices but budgets ${recipe.budgets.voices}`,
  );
  if (recipe.importance >= 0.85) {
    assert(
      eventVoices.some((voice) => voice.duck),
      `${entry.cueId} is high-importance and must duck music`,
    );
  }
}

const profile = sampleMix(voices);
assert(
  profile.maxMasterPeak <= MASTER_HEADROOM_LIMIT,
  `worst-combat mix peak ${profile.maxMasterPeak.toFixed(4)} exceeds ${MASTER_HEADROOM_LIMIT}`,
);
assert(
  profile.maxActiveVoices <= MAX_AUDIO_VOICES,
  `worst-combat mix uses ${profile.maxActiveVoices} voices, cap is ${MAX_AUDIO_VOICES}`,
);

const masking = [];
for (const entry of WORST_COMBAT_TIMELINE.filter((item) => CRITICAL_SLICE_EVENT_IDS.includes(item.cueId))) {
  const result = measureCriticalCueShare(voices, entry);
  masking.push(result);
  assert(
    result.peakMaster >= CRITICAL_MIN_MASTER_PEAK,
    `${entry.cueId} peak ${result.peakMaster.toFixed(4)} is below the critical audibility floor`,
  );
  assert(
    result.bestShare >= CRITICAL_MIN_MIX_SHARE,
    `${entry.cueId} mix share ${result.bestShare.toFixed(3)} indicates masking in worst combat`,
  );
}

console.log(JSON.stringify({
  schema: 'spaceface.sg08MixProfile.v1',
  ok: true,
  profile,
  criticalMasking: masking,
  voices: voices.map((voice) => ({
    source: voice.source,
    cueId: voice.cueId,
    recipeId: voice.recipeId,
    start: round4(voice.start),
    peak: round4(voice.peak),
    stopAt: round4(voice.stopAt),
    duck: voice.duck,
  })),
}, null, 2));

function collectPresentationVoices() {
  const output = [];
  const bus = createBus();
  let currentTime = 0;
  const state = {
    playerId: 1,
    tick: 0,
    simTime: 0,
    settings: {
      video: { motionReduce: false },
      accessibility: { flashReduce: false, highContrast: false },
    },
    entities: new Map([
      [1, { id: 1, pos: { x: 0, y: 0, z: 0 } }],
      [2, { id: 2, pos: { x: 92, y: 0, z: 0 } }],
      [3, { id: 3, pos: { x: -44, y: 0, z: 18 } }],
    ]),
  };

  bus.on('audio:cue', (payload) => {
    output.push(makeVoice({
      source: 'presentation-audio',
      cueId: payload.cueId,
      semanticId: payload.id,
      gain: payload.gain == null ? 0.8 : payload.gain,
      start: currentTime,
      duck: !!payload.duck,
    }));
  });
  bus.on('alert', (payload) => {
    output.push(makeVoice({
      source: 'presentation-alert',
      cueId: payload.cueId,
      semanticId: 'alert',
      gain: 0.8,
      start: currentTime,
      duck: false,
    }));
  });

  presentationAdapters.init({ state, bus });
  for (const entry of WORST_COMBAT_TIMELINE) {
    currentTime = entry.t;
    state.tick = Math.round(entry.t * 60);
    state.simTime = entry.t;
    bus.emit('presentation:cue', cuePayload(entry.cueId, entry.t));
    bus.flush();
  }
  presentationAdapters.dispose();
  return output;
}

function cuePayload(cueId, timeS) {
  const recipe = getPresentationRecipe(cueId);
  assert(recipe, `${cueId} must resolve to a presentation recipe`);
  return {
    id: cueId,
    importance: recipe.importance,
    playerRelevance: CRITICAL_SLICE_EVENT_IDS.includes(cueId) ? 1 : 0.82,
    sourceId: 1,
    targetId: cueId === 'shield.collapse' || cueId === 'subsystem.disabled' ? 3 : 2,
    sourceEvent: `sg08.mix.${cueId}`,
    material: recipe.material,
    lanes: { ...recipe.lanes },
    budgets: { ...recipe.budgets },
    tags: [...recipe.tags],
    simTimeMs: Math.round(timeS * 1000),
    presentationTimeMs: Math.round(timeS * 1000),
    position: cueId === 'shield.collapse' || cueId === 'subsystem.disabled'
      ? { x: -44, y: 0, z: 18 }
      : { x: 92, y: 0, z: 0 },
    direction: cueId === 'shield.collapse' || cueId === 'subsystem.disabled'
      ? { x: -0.9255, z: 0.3788 }
      : { x: 1, z: 0 },
    distance: cueId === 'shield.collapse' || cueId === 'subsystem.disabled' ? 47.54 : 92,
    magnitude: 1,
  };
}

function makeVoice({ source, cueId, semanticId, recipeId, gain, start, duck }) {
  const resolvedRecipeId = recipeId || resolveAudioCueRecipeId(semanticId);
  const recipe = AUDIO_RECIPE_BY_ID[resolvedRecipeId];
  assert(recipe, `${semanticId || resolvedRecipeId} should resolve to a recipe`);
  const peak = Math.min(1, audioRecipeBasePeak(recipe) * finite(gain, 1));
  const envelope = predictEnvelope(recipe, peak);
  const startTime = finite(start, 0);
  return {
    source,
    cueId,
    semanticId,
    recipeId: resolvedRecipeId,
    recipe,
    gain: finite(gain, 1),
    start: startTime,
    peak,
    duck: !!duck,
    ...envelope,
    stopAt: startTime + envelope.stopAfter,
  };
}

function sampleMix(voiceList) {
  const end = Math.max(...voiceList.map((voice) => voice.stopAt)) + 0.25;
  let maxMasterPeak = 0;
  let maxSfxPreBus = 0;
  let maxActiveVoices = 0;
  let maxAt = 0;
  for (let t = 0; t <= end; t += 1 / SAMPLE_RATE_HZ) {
    const snapshot = mixAt(voiceList, t);
    if (snapshot.masterPeak > maxMasterPeak) {
      maxMasterPeak = snapshot.masterPeak;
      maxSfxPreBus = snapshot.sfxPreBus;
      maxActiveVoices = snapshot.activeVoices;
      maxAt = t;
    }
    maxActiveVoices = Math.max(maxActiveVoices, snapshot.activeVoices);
  }
  return {
    maxMasterPeak: round4(maxMasterPeak),
    maxSfxPreBus: round4(maxSfxPreBus),
    maxActiveVoices,
    maxAt: round4(maxAt),
    headroomDb: round2(db(1 / Math.max(0.0001, maxMasterPeak))),
    combatMusicRawPeak: round4(combatMusicRawPeak()),
    duckWindows: duckWindows(voiceList),
  };
}

function measureCriticalCueShare(voiceList, entry) {
  let bestShare = 0;
  let peakMaster = 0;
  let bestAt = entry.t;
  for (let t = entry.t; t <= entry.t + 0.18; t += 1 / SAMPLE_RATE_HZ) {
    const directPreBus = voiceList
      .filter((voice) => voice.cueId === entry.cueId && nearlyEqual(voice.start, entry.t))
      .reduce((sum, voice) => sum + voiceAmpAt(voice, t), 0);
    const snapshot = mixAt(voiceList, t);
    const directMaster = directPreBus * SFX_BUS_GAIN * MASTER_GAIN;
    const share = snapshot.masterPeak > 0 ? directMaster / snapshot.masterPeak : 0;
    if (share > bestShare) {
      bestShare = share;
      peakMaster = directMaster;
      bestAt = t;
    }
  }
  return {
    cueId: entry.cueId,
    bestAt: round4(bestAt),
    bestShare: round4(bestShare),
    peakMaster: round4(peakMaster),
  };
}

function mixAt(voiceList, t) {
  const sfxPreBus = voiceList.reduce((sum, voice) => sum + voiceAmpAt(voice, t), 0);
  const activeVoices = voiceList.reduce((count, voice) => count + (voiceAmpAt(voice, t) > 0.0002 ? 1 : 0), 0);
  const musicPreBus = combatMusicRawPeak() * duckFactorAt(voiceList, t);
  return {
    sfxPreBus,
    musicPreBus,
    activeVoices,
    masterPeak: (sfxPreBus * SFX_BUS_GAIN + musicPreBus * MUSIC_BUS_GAIN) * MASTER_GAIN,
  };
}

function voiceAmpAt(voice, t) {
  const dt = t - voice.start;
  if (dt < 0 || t > voice.stopAt) return 0;
  const { attack, decayEnd, release, peak, decayTo } = voice;
  if (dt <= attack) return lerp(0.0001, peak, dt / attack);
  if (dt <= decayEnd) return lerp(peak, decayTo, (dt - attack) / (decayEnd - attack));
  const relT = Math.min(1, Math.max(0, (dt - decayEnd) / release));
  return Math.max(0.0001, decayTo * Math.pow(0.0001 / Math.max(0.0001, decayTo), relT));
}

function predictEnvelope(recipe, peak) {
  const env = recipe.gainEnvelope || {};
  const attack = Math.max(0.001, finite(env.attack, 0.005));
  const sustain = finite(env.sustain, 0);
  const release = Math.max(0.01, finite(env.release, 0.05));
  const decayEnd = attack + 0.04;
  const decayTo = Math.max(0.0001, peak * (sustain > 0 ? sustain : 0.0001));
  return {
    attack,
    decayEnd,
    release,
    decayTo,
    stopAfter: attack + 0.04 + release + 0.02,
  };
}

function assertOneShotEnvelopeIsFinite(recipeId) {
  const recipe = AUDIO_RECIPE_BY_ID[recipeId];
  assert(recipe, `${recipeId} should exist`);
  const tail = applyEnvelope(fakeAudioParam(), 0, 0.1, recipe.gainEnvelope || {}, false);
  assert(Number.isFinite(tail.stopAt), `${recipeId} one-shot envelope must stop without voice-cap eviction`);
}

function fakeAudioParam() {
  return {
    value: 0.0001,
    cancelScheduledValues() {},
    setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime(value) { this.value = value; },
    exponentialRampToValueAtTime(value) { this.value = value; },
  };
}

function combatMusicRawPeak() {
  const combat = MUSIC_STEMS.find((stem) => stem.label === 'Combat') || MUSIC_STEMS[2];
  const sum = (combat.layers || []).reduce((total, layer) => total + finite(layer.gainBase, 0), 0);
  return Math.min(0.55, sum * 0.18);
}

function duckFactorAt(voiceList, t) {
  return voiceList.some((voice) => voice.duck && t >= voice.start && t <= voice.start + 0.8) ? 0.5 : 1;
}

function duckWindows(voiceList) {
  return voiceList
    .filter((voice) => voice.duck)
    .map((voice) => ({ cueId: voice.cueId, start: round4(voice.start), end: round4(voice.start + 0.8) }));
}

function linearGain(value) {
  const clamped = Math.max(0, Math.min(1, finite(value, 0)));
  return clamped * clamped;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function round4(value) {
  return Math.round(finite(value, 0) * 10000) / 10000;
}

function round2(value) {
  return Math.round(finite(value, 0) * 100) / 100;
}

function db(value) {
  return 20 * Math.log10(Math.max(0.0001, value));
}

function nearlyEqual(a, b) {
  return Math.abs(a - b) < 1e-9;
}
