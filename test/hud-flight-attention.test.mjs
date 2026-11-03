// Drives the shipped HUD attention contracts on the live modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

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
  syncTutorialFlightCard,
  tutorialFlightCardLayout,
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
    constructor(owner) { this.owner = owner; this.values = new Set(); }
    add(...vs) { vs.forEach((v) => this.values.add(v)); this._sync(); }
    remove(...vs) { vs.forEach((v) => this.values.delete(v)); this._sync(); }
    contains(v) { return this.values.has(v); }
    // Mirror the real DOM: className and classList are two views of one attribute. Without the
    // sync a className-based filter can never see state classes added after creation.
    _sync() { this.owner.className = Array.from(this.values).join(' '); }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.classList = new FakeClassList(this);
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
    removeAttribute(k) { this.attributes.delete(k); }
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
    documentElement: { dataset: {} },
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
  // mtTime's display is owned by paintTutorialTrackerCaption; no redundant pre-hide.
  assert.match(paint, /paintTutorialTrackerCaption\(mtTime,\s*state\)/);
  assert.doesNotMatch(paint, /setDisplay\(mtTime,\s*false\)/);
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

test('campaign story objective stays off the mission tracker during a live Crucible run', () => {
  const state = { run: { kind: 'survival', ruleset: 'swarm', phase: 'active' } };
  const storyCommand = { owner: 'story' };
  assert.deepEqual(
    flightDestinationSurface(state, storyCommand),
    { show: false, line: '', urgent: false },
    'a live survival run owns its HUD and cannot inherit the campaign story prompt',
  );

  state.run = { kind: 'adventure', phase: 'active' };
  const campaign = flightDestinationSurface(state, storyCommand);
  assert.equal(campaign.show, true, 'campaign flight keeps the story objective prompt');
  assert.match(campaign.line, /Mission Log/);
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
    // A receipt in its exit beat stays mounted ~170 ms (d9619d568); the live count is the
    // admission contract, so cards already leaving don't count against RECEIPT_MAX.
    const cards = dom.toasts.children.filter((el) => el.className && String(el.className).includes('sf-toast')
      && !el.classList.contains('sf-toast--out'));
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

test('receipt placement handles visible and hidden captions with external flight captions', () => {
  const ast = parse(HUD_SRC, { sourceType: 'module' });
  let declaration = null;
  const visit = (node) => {
    if (!node || typeof node !== 'object' || declaration) return;
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'placeReceiptLane') {
      declaration = node;
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  assert.ok(declaration, 'the production receipt placement owner is present');
  const owner = HUD_SRC.slice(declaration.start, declaration.end);
  let snapshotDeclaration = null;
  const findSnapshot = (node) => {
    if (!node || typeof node !== 'object' || snapshotDeclaration) return;
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'refreshFlightTextObstacleSnapshot') {
      snapshotDeclaration = node;
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(findSnapshot);
      else if (value && typeof value === 'object') findSnapshot(value);
    }
  };
  findSnapshot(ast);
  assert.ok(snapshotDeclaration, 'the production obstacle snapshot owner is present');
  const refreshFlightTextObstacleSnapshot = runInNewContext(
    `(${HUD_SRC.slice(snapshotDeclaration.start, snapshotDeclaration.end)})`,
    { flightTextObstaclesStale: false },
  );

  for (const { visible, external } of [
    { visible: true, external: true },
    { visible: false, external: true },
    { visible: true, external: false },
  ]) {
    const placed = [];
    let externalPlacements = 0;
    let readoutPlacements = 0;
    const receipt = { getBoundingClientRect: () => ({ height: 44 }) };
    const laneRoot = {
      style: {},
      querySelector: () => receipt,
      querySelectorAll: () => [receipt],
    };
    const caption = {
      hidden: !visible,
      scrollHeight: 56,
      style: {},
      classList: { contains: (name) => name === 'show' && visible },
      getBoundingClientRect: () => ({ height: 56 }),
    };
    const slot = {
      x: 10, width: 300, captionSlot: { x: 12, width: 120 },
    };
    const layout = { receipt: { x: 0, width: 320, height: 50 }, safe: {} };
    const context = {
      toastsLaneEl: laneRoot,
      document: { getElementById: () => laneRoot },
      window: { innerWidth: 800, innerHeight: 600 },
      caption,
      lastReceiptObstacle: null,
      lastCaptionObstacleVisible: false,
      externalCaptionsStale: false,
      externalFlightCaptions: new Set(external ? [{}] : []),
      placeAlertLaneInSafeBands: () => {},
      overlaySafeSlot: () => slot,
      freeOverlayBands: () => [{ top: 0, bottom: 160 }],
      setStyle: (el, key, value) => { el.style[key] = value; },
      getComputedStyle: () => ({ rowGap: '0px' }),
      placeCaptionInSafeSlot: (...args) => placed.push(args),
      placeExternalFlightCaptions: () => { externalPlacements++; },
      placeFlightReadouts: () => { readoutPlacements++; },
      refreshFlightTextObstacleSnapshot,
    };
    const placeReceiptLane = runInNewContext(`(${owner})`, context);
    placeReceiptLane(layout);

    assert.equal(placed.length, visible ? 1 : 0);
    if (visible) assert.equal(placed[0][2], slot.captionSlot);
    assert.equal(externalPlacements, 1);
    assert.equal(readoutPlacements, 1);
  }
});

test('caption bands reserve sibling touch controls and refresh only their layout changes', () => {
  const ast = parse(HUD_SRC, { sourceType: 'module' });
  const names = new Set(['responsiveOverlayObstacles', 'freeOverlayBands',
    'invalidateObjectiveEdgeBoxes', 'invalidateAndPlaceHudOverlays']);
  const owners = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && names.has(node.id?.name)) {
      owners.push(HUD_SRC.slice(node.start, node.end));
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  assert.equal(owners.length, names.size);
  const obstacle = (left, top, width, height) => ({
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
  });
  const status = obstacle(14, 14, 176, 124);
  const pause = obstacle(326, 14, 52, 52);
  const powers = obstacle(250, 14, 68, 44);
  const buttons = obstacle(254, 640, 124, 190);
  const hiddenDock = obstacle(0, 0, 0, 0);
  const tape = obstacle(250, 64, 128, 62);
  const touchElements = [status, pause, powers, buttons, hiddenDock];
  const touch = { querySelectorAll: () => touchElements };
  const observed = new Set();
  let observeCalls = 0;
  let placements = 0;
  let configObserver;
  const context = {
    root: { querySelectorAll: () => [], querySelector: () => true },
    document: { getElementById: () => touch, querySelectorAll: () => [] },
    window: { innerWidth: 390 },
    objectiveEdgeObstacles: () => ({}),
    externalFlightCaptions: new Set(),
    yieldedFlightVisuals: new Map(),
    responsiveOverlayElements: new Set(),
    overlayLayoutObserver: {
      observe: (el) => { observed.add(el); observeCalls++; },
      unobserve: (el) => { observed.delete(el); },
    },
    touchOverlayOwner: null,
    touchOverlayObserver: null,
    objectiveEdgeBoxes: { stale: false },
    externalCaptionsStale: false,
    invalidateReceiptLane: () => { placements++; },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; configObserver = this; }
      observe(el, options) { this.element = el; this.options = options; }
      disconnect() { this.disconnected = true; }
    },
  };
  // The ordinary selector returns no touch controls: they are outside #hud. Only the
  // production responsive owner can find and reserve these sibling rectangles.
  context.root.querySelectorAll = (selector) => selector === '#race-tape' ? [tape] : [];
  const { freeOverlayBands } = runInNewContext(`${owners.join('\n')}; ({ freeOverlayBands })`, context);
  const layout = { viewport: { width: 390 } };
  const slot = { x: 12, width: 366 };
  const bands = freeOverlayBands(slot, 844, layout);
  assert.ok(bands.length > 0, 'visible discovery space remains');
  assert.ok(bands.every((band) => band.top >= 146 && band.bottom <= 632),
    'all available bands clear ship status, top keys, race tape and lower thumb controls');
  assert.equal(observed.size, 6, 'each actual instrument is watched, including hidden dock appearance');
  freeOverlayBands(slot, 844, layout);
  assert.equal(observeCalls, 6, 'settled captions do not repeatedly register geometry observers');
  assert.equal(placements, 0, 'reading live controls does not invalidate placement');
  assert.equal(configObserver.element, touch);
  assert.deepEqual(Array.from(configObserver.options.attributeFilter), ['data-layout', 'data-lefty', 'style']);
  assert.equal(configObserver.options.subtree, undefined, 'live speed and meter updates are not observed');
  configObserver.callback();
  assert.equal(context.objectiveEdgeBoxes.stale, true);
  assert.equal(context.externalCaptionsStale, true);
  assert.equal(placements, 1, 'handedness/scale changes invalidate the caption reservation for the next paint');

  touchElements.splice(touchElements.indexOf(powers), 1);
  freeOverlayBands(slot, 844, layout);
  assert.equal(observed.has(powers), false, 'replaced controls release their geometry observer');

  // In landscape the tape sits to the left of the radar, beyond the status strip.
  const railBands = freeOverlayBands({ x: 250, width: 128 }, 390,
    { viewport: { width: 844 } });
  assert.ok(railBands.every((band) => band.top >= 134), 'the compact tape is itself a caption obstacle');
});

