// PQ-130.08 "The mine's voice" — ASTEROID_WORKS_DESIGN_LAW.md §5, §8, §9, §11.9.
//
// Proves, without a browser and without an audio device:
//
//   1. the pause path gives screen `drill` a bed that stays audible, and is byte-for-byte the
//      legacy behaviour for EVERY other screen in the real PAUSING_SCREENS set;
//   2. every row of the law's §5 event table maps to a cue, that cue exists, has a synth branch,
//      and is reachable from a real bus event;
//   3. the MK-gate refusal suppresses repeats inside 5 s (law §5 "Repeats suppress");
//   4. the grind picks its layer from the target cell's material and is silent when not boring;
//   5. the mix priority order hazard > payoff > machine > ambience, with one voice at a time for
//      alert-class sounds.
//
// A headless harness cannot prove a speaker moved. What it CAN prove is that the graph exists, is
// connected to a bus with non-zero gain, and receives a scheduled envelope — which is exactly what
// was missing before this leaf. The manual check is in the leaf report.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Mock Web Audio (same shape as scripts/check-first-hour-audio-identity.mjs)
// ---------------------------------------------------------------------------
class MockAudioParam {
  constructor(v = 1) { this.value = v; this.timeline = []; }
  setValueAtTime(val, t) { this.timeline.push({ type: 'set', val, t }); this.value = val; return this; }
  linearRampToValueAtTime(val, t) { this.timeline.push({ type: 'linear', val, t }); this.value = val; return this; }
  exponentialRampToValueAtTime(val, t) { this.timeline.push({ type: 'exp', val, t }); this.value = val; return this; }
  setTargetAtTime(val, t, tc) { this.timeline.push({ type: 'target', val, t, tc }); this.value = val; return this; }
  cancelScheduledValues(t) { this.timeline = this.timeline.filter((e) => e.t < t); return this; }
}
class MockGainNode {
  constructor(g = 1) { this.gain = new MockAudioParam(g); this._out = []; }
  connect(d) { this._out.push(d); }
  disconnect() { this._out.length = 0; }
}
class MockOscillatorNode {
  constructor() { this.frequency = new MockAudioParam(440); this.detune = new MockAudioParam(0); this.type = 'sine'; this._started = false; this._stopped = false; }
  connect() {} disconnect() {}
  start() { this._started = true; }
  stop() { this._stopped = true; }
}
class MockBiquadFilterNode {
  constructor() { this.frequency = new MockAudioParam(1000); this.Q = new MockAudioParam(1); this.type = 'lowpass'; }
  connect() {} disconnect() {}
}
class MockBufferSource {
  constructor() { this.buffer = null; this.loop = false; this.playbackRate = new MockAudioParam(1); this._started = false; }
  connect() {} disconnect() {}
  start() { this._started = true; }
  stop() {}
}
class MockAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; }
  createBuffer(channels, length, sampleRate) {
    return { length, sampleRate, numberOfChannels: channels, getChannelData() { return new Float32Array(length); } };
  }
  createGain() { return new MockGainNode(); }
  createOscillator() { return new MockOscillatorNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createBufferSource() { return new MockBufferSource(); }
  createDynamicsCompressor() {
    return {
      threshold: new MockAudioParam(-6), knee: new MockAudioParam(6), ratio: new MockAudioParam(12),
      attack: new MockAudioParam(0.003), release: new MockAudioParam(0.25),
      connect() {}, disconnect() {},
    };
  }
  createStereoPanner() { return { pan: new MockAudioParam(0), connect() {}, disconnect() {} }; }
  createWaveShaper() { return { curve: null, oversample: 'none', connect() {}, disconnect() {} }; }
  createDelay(max = 1) { return { delayTime: new MockAudioParam(Math.min(0.1, max)), connect() {}, disconnect() {} }; }
  createChannelMerger() { return { connect() {}, disconnect() {} }; }
  createChannelSplitter() { return { connect() {}, disconnect() {} }; }
  createConvolver() { return { buffer: null, normalize: true, connect() {}, disconnect() {} }; }
  createPanner() { return { connect() {}, disconnect() {} }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

let FAKE_NOW_MS = 0;
globalThis.window = { addEventListener() {}, removeEventListener() {}, AudioContext: MockAudioContext, webkitAudioContext: MockAudioContext };
globalThis.performance = { now: () => FAKE_NOW_MS };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const {
  audio,
  MINE_SCREEN_ID,
  MINE_CUES,
  MINE_CUE_CLASS_RANK,
  MINE_EVENT_CUE_MAP,
  MINE_LAW_EVENT_ROWS,
  MINE_OWNED_PRESENTATION_CUES,
  MINE_GRIND_LAYERS,
  MINE_GRIND_CENTRES,
  MINE_BED_DUCK_BEHIND,
  MINE_BED_FADE_IN_S,
  MINE_REFUSAL_SUPPRESS_MS,
  MINE_PRIORITY_DUCK,
  MINE_BED_ALERT_DUCK,
  MINE_GRIND_ALERT_DUCK,
  MINE_HEAT_CRITICAL,
  MINE_HEAT_RELIEF,
  MINE_GRIND_PEAK,
  AUDIO_RECIPE_BY_ID,
  audioRecipeBasePeak,
  createMineVoiceArbiter,
  mineGrindLayers,
  mineOreTickRate,
  mineScreenPresence,
  mineTileHardness,
  resolveMineAudioIntent,
} = await import('../src/audio/audioSystem.js');
const { createBus } = await import('../src/core/eventBus.js');
const { materialHardness } = await import('../src/systems/drill.js');

const failures = [];
function section(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); } catch (err) {
    failures.push(`${name}: ${err && err.message}`);
    console.log(`  FAIL ${name}\n       ${err && err.message}`);
  }
}

