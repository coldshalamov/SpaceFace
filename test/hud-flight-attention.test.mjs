// Drives the shipped HUD attention contracts on the live modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  admitReceipt,
  contactRosterExpanded,
  firstUseAttachKind,
  firstUseLine,
  formatDestinationLine,
  formatRosterCount,
  hudJobFromState,
  markFirstUseHint,
  masslineInstrumentReadout,
  masslineInstrumentVisible,
  RECEIPT_MAX,
  receiptLaneRect,
  receiptOverlapsReserved,
  resolveFirstUseEntityId,
  shouldShowFirstUseHint,
  shipGlyphBox,
  SHIP_GLYPH_BOX,
  vitalNumericVisible,
} from '../src/ui/hudAttention.js';
import { flightDestinationSurface, resolveFlightObjectiveCommand, resolveObjectiveHudLayout } from '../src/ui/hud.js';
import { createToasts } from '../src/ui/toasts.js';
import { createBus } from '../src/core/eventBus.js';

const HUD_SRC = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
const TOASTS_SRC = readFileSync(new URL('../src/ui/toasts.js', import.meta.url), 'utf8');
const UIROOT_SRC = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
const ONBOARDING_SRC = readFileSync(new URL('../src/systems/onboarding.js', import.meta.url), 'utf8');
const CSS_SRC = readFileSync(new URL('../styles/ui.css', import.meta.url), 'utf8');

function installToastDom() {
  const byId = new Map();
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...vs) { vs.forEach((v) => this.values.add(v)); }
    remove(...vs) { vs.forEach((v) => this.values.delete(v)); }
    contains(v) { return this.values.has(v); }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this.style = {};
      this.textContent = '';
      this.id = '';
      this.className = '';
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    prepend(child) { return this.appendChild(child); }
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    }
    addEventListener() {}
    querySelector() { return null; }
  }
  const toasts = new FakeElement('div');
  toasts.id = 'toasts';
  const live = new FakeElement('div');
  live.id = 'toast-live';
  const hud = new FakeElement('div');
  hud.id = 'hud';
  byId.set('toasts', toasts);
  byId.set('toast-live', live);
  byId.set('hud', hud);
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    body: { dataset: {} },
    activeElement: null,
  };
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
  return {
    toasts,
    hud,
    restore() {
      globalThis.document = previous;
    },
  };
}

test('ship numbers appear only when hull or shields are actually low', () => {
  assert.equal(vitalNumericVisible(1), false);
  assert.equal(vitalNumericVisible(0.5), false);
  assert.equal(vitalNumericVisible(0.49), true);
  assert.equal(vitalNumericVisible(0), true);
  assert.equal(vitalNumericVisible(NaN), false);
});

test('ghost and fill share one glyph box', () => {
  const box = shipGlyphBox();
  assert.deepEqual(box, SHIP_GLYPH_BOX);
  assert.equal(box.width, box.width);
  assert.match(HUD_SRC, /sf-sch-ship--empty/);
  assert.match(HUD_SRC, /sf-sch-ship--fill/);
  assert.doesNotMatch(HUD_SRC, /SHIP CONDITION/);
  assert.doesNotMatch(HUD_SRC, />NOMINAL</);
});