test('the mobile voice lane moves below open Details and View controls, then re-seats after they close', () => {
  const ast = parse(HUD_SRC, { sourceType: 'module' });
  const wanted = new Set(['freeOverlayBands', 'placeAlertLaneInSafeBands',
    'restoreAlertLanePlacement', 'invalidateObjectiveEdgeBoxes']);
  const functions = new Map();
  let alertStyleDeclaration = '';
  let setMissionDetailsExpression = '';
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === 'setMissionDetails') {
      setMissionDetailsExpression = HUD_SRC.slice(node.init.start, node.init.end);
    }
    if (node.type === 'FunctionDeclaration' && wanted.has(node.id?.name)) {
      functions.set(node.id.name, HUD_SRC.slice(node.start, node.end));
      return;
    }
    if (node.type === 'VariableDeclaration' && node.declarations?.some((item) => item.id?.name === 'ALERT_LANE_STYLE_KEYS')) {
      alertStyleDeclaration = HUD_SRC.slice(node.start, node.end);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  assert.equal(functions.size, wanted.size);
  assert.ok(alertStyleDeclaration);
  assert.ok(setMissionDetailsExpression, 'Details has a concrete open/close owner');

  const box = (name, left, top, width, height, touch = false) => ({
    name, isConnected: true, hidden: false, style: {},
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
    closest: (selector) => touch && selector === '#sf-touch-overlay' ? {} : null,
    matches: () => false,
  });
  const status = box('status', 14, 10, 124, 100, true);
  const pause = box('pause', 326, 10, 52, 52, true);
  const powers = box('powers', 250, 14, 68, 44, true);
  const objective = box('objective', 16, 122, 188, 76);
  const radar = box('radar', 250, 124, 128, 130);
  const details = box('details-panel', 8, 112, 280, 172);
  const view = box('view-options', 192, 109, 186, 141);
  const touchButtons = box('touch-buttons', 182, 490, 196, 156, true);
  const card = box('voice-floor', 0, 146, 390, 48);
  card.className = 'sf-alert sf-alert--floor';
  card.getAttribute = (key) => key === 'aria-live' ? 'off' : null;
  const lane = { id: 'alerts', style: {}, scrollHeight: 48,
    querySelectorAll: () => [card] };
  const touchRoot = { querySelector: () => touchButtons };
  let mobileFlight = true;
  let obstacles = [status, pause, powers, objective, radar, details, view, touchButtons];
  const context = {
    alertLanePlacementStale: true, alertLanePlacementActive: false, alertLaneOriginalStyle: null,
    ALERT_LANE_STYLE_KEYS: undefined,
    alertsEl: lane,
    document: { documentElement: { getAttribute: (key) => key === 'data-sf-mobile-flight' ? (mobileFlight ? '1' : '0') : null },
      defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
      getElementById: (id) => id === 'alerts' ? lane : id === 'sf-touch-overlay' ? touchRoot : null,
      querySelectorAll: (selector) => selector === '#alerts > .sf-alert:not([hidden])' ? [card] : [] },
    globalThis: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    window: { innerWidth: 390, innerHeight: 682 },
    root: { querySelectorAll: (selector) => selector === '.sf-leftcontext' ? [objective] : [],
      querySelector: () => null },
    objectiveEdgeBoxes: { stale: false }, externalCaptionsStale: false,
    flightTextObstaclesStale: false, yieldedFlightVisuals: new Map(), externalFlightCaptions: new Set(),
    responsiveOverlayObstacles: () => obstacles,
    objectiveEdgeObstacles: () => ({}),
    overlaySafeSlot: () => ({ x: 12, width: 366 }),
    setStyle: (el, key, value) => { if (el.style[key] !== value) el.style[key] = value; },
  };
  const { freeOverlayBands, placeAlertLaneInSafeBands, invalidateObjectiveEdgeBoxes } = runInNewContext(
    `${alertStyleDeclaration}\n${[...functions.values()].join('\n')}; ({ freeOverlayBands, placeAlertLaneInSafeBands, invalidateObjectiveEdgeBoxes })`, context);
  // Bind the production allocator into the placement closure after extracting both owners.
  context.freeOverlayBands = freeOverlayBands;
  const detailsState = { hidden: true };
  const detailsButton = { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
  let detailPlacementSawStale = false;
  const detailsContext = {
    mtDetails: detailsState,
    mtDetailsButton: detailsButton,
    mtDetailsClose: { focus() {} },
    flightTextObstaclesStale: false,
    alertLanePlacementStale: false,
    invalidateReceiptLane() { detailPlacementSawStale = detailsContext.alertLanePlacementStale; },
  };
  const setMissionDetails = runInNewContext(`(${setMissionDetailsExpression})`, detailsContext);
  setMissionDetails(true);
  assert.equal(detailsState.hidden, false);
  assert.equal(detailsButton.attributes['aria-expanded'], 'true');
  assert.equal(detailPlacementSawStale, true, 'opening Details invalidates the voice lane for the next paint');
  setMissionDetails(false);
  assert.equal(detailsState.hidden, true);
  assert.equal(detailsButton.attributes['aria-expanded'], 'false');
  const layout = { viewport: { width: 390 }, safe: { left: 12, width: 366 } };
  placeAlertLaneInSafeBands(layout, 390, 682);
  const openedTop = Number.parseFloat(lane.style.top);
  const openedHeight = Number.parseFloat(lane.style.maxHeight);
  assert.ok(openedTop >= 288, `voice lane starts below both open panels (${openedTop}px)`);
  assert.ok(openedTop + openedHeight < 482, 'voice lane clears the lower touch-control band');
  assert.equal(lane.style.position, 'fixed');
  assert.equal(lane.style.transform, 'none');
  assert.equal(card.name, 'voice-floor', 'the existing voice node and full text remain mounted');
  assert.equal(card.getAttribute('aria-live'), 'off', 'the voice owner retains its live-region contract');

  obstacles = [status, pause, powers, objective, radar, touchButtons];
  context.alertLanePlacementStale = false;
  invalidateObjectiveEdgeBoxes();
  assert.equal(context.alertLanePlacementStale, true, 'layout changes invalidate the cached alert seat');
  placeAlertLaneInSafeBands(layout, 390, 682);
  assert.ok(Number.parseFloat(lane.style.top) < openedTop, 'closing Details and View returns the voice to an earlier free band');
  assert.equal(card.hidden, false, 'the tutorial voice is never discarded to clear the controls');
  mobileFlight = false;
  context.alertLanePlacementStale = true;
  placeAlertLaneInSafeBands(layout, 390, 682);
  assert.equal(lane.style.position, '', 'the mobile seat is removed when returning to desktop flight');
  assert.equal(lane.style.transform, '', 'desktop transform policy remains owned by its existing stylesheet');
});

test('alert lane placement observer ignores its own style writes and cleanup releases the lane', () => {
  const ast = parse(HUD_SRC, { sourceType: 'module' });
  const names = new Set(['alertLaneStyleMutationIsOwned', 'restoreAlertLanePlacement', 'cleanupAlertLanePlacement']);
  const declarations = new Map();
  const constants = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && names.has(node.id?.name)) {
      declarations.set(node.id.name, HUD_SRC.slice(node.start, node.end));
    }
    if (node.type === 'VariableDeclaration' && node.declarations?.some((item) =>
      ['ALERT_LANE_STYLE_KEYS', 'ALERT_LANE_OWNED_CSS_PROPERTIES'].includes(item.id?.name))) {
      constants.push(HUD_SRC.slice(node.start, node.end));
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  assert.equal(declarations.size, names.size);
  assert.equal(constants.length, 2);
  const lane = { style: { position: 'fixed', top: '92px' }, getAttribute: () => lane.styleText };
  let disconnected = 0;
  const context = {
    lane, alertsEl: lane, alertLanePlacementActive: true,
    alertLaneOriginalStyle: { position: 'absolute', left: '', right: '', top: '', bottom: '', width: '',
      maxHeight: '', overflowY: '', transform: 'translateY(4px)', pointerEvents: '', boxSizing: '' },
    alertLaneObserver: { disconnect() { disconnected++; } },
    setStyle(el, key, value) { el.style[key] = value; },
  };
  const harness = runInNewContext(`${constants.join('\n')}\n${declarations.get('restoreAlertLanePlacement')}\n${declarations.get('cleanupAlertLanePlacement')}\n${declarations.get('alertLaneStyleMutationIsOwned')}\n({ cleanupAlertLanePlacement, alertLaneStyleMutationIsOwned })`, context);
  lane.styleText = 'position:fixed; top:92px; opacity:0.7';
  const ownPositionChange = { type: 'attributes', target: lane, attributeName: 'style', oldValue: 'position:absolute; top:8px; opacity:0.7' };
  assert.equal(harness.alertLaneStyleMutationIsOwned(ownPositionChange, lane), true,
    'positioning changes owned by the allocator do not schedule another placement');
  lane.styleText = 'position: fixed; inset: 484px auto auto 12px; width: 366px; max-height: 174px; overflow-y: visible; transform: none; pointer-events: none; box-sizing: border-box;';
  const cssomInsetChange = {
    type: 'attributes', target: lane, attributeName: 'style',
    oldValue: 'position: fixed; inset: 0px auto auto 12px; width: 366px; max-height: none; overflow-y: visible; transform: none; pointer-events: none; box-sizing: border-box;',
  };
  assert.equal(harness.alertLaneStyleMutationIsOwned(cssomInsetChange, lane), true,
    'CSSOM inset shorthand serialization of allocator-owned side writes is not treated as an external change');
  lane.styleText = 'position:fixed; top:92px; opacity:0';
  assert.equal(harness.alertLaneStyleMutationIsOwned(ownPositionChange, lane), false,
    'a lane visibility change remains observable even when the allocator also owns position');
  assert.equal(harness.alertLaneStyleMutationIsOwned({ ...ownPositionChange, target: {} }, lane), false,
    'child alert changes continue to refresh the lane');
  harness.cleanupAlertLanePlacement();
  assert.equal(disconnected, 1);
  assert.equal(lane.style.position, 'absolute');
  assert.equal(lane.style.transform, 'translateY(4px)');
  assert.equal(context.alertLanePlacementActive, false);
});

test('natural mobile discovery geometry chooses the opposite thumb lane and waits safely when full', () => {
  const names = new Set(['overlaySafeSlot', 'freeOverlayBands', 'placeExternalFlightCaptions',
    'placeCaptionInSafeSlot', 'clearExternalFlightCaptionPlacement', 'plateBox']);
  const owners = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && names.has(node.id?.name)) {
      owners.push(HUD_SRC.slice(node.start, node.end));
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(parse(HUD_SRC, { sourceType: 'module' }));
  assert.equal(owners.length, names.size);
  const rect = (x, y, width, height) => ({ x, y, left: x, top: y, width, height,
    right: x + width, bottom: y + height });
  const node = (name, box, touch = false) => ({
    name, isConnected: true, hidden: false, style: {},
    getBoundingClientRect: () => box,
    closest: () => touch ? {} : null,
    matches: () => false,
  });
  for (const { lefty, portrait } of [
    { lefty: false, portrait: true }, { lefty: true, portrait: true },
    { lefty: false, portrait: false },
  ]) {
    // These values came from the natural a473 discovery capture, not estimated corner
    // anchors. The stale desktop reservations plus these actual instruments returned no band.
    const w = portrait ? 390 : 844, h = portrait ? 664 : 390;
    const dock = node('dock', portrait ? rect(151.8125, 196, 226.1875, 229) : rect(518, 80, 236, 229));
    const objective = node('objective', rect(portrait ? 16 : 91.328125, portrait ? 236 : 110,
      176.84765625, 82.03125));
    const thumb = node('thumb', portrait ? rect(lefty ? 12 : 182, 490, 196, 156)
      : rect(658, 248, 170, 132), true);
    const status = node('status', rect(14, 10, 124, portrait ? 107.390625 : 92.515625), true);
    const pause = node('pause', rect(portrait ? 326 : 780, 10, 52, 52), true);
    const powers = node('powers', portrait ? rect(250, 14, 68, 44) : rect(796, 82, 48, 88), true);
    const tape = node('tape', portrait ? rect(250, 64, 128, 56) : rect(409, 108, 180, 56));
    const alert = node('alert', portrait ? rect(10, 146, 370, 38) : rect(232.328125, 22, 379.328125, 23));
    const receipts = [node('receipt', rect(14, portrait ? 359.203125 : 118, portrait ? 306 : 320, 24.890625)),
      node('receipt', rect(14, portrait ? 388.09375 : 146.890625, portrait ? 306 : 320, 24.890625))];
    let blocked = false;
    const full = node('blocking-decision', rect(0, 0, w, h));
    full.getBoundingClientRect = () => rect(0, 0, w, blocked === 'short-band' ? h - 64 : h);
    const discovery = node('discovery', rect(12, 8, 336.53125, 74));
    discovery.style.opacity = '';
    discovery.getAttribute = (key) => key === 'aria-live' ? 'polite' : null;
    const measuredWidths = [];
    let geometryReads = 0;
    Object.defineProperty(discovery, 'scrollHeight', { get() {
      const width = Number.parseFloat(discovery.style.maxWidth);
      measuredWidths.push(width);
      return width < 200 ? 148 : 74;
    } });
    const touch = { querySelector: () => thumb };
    const context = {
      root: {
        querySelectorAll: selector => selector.includes('sf-caption.show') ? receipts
          : selector === '.sf-leftcontext' ? [objective] : [dock],
        querySelector: () => true,
      },
      document: { getElementById: () => touch, querySelectorAll: () => blocked ? [alert, full] : [alert] },
      window: { innerWidth: w, innerHeight: h },
      objectiveEdgeObstacles: () => ({ right: dock.getBoundingClientRect(), rightEl: dock }),
      responsiveOverlayObstacles: () => { geometryReads++; return [thumb, status, pause, powers, tape]; },
      externalFlightCaptions: new Set([discovery]),
      externalCaptionOpacity: new Map([[discovery, '']]),
      yieldedFlightVisuals: new Map(),
      restoreYieldedFlightVisuals() {},
      externalCaptionsStale: true,
    };
    const { placeExternalFlightCaptions, clearExternalFlightCaptionPlacement,
      freeOverlayBands, overlaySafeSlot } = runInNewContext(
      `${owners.join('\n')}; ({ placeExternalFlightCaptions, clearExternalFlightCaptionPlacement, freeOverlayBands, overlaySafeSlot })`, context);
    const layout = resolveObjectiveHudLayout(w, h);
    placeExternalFlightCaptions(layout, w, h);
    assert.equal(discovery.style.left, lefty ? '216px' : '12px');
    assert.equal(discovery.style.top, portrait ? '433px' : '200px');
    assert.equal(discovery.style.maxWidth, portrait ? '162px' : '320px');
    assert.equal(discovery.style.maxHeight, portrait ? '223px' : '182px');
    assert.equal(discovery.style.overflowY, 'visible', 'wrapped discovery fits without clipping or scrolling');
    assert.equal(measuredWidths[0], portrait ? 162 : 320, 'the candidate width is applied before height measurement');
    assert.equal(discovery.style.opacity, '', 'authored class fade owns a placed discovery');
    assert.equal(context.externalCaptionsStale, false, 'settled placement does not keep scanning geometry');

    for (const obstruction of ['short-band', 'no-band']) {
      blocked = obstruction;
      context.externalCaptionsStale = true;
      if (obstruction === 'short-band') {
        const candidate = overlaySafeSlot(layout, w, h).captionSlot;
        const bands = freeOverlayBands(candidate, h, layout, discovery, true);
        assert.equal(bands.length, 1, 'this regression has a nonempty band, not just an exhausted allocator');
        assert.equal(bands[0].bottom - bands[0].top, 48, 'the band is shorter than the whole wrapped caption');
      }
      placeExternalFlightCaptions(layout, w, h);
      assert.equal(discovery.style.opacity, '0', `${obstruction}: the whole wrapped caption must fit`);
      assert.equal(discovery.style.pointerEvents, 'none');
      assert.equal(discovery.hidden, false);
      assert.equal(discovery.style.display, undefined);
      assert.equal(discovery.getAttribute('aria-live'), 'polite');
      assert.equal(context.externalCaptionsStale, false, 'deferred placement waits for an actual layout invalidation');
      const measured = measuredWidths.length, reads = geometryReads;
      placeExternalFlightCaptions(layout, w, h);
      assert.equal(measuredWidths.length, measured, 'a blocked steady frame does not measure wrapped text again');
      assert.equal(geometryReads, reads, 'a blocked steady frame does not query obstacle geometry again');
      blocked = false;
      placeExternalFlightCaptions(layout, w, h);
      assert.equal(discovery.style.opacity, '0', 'space alone does not bypass the cached placement');
      context.externalCaptionsStale = true; // the real resize/config/receipt/objective invalidation seam
      placeExternalFlightCaptions(layout, w, h);
      assert.equal(discovery.style.opacity, '', 'an invalidated freed band restores the existing class opacity/fade');
      assert.equal(discovery.style.top, portrait ? '433px' : '200px');
    }
    blocked = true;
    context.externalCaptionsStale = true;
    placeExternalFlightCaptions(layout, w, h);
    clearExternalFlightCaptionPlacement(discovery);
    assert.equal(discovery.style.opacity, '', 'unregistering a waiting discovery restores paint ownership');
    assert.equal(context.externalCaptionOpacity.has(discovery), false);
  }
});

test('critical notice borrows the objective only when crowded and restores it on reflow', () => {
  const names = new Set(['placeExternalFlightCaptions', 'restoreYieldedFlightVisuals', 'yieldFlightVisual']);
  const owners = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && names.has(node.id?.name)) {
      owners.push(HUD_SRC.slice(node.start, node.end)); return;
    }
    for (const value of Object.values(node)) Array.isArray(value) ? value.forEach(visit) : visit(value);
  };
  visit(parse(HUD_SRC, { sourceType: 'module' }));
  const objective = { style: { visibility: '' } };
  const notice = { isConnected: true, hidden: false, dataset: { flightCritical: 'true' },
    style: {}, scrollHeight: 80, getBoundingClientRect: () => ({ height: 80 }) };
  const classes = new Set();
  const touch = { querySelector: () => ({}), classList: { add: v => classes.add(v), remove: v => classes.delete(v) } };
  let free = false;
  const context = {
    root: { querySelectorAll: selector => selector.includes('sf-leftcontext') ? [objective] : [] },
    document: { getElementById: () => touch },
    externalFlightCaptions: new Set([notice]), externalCaptionOpacity: new Map([[notice, '']]),
    yieldedFlightVisuals: new Map(), externalCaptionsStale: true,
    plateBox: () => ({}), overlaySafeSlot: () => ({ x: 10, width: 200 }),
    freeOverlayBands: () => free || objective.style.visibility === 'hidden' ? [{ top: 20, bottom: 120 }] : [],
    placeCaptionInSafeSlot: (el, layout, slot, unused, band) => { el.style.top = String(band.top); },
  };
  const { placeExternalFlightCaptions } = runInNewContext(`${owners.join('\n')}; ({ placeExternalFlightCaptions })`, context);
  placeExternalFlightCaptions({}, 390, 320);
  assert.equal(objective.style.visibility, 'hidden');
  assert.equal(notice.style.opacity, '');
  assert.equal(notice.style.top, '20');
  free = true; context.externalCaptionsStale = true;
  placeExternalFlightCaptions({}, 390, 320);
  assert.equal(objective.style.visibility, '', 'objective returns when a free slot opens');
  assert.equal(classes.has('mf-notice-priority'), false);
});