// ---------------------------------------------------------------------------
// The REAL pausing-screen set, read out of screenManager.js. Enumerating the live set (rather than
// a copy) means a screen added to it later is covered by this test the day it lands.
// ---------------------------------------------------------------------------
const screenManagerSrc = fs.readFileSync(path.join(__dirname, '../src/ui/screenManager.js'), 'utf8');
const setStart = screenManagerSrc.indexOf('const PAUSING_SCREENS = new Set([');
assert.ok(setStart >= 0, 'screenManager.js must still declare PAUSING_SCREENS as a Set literal');
const setEnd = screenManagerSrc.indexOf(']);', setStart);
const PAUSING_SCREENS = [...screenManagerSrc.slice(setStart, setEnd).matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);
assert.ok(PAUSING_SCREENS.length >= 12, `expected the real pausing set, parsed ${PAUSING_SCREENS.length}`);
assert.ok(PAUSING_SCREENS.includes(MINE_SCREEN_ID), 'screen `drill` must still be a pausing screen');

// ---------------------------------------------------------------------------
// Live-graph harness
// ---------------------------------------------------------------------------
function tile(over = {}) {
  return {
    type: 'rock', hp: 20, maxHp: 20, ore: null, hazard: false, tierReq: 1, hardness: 1.45, ...over,
  };
}

function makeState(screenStack = [], drillOver = {}) {
  const field = [[tile({ type: 'dirt', hardness: 0.75 }), tile()]];
  return {
    playerId: 'player',
    simTime: 10,
    tick: 100,
    entities: new Map([['player', { id: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, shield: 50, shieldMax: 50, alive: true, flags: {}, team: 0, type: 'ship' }]]),
    player: { cruise: { phase: 'idle' }, tether: { active: false, strain: 0 }, cargo: { items: {} } },
    input: { moveX: 0, moveZ: 0, brake: false, actions: {} },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    settings: {
      audio: { muted: false, master: 0.55, sfx: 0.7, music: 0.32, engine: 0.7, ambient: 0.7, combat: 0.7, ui: 0.7, comms: 0.7 },
      video: { motionReduce: false },
      accessibility: {},
    },
    ui: { docked: false, screenStack: [...screenStack] },
    mode: 'flight',
    drill: {
      active: true,
      asteroidId: 'rock-1',
      field,
      drillTemp: 0,
      drillEnergy: 100,
      avatar: { col: 0, row: 0, isDrilling: false, drillBlocked: false, drillTarget: null },
      ...drillOver,
    },
  };
}

// Spy on the synth layer: counting `rt._mineVoices` directly is GC-sensitive (finished voices
// are pruned), so every "did it speak?" assertion below counts SCHEDULED cues instead.
const synthLog = [];
const originalSynthMineCue = audio._synthMineCue;
audio._synthMineCue = function spySynthMineCue(key, t, gain, opts) {
  const built = originalSynthMineCue.call(this, key, t, gain, opts);
  if (built) synthLog.push({ key, gain, t });
  return built;
};
const spoke = (key) => synthLog.filter((e) => e.key === key).length;
function resetSynthLog() { synthLog.length = 0; }

function boot(screenStack = [], drillOver = {}) {
  try { audio.destroy(); } catch (_) {}
  FAKE_NOW_MS = 0;
  resetSynthLog();
  const state = makeState(screenStack, drillOver);
  const bus = createBus();
  audio.init({ state, bus, helpers: {} });
  const ctx = audio._ensureContext();
  assert.ok(ctx, 'mock AudioContext must come up');
  return { state, bus, ctx, rt: audio.rt };
}

function advance(h, seconds) {
  const steps = Math.max(1, Math.round(seconds / 0.05));
  for (let i = 0; i < steps; i++) {
    h.ctx.currentTime += 0.05;
    FAKE_NOW_MS += 50;
    audio._frame();
  }
}

function busSnapshot(rt) {
  const g = (n) => (n && n.gain ? Number(n.gain.value.toFixed(9)) : null);
  return {
    master: g(rt.masterGain), music: g(rt.musicBus), engine: g(rt.engineBus),
    ambient: g(rt.ambientBus), combat: g(rt.combatBus), ui: g(rt.uiBus), comms: g(rt.commsBus),
    mine: g(rt._mineBus),
  };
}

// ===========================================================================
// §1 — pause-path parity across the REAL pausing set (pure policy)
// ===========================================================================
section('§1 pause policy: every non-drill pausing screen keeps the legacy rule', () => {
  const LEGACY = { presence: 'none', mineActive: false, bedActive: false, bedDuck: 0, musicSilenced: true, cuesOwnedByMine: false };
  let checked = 0;
  for (const id of PAUSING_SCREENS) {
    if (id === MINE_SCREEN_ID) continue;
    const got = resolveMineAudioIntent({ screenStack: [id], paused: true, muted: false });
    assert.deepEqual(got, LEGACY, `pausing screen "${id}" must behave exactly as before`);
    // and unpaused (a live overlay that somehow lands here) must not silence music either
    const live = resolveMineAudioIntent({ screenStack: [id], paused: false, muted: false });
    assert.equal(live.musicSilenced, false, `"${id}" unpaused must not silence music`);
    assert.equal(live.bedActive, false, `"${id}" must never raise the mine bed`);
    checked++;
  }
  assert.ok(checked >= 11, `expected to cover the whole pausing set, covered ${checked}`);
  // Flight: nothing changes at all.
  assert.deepEqual(resolveMineAudioIntent({ screenStack: [], paused: false, muted: false }), {
    presence: 'none', mineActive: false, bedActive: false, bedDuck: 0, musicSilenced: false, cuesOwnedByMine: false,
  });
});

