import test from 'node:test';
import assert from 'node:assert/strict';
import { audio } from '../src/audio/audioSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { createScreenManager } from '../src/ui/screenManager.js';

// Adapted from audio-mix-direction's Web Audio graph double: the production voice builder,
// event subscribers, envelope scheduling and graph ownership all execute unchanged.
class Param {
  constructor(value = 1) { this.value = value; this.timeline = []; }
  write(type, value, time, extra) { this.value = value; this.timeline.push({ type, value, time, extra }); return this; }
  setValueAtTime(v, t) { return this.write('set', v, t); }
  setTargetAtTime(v, t, tc) { return this.write('target', v, t, tc); }
  linearRampToValueAtTime(v, t) { return this.write('linear', v, t); }
  exponentialRampToValueAtTime(v, t) { return this.write('exponential', v, t); }
  cancelScheduledValues(t) { this.timeline = this.timeline.filter(e => e.time < t); return this; }
}
class Node {
  constructor() { this.gain = new Param(); this.frequency = new Param(440); this.detune = new Param(0); this.Q = new Param(); this.playbackRate = new Param(); this.pan = new Param(); this.stops = []; }
  connect() {} disconnect() {} start(t) { this.started = t; } stop(t) { this.stops.push(t); }
}
class Context {
  constructor() { this.currentTime = 1; this.state = 'running'; this.sampleRate = 8000; }
  createGain() { return new Node(); } createOscillator() { return new Node(); }
  createBiquadFilter() { return new Node(); } createBufferSource() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createBuffer(_c, n, sampleRate) { return { sampleRate, getChannelData: () => new Float32Array(n) }; }
  createWaveShaper() { return new Node(); }
}
// Adapted from screen-warm-lifecycle's minimal DOM; ScreenManager itself owns the modal and pause.
function screenManager(state, bus) {
  class Element {
    constructor() {
      this.style = {}; this.dataset = {}; this.children = []; this.attributes = new Map();
      this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    }
    appendChild(el) { el.parentNode = this; this.children.push(el); }
    removeChild(el) { this.children = this.children.filter(child => child !== el); el.parentNode = null; }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    removeAttribute(k) { this.attributes.delete(k); }
    addEventListener() {} removeEventListener() {} querySelectorAll() { return []; }
    querySelector() { return null; } contains() { return false; } focus() {}
  }
  const body = new Element(), screens = new Element(), backdrop = new Element(), hud = new Element();
  const byId = { screens, 'modal-backdrop': backdrop, hud };
  globalThis.document = { body, documentElement: body, activeElement: null,
    getElementById: id => byId[id] || null, createElement: () => new Element(),
    addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const manager = createScreenManager({ state, bus, timeEffects: { set() {}, clear() {} } });
  manager.register({ id: 'pause', mount() {} });
  return manager;
}
function boot() {
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, flags: {}, type: 'ship' };
  const target = { id: 9, alive: true, mass: 400, pos: { x: 40, z: 0 }, type: 'asteroid' };
  const state = { mode: 'flight', tick: 1, simTime: 1, playerId: 1,
    entities: new Map([[1, player], [9, target]]), entityList: [player, target],
    player: { tether: { active: true, targetId: 9, phase: 'loaded', load: 0.55, strain: 0.2,
      lineControl: true, reeling: true, lineLengthRate: -0.4, reelStrength: 0.6 } },
    input: {}, world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    ui: { screenStack: [] }, settings: { audio: { muted: false }, video: {}, accessibility: {} } };
  const bus = createBus(), host = Object.create(audio);
  host.init({ state, bus, helpers: {} });
  const rt = host.rt, ctx = new Context();
  rt.ctx = ctx;
  rt.combatBus = new Node(); rt.sfxBus = new Node(); rt.musicBus = new Node(); rt.uiBus = new Node();
  rt.ambientBus = new Node(); rt.engineBus = new Node();
  // Only prevent unrelated engine/pressure graph creation on resume; tether and voice graphs are real.
  host._ensureContinuousSources = () => {};
  host._playAccessibilityCue = () => {};
  host._ensureTetherHum();
  const screens = screenManager(state, bus);
  return { host, rt, ctx, state, bus, player, target, screens };
}

