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
  createWaveShaper() {
    return { curve: null, oversample: 'none', connect() {}, disconnect() {} };
  }
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
import { playRecipe } from '../src/audio/synth.js';
import { createCuePriorityBus } from '../src/audio/cuePriorityBus.js';
import { SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
import { PRESENTATION_AUDIO_CUE_BY_ID } from '../src/systems/presentationAdapters.js';

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
// Drive the real audio.play scheduler and rt.voices list for a scripted 60-second combat mix.
const budgetCtx = new MockAudioContext();
audio.state = {
  playerId: 'budget-player',
  entities: new Map([['budget-player', { id: 'budget-player', pos: { x: 0, z: 0 } }]]),
  settings: { audio: {} },
};
audio.rt = {
  ctx: budgetCtx,
  masterGain: budgetCtx.createGain(),
  sfxBus: budgetCtx.createGain(),
  musicBus: budgetCtx.createGain(),
  engineBus: budgetCtx.createGain(),
  ambientBus: budgetCtx.createGain(),
  combatBus: budgetCtx.createGain(),
  uiBus: budgetCtx.createGain(),
  commsBus: budgetCtx.createGain(),
  voices: [],
  loops: {},
  _caches: {},
  _nextVoiceId: 1,
  _criticalSquelchUntilMs: 0,
};
let maxActive = 0;
let maxPeak = 0;

const dt = 1 / 60;
for (let t = 0; t < 60; t += dt) {
  budgetCtx.currentTime = t;
  audio._gcVoices(t);
  if (Math.abs(t % 0.8) < dt) {
    for (let c = 0; c < 4; c++) {
      audio.play('sfx.shieldHit', { gain: 0.25 });
    }
  }

  if (Math.abs(t % 4.0) < dt) {
    audio.play('sfx.killSmall', { gain: 0.7 });
  }

  maxActive = Math.max(maxActive, audio.rt.voices.length);
  assert(audio.rt.voices.length <= 12,
    `Live scheduler voice count exceeded 12: currently ${audio.rt.voices.length}`);

  let sumG = 0;
  for (const voice of audio.rt.voices) sumG += voice.callGain * 0.25119;
  const currentPeak = sumG * 0.501187; // combat bus then master limiter target
  maxPeak = Math.max(maxPeak, currentPeak);
}

console.log(`Peak live-scheduler voice count: ${maxActive} (max budget: 12)`);
console.log(`Peak live-scheduler master peak: ${maxPeak.toFixed(4)} (max headroom: 0.5012)`);
assert(maxPeak <= 0.501187, 'Master peak headroom limit of -6dBFS exceeded!');
console.log('Check 2 PASSED: live scheduler enforces headroom and voice budget.');

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
// CHECK 4: Sector identity stays finite
// ==========================================
console.log('\nRunning Check 4: Finite sector identity...');
mockState.world = {
  currentSectorId: 's1',
  sectors: {
    s1: { id: 's1', palette: SECTOR_PALETTE_CLASSES.core },
    s2: { id: 's2', palette: SECTOR_PALETTE_CLASSES.belt },
  }
};
mockState.settings = { audio: { muted: false } };
mockState.ui = { docked: false };
mockCtx.currentTime = 46;
const sectorCues = [];
const playBeforeSectorCheck = audio.play;
audio.play = (recipeId) => { sectorCues.push(recipeId); return null; };
try {
  audio._updateSectorCues(mockCtx.currentTime);
  mockState.world.currentSectorId = 's2';
  audio._updateSectorCues(mockCtx.currentTime);
} finally {
  audio.play = playBeforeSectorCheck;
}
assert.equal(audio.rt.pads, undefined, 'sector changes must not allocate an oscillator pad');
assert.deepEqual(sectorCues, ['sfx_core_bell'], 'sector identity should use only the earned sparse cue');

console.log('Check 4 PASSED: sector identity uses finite cues without a continuous oscillator pad.');

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
  ui_accept: { distinct: true }, ui_undock: { distinct: true },
  ui_charge_start: { distinct: true }, ui_charge_abort: { distinct: true },
  click: { distinct: false }, hover: { distinct: true }, confirm: { distinct: true },
  deny: { distinct: true }, alert: { distinct: true }, warning: { distinct: true }, error: { distinct: true },
  lock_acquired: { distinct: true }, scan_resolve: { distinct: true },
  // Gameplay
  loot_collect: { distinct: true }, mining_core_fizzle: { distinct: true },
  shield_break: { distinct: true }, cm_chaff: { distinct: true }, cm_ecm: { distinct: true },
  sfx_explosion_small: { distinct: true },
  // Authored weapon/mining signatures emitted by their literal sfx_* recipe id (no cue indirection):
  // each resolves directly to a dedicated recipe via AUDIO_RECIPE_BY_ID, so they must be listed here
  // or the drift guard treats the literal emit as uncovered.
  sfx_mining_seam_reward: { distinct: true },   // mining.js seam bonus (layered impact+bell)
  sfx_vector_mine: { distinct: true },          // weapons.js SF-09 vector-mine directional detonation
  sfx_rcs_disrupt: { distinct: true },          // weapons.js SF-10 RCS-disruptor ion hit
  // Massline Physics Identity (Wave M2): throw/sling/tumble/bullet-time/cloak/jettison semantics.
  'massline.throw': { distinct: true }, 'massline.solutionLock': { distinct: true },
  'massline.sling': { distinct: true }, 'massline.tumble': { distinct: true },
  'massline.bulletTimeIn': { distinct: true }, 'massline.bulletTimeOut': { distinct: true },
  'massline.cloakOn': { distinct: true }, 'massline.cloakOff': { distinct: true },
  'massline.jettisonKick': { distinct: true },
  'massline.bombDrop': { distinct: true },
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

// Render guard: every recipe that can be played must actually produce a voiced source when run
// through the synth. A recipe whose `type`/fields the synth does not recognise falls through
// buildRecipeVoice with ZERO sources — a silent voice that still consumes the voice budget.
// Resolution alone ("recipe exists and isn't the click fallback") cannot catch this; only rendering
// can. (This would have caught a `type:'osc'` or `type:'noise'` recipe that the synth never renders.)
//
// We sweep the FULL RECIPES catalog, not just EMITTED_CUES, because many recipes are played directly
// by id (weapons/mining/massline emitters) rather than through the semantic cue contract — a silent
// direct-play recipe would never be caught by an EMITTED_CUES-only guard.
const renderCtx = mockCtx;
const renderDest = mockCtx.createGain();
for (const recipe of RECIPES) {
  const voice = playRecipe(renderCtx, recipe, renderDest, { peakGain: 0.5 }, {});
  assert.ok(voice.sources.length >= 1,
    `Recipe "${recipe.id}" (type:"${recipe.type}") renders with no sources (${voice.sources.length}); ` +
    `its type/fields are not recognised by the synth and it would be silent. Use a supported type ` +
    `(oscillator / noise_filtered / noise_burst / continuous_*) with matching fields.`);
}
// Also assert the EMITTED_CUES contract specifically resolves to a real recipe (the catalog sweep
// above proves recipes render; this proves every emitted cue MAPS to one of them).
for (const [cue] of Object.entries(EMITTED_CUES)) {
  const rid = resolveAudioCueRecipeId(cue);
  assert.ok(AUDIO_RECIPE_BY_ID[rid],
    `Emitted cue "${cue}" resolves to "${rid}", which is not a defined recipe.`);
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

// ==========================================
// CHECK 7: Continuous layers + priority bus + place recipes (first-hour identity floor)
// ==========================================
console.log('\nRunning Check 7: Continuous layers / priority wiring / place recipes...');
const audioSrc = fs.readFileSync(path.join(__dirname, '../src/audio/audioSystem.js'), 'utf8');
assert.match(audioSrc, /_ensureContinuousSources\s*\(/, 'audioSystem must own _ensureContinuousSources');
assert.match(audioSrc, /this\._ensureEngineHum\s*\(\)/, 'ensure path must call _ensureEngineHum');
assert.match(audioSrc, /this\._ensureBrakeHiss\s*\(\)/, 'ensure path must call _ensureBrakeHiss');
assert.match(audioSrc, /this\._ensureTetherHum\s*\(\)/, 'ensure path must call _ensureTetherHum');
assert.match(audioSrc, /createCuePriorityBus/, 'live graph must import createCuePriorityBus');
assert.match(audioSrc, /comms:popup/, 'comms squelch must subscribe to comms:popup');
assert.equal(PRESENTATION_AUDIO_CUE_BY_ID['mining.survey.pulse'], 'presentation.mining.scan_pulse',
  'scanner pulse must route through normalized mining presentation audio');
assert.equal(resolveAudioCueRecipeId(PRESENTATION_AUDIO_CUE_BY_ID['mining.survey.pulse']), 'sfx_mining_scan_pulse',
  'scanner pulse semantic cue must resolve to its authored survey family');
assert.doesNotMatch(audioSrc, /bus\.on\('scan:pulse'/,
  'raw scanner pulse must not stack a duplicate voice beneath presentation audio');
assert.equal(PRESENTATION_AUDIO_CUE_BY_ID['travel.cruise.charging'], 'presentation.travel.cruise_charge',
  'cruise charging must route through the normalized presentation audio lane');
assert.equal(resolveAudioCueRecipeId(PRESENTATION_AUDIO_CUE_BY_ID['travel.cruise.charging']), 'sfx.cruiseCharging',
  'cruise charging semantic cue must resolve to its authored rise');
assert.doesNotMatch(audioSrc, /bus\.on\('cruise:charging'/,
  'raw cruise charging must not stack a duplicate voice beneath presentation audio');
assert.doesNotMatch(audioSrc, /bus\.on\('jump:(?:chargeStart|start|arrive)'/,
  'raw jump events must not stack duplicate voices beneath presentation audio');
assert.match(audioSrc, /sfx_accel_transition/, 'acceleration transition motif must be used');
assert.match(audioSrc, /sfx_undock_release/, 'undock mood must use undock release recipe');
assert.match(audioSrc, /_isCriticalSquelchActive/, 'critical squelch gate must exist');
assert.match(audioSrc, /_updatePriorityDuckGains/, 'priority duck must apply to continuous loops each frame');
assert.equal(resolveAudioCueRecipeId(PRESENTATION_AUDIO_CUE_BY_ID['mining.seam.reward']), 'sfx_mining_seam_reward',
  'seam reward recipe must be reachable through normalized presentation audio');
assert.match(audioSrc, /bus\.on\('weapons:vent'/, 'vent reward recipe must be reachable');
assert.match(audioSrc, /bus\.on\('charge:detonated'/, 'impulse detonation recipe must be reachable');
assert.equal(AUDIO_RECIPE_BY_ID['sfx.shieldHit'].category, 'weapon',
  'shield hits must route through the combat bus');
assert.equal(AUDIO_RECIPE_BY_ID['sfx.playerDamage'].category, 'weapon',
  'player damage must route through the combat bus');

const placeRecipes = [
  'sfx_fringe_tick', 'sfx_anomaly_swell', 'sfx_accel_transition', 'sfx_undock_release',
  'sfx_scan_pulse', 'sfx_travel_motif', 'sfx_station_machinery', 'sfx_traffic_blip',
];
for (const rid of placeRecipes) {
  assert(AUDIO_RECIPE_BY_ID[rid], `First-hour place/identity recipe ${rid} must be defined`);
}

// Live continuous ensure: the reusable engine graph exists, but idle output remains hard-silent.
const engState = {
  playerId: 'p1',
  entities: new Map([
    ['p1', { id: 'p1', pos: { x: 0, z: 0 }, flags: { boosting: false }, vel: { x: 0, z: 0 }, derived: { mass: 80 } }],
  ]),
  player: { cruise: { phase: 'idle' }, tether: { active: false, strain: 0 } },
  input: { moveX: 0, moveZ: 0, actions: { brake: false } },
  world: { currentSectorId: 'sector_helios_prime', sectors: { sector_helios_prime: { id: 'sector_helios_prime', palette: SECTOR_PALETTE_CLASSES.core } } },
  settings: { audio: {}, video: { motionReduce: false } },
  ui: {},
};
const engCtx = new MockAudioContext();
audio.state = engState;
audio.bus = { on() {} };
audio.rt = {
  ctx: engCtx,
  musicBus: engCtx.createGain(),
  ambientBus: engCtx.createGain(),
  engineBus: engCtx.createGain(),
  combatBus: engCtx.createGain(),
  uiBus: engCtx.createGain(),
  commsBus: engCtx.createGain(),
  masterGain: engCtx.createGain(),
  sfxBus: engCtx.createGain(),
  _caches: {},
  _paused: false,
  _priorityBus: null,
  _priorityEngineProbe: { role: 'engineLoop', loop: true },
  _priorityWeaponProbe: { role: 'weaponLoop', loop: true },
  _priorityDuckEngine: 1,
  _priorityDuckWeapon: 1,
  _engineTelemetry: {
    tier: 'idle', f1: 55, f2: 55, noiseG: 0, humG: 0, massNorm: 1, duck: 1,
  },
  pads: {},
  loops: {},
  voices: [],
  sidechainDuck: 1,
};
audio.rt._priorityBus = createCuePriorityBus();
audio._ensureContinuousSources();
assert(audio.rt.engineOsc1, 'Engine osc1 must exist after ensure');
assert(audio.rt.engineOsc2, 'Engine osc2 must exist after ensure');
assert(audio.rt.engineNoiseGain, 'Engine noise layer must exist after ensure');
assert(audio.rt.brakeGain, 'Brake hiss must exist after ensure');
assert(audio.rt.tetherOsc, 'Tether hum must exist after ensure');

// Tier frequencies: idle → thrust → boost → cruise.
const tiers = [
  { moveZ: 0, boosting: false, cruise: 'idle', expect: 55, name: 'idle', sector: 'sector_helios_prime' },
  { moveZ: 0, boosting: false, cruise: 'idle', expect: 55, name: 'idle', sector: 'sector_ceres_belt' },
  { moveZ: 1, boosting: false, cruise: 'idle', expect: 78, name: 'thrust', sector: 'sector_helios_prime' },
  { moveZ: 1, boosting: true, cruise: 'idle', expect: 110, name: 'boost', sector: 'sector_helios_prime' },
  { moveZ: 0, boosting: false, cruise: 'cruising', expect: 65, name: 'cruise', sector: 'sector_helios_prime' },
];
for (const row of tiers) {
  engState.world.currentSectorId = row.sector;
  engState.input.moveZ = row.moveZ;
  engState.entities.get('p1').flags.boosting = row.boosting;
  engState.player.cruise = { phase: row.cruise };
  audio._updateEngineHum();
  // setTargetAtTime on mock may not update .value — read telemetry
  const tel = audio.rt._engineTelemetry;
  assert(tel && tel.tier === row.name, `Engine tier must resolve to ${row.name}, got ${tel && tel.tier}`);
  assert(Math.abs(tel.f1 - row.expect) < 0.01, `Engine ${row.name} f1 must be ${row.expect} in ${row.sector}, got ${tel.f1}`);
  if (row.name === 'idle') assert.equal(tel.humG, 0, 'idle engine identity must be informational, not audible');
}
// Loop voices must share the same bus routing as one-shots (no sfxBus bypass).
assert.match(
  audioSrc,
  /_startLoopVoice[\s\S]{0,900}getBusForRecipe/,
  'loop voices must route via getBusForRecipe for shared bus reconciliation',
);
assert.match(
  audioSrc,
  /_startLoopVoice[\s\S]{0,1200}combatBus/,
  'loop voices must be able to target combatBus',
);

// Positional refreshes run after priority duck updates. They must preserve the duck rather
// than restoring a moving beam to its full base gain.
const beamTarget = {
  id: 'beam-target',
  type: 'ship',
  pos: { x: 120, z: 0 },
  alive: true,
};
engState.entities.set(beamTarget.id, beamTarget);
const beamGain = engCtx.createGain();
const beamVoice = {
  trackId: beamTarget.id,
  role: 'weaponLoop',
  busName: 'combat',
  loop: true,
  _baseGain: 0.8,
  gain: beamGain,
};
audio.rt.loops.beam_test = beamVoice;
audio.rt._priorityDuckWeapon = 0.4;
audio._updateLoopPositions(engCtx.currentTime);
const beamGainTarget = beamGain.gain.timeline.at(-1);
assert.equal(beamGainTarget.type, 'target');
assert(
  beamGainTarget.val < 0.8 * 0.5,
  `positional beam refresh must retain priority duck, got ${beamGainTarget.val}`,
);

console.log('Check 7 PASSED: continuous ensures, priority wiring, place recipes, thrust tiers.');

console.log('\n--- ALL AUDIO IDENTITY CHECKS PASSED SUCCESSFULLY ---');