section('§1 pause policy: screen `drill` raises the bed and keeps the score out', () => {
  const front = resolveMineAudioIntent({ screenStack: ['drill'], paused: true, muted: false });
  assert.equal(front.presence, 'front');
  assert.equal(front.bedActive, true, 'the mine must get its own bed');
  assert.equal(front.bedDuck, 1);
  // Law §8: "The flight score does not continue inside." Zeroing the music bus is the LAW here,
  // not the bug — §11.9's live invariant is about the ambience bus, which the bed occupies.
  assert.equal(front.musicSilenced, true);
  assert.equal(front.cuesOwnedByMine, true);

  // A pause menu over the mine: still in the rock, bed ducked rather than killed.
  const behind = resolveMineAudioIntent({ screenStack: ['drill', 'pause'], paused: true, muted: false });
  assert.equal(behind.presence, 'behind');
  assert.equal(behind.bedActive, true);
  assert.equal(behind.bedDuck, MINE_BED_DUCK_BEHIND);
  assert.ok(behind.bedDuck < front.bedDuck, 'the bed must step back behind a menu');

  // Muted is hard silence, mine included.
  const muted = resolveMineAudioIntent({ screenStack: ['drill'], paused: true, muted: true });
  assert.equal(muted.bedActive, false);
  assert.equal(muted.mineActive, false);

  assert.equal(mineScreenPresence(['drill']), 'front');
  assert.equal(mineScreenPresence(['drill', 'settings']), 'behind');
  assert.equal(mineScreenPresence(['station']), 'none');
  assert.equal(mineScreenPresence(null), 'none');
});

// ===========================================================================
// §2 — the same rule, on the live graph
// ===========================================================================
section('§2 live graph: the mine bus is the ONLY bus that differs from a plain pause', () => {
  // Reference = the legacy situation: paused, and the stack is something the mine code cannot
  // possibly care about. The new code reads nothing but the stack, so an identical vector here is
  // proof that flight/menu audio is untouched.
  const ref = boot([]);
  ref.bus.emit('sim:pause', {});
  advance(ref, 1.2);
  const reference = busSnapshot(ref.rt);
  assert.equal(reference.music, 0, 'a plain pause still zeroes the music bus');
  assert.ok(reference.ambient > 0, 'the ambient bus was never part of the pause silence');
  assert.equal(reference.mine, 0.0001, 'no mine bus outside the mine');

  for (const id of PAUSING_SCREENS) {
    if (id === MINE_SCREEN_ID) continue;
    const h = boot([id]);
    h.bus.emit('sim:pause', {});
    advance(h, 1.2);
    assert.deepEqual(busSnapshot(h.rt), reference, `pausing screen "${id}" must produce the identical bus vector`);
    assert.equal(h.rt._mineBed, null, `"${id}" must not build a mine bed`);
    assert.equal(h.rt._mineGrind, null, `"${id}" must not build a mine grind`);
    assert.equal(audio._mineOwnsEar(), false, `"${id}" must not take the mine's ear`);
  }
});

section('§2 live graph: screen `drill` gets an audible bed while the sim is paused', () => {
  const h = boot(['drill']);
  h.bus.emit('sim:pause', {});
  advance(h, 1.2);
  const snap = busSnapshot(h.rt);
  assert.equal(snap.music, 0, 'the flight score does not continue inside (law §8)');
  assert.ok(snap.ambient > 0, 'law §11.9: the ambience bus must be > 0 inside the mine');
  assert.ok(snap.mine > 0.5, `the mine bus must be open, got ${snap.mine}`);
  assert.ok(h.rt._mineBed, 'the mine must build its room tone');
  assert.ok(h.rt._mineGrind, 'the mine must build its grind layers');
  for (const name of MINE_GRIND_LAYERS) {
    assert.ok(h.rt._mineGrind[name], `grind layer "${name}" must exist`);
    assert.ok(h.rt._mineGrind[name].sources.every((s) => s._started), `grind layer "${name}" must be running`);
  }
  assert.ok(h.rt._mineBed.sources.every((s) => s._started), 'the room tone sources must be running');

  // Fade-in is an envelope, not a snap, and lands inside the law's 600 ms.
  const busTimeline = h.rt._mineBus.gain.timeline;
  const rampIn = busTimeline.find((e) => e.type === 'linear' && e.val > 0.5);
  assert.ok(rampIn, 'the mine bus must fade in, not snap on');
  const setZero = busTimeline.find((e) => e.type === 'set' && e.val <= 0.0001);
  assert.ok(setZero && rampIn.t - setZero.t <= 0.6 + 1e-9,
    `the enter fade must be <= 600 ms, got ${rampIn.t - (setZero ? setZero.t : 0)}s`);
  assert.equal(Number(MINE_BED_FADE_IN_S.toFixed(3)) <= 0.6, true);

  // Retract: the stack empties, the soundscape fades out and the graph is dropped.
  h.state.ui.screenStack.length = 0;
  h.bus.emit('sim:resume', {});
  advance(h, 1.0);
  assert.equal(h.rt._mineBed, null, 'retract must drop the bed');
  assert.equal(h.rt._mineGrind, null, 'retract must drop the grind');
  assert.ok(busSnapshot(h.rt).mine <= 0.0001, 'the mine bus must close on retract');
  assert.ok(busSnapshot(h.rt).music > 0, 'the flight score must come back after retract');
});

