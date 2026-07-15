import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import * as audioModule from '../src/audio/bandBeds.js';
import * as uiModule from '../src/ui/bandHud.js';

class MiniClassList {
  constructor(node) { this.node = node; this.values = new Set(); }
  add(...tokens) { tokens.forEach((token) => this.values.add(token)); this._sync(); }
  remove(...tokens) { tokens.forEach((token) => this.values.delete(token)); this._sync(); }
  toggle(token, force) {
    const active = force == null ? !this.values.has(token) : !!force;
    if (active) this.values.add(token); else this.values.delete(token);
    this._sync();
    return active;
  }
  contains(token) { return this.values.has(token); }
  _sync() { this.node.className = [...this.values].join(' '); }
}

class MiniElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase(); this.children = []; this.parentNode = null;
    this.attributes = new Map(); this.listeners = new Map(); this.style = {}; this.hidden = false;
    this.textContent = ''; this.className = ''; this.classList = new MiniClassList(this);
    this.attributeWrites = 0;
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(name, value) { this.attributeWrites += 1; this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || null; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name) { this.listeners.delete(name); }
  click() { const fn = this.listeners.get('click'); if (fn) fn({ preventDefault() {} }); }
}

function fakeDocument() {
  const head = new MiniElement('head');
  const body = new MiniElement('body');
  return {
    head, body,
    createElement: (tag) => new MiniElement(tag),
    getElementById(id) {
      const visit = (node) => {
        if (node.id === id) return node;
        for (const child of node.children || []) { const found = visit(child); if (found) return found; }
        return null;
      };
      return visit(head) || visit(body);
    },
  };
}

test('Band HUD is one compact non-modal chip and emits tuner intent without mutating state', () => {
  assert.equal(typeof uiModule.createBandHud, 'function', 'createBandHud export must exist');
  assert.equal(typeof uiModule.BAND_HUD_CSS, 'string');
  assert.doesNotMatch(uiModule.BAND_HUD_CSS, /backdrop-filter|cockpit|visor/i);
  assert.match(uiModule.BAND_HUD_CSS, /#hud\s*>\s*\.sf-band-hud\s*\{[^}]*pointer-events\s*:\s*auto/i,
    'the chip must override the shipped #hud > * pointer-event fence at equal-or-higher specificity');
  assert.match(uiModule.BAND_HUD_CSS, /\.sf-band-hud\s*\{[^}]*top\s*:\s*150px[^}]*bottom\s*:\s*auto/i,
    'the default tuner position must avoid the lower-right radar and contact-roster column');
  const documentRef = fakeDocument();
  const host = new MiniElement('div');
  host.id = 'hud';
  documentRef.body.appendChild(host);
  const bus = createBus();
  const cycles = [];
  bus.on('band:cycle', (payload) => cycles.push(payload));
  const state = { mode: 'flight', ui: { docked: false }, bandRadio: { channelId: null, signalStrength: 0 } };
  const hud = uiModule.createBandHud({ state, bus }, { documentRef, host });
  hud.update();
  assert.match(hud.button.textContent, /BAND.*OFF/);
  assert.match(hud.button.getAttribute('aria-label'), /Band.*off/i);
  assert.equal(hud.button.getAttribute('aria-keyshortcuts'), 'Shift+O');
  const unchangedWrites = hud.button.attributeWrites;
  hud.update();
  assert.equal(hud.button.attributeWrites, unchangedWrites,
    'the render-frame update path must not rewrite unchanged Band DOM attributes');

  const before = structuredClone(state);
  hud.button.click();
  assert.equal(cycles.length, 1);
  assert.deepEqual(state, before, 'UI emits intent only');

  state.bandRadio.channelId = 'concord_bulletin';
  state.bandRadio.signalStrength = 0.82;
  hud.update();
  assert.match(hud.button.textContent, /CONCORD BULLETIN/i);
  assert.equal(hud.root.hidden, false);
  hud.destroy();
  assert.equal(host.children.includes(hud.root), false);
});

function param(value = 0) {
  return {
    value,
    cancelScheduledValues() {}, setValueAtTime(next) { this.value = next; },
    linearRampToValueAtTime(next) { this.value = next; }, exponentialRampToValueAtTime(next) { this.value = next; },
    setTargetAtTime(next) { this.value = next; },
  };
}

function fakeAudioContext() {
  const calls = { starts: 0, stops: 0, disconnects: 0 };
  const node = () => ({
    connect() {}, disconnect() { calls.disconnects += 1; },
  });
  const source = () => ({
    ...node(), loop: false, playbackRate: param(1),
    start() { calls.starts += 1; }, stop() { calls.stops += 1; },
  });
  return {
    currentTime: 1, sampleRate: 48000, calls,
    createOscillator() { return { ...source(), type: 'sine', frequency: param(440), detune: param(0) }; },
    createGain() { return { ...node(), gain: param(1) }; },
    createBiquadFilter() { return { ...node(), type: 'lowpass', frequency: param(1000), Q: param(1) }; },
    createStereoPanner() { return { ...node(), pan: param(0) }; },
    createBufferSource() { return { ...source(), buffer: null }; },
    createBuffer(_channels, length) {
      const channel = new Float32Array(length);
      return { sampleRate: 48000, getChannelData() { return channel; } };
    },
  };
}

test('procedural Band beds pool a live graph, retune cleanly, and honor RF silence', () => {
  assert.equal(typeof audioModule.createBandBedRuntime, 'function', 'createBandBedRuntime export must exist');
  assert.ok(audioModule.BAND_BED_PROFILES && audioModule.BAND_BED_PROFILES.civil_service);
  const ctx = fakeAudioContext();
  const destination = { connect() {} };
  const runtime = audioModule.createBandBedRuntime(ctx, destination, { random: () => 0.5 });
  runtime.setIntent({
    active: true, channelId: 'concord_bulletin', strength: 0.8,
    bed: { kind: 'civil_service', pulse: 'teletype', timbre: 'clean_mono' },
  });
  assert.ok(runtime.activeGraph);
  const firstGraph = runtime.activeGraph;
  const starts = ctx.calls.starts;
  runtime.setIntent({
    active: true, channelId: 'concord_bulletin', strength: 0.4,
    bed: { kind: 'civil_service', pulse: 'teletype', timbre: 'clean_mono' },
  });
  assert.equal(runtime.activeGraph, firstGraph, 'same carrier updates gain instead of rebuilding');
  assert.equal(ctx.calls.starts, starts);

  runtime.setIntent({
    active: true, channelId: 'the_static', strength: 0.7,
    bed: { kind: 'pirate_roast', pulse: 'burst_noise', timbre: 'overdriven' },
  });
  assert.notEqual(runtime.activeGraph, firstGraph);
  assert.ok(ctx.calls.stops > 0, 'old carrier sources stop on retune');

  runtime.setIntent({ active: false, silence: true });
  assert.equal(runtime.activeGraph, null);
  runtime.destroy();
});
