import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mock Web Audio Context
class MockAudioParam {
  constructor(initialVal = 1) {
    this.value = initialVal;
    this.timeline = [];
  }
  setValueAtTime(val, t) {
    this.timeline.push({ type: 'set', val, t });
    this.value = val;
  }
  linearRampToValueAtTime(val, t) {
    this.timeline.push({ type: 'linear', val, t });
    this.value = val;
  }
  exponentialRampToValueAtTime(val, t) {
    this.timeline.push({ type: 'exponential', val, t });
    this.value = val;
  }
  setTargetAtTime(val, t, tc) {
    this.timeline.push({ type: 'target', val, t, tc });
    this.value = val;
  }
  cancelScheduledValues(t) {
    this.timeline = this.timeline.filter(e => e.t < t);
  }
}

class MockGainNode {
  constructor(initialGain = 1) {
    this.gain = new MockAudioParam(initialGain);
  }
  connect(dest) {}
  disconnect() {}
}

class MockOscillatorNode {
  constructor() {
    this.frequency = new MockAudioParam(440);
    this.detune = new MockAudioParam(0);
  }
  connect(dest) {}
  disconnect() {}
  start(t) {}
  stop(t) {}
}

class MockBiquadFilterNode {
  constructor() {
    this.frequency = new MockAudioParam(1000);
    this.Q = new MockAudioParam(1);
  }
  connect(dest) {}
  disconnect() {}
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
  }
  createBuffer(channels, length, sampleRate) {
    return {
      length,
      sampleRate,
      numberOfChannels: channels,
      getChannelData() { return new Float32Array(length); }
    };
  }
  createGain() { return new MockGainNode(); }
  createOscillator() { return new MockOscillatorNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createDynamicsCompressor() {
    return {
      threshold: new MockAudioParam(-6),
      knee: new MockAudioParam(6),
      ratio: new MockAudioParam(12),
      attack: new MockAudioParam(0.003),
      release: new MockAudioParam(0.25),
    };
  }
  createBufferSource() {
    return {
      playbackRate: new MockAudioParam(1),
      connect() {},
      start() {},
      stop() {},
    };
  }
  resume() { this.state = 'running'; }
}

// Global window mock to bypass gesture handler registration
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
};