// ===========================================================================
// §3 — law §5 coverage
// ===========================================================================
section('§3 every law §5 row maps to a cue that exists and can be synthesized', () => {
  const h = boot(['drill']);
  const rows = MINE_LAW_EVENT_ROWS;
  assert.ok(rows.length >= 12, `the §5 table transcription looks short: ${rows.length} rows`);
  const seen = new Set();
  for (const row of rows) {
    if (row.cue == null) {
      assert.match(row.source, /grind|state\.drill/, `row "${row.row}" has no cue and is not the continuous bed`);
      continue;
    }
    assert.ok(MINE_CUES[row.cue], `law row "${row.row}" names cue "${row.cue}" which is not in MINE_CUES`);
    assert.ok(MINE_CUE_CLASS_RANK[MINE_CUES[row.cue].klass] != null, `cue "${row.cue}" has no priority class`);
    // there must be a real synth branch — the default arm returns false rather than beeping
    const before = h.rt._mineVoices.length;
    const built = audio._synthMineCue(row.cue, h.ctx.currentTime, MINE_CUES[row.cue].peak, { payload: {} });
    assert.equal(built, true, `cue "${row.cue}" has no synth branch`);
    assert.ok(h.rt._mineVoices.length > before, `cue "${row.cue}" scheduled no Web Audio nodes`);
    seen.add(row.cue);
  }
  // every cue in the table is claimed by a law row (no orphan sounds), except the extras the law
  // does not tabulate but §5's rule ("every sim event gets a sound") demands.
  const EXTRA = new Set(['rockBreak', 'rockDepleted']);
  for (const key of Object.keys(MINE_CUES)) {
    assert.ok(seen.has(key) || EXTRA.has(key), `cue "${key}" is not claimed by any law §5 row`);
  }
  // an unknown key must stay SILENT, never fall through to a generic beep
  assert.equal(audio._synthMineCue('not_a_cue', 0, 0.3, { payload: {} }), false);
});

section('§3 every law row is reachable from a real bus event', () => {
  const sources = new Set(Object.keys(MINE_EVENT_CUE_MAP));
  for (const row of MINE_LAW_EVENT_ROWS) {
    if (row.cue == null) continue;
    if (row.source.startsWith('state.drill')) {
      // derived edges: the heat whine and the vent relief are polled, not evented
      assert.ok(['heatCritical', 'ventRelief'].includes(row.cue), `row "${row.row}" claims a polled source`);
      continue;
    }
    assert.ok(sources.has(row.source), `law row "${row.row}" names source "${row.source}" with no entry in MINE_EVENT_CUE_MAP`);
    assert.equal(MINE_EVENT_CUE_MAP[row.source], row.cue, `source "${row.source}" must route to "${row.cue}"`);
  }
});

// ===========================================================================
// §4 — live event routing
// ===========================================================================
const LIVE_EVENTS = [
  ['drill:yield', { commodityId: 'cmdty_ore_iron', qty: 3 }],
  ['drill:spark', { bite: true, bore: 0.4, hardness: 1.4 }],
  ['drill:break', { col: 0, row: 1, type: 'rock' }],
  ['drill:gasHit', { dmg: 12, pos: { col: 0, row: 1 } }],
  ['drill:cargoFull', { commodityId: 'cmdty_ore_iron', qty: 2 }],
  ['drill:rockDepleted', { asteroidId: 'rock-1', budget: 0 }],
  ['drill:scanPulse', { contacts: 2 }],
  ['drill:warn', { reason: 'tier', tierReq: 2 }],
  ['site:machineInstalled', { siteId: 's1', machineId: 'm1', defId: 'sm_extractor' }],
  ['site:courierLaunched', { siteId: 's1', podId: 'p1' }],
  ['site:machineStatus', { siteId: 's1', machineId: 'm1', state: 'no-power' }],
];

section('§4 inside the mine, every wired event produces a voice', () => {
  for (const [event, payload] of LIVE_EVENTS) {
    const h = boot(['drill']);
    h.bus.emit('sim:pause', {});
    advance(h, 0.8);
    resetSynthLog();
    h.bus.emit(event, payload);
    const key = MINE_EVENT_CUE_MAP[event] || MINE_EVENT_CUE_MAP[`${event}/${payload.reason}`];
    assert.ok(key, `"${event}" is not in MINE_EVENT_CUE_MAP`);
    assert.equal(spoke(key), 1, `"${event}" must voice exactly one "${key}" cue`);
  }
});

section('§4 outside the mine, none of them touch the mine graph', () => {
  const h = boot([]);
  advance(h, 0.5);
  resetSynthLog();
  for (const [event, payload] of LIVE_EVENTS) {
    h.bus.emit(event, payload);
    assert.equal(synthLog.length, 0, `"${event}" leaked a mine voice into flight`);
  }
  assert.equal(h.rt._mineBed, null);
});