test('one destination line already carries distance and ETA', () => {
  assert.equal(
    formatDestinationLine({
      action: 'Follow the marked route',
      distanceText: '420 WU',
      etaText: 'ETA 12s',
      bearing: '↗',
    }),
    'Follow the marked route · 420 WU · ETA 12s · ↗',
  );
  const paint = HUD_SRC.slice(
    HUD_SRC.indexOf('// --- mission tracker @10Hz ---'),
    HUD_SRC.indexOf('// --- credits / cargo / objectives'),
  );
  assert.match(paint, /flightDestinationSurface\(state, command\)/);
  assert.match(paint, /setDisplay\(mtTitle,\s*false\)/);
  assert.match(paint, /setDisplay\(mtTime,\s*false\)/);
  assert.doesNotMatch(paint, /setText\(mtTitle/);
  assert.doesNotMatch(paint, /mtMarkerLine\(/);
  assert.doesNotMatch(paint, /coreText\('currentObjective'\)/);
  assert.doesNotMatch(paint, /coreText\('tutorialObjective'\)/);
  assert.match(HUD_SRC, /setDisplay\(elNavReadout,\s*false\)/);
  const state = {
    simTime: 10,
    entities: new Map([[1, { pos: { x: 0, z: 0 }, vel: { x: 20, z: 0 } }]]),
    playerId: 1,
    nav: { waypoint: { reason: 'Follow the marked route', pos: { x: 400, z: 0 }, label: 'Helios' } },
    missions: { active: [] },
    ui: {},
  };
  const command = resolveFlightObjectiveCommand(state, state.nav.waypoint);
  const dest = flightDestinationSurface(state, command);
  assert.equal(dest.show, true);
  assert.match(dest.line, /Follow the marked route/);
  assert.match(dest.line, /WU|ETA/);
  assert.doesNotMatch(dest.line, /CURRENT OBJECTIVE|TUTORIAL OBJECTIVE|AMBER DIAMOND|GOAL ·/);
});

test('receipt taxonomy rejects Target and danger, admits pay and errors', () => {
  assert.equal(admitReceipt({ text: 'Target: Raider', kind: 'info' }).admit, false);
  assert.equal(admitReceipt({ text: 'SHIELDS DOWN', kind: 'danger' }).admit, false);
  assert.equal(admitReceipt({ text: 'CARGO FULL', kind: 'warn' }).admit, false);
  assert.equal(admitReceipt({ text: 'W thrusts. A D steer.', kind: 'info' }).admit, false);
  assert.equal(admitReceipt({ text: 'Sold 12 Iron Ore · +840 cr', kind: 'good' }).admit, true);
  assert.equal(admitReceipt({ text: 'Insufficient credits', kind: 'error' }).admit, true);
  assert.equal(admitReceipt({
    text: 'Platinum x1',
    kind: 'good',
    combat: true,
  }).admit, false);
  assert.equal(admitReceipt({
    text: 'Saved slot 1',
    kind: 'info',
    combat: true,
  }).admit, true);
  assert.equal(RECEIPT_MAX, 2);
});

test('createToasts uses admitReceipt and keeps at most two receipts', () => {
  const dom = installToastDom();
  try {
    const bus = createBus();
    createToasts({ bus });
    bus.emit('toast', { text: 'Target: Raider', kind: 'info', ttl: 2 });
    bus.emit('toast', { text: 'SHIELDS DOWN', kind: 'danger', ttl: 2 });
    bus.emit('toast', { text: 'Sold 12 Iron Ore · +840 cr', kind: 'good', ttl: 3 });
    bus.emit('toast', { text: '+12 REP · DMC', kind: 'rep', ttl: 3 });
    bus.emit('toast', { text: 'Saved slot 1', kind: 'info', ttl: 3 });
    const cards = dom.toasts.children.filter((el) => el.className && String(el.className).includes('sf-toast'));
    assert.equal(cards.length, 2);
    assert.ok(cards.every((el) => !/Target:/.test(el.textContent)));
    assert.match(TOASTS_SRC, /admitReceipt/);
    assert.match(TOASTS_SRC, /RECEIPT_MAX/);
  } finally {
    dom.restore();
  }
});

test('receipt lane sits in the HUD layout and misses radar/ship/objective', () => {
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    const layout = resolveObjectiveHudLayout(width, height);
    assert.ok(layout.receipt, `${width}x${height} exposes a receipt rectangle`);
    const lane = receiptLaneRect(layout);
    assert.deepEqual(lane, layout.receipt);
    assert.equal(receiptOverlapsReserved(layout), false, `${width}x${height} receipt misses reserved HUD`);
  }
});

test('roster stays reachable and collapses to a count at rest', () => {
  assert.equal(contactRosterExpanded({ pinned: false, nearbyHostile: false }), false);
  assert.equal(contactRosterExpanded({ nearbyHostile: true }), true);
  assert.equal(contactRosterExpanded({ selected: true }), true);
  assert.equal(formatRosterCount([
    { hostile: true },
    { hostile: true },
    { hostile: false },
  ]), '2 HOSTILE · 3');
});

test('Massline instrument is analog while latched and absent when cut', () => {
  assert.equal(masslineInstrumentVisible(null), false);
  assert.equal(masslineInstrumentVisible({ active: false }), false);
  const live = masslineInstrumentReadout({ active: true, load: 0.7, restLength: 48, phase: 'loaded' });
  assert.ok(live);
  assert.equal(live.releaseOpen, true);
  assert.equal(live.length, 48);
  assert.match(HUD_SRC, /masslineInstrumentReadout/);
  assert.doesNotMatch(HUD_SRC, /paintTetherControlChips\(/);
});

test('first-use is teach-once and object-attached', () => {
  const hints = {};
  assert.equal(shouldShowFirstUseHint(hints, 'firstStation'), true);
  markFirstUseHint(hints, 'firstStation');
  assert.equal(shouldShowFirstUseHint(hints, 'firstStation'), false);
  assert.equal(firstUseAttachKind('firstStation'), 'station');
  assert.equal(firstUseAttachKind('firstDrill'), 'rock');
  assert.equal(firstUseAttachKind('masslineThrow'), 'latch');
  assert.equal(firstUseLine('firstCombat'), 'Return fire.');
  assert.doesNotMatch(firstUseLine('firstCombat'), /LMB|Space\/F|auto-target/i);
  assert.equal(resolveFirstUseEntityId({ playerId: 1 }, {
    targetId: 1,
    attackerId: 42,
    amount: 12,
    applied: 12,
    isPlayer: true,
    brokeShield: true,
    shieldHit: true,
    hullHit: false,
  }), 42, 'live combat:damage must attach to the attacker, not the player target');
  assert.equal(resolveFirstUseEntityId({}, { attackerId: 77 }), 77);
  assert.equal(resolveFirstUseEntityId({}, { asteroidId: 12 }), 12);
  assert.equal(resolveFirstUseEntityId({
    entityList: [{ id: 9, data: { stationId: 'station_helios' } }],
  }, { stationId: 'station_helios' }), 9);
  assert.match(ONBOARDING_SRC, /hud:firstUse/);
  assert.match(ONBOARDING_SRC, /entityId/);
  assert.match(ONBOARDING_SRC, /resolveFirstUseEntityId/);
  assert.match(ONBOARDING_SRC, /entityId: p\.attackerId/);
  assert.doesNotMatch(ONBOARDING_SRC, /controlPrompt\('firstCombat'/);
  assert.doesNotMatch(ONBOARDING_SRC, /voice\.say\(\{ channel: 'tutorial', text, kind: 'info', ttl: 7/);
  assert.doesNotMatch(ONBOARDING_SRC, /_sfShowHints/);
  assert.doesNotMatch(ONBOARDING_SRC, /_updateControlBar/);
});

test('windshield key laundry is not mounted on the flight route', () => {
  assert.doesNotMatch(UIROOT_SRC, /hints\.id = 'control-hints'/);
  assert.doesNotMatch(UIROOT_SRC, /_sfShowHints/);
  assert.doesNotMatch(CSS_SRC, /#control-hints\s*\{/);
});

test('story HUD lies remain mounted', () => {
  assert.match(HUD_SRC, /createHudMeta/);
  const meta = readFileSync(fileURLToPath(new URL('../src/ui/hudMeta.js', import.meta.url)), 'utf8');
  assert.match(meta, /STABLE LOAD/);
});

test('hud job follows latch, fight, and hurt', () => {
  const entities = new Map([
    [1, { hull: 10, hullMax: 100, team: 1 }],
    [2, { alive: true, team: 2 }],
  ]);
  const state = { playerId: 1, entities, player: { targetId: 2 } };
  assert.equal(hudJobFromState(state, { active: true }), 'hurt');
  entities.get(1).hull = 100;
  assert.equal(hudJobFromState(state, { active: true }), 'latch');
  assert.equal(hudJobFromState(state, null), 'fight');
  state.player.targetId = null;
  assert.equal(hudJobFromState(state, null), 'cruise');
});
