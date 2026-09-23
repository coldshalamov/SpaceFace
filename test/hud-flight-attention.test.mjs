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
  OPENING_INSTRUCTION_WINDOW_S,
  openingInstructionSolo,
  openingObjectivePending,
  RECEIPT_MAX,
  receiptLaneRect,
  receiptOverlapsReserved,
  resolveFirstUseEntityId,
  shouldShowFirstUseHint,
  shipGlyphBox,
  SHIP_GLYPH_BOX,
  vitalNumericVisible,
} from '../src/ui/hudAttention.js';
import { flightDestinationSurface, presentedEntityAnchorPos, resolveFlightObjectiveCommand, resolveObjectiveHudLayout } from '../src/ui/hud.js';
import { createToasts } from '../src/ui/toasts.js';
import { createSectorLawPresenter } from '../src/ui/sectorLawPresenter.js';
import { DANGER_PRIORITY, VoiceQueue } from '../src/ui/voiceArbiter.js';
import { createBus } from '../src/core/eventBus.js';

const HUD_SRC = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
const TOASTS_SRC = readFileSync(new URL('../src/ui/toasts.js', import.meta.url), 'utf8');
const UIROOT_SRC = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
const ONBOARDING_SRC = readFileSync(new URL('../src/systems/onboarding.js', import.meta.url), 'utf8');
const CSS_SRC = readFileSync(new URL('../styles/ui.css', import.meta.url), 'utf8');
const COMMS_SRC = readFileSync(new URL('../src/ui/comms.js', import.meta.url), 'utf8');
const LAW_SRC = readFileSync(new URL('../src/ui/sectorLawPresenter.js', import.meta.url), 'utf8');
const ARBITER_SRC = readFileSync(new URL('../src/ui/voiceArbiter.js', import.meta.url), 'utf8');

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
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
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