section('§4 the flight-mix recipe does not double the mine voice', () => {
  const mine = boot(['drill']);
  mine.bus.emit('sim:pause', {});
  advance(mine, 0.6);
  for (const cueId of MINE_OWNED_PRESENTATION_CUES) {
    const played = audio._onCue({ id: 'presentation.mining.drill_yield', cueId, gain: 0.8 });
    assert.equal(played, null, `presentation cue "${cueId}" must not also play its flight recipe in the mine`);
  }
  // ...and outside the mine the same cue still plays its recipe exactly as before.
  const flight = boot([]);
  advance(flight, 0.2);
  const voice = audio._onCue({ id: 'presentation.mining.drill_yield', cueId: 'mining.drill.yield', gain: 0.8 });
  assert.ok(voice, 'outside the mine the flight recipe must still play');
});

section('§4 the legacy single-recipe grind loop stands down inside the mine', () => {
  const boring = { avatar: { col: 0, row: 0, isDrilling: true, drillBlocked: false, drillTarget: { col: 0, row: 1 } } };
  const h = boot(['drill'], boring);
  h.bus.emit('sim:pause', {});
  advance(h, 0.6);
  assert.equal(h.rt._wantDrillGrind, false, 'the old one-voice grind must not stack with the three-layer bed');
  assert.equal(h.rt.loops.drillGrind, undefined, 'the old grind loop voice must not exist in the mine');
  assert.equal(h.rt._mineGrindMix.active, true, 'the three-layer grind must be the one that runs');

  // Outside the mine the legacy loop is untouched.
  const f = boot([], boring);
  advance(f, 0.4);
  assert.equal(f.rt._wantDrillGrind, true, 'the legacy deep-drill grind must still work outside the mine screen');
});

// ===========================================================================
// §5 — refusals: 5 s repeat suppression, once-per-transition chime
// ===========================================================================
section('§5 the MK-gate refusal does not replay inside 5 s', () => {
  const h = boot(['drill']);
  h.bus.emit('sim:pause', {});
  advance(h, 0.6);
  resetSynthLog();
  h.bus.emit('drill:warn', { reason: 'tier', tierReq: 2 });
  assert.equal(spoke('lockRefusal'), 1, 'the first refusal must clank');

  // hammering the wall for four seconds must not replay it
  for (let i = 0; i < 40; i++) {
    FAKE_NOW_MS += 100;
    h.bus.emit('drill:warn', { reason: 'tier', tierReq: 2 });
  }
  assert.equal(spoke('lockRefusal'), 1, 'identical refusals inside 5 s must not replay (law §5)');

  // past the window it speaks again
  FAKE_NOW_MS += MINE_REFUSAL_SUPPRESS_MS + 200;
  h.bus.emit('drill:warn', { reason: 'tier', tierReq: 2 });
  assert.equal(spoke('lockRefusal'), 2, 'after 5 s the refusal must be allowed to speak again');
});

section('§5 a starved machine chimes once per transition, not once per report', () => {
  const h = boot(['drill']);
  h.bus.emit('sim:pause', {});
  advance(h, 0.6);
  resetSynthLog();
  for (let i = 0; i < 10; i++) {
    FAKE_NOW_MS += 250;
    h.bus.emit('site:machineStatus', { siteId: 's1', machineId: 'm1', state: 'no-power' });
  }
  assert.equal(spoke('machineStarved'), 1, 'a starved machine chimes once per transition, not per report');
  // recovering and starving again is a NEW transition and does speak
  FAKE_NOW_MS += MINE_REFUSAL_SUPPRESS_MS + 1000;
  h.bus.emit('site:machineStatus', { siteId: 's1', machineId: 'm1', state: 'running' });
  h.bus.emit('site:machineStatus', { siteId: 's1', machineId: 'm1', state: 'no-power' });
  assert.equal(spoke('machineStarved'), 2, 'a fresh starve transition must chime again');
});

section('§5 heat: the whine fires on the way up, the relief hiss on the vent', () => {
  const h = boot(['drill']);
  h.bus.emit('sim:pause', {});
  advance(h, 0.6);
  resetSynthLog();
  h.state.drill.drillTemp = MINE_HEAT_CRITICAL + 5;
  advance(h, 0.2);
  assert.equal(spoke('heatCritical'), 1, 'crossing the critical heat line must whine');
  assert.equal(h.rt._mineHeatCritical, true);
  // staying hot must not re-whine
  advance(h, 1.5);
  assert.equal(spoke('heatCritical'), 1, 'a sustained overheat must not repeat the whine');
  assert.equal(spoke('ventRelief'), 0, 'no relief hiss while still hot');
  // venting back below the release line gives the relief hiss
  h.state.drill.drillTemp = MINE_HEAT_RELIEF - 5;
  advance(h, 0.2);
  assert.equal(spoke('ventRelief'), 1, 'venting must give the relief hiss');
  assert.equal(h.rt._mineHeatCritical, false);
});