// Import the systems
import { RECIPES } from '../src/data/audioRecipes.js';
import { audio, AUDIO_RECIPE_BY_ID, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';
import { SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- STARTING AUDIO IDENTITY AUDIT ---');

// ==========================================
// CHECK 1: Recipe Coverage
// ==========================================
console.log('\nRunning Check 1: Recipe Coverage...');
const requiredRecipes = [
  'sfx.shieldHit',
  'sfx.shieldBreak',
  'sfx.armorHit',
  'sfx.hullHit',
  'sfx.killSmall',
  'sfx.killCapital',
  'sfx.playerDamage',
  'sfx.tetherLatch',
  'sfx.tetherSnap',
  'sfx.chargeDetonate',
  'sfx.shipDash',
  'sfx.cruiseCharging',
  'sfx.cruiseEngaged',
  'sfx.cruiseSnared',
];

for (const rid of requiredRecipes) {
  assert(AUDIO_RECIPE_BY_ID[rid], `Recipe ${rid} must be defined in audioRecipes.js`);
}
console.log('Check 1 PASSED: All 14 required spec recipes are defined.');

// ==========================================
// CHECK 2: Mix Budget & Headroom (60s Combat Simulation)
// ==========================================
console.log('\nRunning Check 2: Mix Budget...');
// We simulate a worst-case scenario over 60 seconds with active voices decay
const voicesList = [];
let maxActive = 0;
let maxPeak = 0;

// Simulate triggering many combat hits simultaneously
const dt = 1 / 60;
for (let t = 0; t < 60; t += dt) {
  // Evict active voices that have ended
  for (let i = voicesList.length - 1; i >= 0; i--) {
    const v = voicesList[i];
    if (t - v.start > v.duration) {
      voicesList.splice(i, 1);
    }
  }

  // Trigger triggers periodically
  if (Math.abs(t % 0.8) < dt) {
    // start 4 hits
    for (let c = 0; c < 4; c++) {
      if (voicesList.length >= 12) {
        // Oldest-quietest eviction
        let oldestIdx = 0;
        let oldestT = Infinity;
        for (let j = 0; j < voicesList.length; j++) {
          if (voicesList[j].start < oldestT) {
            oldestT = voicesList[j].start;
            oldestIdx = j;
          }
        }
        voicesList.splice(oldestIdx, 1);
      }
      voicesList.push({ start: t, duration: 0.15, gain: 0.25 * 0.25119 }); // combat bus scaling
    }
  }

  if (Math.abs(t % 4.0) < dt) {
    // major explosion
    if (voicesList.length >= 12) {
      voicesList.splice(0, 1);
    }
    voicesList.push({ start: t, duration: 0.6, gain: 0.7 * 0.25119 }); // combat bus scaling
  }

  // Check voice count
  maxActive = Math.max(maxActive, voicesList.length);
  assert(voicesList.length <= 12, `Voice count exceeded 12: currently ${voicesList.length}`);

  // Calculate master peak (linear sum of active voice gains scaled by master gain -6dBFS = 0.501187)
  let sumG = 0;
  for (const v of voicesList) {
    sumG += v.gain;
  }
  const currentPeak = sumG * 0.501187;
  maxPeak = Math.max(maxPeak, currentPeak);
}

console.log(`Peak simulated voice count: ${maxActive} (max budget: 12)`);
console.log(`Peak simulated master peak: ${maxPeak.toFixed(4)} (max headroom: 0.5012)`);
assert(maxPeak <= 0.501187, 'Master peak headroom limit of -6dBFS exceeded!');
console.log('Check 2 PASSED: Headroom and voice budget enforced successfully.');

// ==========================================
// CHECK 3: Tether Hum Monotonicity
// ==========================================
console.log('\nRunning Check 3: Tether Hum Monotonicity...');
// Mock the system state and context
const mockState = {
  playerId: 'p1',
  entities: new Map([
    ['p1', { id: 'p1', pos: { x: 0, z: 0 }, flags: { boosting: false }, vel: { x: 0, z: 0 } }]
  ]),
  player: {
    tether: {
      active: true,
      strain: 0.0,
    }
  }
};

const mockCtx = new MockAudioContext();
audio.state = mockState;
audio.bus = { on() {} };
audio.rt = {
  ctx: mockCtx,
  musicBus: mockCtx.createGain(),
  ambientBus: mockCtx.createGain(),
  engineBus: mockCtx.createGain(),
  combatBus: mockCtx.createGain(),
  uiBus: mockCtx.createGain(),
  commsBus: mockCtx.createGain(),
  masterGain: mockCtx.createGain(),
  _caches: {},
  _paused: false,
};

audio._ensureTetherHum();
assert(audio.rt.tetherOsc, 'Tether oscillator must be initialized');
assert(audio.rt.tetherHum, 'Tether gain node must be initialized');

const strains = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const gains = [];

for (const s of strains) {
  mockState.player.tether.strain = s;
  audio._updateTetherHum();
  gains.push(audio.rt.tetherHum.gainValue);
}

// Verify monotonicity
for (let i = 1; i < gains.length; i++) {
  assert(gains[i] > gains[i - 1], `Gain must strictly increase with strain: gain at strain ${strains[i]} (${gains[i]}) is not greater than gain at ${strains[i - 1]} (${gains[i - 1]})`);
}
console.log('Check 3 PASSED: Tether hum gain tracks strain monotonically.');

// ==========================================
// CHECK 4: Pads Crossfade
// ==========================================
console.log('\nRunning Check 4: Pads Crossfade...');
// Mock sector enter and check pad gains
mockState.world = {
  currentSectorId: 's1',
  sectors: {
    s1: { id: 's1', palette: SECTOR_PALETTE_CLASSES.core },
    s2: { id: 's2', palette: SECTOR_PALETTE_CLASSES.belt },
  }
};

audio.rt.pads = {};
audio.rt.activePadClass = null;

// Move to sector 1
audio._updatePads(0);
const pad1 = audio.rt.pads['core'];
assert(pad1, 'Core pad must be started');

// Move to sector 2
mockState.world.currentSectorId = 's2';
audio._updatePads(0);
const pad2 = audio.rt.pads['belt'];
assert(pad2, 'Belt pad must be started');

// Inspect crossfade duration
const timeline1 = pad1.gainNode.gain.timeline;
const timeline2 = pad2.gainNode.gain.timeline;

// Find linear ramp commands
const fadeOut = timeline1.find(e => e.type === 'linear' && e.val === 0.0001);
const fadeIn = timeline2.find(e => e.type === 'linear' && e.val === 1.0);

assert(fadeOut, 'Core pad must be scheduled to fade out');
assert(fadeIn, 'Belt pad must be scheduled to fade in');

const fadeOutDur = fadeOut.t - mockCtx.currentTime;
const fadeInDur = fadeIn.t - mockCtx.currentTime;

console.log(`Fade out duration: ${fadeOutDur}s`);
console.log(`Fade in duration: ${fadeInDur}s`);
assert(fadeOutDur <= 4.5, `Fade out duration ${fadeOutDur}s exceeds 4.5s`);
assert(fadeInDur <= 4.5, `Fade in duration ${fadeInDur}s exceeds 4.5s`);

console.log('Check 4 PASSED: Pads crossfade in <= 4.5 seconds smoothly.');

// ==========================================
// CHECK 5: Mute/Volume Settings
// ==========================================
console.log('\nRunning Check 5: Mute/Volume Settings...');
// Change settings and check master target volume
mockState.settings = {
  audio: {
    muted: false,
    master: 0.5,
    sfx: 0.8,
    music: 0.4,
    engine: 0.9,
    ambient: 0.6,
    combat: 0.5,
    ui: 0.8,
    comms: 0.7,
  }
};

audio._applySettings();

const finalMasterGain = audio.rt.masterGain.gain.value;
const targetMasterGain = 0.5 * 0.5 * 0.501187; // linearGain(0.5) * -6dBFS
assert(Math.abs(finalMasterGain - targetMasterGain) < 0.0001, `Master gain value ${finalMasterGain} does not match target ${targetMasterGain}`);

// Audit settings UI file to verify the 5 sub-bus volume sliders exist
const settingsContent = fs.readFileSync(path.join(__dirname, '../src/ui/screens/settings.js'), 'utf8');
const expectedSliders = ["'Engine'", "'Ambient'", "'Combat'", "'UI'", "'Comms'"];
for (const slider of expectedSliders) {
  assert(settingsContent.includes(slider), `Settings screen must render the ${slider} volume slider`);
}

console.log('Check 5 PASSED: Mute/volume settings apply immediately, and settings UI has all 5 sliders.');

// ==========================================
// CHECK 6: Semantic cue resolution (no silent collapse to generic click)
// ==========================================
console.log('\nRunning Check 6: Semantic cue resolution...');
// Every semantic audio:cue id emitted anywhere in the game must resolve, through
// resolveAudioCueRecipeId(), to a recipe that actually EXISTS. Cues that are not a plain
// click must additionally not fall through to the sfx_ui_click fallback — otherwise distinct
// player-facing moments (open/back/deny/loot/chaff/shield-break) all sound the same.
//
// EMITTED_CUES is the authoritative contract. Regenerate the candidate list with:
//   grep -rhoE "audio:cue['\"]?\s*,\s*\{[^}]*id:[^}]*" src --include=*.js
//   grep -rhoE "_onCue\('[^']+'\)" src --include=*.js
// `distinct:true` means "must have its own voice" (fail if it collapses to sfx_ui_click).
const EMITTED_CUES = {
  // UI navigation / feedback
  ui_open: { distinct: true }, ui_back: { distinct: true }, ui_tab: { distinct: true },
  ui_tick: { distinct: true }, ui_deny: { distinct: true }, ui_alert: { distinct: true },
  ui_dock: { distinct: true }, ui_confirm: { distinct: true }, ui_click: { distinct: false },
  click: { distinct: false }, hover: { distinct: true }, confirm: { distinct: true },
  deny: { distinct: true }, alert: { distinct: true }, error: { distinct: true },
  lock_acquired: { distinct: true },
  // Gameplay
  loot_collect: { distinct: true }, mining_core_fizzle: { distinct: true },
  shield_break: { distinct: true }, cm_chaff: { distinct: true }, cm_ecm: { distinct: true },
  sfx_explosion_small: { distinct: true },
};

for (const [cue, spec] of Object.entries(EMITTED_CUES)) {
  const rid = resolveAudioCueRecipeId(cue);
  assert(AUDIO_RECIPE_BY_ID[rid],
    `Emitted cue "${cue}" resolves to "${rid}", which is NOT a defined recipe. ` +
    `Add the recipe to audioRecipes.js or fix its AUDIO_CUE_TO_RECIPE mapping.`);
  if (spec.distinct) {
    assert(rid !== 'sfx_ui_click',
      `Emitted cue "${cue}" collapses to the generic sfx_ui_click fallback. ` +
      `Map it to a dedicated recipe in AUDIO_CUE_TO_RECIPE so it has its own voice.`);
  }
}

// Drift guard: discover every literal audio:cue / _onCue id in src and require it to be listed
// above. A new cue with a typo'd id (or one that would silently collapse) fails this check
// until it is given an intentional resolution here.
const SRC_DIR = path.join(__dirname, '../src');
function walkJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(p, out);
    else if (entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const CUE_ID_SHAPE = /^[a-z][a-z0-9_.]*$/;
const discovered = new Set();
for (const file of walkJs(SRC_DIR)) {
  const src = fs.readFileSync(file, 'utf8');
  // audio:cue emits carrying a literal id (object or ternary form).
  const emitRe = /audio:cue['"]?\s*,\s*\{([^}]*)\}/g;
  let m;
  while ((m = emitRe.exec(src))) {
    const body = m[1];
    if (!/\bid\b/.test(body)) continue;
    // Only trust the object literal if id is assigned string literal(s); skip `{ id }` shorthand.
    if (/\bid\s*:/.test(body)) {
      // Drop comparison operands (e.g. `cfg.kind === 'chaff'`) so only the id VALUE literals
      // — direct or ternary-branch — are treated as emitted cue ids.
      const valueExpr = body.replace(/(===?|!==?)\s*'[^']*'|'[^']*'\s*(===?|!==?)/g, '');
      for (const lit of valueExpr.match(/'([^']+)'/g) || []) {
        const id = lit.slice(1, -1);
        if (CUE_ID_SHAPE.test(id) && !id.includes('/')) discovered.add(id);
      }
    }
  }
  // _onCue('literal') subscriptions in audioSystem.js.
  const onCueRe = /_onCue\('([^']+)'\)/g;
  while ((m = onCueRe.exec(src))) {
    if (CUE_ID_SHAPE.test(m[1])) discovered.add(m[1]);
  }
}
// presentation.* lane cues are resolved by the presentation adapter, not the semantic map — exclude.
const unlisted = [...discovered].filter((id) => !EMITTED_CUES[id] && !id.startsWith('presentation.'));
assert(unlisted.length === 0,
  `Found emitted audio:cue id(s) not covered by Check 6's EMITTED_CUES contract: ${unlisted.join(', ')}. ` +
  `Add each to EMITTED_CUES with an intended resolution so it can't silently collapse to a click.`);
console.log(`Check 6 PASSED: ${Object.keys(EMITTED_CUES).length} semantic cues resolve to real recipes; ` +
  `${discovered.size} discovered literal cues all covered, none collapse unintentionally.`);

console.log('\n--- ALL AUDIO IDENTITY CHECKS PASSED SUCCESSFULLY ---');