test('Massline load and moving spool go quiet on covered pause, recover once, and release', () => {
  const { host, rt, ctx, state, screens } = boot();
  host._updateTetherHum();
  const rope = rt.tetherHum, spool = rt._tetherSpoolGain;
  const loadGain = rope.gain.value, spoolGain = spool.gain.value;
  assert.ok(loadGain > 0.0001 && spoolGain > 0.0001);
  ctx.currentTime = 2;
  screens.pushScreen('pause');
  assert.equal(rope.gain.value, 0.0001);
  assert.equal(spool.gain.value, 0.0001, 'the running spool must be silenced at the pause boundary');
  host._updateTetherHum();
  assert.equal(spool.gain.value, 0.0001);
  ctx.currentTime = 3; screens.closeAll();
  host._updateTetherHum();
  assert.equal(rt.tetherHum, rope); assert.equal(rt._tetherSpoolGain, spool);
  assert.equal(rope.gain.value, loadGain); assert.equal(spool.gain.value, spoolGain);
  state.player.tether.lineLengthRate = 0; state.player.tether.reeling = false;
  ctx.currentTime = 3.5; host._updateTetherHum();
  assert.equal(spool.gain.value, 0.0001, 'a stationary winch falls silent while its loaded rope remains');
  assert.equal(rope.gain.value, loadGain);
  state.player.tether = { active: false, phase: 'released', load: 0, strain: 0 };
  state.entities.delete(9); ctx.currentTime = 4; host._updateTetherHum();
  assert.equal(rope.gain.value, 0.0001); assert.equal(spool.gain.value, 0.0001);
  screens.destroy(); host.destroy();
});

test('continuous combat beam schedules one voice, releases on pause, rearms on work and retires with owner', () => {
  const { host, rt, ctx, state, bus, player, screens } = boot();
  const fire = { ownerId: 1, weaponId: 'wpn_beam_laser', origin: player.pos, continuous: true };
  bus.emit('combat:fire', fire);
  const first = rt.loops.beam_1;
  assert.ok(first, 'a real beam receipt builds the recipe graph');
  bus.emit('combat:fire', fire);
  assert.equal(rt.loops.beam_1, first, 'repeated work receipts share one voice');
  ctx.currentTime = 2; screens.pushScreen('pause');
  assert.equal(rt.loops.beam_1, undefined);
  assert.equal(first._stopped, true);
  assert.ok(Number.isFinite(first.stopAt) && first.sources.every(s => s.stops.length));
  const uiBefore = rt.voices.length;
  host.play('sfx_ui_confirm', { gain: 0.5 });
  assert.ok(rt.voices.length > uiBefore, 'UI confirmation remains available while paused');
  ctx.currentTime = 2.05; screens.closeAll();
  assert.equal(rt.loops.beam_1, undefined, 'resume alone cannot invent work');
  bus.emit('combat:fire', fire);
  const resumed = rt.loops.beam_1;
  assert.ok(resumed && resumed !== first);
  assert.ok(first.stopAt > ctx.currentTime, 'a quick return overlaps only the old authored release tail');
  assert.equal(resumed.subVoices[0].gain.gain.timeline[0].value, 0.0001,
    'the new voice attacks from silence rather than jumping to peak');
  bus.emit('combat:fire', fire); assert.equal(rt.loops.beam_1, resumed);
  ctx.currentTime = 3; bus.emit('combat:beamStop', { ownerId: 1, ownerStillFiring: false });
  assert.equal(resumed._stopped, true); assert.equal(rt.loops.beam_1, undefined);
  bus.emit('combat:fire', fire);
  const finalVoice = rt.loops.beam_1; assert.ok(finalVoice);
  state.entities.delete(1); ctx.currentTime = 4; host._updateLoopPositions(ctx.currentTime);
  assert.equal(finalVoice._stopped, true); assert.equal(rt.loops.beam_1, undefined);
  assert.equal(rt._wantBeam[1], undefined);
  screens.destroy(); host.destroy();
});