// ===========================================================================
// §6 — grind layer selection by hardness
// ===========================================================================
section('§6 the grind layer is chosen by the target cell material', () => {
  const boring = { boring: true, bore: 0.5 };
  const dirt = tile({ type: 'dirt', hardness: 0.75, tierReq: 1 });
  const rock = tile({ type: 'rock', hardness: 1.5, tierReq: 1 });
  const deep = tile({ type: 'rock', hardness: 2.0, tierReq: 1 });
  const gated = tile({ type: 'vein', hardness: 1.1, tierReq: 3, ore: 'cmdty_gem_diamond' });

  assert.equal(mineGrindLayers(dirt, boring).layer, 'matrix', 'regolith must ride the matrix layer');
  assert.equal(mineGrindLayers(rock, boring).layer, 'basalt', 'stone must ride the basalt layer');
  // The generator's hardest plain rock is 1.15 + 0.85 = 2.0. It must still read as stone, not as
  // a locked cell — the tier gate, not raw hardness, is what earns the metallic skate.
  assert.equal(mineGrindLayers(deep, boring).layer, 'basalt', 'the hardest plain rock must still be basalt-dominant');
  assert.ok(MINE_GRIND_CENTRES.locked > 2.0 * 1.15, 'the locked centre must sit clear of the plain-rock ceiling');
  assert.equal(mineGrindLayers(gated, boring).layer, 'locked', 'a cell the bit is not rated for must ride the locked layer');
  assert.equal(mineGrindLayers(gated, boring).gated, true);

  // crossfade, not a switch: a hardness between two centres mixes both, and the mix is monotone.
  const mid = mineGrindLayers(tile({ hardness: 1.1 }), boring);
  assert.ok(mid.weights.matrix > 0 && mid.weights.basalt > 0, 'adjacent layers must crossfade');
  assert.ok(Math.abs(mid.weights.matrix + mid.weights.basalt + mid.weights.locked - 1) < 1e-9, 'weights must sum to 1');
  let prev = -1;
  for (let hRaw = MINE_GRIND_CENTRES.matrix; hRaw <= MINE_GRIND_CENTRES.basalt; hRaw += 0.05) {
    const w = mineGrindLayers(tile({ hardness: hRaw }), boring).weights.basalt;
    assert.ok(w >= prev - 1e-9, 'basalt weight must rise monotonically with hardness');
    prev = w;
  }

  // silent when not boring — the law's exact wording
  const idle = mineGrindLayers(rock, { boring: false, bore: 0.9 });
  assert.equal(idle.active, false);
  assert.equal(idle.gain, 0);
  assert.equal(idle.layer, null);
  assert.equal(mineGrindLayers(null, boring).active, false, 'an empty face is silent');

  // intensity rises with bore progress
  const early = mineGrindLayers(rock, { boring: true, bore: 0 });
  const late = mineGrindLayers(rock, { boring: true, bore: 1 });
  assert.ok(late.gain > early.gain + 0.2, `the grind must build with the bore (${early.gain} -> ${late.gain})`);
});

section('§6 the audio hardness mirror agrees with the sim`s materialHardness', () => {
  const archetypes = [
    { type: 'empty', hp: 0, maxHp: 0, hardness: 0 },
    { type: 'dirt', hardness: 0.75 },
    { type: 'gas', hardness: 0.5 },
    { type: 'vein', hardness: 1.15 },
    { type: 'rock', hardness: 2.0 },
    { type: 'rock' },      // no hardness field -> both must fall back the same way
    { type: 'vein' },
    { type: 'gas' },
    { type: 'dirt' },
  ];
  for (const t of archetypes) {
    assert.equal(mineTileHardness(t), materialHardness(t), `hardness mirror drifted for type "${t.type}"`);
  }
});

// ===========================================================================
// §7 — mix priority and the one-voice alert rule
// ===========================================================================
section('§7 priority order is hazard > payoff > machine state > ambience', () => {
  assert.ok(MINE_CUE_CLASS_RANK.hazard > MINE_CUE_CLASS_RANK.payoff);
  assert.ok(MINE_CUE_CLASS_RANK.payoff > MINE_CUE_CLASS_RANK.machine);
  assert.ok(MINE_CUE_CLASS_RANK.machine > MINE_CUE_CLASS_RANK.ambience);
  assert.equal(MINE_CUES.gasBreach.klass, 'hazard');
  assert.equal(MINE_CUES.oreTick.klass, 'payoff');
  assert.equal(MINE_CUES.lockRefusal.klass, 'machine');
  assert.equal(MINE_CUES.assayPing.klass, 'ambience');
  // the hazards are the loudest thing in the room, ambience the quietest
  assert.ok(MINE_CUES.gasBreach.peak > MINE_CUES.oreTick.peak);
  assert.ok(MINE_CUES.oreTick.peak > MINE_CUES.assayPing.peak);
  // nothing clips: every cue peak leaves headroom, and they ride the ambient bus (x0.063)
  for (const [key, spec] of Object.entries(MINE_CUES)) {
    assert.ok(spec.peak > 0 && spec.peak <= 0.75, `cue "${key}" peak ${spec.peak} is out of the sane window`);
  }
});

