// one-voice seat: lamps are not voices, demo review 2026-11-23
// Standing condition lights stay lit. They do not take the danger seat, hide the dock
// prompt or eat a receipt's lifetime. A tracker parenthesis is a key only when it is a
// key. A class that merely contains the tier word still prints the word. A pack tag is
// written once.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createAlerts } from '../src/ui/alerts.js';
import { alertVoiceChannel, resolveVoiceSeat, VOICE_SEAT_ORDER } from '../src/ui/hudAttention.js';
import { splitTrackerActionKey } from '../src/ui/hud.js';
import { classSaysThreatTier } from '../src/ui/targetPanel.js';
import { createThreatHalo } from '../src/ui/threatHalo.js';
import { createToasts } from '../src/ui/toasts.js';
import { fakeDom } from './helpers/fake-dom.mjs';

test('one-voice seat: lamps are not voices, demo review 2026-11-23', () => {
  assert.deepEqual(VOICE_SEAT_ORDER, ['deck', 'tell', 'danger', 'speaker', 'floor', 'feed']);
  const lamp = { contains: (name) => name === 'sf-alert--danger' || name === 'sf-alert--lamp' };
  assert.equal(alertVoiceChannel(lamp), 'pill');
  assert.equal(alertVoiceChannel('sf-alert sf-alert--danger sf-alert--lamp dp-annunc'), 'pill');
  assert.equal(alertVoiceChannel('sf-alert sf-alert--dock sf-alert--lamp dp-annunc'), 'dock');
  assert.equal(alertVoiceChannel('sf-alert sf-alert--danger dp-annunc'), 'danger');
  assert.equal(alertVoiceChannel('sf-alert sf-alert--floor sf-alert--danger dp-annunc'), 'danger');
  // A timed danger still sends the dock and the pills aside. A lamp never sits in that seat,
  // so the caller simply does not report it as danger.
  assert.deepEqual([...resolveVoiceSeat({ danger: true, dock: true, pill: true }).yields].sort(), ['dock', 'pill']);
  assert.equal(resolveVoiceSeat({ pill: true, dock: true }).seat, null);
});

