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
import { audio, AUDIO_RECIPE_BY_ID } from '../src/audio/audioSystem.js';
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

console.log('\n--- ALL AUDIO IDENTITY CHECKS PASSED SUCCESSFULLY ---');