// The repo's own clipping model (check-sg08-mix-profile) computes master-referred peaks for
// `RECIPES` only, and the mine is synthesized outside that array — so nothing else in the suite has
// ever looked at how loud it is. Measure it off the live graph and pin it against the two things
// that already ship on the same bus: the station hum (a bed) and a mining one-shot (a foreground
// cue). This is what "levels sane against the flight mix" has to mean to be checkable.
section('§7 measured levels sit between the shipped bed and the shipped one-shot', () => {
  const linearGain = (v) => v * v;
  // exactly the chain `_applySettings` writes at the harness's default slider positions
  const MASTER = linearGain(0.55) * 0.501187;
  const AMBIENT = linearGain(0.7) * linearGain(0.7) * 0.06309;
  const toMaster = (busInput) => busInput * AMBIENT * MASTER;

  // reference 1 — the shipped station hum, read out of the live source so it cannot drift silently
  const audioSrc = fs.readFileSync(path.join(__dirname, '../src/audio/audioSystem.js'), 'utf8');
  const humMatch = audioSrc.match(/const humPeak = isHelios \? ([\d.]+) : ([\d.]+);/);
  assert.ok(humMatch, 'the station hum peak must still be readable from audioSystem.js');
  const STATION_HUM = Number(humMatch[2]);
  // reference 2 — a shipped mining one-shot at the default cue gain
  const ONE_SHOT = audioRecipeBasePeak(AUDIO_RECIPE_BY_ID.sfx_mining_gas_hazard) * 0.8;
  assert.ok(STATION_HUM > 0 && ONE_SHOT > 0);

  const h = boot(['drill'], { avatar: { col: 0, row: 0, isDrilling: true, drillBlocked: false, drillTarget: { col: 0, row: 1 } } });
  h.bus.emit('sim:pause', {});
  advance(h, 1.2);

  // --- the bed, measured at the ambient-bus input ---
  const bedNodes = h.rt._mineBed.nodes.filter((n) => n.gain);
  const bedInner = bedNodes.reduce((sum, n) => sum + Math.max(n.gain.value, 0), 0);
  const bedBusInput = bedInner * h.rt._mineBedGain.gain.value * h.rt._mineBus.gain.value;
  assert.ok(bedBusInput > STATION_HUM * 1.5,
    `the mine bed must be more present than a station hum (${bedBusInput.toFixed(4)} vs ${STATION_HUM})`);
  assert.ok(bedBusInput < STATION_HUM * 6,
    `the mine bed must not be a hangar (${bedBusInput.toFixed(4)} vs ${STATION_HUM})`);
  assert.ok(bedBusInput < ONE_SHOT, 'a bed must sit under a foreground cue');

  // --- the grind at its loudest possible bore, measured the same way ---
  const worst = mineGrindLayers(tile({ hardness: 1.5 }), { boring: true, bore: 1, heat: 1, energy: 1 });
  let grindInner = 0;
  for (const name of MINE_GRIND_LAYERS) {
    const l = h.rt._mineGrind[name];
    const internal = l.nodes.filter((n) => n.gain && n !== l.gain).reduce((sum, n) => sum + n.gain.value, 1);
    grindInner = Math.max(grindInner, internal * worst.gain * worst.weights[name]);
  }
  const grindBusInput = grindInner * MINE_GRIND_PEAK;
  assert.ok(grindBusInput <= ONE_SHOT * 1.25,
    `the grind must not be hotter than a foreground mining one-shot (${grindBusInput.toFixed(4)} vs ${ONE_SHOT})`);
  assert.ok(grindBusInput > STATION_HUM * 2, 'the grind must be the loudest thing in a working mine');

  // --- every cue, measured as the SUM of the partials its synth branch schedules ---
  const measured = {};
  for (const key of Object.keys(MINE_CUES)) {
    const before = h.rt._mineVoices.length;
    audio._synthMineCue(key, h.ctx.currentTime, MINE_CUES[key].peak, { payload: {} });
    let sum = 0;
    for (let i = before; i < h.rt._mineVoices.length; i++) {
      for (const n of h.rt._mineVoices[i].nodes) {
        if (!n.gain || !n.gain.timeline) continue;
        sum += n.gain.timeline.reduce((m, e) => Math.max(m, e.val), 0);
      }
    }
    measured[key] = sum;
  }
  for (const [key, sum] of Object.entries(measured)) {
    assert.ok(sum > 0, `cue "${key}" measured silent`);
    assert.ok(sum < 1, `cue "${key}" sums to ${sum.toFixed(3)} at the bus input — that clips before the limiter`);
    assert.ok(toMaster(sum) < 0.01, `cue "${key}" master-referred peak ${toMaster(sum).toExponential(2)} is out of the flight window`);
  }
  // the hazard dominates the room, ambience is the quietest thing in it
  const loudest = Object.entries(measured).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(loudest, 'gasBreach', `the loudest cue should be the hazard, got "${loudest}"`);
  const quietest = Object.entries(measured).sort((a, b) => a[1] - b[1])[0][0];
  assert.equal(quietest, 'assayPing', `the quietest cue should be the ambience ping, got "${quietest}"`);
  // and nothing but the hazard is louder than a shipped mining one-shot
  for (const [key, sum] of Object.entries(measured)) {
    if (key === 'gasBreach') continue;
    assert.ok(sum <= ONE_SHOT * 2, `cue "${key}" (${sum.toFixed(3)}) is out of family with a mining one-shot (${ONE_SHOT})`);
  }
  console.log(`       bed ${bedBusInput.toFixed(3)} · grind ${grindBusInput.toFixed(3)} · hum ${STATION_HUM} · one-shot ${ONE_SHOT} · gas ${measured.gasBreach.toFixed(3)}`);
});