test('standing HULL CRITICAL and MISSILE LOCK wear the lamp class; a timed SHIELDS DOWN does not', () => {
  const dom = fakeDom();
  const previous = globalThis.document;
  globalThis.document = dom;
  const root = dom.createElement('div');
  root.id = 'alerts';
  dom.head.appendChild(root);
  try {
    const alerts = createAlerts({ bus: createBus(), state: { playerId: 'p' } });
    const hull = alerts.raise({ key: 'low-hull', sev: 'danger', text: 'HULL CRITICAL', ttl: Infinity });
    const lock = alerts.raise({ key: 'lock', sev: 'danger', text: 'MISSILE LOCK', ttl: Infinity });
    const down = alerts.raise({ key: 'shield-down', sev: 'danger', text: 'SHIELDS DOWN', ttl: 3 });
    assert.match(hull.el.className, /sf-alert--lamp/);
    assert.match(lock.el.className, /sf-alert--lamp/);
    assert.doesNotMatch(down.el.className, /sf-alert--lamp/);
    assert.match(down.el.className, /sf-alert--danger/);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('a receipt hidden by the voice seat does not age out, demo review 2026-11-23', () => {
  let nowMs = 10_000;
  const realNow = performance.now;
  performance.now = () => nowMs;
  const byId = new Map();
  class El {
    constructor() {
      this.children = [];
      this.parentNode = null;
      this.classList = { values: new Set(), add: (...v) => v.forEach((x) => this.classList.values.add(x)), remove: (...v) => v.forEach((x) => this.classList.values.delete(x)), contains: (x) => this.classList.values.has(x) };
      this.attributes = new Map();
      this.style = {};
      this.textContent = '';
      this._className = '';
    }
    get className() { return this._className; }
    set className(v) { this._className = String(v); }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
    prepend(child) { child.parentNode = this; this.children.unshift(child); return child; }
    removeChild(child) { this.children = this.children.filter((c) => c !== child); child.parentNode = null; }
    addEventListener() {}
    contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  }
  const toasts = new El();
  toasts.id = 'toasts';
  const live = new El();
  live.id = 'toast-live';
  const hud = new El();
  hud.id = 'hud';
  byId.set('toasts', toasts);
  byId.set('toast-live', live);
  byId.set('hud', hud);
  const body = {
    dataset: {},
    _yields: null,
    getAttribute(name) { return name === 'data-sf-voice-yields' ? this._yields : null; },
    setAttribute(name, value) { if (name === 'data-sf-voice-yields') this._yields = String(value); },
    removeAttribute(name) { if (name === 'data-sf-voice-yields') this._yields = null; },
  };
  const previous = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
  globalThis.document = {
    getElementById: (id) => byId.get(id) || null,
    createElement: () => new El(),
    body,
    documentElement: { dataset: {} },
    activeElement: null,
  };
  try {
    const ui = createToasts({ bus: createBus() });
    const cards = () => toasts.children.filter((el) => String(el.className).includes('sf-toast')
      && !(el.classList && el.classList.contains('sf-toast--out')));
    ui.push({ text: 'Bay jammed', kind: 'error', ttl: 2 });
    assert.equal(cards().length, 1);
    nowMs += 500;
    body.setAttribute('data-sf-voice-yields', 'feed speaker');
    ui.tick();
    nowMs += 3_000;
    ui.tick();
    assert.equal(cards().length, 1, 'three hidden seconds do not expire a two-second receipt');
    body.removeAttribute('data-sf-voice-yields');
    nowMs += 1_000;
    ui.tick();
    assert.equal(cards().length, 1, 'the receipt still has the life it had when the seat took it');
    nowMs += 700;
    ui.tick();
    assert.equal(cards().length, 0, 'it expires once its own remaining life runs out');
    ui.destroy();
  } finally {
    performance.now = realNow;
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
  }
});

test('tracker key caps are real keys, not progress or prose, demo review 2026-11-23', () => {
  assert.equal(splitTrackerActionKey('Install a drill inside a rock (1/3)'), null);
  assert.equal(splitTrackerActionKey('Install a drill (Field Build)'), null);
  assert.deepEqual(splitTrackerActionKey('Dock (E)'), { text: 'Dock', key: 'E' });
  assert.deepEqual(splitTrackerActionKey('Range (F4)'), { text: 'Range', key: 'F4' });
  assert.deepEqual(splitTrackerActionKey('Open the bay (Space)'), { text: 'Open the bay', key: 'Space' });
  assert.deepEqual(splitTrackerActionKey('Fire (LMB)'), { text: 'Fire', key: 'LMB' });
  assert.deepEqual(splitTrackerActionKey('Hold (F12)'), { text: 'Hold', key: 'F12' });
});

test('the threat word drops only on an exact class match, demo review 2026-11-23', () => {
  assert.equal(classSaysThreatTier('Light ship', 'LIGHT'), false);
  assert.equal(classSaysThreatTier('Heavy Hauler', 'HEAVY'), false);
  assert.equal(classSaysThreatTier('LIGHT', 'LIGHT'), true);
  assert.equal(classSaysThreatTier(' light ', 'LIGHT'), true);
  assert.equal(classSaysThreatTier('Fighter', 'LIGHT'), false);
});

test('the yield sheet never hides a lamp, demo review 2026-11-23', () => {
  const css = readFileSync(new URL('../styles/hud.css', import.meta.url), 'utf8');
  assert.match(css, /sf-alert--danger:not\(\.sf-alert--lamp\)/);
  assert.match(css, /sf-alert--dock:not\(\.sf-alert--lamp\)/);
  assert.match(css, /:not\(\.sf-alert--lamp\)/);
  const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  const hidden = hud.slice(hud.indexOf('function tickHidden'), hud.indexOf('function tickHidden') + 700);
  assert.match(hidden, /lastVoiceYields = ''/);
  assert.match(hidden, /removeAttribute\('data-sf-voice-yields'\)/);
});

function haloDocument() {
  const elements = [];
  const fakeElement = (tag) => {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      attributes: {},
      style: {},
      children: [],
      textContent: '',
      innerHTML: '',
      parentNode: null,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        child.parentNode = null;
      },
    };
    elements.push(el);
    return el;
  };
  return { elements, document: { createElement: fakeElement } };
}

function walk(el, cls, out) {
  if (String(el.className || '').includes(cls)) out.push(el);
  for (const child of el.children || []) walk(child, cls, out);
  return out;
}

test('a pack tag is written once as Wasp ×N, demo review 2026-11-23', () => {
  const mock = haloDocument();
  const previous = globalThis.document;
  globalThis.document = mock.document;
  try {
    const root = mock.document.createElement('div');
    const halo = createThreatHalo(root);
    const kinds = walk(root, 'sf-threat-halo__tag-kind', []);
    let writes = 0;
    for (const el of kinds) {
      let value = '';
      Object.defineProperty(el, 'textContent', {
        configurable: true,
        get() { return value; },
        set(v) {
          const next = v == null ? '' : String(v);
          if (next !== value) writes += 1;
          value = next;
        },
      });
    }
    const player = { id: 'player', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
    const wasp = (id, x) => ({
      id, type: 'ship', team: 1, alive: true, role: 'wasp',
      pos: { x, z: 0 }, vel: { x: 0, z: 0 },
      data: { encounter: true, weapons: ['wpn_pulse'], enemyTypeId: 'wasp_swarmer' },
    });
    const a = wasp('a', 900);
    const b = wasp('b', 940);
    const entities = new Map([[player.id, player], [a.id, a], [b.id, b]]);
    const state = {
      tick: 10, simTime: 10 / 60, playerId: player.id, entities,
      entityList: [player, a, b],
    };
    const offRight = (world, out) => {
      out.x = 2000;
      out.y = 360;
      out.onScreen = false;
      return out;
    };
    halo.update(player, state, offRight);
    halo.update(player, state, offRight);
    const shown = kinds.map((el) => el.textContent).filter(Boolean);
    assert.deepEqual(shown, ['Wasp ×2'], `one pack count, got ${JSON.stringify(shown)}`);
    assert.equal(writes, 1, `the pack count is written once per change, got ${writes}`);
    halo.destroy();
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