test('first-flight instruction yields space to the right target dock on narrow viewports', () => {
  const wide = tutorialFlightCardLayout(resolveObjectiveHudLayout(1440, 900));
  assert.equal(wide.maxWidth, 672, 'the existing wide-screen card size is preserved');
  assert.equal(wide.centerX, 720, 'the wide-screen card remains centered');

  const narrowHud = resolveObjectiveHudLayout(900, 900);
  const narrow = tutorialFlightCardLayout(narrowHud);
  const rightDockLeft = narrowHud.rightDock.x;
  assert.ok(narrow.maxWidth < wide.maxWidth, 'the instruction condenses when the inspector consumes space');
  assert.ok(narrow.centerX + narrow.maxWidth / 2 <= rightDockLeft - 16,
    'the instruction remains clear of the target inspector');

  const phoneHud = resolveObjectiveHudLayout(320, 900);
  const phone = tutorialFlightCardLayout(phoneHud);
  assert.equal(phone.maxWidth, 275.2, 'the existing 86vw phone instruction width is preserved');
  assert.equal(phone.centerX, 160, 'the existing centered phone placement is preserved');
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

test('the opening objective defers the flight-controls card without spending its teach-once hint', () => {
  const dom = installToastDom();
  try {
    const state = {
      mode: 'flight',
      ui: {},
      simTime: 3.1,
      player: { hints: {} },
      onboarding: { active: true, finished: false, startedAt: 0, currentBeat: 0 },
      nav: { waypoint: { reason: 'Target the marked derelict.' } },
    };

    assert.equal(openingInstructionSolo(state), true);
    assert.equal(syncTutorialFlightCard(state), null, 'B0 keeps the HUD tracker as its only instruction');
    assert.equal(dom.hud.children.length, 0, 'the secondary flight-controls card is not mounted');
    assert.notEqual(state.player.hints.firstFlight, true, 'the hint remains available for the later quiet moment');

    state.simTime = OPENING_INSTRUCTION_WINDOW_S;
    const card = syncTutorialFlightCard(state);
    assert.ok(card, 'the controls card can appear when the existing opening gate expires');
    assert.match(card.textContent, /thrusts|flies/i);
    assert.equal(state.player.hints.firstFlight, true, 'the one-time hint is spent only when shown');
  } finally {
    dom.restore();
  }
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

test('mobile authority notices register and release their existing flight overlay', () => {
  const dom = installSectorLawDom();
  try {
    document.documentElement.dataset.sfMobile = '1';
    const calls = [];
    const hud = {
      registerExternalFlightCaption: (el) => calls.push(['register', el]),
      refreshExternalFlightCaption: (el) => calls.push(['refresh', el]),
      releaseExternalFlightCaption: (el) => calls.push(['release', el]),
    };
    const state = { mode: 'flight', ui: {}, simTime: 0, world: {}, playerId: 1 };
    const presenter = createSectorLawPresenter({ state, bus: createBus(), ui: { hud } });
    assert.equal(presenter.showDirectReceipt({ outcome: 'protected_withdrawal' }), true);
    assert.equal(presenter.el.parentNode, dom.uiRoot);
    assert.equal(presenter.el.dataset.flightCritical, 'true');
    assert.deepEqual(calls.map(([kind]) => kind), ['register']);
    assert.match(presenter.el.getAttribute('aria-label'), /CONTACT WITHDREW/);
    state.simTime = 5;
    presenter.tick();
    assert.equal(presenter.el.hidden, true, 'receipt retains its existing expiry');
    assert.deepEqual(calls.map(([kind]) => kind), ['register', 'release']);
    assert.equal(presenter.renderIncident({ id: 'inc', attackerId: 2, status: 'distress',
      cause: 'npc_piracy', factionId: 'faction_scn' }), true);
    assert.deepEqual(calls.map(([kind]) => kind), ['register', 'release', 'register']);
    presenter.hide();
    assert.equal(presenter.el.hidden, true);
    assert.deepEqual(calls.map(([kind]) => kind), ['register', 'release', 'register', 'release']);
    state.simTime = 30;
    assert.equal(presenter.showSector('sector_helios'), true);
    assert.equal(presenter.el.dataset.flightCritical, 'true', 'timed law line retains notice priority');
    state.simTime += 5;
    presenter.tick();
    assert.equal(presenter.el.dataset.lawMode, 'badge');
    assert.equal(presenter.el.dataset.flightCritical, undefined, 'steady badge does not evict other flight visuals');
    assert.deepEqual(calls.slice(-3).map(([kind]) => kind), ['register', 'release', 'register'],
      'the old critical registration is released before normal-priority registration');
    presenter.destroy();
  } finally { dom.restore(); }
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