section('§7 one voice at a time for alert-class sounds', () => {
  const arb = createMineVoiceArbiter();
  const gas = arb.admit('gasBreach', 1000);
  assert.equal(gas.ok, true);
  assert.equal(gas.duck, 1);

  // a LOWER-rank alert cannot cut in while the hazard holds the ear
  const heat = arb.admit('heatCritical', 1200);
  assert.equal(heat.ok, false);
  assert.equal(heat.reason, 'alert_voice_busy');
  assert.equal(heat.heldBy, 'gasBreach');

  // a non-alert cue is NOT refused — it ducks under the hazard
  const ore = arb.admit('oreTick', 1200);
  assert.equal(ore.ok, true);
  assert.equal(ore.duck, MINE_PRIORITY_DUCK);
  assert.ok(ore.gain < MINE_CUES.oreTick.peak, 'a payoff under a live hazard must be quieter');

  // ambience/bed/grind duck too
  const duck = arb.ambienceDuck(1200);
  assert.equal(duck.bed, MINE_BED_ALERT_DUCK);
  assert.equal(duck.grind, MINE_GRIND_ALERT_DUCK);
  assert.equal(duck.heldBy, 'gasBreach');

  // once the hold expires everyone is back at full
  assert.equal(arb.heldBy(2500), null);
  assert.deepEqual(arb.ambienceDuck(2500), { bed: 1, grind: 1, heldBy: null });
  assert.equal(arb.admit('heatCritical', 2500).ok, true, 'after the hold the next alert may speak');

  // a HIGHER-priority alert preempts a live lower one (class rank first, then cue priority)
  const arb2 = createMineVoiceArbiter();
  assert.equal(arb2.admit('heatCritical', 0).ok, true);
  const preempt = arb2.admit('gasBreach', 100);
  assert.equal(preempt.ok, true, 'a gas breach must cut through a heat whine');
  assert.equal(arb2.heldBy(200), 'gasBreach');
  assert.ok(MINE_CUES.gasBreach.priority > MINE_CUES.heatCritical.priority, 'the tie-break must be real');

  // rate limiting is separate from the 5 s refusal window
  const arb3 = createMineVoiceArbiter();
  assert.equal(arb3.admit('oreTick', 0).ok, true);
  assert.equal(arb3.admit('oreTick', 10).reason, 'rate_limited');
  assert.equal(arb3.admit('oreTick', 200).ok, true);
  assert.equal(arb3.admit('nope', 0).reason, 'unknown_cue');
});

section('§7 the ore tick pitches up with value', () => {
  const cheap = mineOreTickRate(1, 'cmdty_silicate');
  const good = mineOreTickRate(1, 'cmdty_ore_goldium');
  const best = mineOreTickRate(1, 'cmdty_gem_diamond');
  assert.ok(good > cheap && best > good, `pitch must climb with value: ${cheap} ${good} ${best}`);
  assert.ok(mineOreTickRate(6, 'cmdty_silicate') > cheap, 'a bigger haul reads higher too');
  assert.ok(mineOreTickRate(9999, 'cmdty_gem_diamond') <= 1.9, 'pitch is clamped');
});

// ===========================================================================
// §8b — the mine holds still: no automation-event storm, and re-entry re-asserts
// ===========================================================================
section('§8b a quiet mine writes almost no automation events', () => {
  const h = boot(['drill']);
  h.bus.emit('sim:pause', {});
  advance(h, 1.0);
  const params = [h.rt._mineBus.gain, h.rt._mineBedGain.gain,
    ...MINE_GRIND_LAYERS.map((n) => h.rt._mineGrind[n].gain.gain)];
  const before = params.reduce((n, p) => n + p.timeline.length, 0);
  advance(h, 10); // ten seconds of standing still in the rock
  const after = params.reduce((n, p) => n + p.timeline.length, 0);
  // 200 frames x 5 params would be 1000 events without the memoryless-write guard.
  assert.ok(after - before <= 12, `idle mine scheduled ${after - before} automation events in 10 s`);
});

section('§8b re-entering the mine re-asserts the whole mix', () => {
  const h = boot(['drill']);
  h.bus.emit('sim:pause', {});
  advance(h, 1.0);
  assert.ok(busSnapshot(h.rt).mine > 0.5);
  h.state.ui.screenStack.length = 0;
  h.bus.emit('sim:resume', {});
  advance(h, 1.0);
  assert.ok(busSnapshot(h.rt).mine <= 0.0001, 'the mine must close behind you');
  // back in
  h.state.ui.screenStack.push('drill');
  h.bus.emit('sim:pause', {});
  advance(h, 1.0);
  assert.ok(busSnapshot(h.rt).mine > 0.5, 're-entry must reopen the mine bus');
  assert.ok(h.rt._mineBed, 're-entry must rebuild the bed');
  assert.equal(busSnapshot(h.rt).music, 0, 're-entry must put the score back outside');
});

// ===========================================================================
// §8 — mutation guards: prove the assertions above can actually go red
// ===========================================================================
section('§8 mutation guards bite', () => {
  // the pause parity check must fail if the mine ever claims a non-mine screen
  const fakeIntent = (id) => resolveMineAudioIntent({ screenStack: [id], paused: true, muted: false });
  assert.notDeepEqual(fakeIntent('drill'), fakeIntent('pause'),
    'if these ever match, §1 and §2 are asserting nothing');
  // the grind layer test must distinguish the three layers
  const boring = { boring: true, bore: 0.5 };
  const layers = new Set([
    mineGrindLayers(tile({ type: 'dirt', hardness: 0.75 }), boring).layer,
    mineGrindLayers(tile({ hardness: 1.5 }), boring).layer,
    mineGrindLayers(tile({ hardness: 1.1, tierReq: 3 }), boring).layer,
  ]);
  assert.equal(layers.size, 3, 'the three layers must be distinguishable or §6 proves nothing');
  // the arbiter must actually be capable of refusing
  const arb = createMineVoiceArbiter();
  arb.admit('lockRefusal', 0);
  assert.equal(arb.admit('lockRefusal', MINE_REFUSAL_SUPPRESS_MS - 1).ok, false);
  assert.equal(arb.admit('lockRefusal', MINE_REFUSAL_SUPPRESS_MS + 1).ok, true);
});

try { audio.destroy(); } catch (_) {}

if (failures.length) {
  console.error(`\nasteroid-sound-routing: FAIL (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nasteroid-sound-routing: PASS');
