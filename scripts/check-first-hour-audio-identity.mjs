/**
 * First-hour audio identity harness + default-route evidence trace.
 * Exercises undock → thrust → one action (scan pulse) → redock on a mock Web Audio graph.
 * Truthful only: records what the live audioSystem actually schedules / ensures.
 * Writes evidence to .devshots/audio/first-hour-audio-trace.json
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUDIO_RECIPE_BY_ID,
  FIRST_HOUR_AUDIO_SIGNATURES,
  audio,
  resolveAudioCueRecipeId,
  resolveFirstHourAudioSignature,
} from '../src/audio/audioSystem.js';
import { createCuePriorityBus, PRIORITY_DUCK_THRESHOLD, dbToGain, PRIORITY_DUCK_DB } from '../src/audio/cuePriorityBus.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../.devshots/audio');
const outFile = path.join(outDir, 'first-hour-audio-trace.json');

class MockAudioParam {
  constructor(initialVal = 1) {
    this.value = initialVal;
    this.timeline = [];
  }
  setValueAtTime(val, t) { this.timeline.push({ type: 'set', val, t }); this.value = val; }
  linearRampToValueAtTime(val, t) { this.timeline.push({ type: 'linear', val, t }); this.value = val; }
  exponentialRampToValueAtTime(val, t) { this.timeline.push({ type: 'exponential', val, t }); this.value = val; }
  setTargetAtTime(val, t, tc) { this.timeline.push({ type: 'target', val, t, tc }); this.value = val; }
  cancelScheduledValues(t) { this.timeline = this.timeline.filter((e) => e.t < t); }
}

class MockGainNode {
  constructor(g = 1) { this.gain = new MockAudioParam(g); }
  connect() {}
  disconnect() {}
}

class MockOscillatorNode {
  constructor() {
    this.frequency = new MockAudioParam(440);
    this.detune = new MockAudioParam(0);
    this.type = 'sine';
    this._started = false;
  }
  connect() {}
  disconnect() {}
  start() { this._started = true; }
  stop() {}
}

class MockBiquadFilterNode {
  constructor() {
    this.frequency = new MockAudioParam(1000);
    this.Q = new MockAudioParam(1);
    this.type = 'lowpass';
  }
  connect() {}
  disconnect() {}
}

class MockBufferSource {
  constructor() {
    this.buffer = null;
    this.loop = false;
    this.playbackRate = new MockAudioParam(1);
  }
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
  }
  createBuffer(channels, length, sampleRate) {
    return {
      length, sampleRate, numberOfChannels: channels,
      getChannelData() { return new Float32Array(length); },
    };
  }
  createGain() { return new MockGainNode(); }
  createOscillator() { return new MockOscillatorNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createBufferSource() { return new MockBufferSource(); }
  createDynamicsCompressor() {
    return {
      threshold: new MockAudioParam(-6),
      knee: new MockAudioParam(6),
      ratio: new MockAudioParam(12),
      attack: new MockAudioParam(0.003),
      release: new MockAudioParam(0.25),
    };
  }
  createStereoPanner() {
    return { pan: new MockAudioParam(0), connect() {}, disconnect() {} };
  }
  createWaveShaper() {
    return { curve: null, oversample: 'none', connect() {}, disconnect() {} };
  }
  resume() { this.state = 'running'; }
}

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  AudioContext: MockAudioContext,
  webkitAudioContext: MockAudioContext,
};
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 0;

const played = [];
const events = [];
const originalPlay = audio.play.bind(audio);

function installTrace() {
  audio.play = function tracedPlay(recipeId, opts) {
    const v = originalPlay(recipeId, opts);
    played.push({
      t: audio.rt && audio.rt.ctx ? audio.rt.ctx.currentTime : 0,
      recipeId,
      gain: opts && opts.gain,
      critical: !!(opts && opts.critical),
      resolved: !!AUDIO_RECIPE_BY_ID[recipeId],
      voiceStarted: !!v,
      // Honest evidence: blocked under squelch still appears as a play() attempt.
      blocked: !v,
    });
    return v;
  };
}

function makeState() {
  return {
    playerId: 'player',
    tick: 100,
    simTime: 10,
    entities: new Map([
      ['player', {
        id: 'player',
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
        flags: { boosting: false, docked: true },
        derived: { mass: 90 },
        team: 0,
        alive: true,
        type: 'ship',
      }],
      ['target', {
        id: 'target', pos: { x: 120, z: 20 }, vel: { x: 0, z: 0 }, flags: {},
        team: 1, alive: true, type: 'ship', radius: 8,
        data: { onboardingTraining: true, trainingFocusEligible: true },
      }],
      ['npc-victim', {
        id: 'npc-victim', pos: { x: 180, z: -30 }, vel: { x: 0, z: 0 }, flags: {},
        team: 1, alive: true, type: 'ship',
      }],
    ]),
    player: {
      cruise: { phase: 'idle' },
      tether: { active: false, strain: 0 },
      credits: 1000,
    },
    input: { moveX: 0, moveZ: 0, brake: false, actions: { brake: false } },
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime',
          name: 'Helios Prime',
          palette: SECTOR_PALETTE_CLASSES.core,
        },
      },
    },
    settings: {
      audio: { muted: false, master: 0.55, sfx: 0.7, music: 0.32, engine: 0.7, ambient: 0.7, combat: 0.7, ui: 0.7, comms: 0.7 },
      video: { motionReduce: false },
      accessibility: {},
    },
    ui: { docked: true },
    mode: 'flight',
  };
}

// ---- boot audio with mock context ----
const state = makeState();
const busHandlers = new Map();
const bus = {
  on(evt, fn) {
    if (!busHandlers.has(evt)) busHandlers.set(evt, []);
    busHandlers.get(evt).push(fn);
    return () => {};
  },
  emit(evt, payload) {
    events.push({ evt, payload: payload || null });
    for (const fn of busHandlers.get(evt) || []) fn(payload);
  },
  queue(evt, payload) { this.emit(evt, payload); },
};

// Match the live path through combat attachments and tetherGameplay. Only the external physics
// port is replaced; the attachment service still owns creation and emits tether:attached itself.
const helpers = {
  combatPhysics: {
    createAttachment(spec) { return { id: spec.attachmentId }; },
  },
};
const combatKernel = createCombatKernel({ state, bus, helpers });
const registry = {
  get(name) { return name === 'combat' ? { kernel: combatKernel } : null; },
};
tetherGameplay.init({ state, bus, helpers, registry });
// Match registry order: normalized presentation owns semantic one-shots before audio consumes them.
presentationOrchestrator.init({ state, bus });
presentationAdapters.init({ state, bus });
audio.init({ state, bus, helpers });
// Force context (gesture path)
const ctx = new MockAudioContext();
audio.rt.ctx = ctx;
audio.rt.masterGain = ctx.createGain();
audio.rt.limiter = ctx.createDynamicsCompressor();
audio.rt.sfxBus = ctx.createGain();
audio.rt.musicBus = ctx.createGain();
audio.rt.engineBus = ctx.createGain();
audio.rt.ambientBus = ctx.createGain();
audio.rt.combatBus = ctx.createGain();
audio.rt.uiBus = ctx.createGain();
audio.rt.commsBus = ctx.createGain();
audio.rt._caches = {};
audio.rt.voices = [];
audio.rt.loops = {};
audio.rt.sidechainDuck = 1;
audio.rt._priorityBus = createCuePriorityBus();
audio.rt._priorityEngineProbe = { role: 'engineLoop', loop: true };
audio.rt._priorityWeaponProbe = { role: 'weaponLoop', loop: true };
audio.rt._priorityDuckEngine = 1;
audio.rt._priorityDuckWeapon = 1;
audio.rt._signatureLastAt = Object.create(null);
audio.rt.musicState = 'calm';
audio.rt.threat = 0;
audio.rt._engineTelemetry = {
  tier: 'idle', f1: 55, f2: 55, noiseG: 0, humG: 0, massNorm: 1, duck: 1,
};
audio.rt._docked = true;
audio.rt._paused = false;
audio.rt._musicStarted = false;
audio._applySettings();
installTrace();
audio._ensureContinuousSources();

assert(audio.rt.engineOsc1, 'engine continuous source must start');
assert(audio.rt.brakeGain, 'brake continuous source must start');
assert(audio.rt.tetherOsc, 'tether continuous source must start');
assert.equal(audio.rt.heliosTrafficBed, undefined, 'Helios must not allocate a continuous traffic oscillator bed');

const trace = {
  schema: 'spaceface.firstHourAudioTrace.v1',
  generatedAt: new Date().toISOString(),
  sector: 'sector_helios_prime',
  steps: [],
  assertions: [],
  playedRecipes: null,
  note: 'Headless mock Web Audio — records recipe schedule intent, not real DAC output.',
};

function step(name, fn) {
  const before = played.length;
  fn();
  const slice = played.slice(before);
  const tel = audio.rt._engineTelemetry || null;
  trace.steps.push({
    name,
    played: slice.filter((p) => p.voiceStarted).map((p) => p.recipeId),
    blocked: slice.filter((p) => p.blocked).map((p) => p.recipeId),
    attempts: slice.map((p) => ({ recipeId: p.recipeId, voiceStarted: p.voiceStarted })),
    engineTelemetry: tel ? { ...tel } : null,
    docked: !!audio.rt._docked,
    priorityDuckEngine: audio.rt._priorityDuckEngine,
  });
  return slice;
}

// 1) UNDOCK
step('undock', () => {
  state.ui.docked = false;
  state.entities.get('player').flags.docked = false;
  bus.emit('dock:undocked', {});
});
assert(
  trace.steps[0].played.includes('sfx_undock_release'),
  'undock must audibly schedule sfx_undock_release',
);

// 2) THRUST (idle → thrust + accel transition)
step('thrust', () => {
  state.input.moveZ = 1;
  audio._updateEngineHum();
  // second frame to allow tier change detection if needed
  audio._updateEngineHum();
});
assert.equal(audio.rt._engineTelemetry.tier, 'thrust', 'thrust input must resolve thrust tier');
assert.equal(audio.rt._engineTelemetry.f1, 78, 'thrust base freq must be 78 Hz');
assert(
  trace.steps[1].played.includes('sfx_accel_transition'),
  'idle→thrust must audibly schedule accel transition motif',
);

// 3) ONE ACTION — Focus/scan pulse (existing seam)
step('scan_pulse', () => {
  bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
});
assert(
  trace.steps[2].played.includes('sfx_mining_scan_pulse'),
  'scan:pulse must audibly schedule the normalized mining scanner motif',
);

function clearPriority() {
  audio.rt._criticalSquelchUntilMs = 0;
  audio.rt._priorityBus.clear();
  audio._updatePriorityDuckGains();
}

// 4) MASSLINE LATCH — drive the shipped tetherGameplay -> attachment-service path.
step('massline_latch', () => {
  clearPriority();
  ctx.currentTime = 0.5;
  state.tick += 20;
  state.player.flybyFocus = { active: true, targetId: 'target', latchScale: 2.4 };
  state.input.actions.tetherFire = true;
  tetherGameplay.update(1 / 60, state);
  state.input.actions.tetherFire = false;
});
assert.deepEqual(
  trace.steps.find((s) => s.name === 'massline_latch').played,
  ['sfx.tetherLatch'],
  'one real latch must schedule exactly the authored mechanical signature, never legacy ui_confirm',
);

// 5) STRAIN — real near-break events may arrive every dedupe window; audio caps the warning cadence.
step('massline_strain_fatigue_guard', () => {
  clearPriority();
  const before = played.filter((p) => p.recipeId === 'sfx_tether_strain_creak' && p.voiceStarted).length;
  ctx.currentTime = 1.0;
  state.tick += 20;
  bus.emit('tether:nearBreak', { actorId: 'player', targetId: 'target', tension: 0.84 });
  ctx.currentTime = 1.2;
  state.tick += 20;
  bus.emit('tether:nearBreak', { actorId: 'player', targetId: 'target', tension: 0.88 });
  ctx.currentTime = 1.8;
  state.tick += 40;
  bus.emit('tether:nearBreak', { actorId: 'player', targetId: 'target', tension: 0.94 });
  const after = played.filter((p) => p.recipeId === 'sfx_tether_strain_creak' && p.voiceStarted).length;
  assert.equal(after - before, 2, 'three rapid near-break events must schedule only two fatigue-safe warnings');
  const blockedWeapon = audio.play('sfx_wpn_pulse_laser', { gain: 0.9 });
  assert.equal(blockedWeapon, null, 'near-break warning must own the combat mix during its priority window');
  audio._updatePriorityDuckGains();
  assert(audio.rt._priorityDuckEngine < 1, 'near-break warning must duck the continuous engine layer');
  trace.masslineStrain = { emitted: 3, audible: after - before, cooldownS: FIRST_HOUR_AUDIO_SIGNATURES.masslineStrain.cooldownS };
});

// 6) MASSLINE BREAK — wide mechanical crack/twang, priority-safe under its own squelch.
step('massline_break', () => {
  clearPriority();
  ctx.currentTime = 2.2;
  state.tick += 30;
  bus.emit('tether:broken', { actorId: 'player', targetId: 'target', tension: 1.05, pos: { x: 120, z: 20 } });
});
assert(
  trace.steps.find((s) => s.name === 'massline_break').played.includes('sfx.tetherSnap'),
  'tether:broken must audibly schedule the mechanical snap',
);

// 7) SHIELD BREAK — canonical raw event owns one crystalline high-register voice.
step('shield_break', () => {
  clearPriority();
  ctx.currentTime = 2.6;
  bus.emit('shieldDown', { combatantId: 'player', pos: { x: 0, z: 0 } });
});
assert(
  trace.steps.find((s) => s.name === 'shield_break').played.includes('sfx.shieldBreak'),
  'shieldDown must audibly schedule the crystalline shield collapse',
);

// 8) KILL ROUTING — physical NPC death stays audible; the rising reward belongs only to player kills.
step('kill_ownership', () => {
  clearPriority();
  ctx.currentTime = 3.0;
  bus.emit('entity:killed', {
    id: 'npc-victim', killerId: 'ally', type: 'ship', victimClass: 'fighter', pos: { x: 180, z: -30 },
  });
  clearPriority();
  ctx.currentTime = 3.4;
  state.tick += 30;
  bus.emit('entity:killed', {
    id: 'target', killerId: 'player', type: 'ship', victimClass: 'fighter', pos: { x: 120, z: 20 },
  });
});
const killStep = trace.steps.find((s) => s.name === 'kill_ownership');
assert(killStep.played.includes('sfx.killSmall'), 'NPC-vs-NPC kill must retain a physical crump');
assert.equal(
  killStep.played.filter((id) => id === 'sfx.killConfirmed').length,
  1,
  'exactly the player-caused kill must receive the rising confirmation layer',
);
for (const stepName of ['massline_latch', 'massline_strain_fatigue_guard', 'massline_break', 'kill_ownership']) {
  assert(
    !trace.steps.find((s) => s.name === stepName).played.includes('sfx_ui_alert'),
    `${stepName} must not stack a generic alert beep over its authored signature`,
  );
}

// 9) IDLE SILENCE — no unearned low-frequency floor between player actions.
step('idle_silence', () => {
  clearPriority();
  state.ui.docked = false;
  state.entities.get('player').flags.docked = false;
  audio.rt._docked = false;
  state.input.moveZ = 0;
  state.entities.get('player').flags.boosting = false;
  state.player.cruise = { phase: 'idle' };
  audio._updateEngineHum();
  assert.equal(audio.rt._engineTelemetry.tier, 'idle');
  assert.equal(audio.rt._engineTelemetry.humG, 0, 'idle propulsion must not emit the 55 Hz startup buzz');
  assert.equal(audio.rt.engineHumGain.gain.value, 0, 'idle engine output must land on hard silence');
  assert.equal(audio.rt.heliosTrafficBed, undefined, 'Helios must not replace idle silence with a traffic bed');
});

// 10) Story comms use the real popup seam and must own the mix.
step('story_comms_priority', () => {
  clearPriority();
  bus.emit('comms:popup', {
    category: 'story',
    text: 'Recover the sample.',
  });
  // weapon / ui noise during critical window must be dropped (null voice)
  const blockedWeapon = audio.play('sfx_wpn_pulse_laser', { gain: 0.9 });
  const blockedUi = audio.play('sfx_ui_click', { gain: 0.9 });
  const storySquelch = played.some((p) => p.recipeId === 'sfx_squelch_story' && p.voiceStarted);
  assert(storySquelch, 'story popup must schedule the story squelch');
  assert.equal(blockedWeapon, null, 'weapon one-shot must squelch under critical window');
  assert.equal(blockedUi, null, 'UI click must squelch under critical window');
  assert(audio._isCriticalSquelchActive(), 'critical squelch window must be active');
  audio._updatePriorityDuckGains();
  assert(
    audio.rt._priorityDuckEngine < 1,
    'engine loop duck gain must drop during priority cue',
  );
  assert.equal(
    Math.round(audio.rt._priorityDuckEngine * 10000) / 10000,
    Math.round(dbToGain(PRIORITY_DUCK_DB) * 10000) / 10000,
  );
  // Record only successful / blocked outcomes for evidence honesty
  trace.storyCommsPriority = {
    storySquelch,
    weaponBlocked: blockedWeapon === null,
    uiBlocked: blockedUi === null,
    engineDuck: audio.rt._priorityDuckEngine,
    criticalActive: audio._isCriticalSquelchActive(),
  };
});

// 11) REDOCK
step('redock', () => {
  clearPriority();
  state.ui.docked = true;
  state.entities.get('player').flags.docked = true;
  bus.emit('dock:docked', { stationId: 'station_helios' });
});
assert(
  trace.steps.find((s) => s.name === 'redock').played.includes('sfx_dock_clunk'),
  'redock must audibly schedule dock clunk',
);
assert(audio.rt._docked, 'docked flag must set');
assert(audio.rt.loops.stationHum, 'station hum loop must start on dock');

// Sector identity keeps sparse cues, but must not rebuild the retired always-on oscillator pad.
audio._updateSectorCues(ctx.currentTime);
assert.equal(audio.rt.pads, undefined, 'Helios must not allocate a second continuous synth pad');

// Recipe existence for identity pack
for (const rid of [
  'sfx_undock_release', 'sfx_accel_transition', 'sfx_scan_pulse', 'sfx_travel_motif',
  'sfx_fringe_tick', 'sfx_anomaly_swell', 'sfx_station_machinery', 'sfx_traffic_blip',
  'sfx.tetherLatch', 'sfx_tether_strain_creak', 'sfx.tetherSnap',
  'sfx.shieldBreak', 'sfx.killSmall', 'sfx.killConfirmed', 'sfx_kill_confirm',
  'sfx_shield_break_crystal',
]) {
  assert(AUDIO_RECIPE_BY_ID[rid], `recipe ${rid} required`);
}

// Structural separation guard: the two break families must not regress to the same crack+low sweep.
assert(
  AUDIO_RECIPE_BY_ID['sfx.shieldBreak'].layers.includes('sfx_shield_break_crystal'),
  'shield collapse must retain its crystalline high-register layer',
);
assert(
  AUDIO_RECIPE_BY_ID['sfx.tetherSnap'].layers.includes('sfx_tether_twang'),
  'massline break must retain its low mechanical twang',
);
assert.notDeepEqual(
  AUDIO_RECIPE_BY_ID['sfx.shieldBreak'].layers,
  AUDIO_RECIPE_BY_ID['sfx.tetherSnap'].layers,
  'shield and massline break layer sets must remain distinct',
);
for (const signature of Object.values(FIRST_HOUR_AUDIO_SIGNATURES)) {
  if (!signature.semanticId) continue;
  assert.equal(resolveFirstHourAudioSignature(signature.semanticId), signature);
  assert.equal(resolveAudioCueRecipeId(signature.semanticId), signature.recipeId);
}

// resolveAudioCue still maps shield_break
assert.notEqual(resolveAudioCueRecipeId('shield_break'), 'sfx_ui_click');

trace.playedRecipes = played;
trace.assertions.push(
  { id: 'undock_release', ok: true },
  { id: 'thrust_tier_78hz', ok: true },
  { id: 'accel_transition', ok: true },
  { id: 'scan_pulse_motif', ok: true },
  { id: 'story_comms_priority_squelch', ok: true },
  { id: 'engine_loop_duck', ok: true },
  { id: 'redock_clunk_station_hum', ok: true },
  { id: 'helios_no_duplicate_sector_pad', ok: true },
  { id: 'massline_latch_event_recipe', ok: true },
  { id: 'massline_strain_fatigue_guard', ok: true },
  { id: 'shield_tether_spectral_separation', ok: true },
  { id: 'player_kill_confirmation_ownership', ok: true },
  { id: 'idle_flight_has_no_low_frequency_bed', ok: true },
);
trace.signatureProfiles = FIRST_HOUR_AUDIO_SIGNATURES;
trace.summary = {
  stepCount: trace.steps.length,
  totalPlayCalls: played.length,
  audiblePlayCalls: played.filter((p) => p.voiceStarted).length,
  blockedPlayCalls: played.filter((p) => p.blocked).length,
  uniqueRecipes: [...new Set(played.filter((p) => p.voiceStarted).map((p) => p.recipeId))],
  continuous: {
    engine: !!audio.rt.engineOsc1,
    brake: !!audio.rt.brakeGain,
    tether: !!audio.rt.tetherOsc,
    heliosTraffic: false,
    idleEngineGain: audio.rt._engineTelemetry.humG,
    stationHum: !!audio.rt.loops.stationHum,
  },
  priorityThreshold: PRIORITY_DUCK_THRESHOLD,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(trace, null, 2));

console.log('--- FIRST-HOUR AUDIO IDENTITY ---');
for (const s of trace.steps) {
  console.log(
    `  [${s.name}] audible=${JSON.stringify(s.played)} blocked=${JSON.stringify(s.blocked || [])}` +
    ` tier=${s.engineTelemetry && s.engineTelemetry.tier}`,
  );
}
console.log(`Evidence written: ${path.relative(process.cwd(), outFile)}`);
console.log('ALL FIRST-HOUR AUDIO CHECKS PASSED');
presentationAdapters.dispose();
presentationOrchestrator.dispose();