// Minimal DOM for the sector-law presenter: element.querySelector resolves data-k stubs so the
// real showSector/renderIncident paths can paint without a browser.
function installSectorLawDom() {
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
      this.dataset = {};
      this.textContent = '';
      this.id = '';
      this.className = '';
      this.hidden = false;
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    prepend(child) { return this.appendChild(child); }
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    addEventListener() {}
    querySelector() { return new FakeElement('span'); }
  }
  const byId = new Map();
  const uiRoot = new FakeElement('div');
  uiRoot.id = 'ui-root';
  byId.set('ui-root', uiRoot);
  const head = new FakeElement('head');
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    querySelector: () => null,
    head,
    body: { dataset: {} },
    activeElement: null,
  };
  return {
    uiRoot,
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

test('Lamina owns the complete integrity readout and removes the reflow-driven hit flask', () => {
  assert.match(HUD_SRC, /shipConditionMarkup/);
  assert.match(HUD_SRC, /updateShipCondition\(schematic, p, frameDt, getMotionReduced\(\), getFlashReduced\(\)\)/);
  assert.match(HUD_SRC, /sf-bars sf-bars--lamina/);
  assert.doesNotMatch(HUD_SRC, /sf-sch-ship--empty|sf-sch-ship--fill|schematic\.offsetWidth|_schFlashTimer/);
  assert.doesNotMatch(HUD_SRC, /SHIP CONDITION/);
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

test('anchored markers wait for the presented hull and track its drawn pose', () => {
  const out = { x: 0, y: 0, z: 0 };
  const entity = { id: 7, type: 'ship', alive: true, pos: { x: 500, y: 0, z: 300 } };

  // No renderer mesh registry (headless/test state): keep the sim anchor.
  const bare = { render: {}, world: { frameOrigin: { x: 0, z: 0 } } };
  assert.equal(presentedEntityAnchorPos(bare, entity, out), entity.pos,
    'without a meshes map the marker keeps its sim anchor');

  const mesh = { position: { x: 400, y: 0, z: 200 }, visible: false };
  const state = {
    render: { meshes: new Map([[7, mesh]]) },
    world: { frameOrigin: { x: 1000, z: 1000 } },
  };
  assert.equal(presentedEntityAnchorPos(state, entity, out), null,
    'a held-back root (runway / pending decode / publication gap) draws no marker over empty space');

  mesh.visible = true;
  const anchored = presentedEntityAnchorPos(state, entity, out);
  assert.equal(anchored, out);
  assert.equal(anchored.x, 1400, 'frame-local 400 re-globalized by origin 1000');
  assert.equal(anchored.z, 1200);
  assert.notEqual(anchored.x, entity.pos.x,
    'the marker follows the drawn hull, not the latest sim tick');

  state.render.meshes.delete(7);
  assert.equal(presentedEntityAnchorPos(state, entity, out), null,
    'a hull type with no registered root has not been admitted yet');
  const noMeshEntity = { id: 9, _noMesh: true, pos: { x: 1, y: 0, z: 2 } };
  assert.equal(presentedEntityAnchorPos(state, noMeshEntity, out), noMeshEntity.pos,
    'entities that never own a hull keep their sim anchor');
  assert.equal(presentedEntityAnchorPos(state, null, out), null);
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

test('the first two minutes keep exactly one instruction on screen', () => {
  // A fresh game with the staged rail running: the objective owns the whole window.
  const fresh = (simTime) => ({
    simTime,
    onboarding: { active: true, finished: false, startedAt: 0 },
    nav: { waypoint: null },
  });
  assert.equal(openingInstructionSolo(fresh(0)), true);
  assert.equal(openingInstructionSolo(fresh(OPENING_INSTRUCTION_WINDOW_S - 0.1)), true);
  // The window ends at exactly two minutes — secondary text surfaces return.
  assert.equal(openingInstructionSolo(fresh(OPENING_INSTRUCTION_WINDOW_S)), false);
  assert.equal(openingInstructionSolo(fresh(600)), false);
  // Player has done the thing and no objective stands: the others may speak again.
  assert.equal(openingInstructionSolo({
    simTime: 30,
    onboarding: { active: false, finished: true, startedAt: 0 },
    nav: { waypoint: null },
  }), false);
  // A standing objective reasserts the rule until it too is done.
  assert.equal(openingInstructionSolo({
    simTime: 30,
    onboarding: { active: false, finished: true, startedAt: 0 },
    nav: { waypoint: { reason: 'Follow the anomaly', label: 'ANOMALY' } },
  }), true);
  // A waypoint with no instruction text is a marker, not an instruction.
  assert.equal(openingObjectivePending({ nav: { waypoint: { pos: { x: 1, z: 1 } } } }), false);
  assert.equal(openingObjectivePending({ nav: { waypoint: { label: 'ANOMALY' } } }), true);
  // Defensive: no clock or no state never suppresses.
  assert.equal(openingInstructionSolo({}), false);
  assert.equal(openingInstructionSolo(null), false);
});

test('the opening window anchors to the sim clock at game start, never wall time', () => {
  // A Continue mid-window keeps the remainder — the rule survives a save/load.
  const resumed = {
    simTime: 100,
    onboarding: { active: true, finished: false, startedAt: 50 },
    nav: { waypoint: null },
  };
  assert.equal(openingInstructionSolo(resumed), true);
  resumed.simTime = 200;
  assert.equal(openingInstructionSolo(resumed), false);
  // A loaded late save is not a new game — no fresh-opening suppression.
  assert.equal(openingInstructionSolo({
    simTime: 500,
    onboarding: { active: false, finished: true, startedAt: 0 },
    nav: { waypoint: { reason: 'Deliver ore' } },
  }), false);
  // A clock rewound behind its own anchor never opens the window.
  assert.equal(openingInstructionSolo({
    simTime: 10,
    onboarding: { active: false, finished: false, startedAt: 50 },
    nav: { waypoint: { reason: 'x' } },
  }), false);
});

test('the law paragraph retires during the opening while live incidents still surface', () => {
  const dom = installSectorLawDom();
  try {
    const state = {
      mode: 'flight',
      ui: {},
      simTime: 30,
      playerId: 'p1',
      entities: new Map(),
      world: { currentSectorId: 'sector_helios', sectors: {} },
      onboarding: { active: true, finished: false, startedAt: 0 },
      nav: { waypoint: null },
    };
    const presenter = createSectorLawPresenter({ state, bus: createBus() });
    assert.equal(presenter.showSector('sector_helios'), false,
      'the jurisdiction paragraph retires while the opening objective owns the screen');
    assert.equal(presenter.el.hidden, true);
    // Danger is not an instruction: a live distress incident still surfaces inside the window.
    assert.equal(presenter.renderIncident({
      id: 'inc-1', attackerId: 'npc-9', status: 'distress',
      cause: 'npc_piracy', factionId: 'faction_scn',
    }), true, 'a live authority incident outranks the quiet window');
    assert.equal(presenter.el.hidden, false);
    presenter.hide();
    // After two minutes the entry card returns on the next sector handoff.
    state.simTime = 600;
    assert.equal(presenter.showSector('sector_helios'), true);
    assert.equal(presenter.el.hidden, false);
    presenter.destroy();
  } finally {
    dom.restore();
  }
});

test('the caption and the bypassed comms log line consult the opening rule', () => {
  // Caption: the HUD asks the rule before painting the event sentence; the aria-live line still
  // lands because assistive tech is not on screen.
  assert.match(HUD_SRC, /if \(openingInstructionSolo\(state\)[^}]*?\{\s*caption\.classList\.remove\('show'\)/,
    'the event caption must retire while the opening objective owns the screen');
  // Log line: authored scenario dialogue keeps its bypass flag, but the bypass itself yields
  // during the window so the line is held until the player has done the thing.
  assert.match(COMMS_SRC, /bypassAttentionGate\)\s*&&\s*!openingInstructionSolo\(state\)/,
    'the comms bypass must yield to the opening one-instruction rule');
  assert.match(COMMS_SRC, /attentionGateActive\(\)/,
    'ordinary chatter still queues behind the existing attention gate');
  // Law paragraph: the entry card consults the rule; incidents and receipts are untouched.
  assert.match(LAW_SRC, /function showSector[\s\S]*?if \(openingInstructionSolo\(state\)\) return false;/,
    'the sector-law entry card must retire while the opening objective owns the screen');
  assert.match(LAW_SRC, /subscribe\('law:distressRaised', renderIncident\)/,
    'live incidents keep their own surface');
});

test('the one-voice floor also keeps the objective solo during the opening', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'story', text: 'Traffic Control hails you.', ttl: 30 }, 0);
  q.enqueue({ channel: 'objective', text: 'Follow the anomaly', ttl: 30 }, 0);
  const solo = { openingSolo: true };
  // Inside the window the story line cannot hold the floor — the objective does.
  assert.equal(q.step(0, solo).channel, 'objective');
  // A higher-priority story line still cannot cut in — it stale-drops rather than surfacing late.
  assert.equal(q.step(1000, solo), null);
  assert.equal(q.active.channel, 'objective');
  // Danger is not an instruction — it always takes the floor.
  q.enqueue({ channel: 'alert', text: 'SHIELDS DOWN', priority: DANGER_PRIORITY, ttl: 5 }, 0);
  assert.equal(q.step(2000, solo).channel, 'alert');
  // Outside the window the same queue behaves exactly as before: story outranks objective.
  const open = new VoiceQueue();
  open.enqueue({ channel: 'story', text: 'Traffic Control hails you.', ttl: 30 }, 0);
  open.enqueue({ channel: 'objective', text: 'Follow the anomaly', ttl: 30 }, 0);
  assert.equal(open.step(0, {}).channel, 'story');
  // The system wrapper derives the policy from live state.
  assert.match(ARBITER_SRC, /openingSolo:\s*openingInstructionSolo\(this\.state\)/,
    'the arbiter must derive opening-solo policy from the sim clock');
});
