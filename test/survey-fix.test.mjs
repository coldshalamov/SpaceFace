// Survey fix: a Survey Lab sells an imperfect bearing to a sealed cache.
// The buy is the dock's own Survey control. Proximity identify, not the mark,
// is what opens the cache into a ropeable pod.
//
// Run: node --test test/survey-fix.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { economy } from '../src/systems/economy.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';
import { createStationApp } from '../src/ui/station/stationApp.js';
import { getDressingRow } from '../src/world/dressingTable.js';

const SEED = 4242;
const SEDNA = 'sector_sedna_dark';
const VAULT = 'poi_sedna_vault';
const RHEA = 'sector_rhea_cinder';
const CLAIM = 'poi_rhea_claim';

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.parentNode = null;
    this.hidden = false;
    this.isConnected = true;
    this.tabIndex = 0;
    this.className = '';
    this.id = '';
    this._cls = new Set();
    this._listeners = {};
    this._bySel = new Map();
    let text = '';
    let html = '';
    Object.defineProperty(this, 'textContent', {
      get: () => text,
      set: (v) => { text = String(v); },
      configurable: true,
    });
    Object.defineProperty(this, 'innerHTML', {
      get: () => html,
      set: (v) => { html = String(v); this._hasHtml = html.length > 0; },
      configurable: true,
    });
    this.classList = {
      add: (...names) => names.forEach((n) => this._cls.add(n)),
      remove: (...names) => names.forEach((n) => this._cls.delete(n)),
      toggle: (n, force) => {
        const on = force === undefined ? !this._cls.has(n) : !!force;
        if (on) this._cls.add(n); else this._cls.delete(n);
        return on;
      },
      contains: (n) => this._cls.has(n),
    };
  }
  querySelector(sel) {
    if (!this._bySel.has(sel)) {
      const child = new FakeEl('div');
      child._hasHtml = true;
      this._bySel.set(sel, child);
    }
    return this._bySel.get(sel);
  }
  querySelectorAll() { return []; }
  getElementsByClassName() { return []; }
  appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; }
  append(...nodes) { nodes.flat().forEach((n) => { if (typeof n === 'string') return; this.appendChild(n); }); }
  prepend(...nodes) { nodes.flat().reverse().forEach((n) => { if (typeof n === 'string') return; this.children.unshift(n); if (n) n.parentNode = this; }); }
  replaceChildren(...nodes) {
    this.children = [];
    nodes.flat().forEach((n) => { if (typeof n === 'string') return; this.appendChild(n); });
  }
  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
    if (child) child.parentNode = null;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener() {}
  setAttribute(k, v) { this.attributes[String(k)] = String(v); }
  getAttribute(k) { return this.attributes[String(k)] ?? null; }
  removeAttribute(k) { delete this.attributes[String(k)]; }
  hasAttribute(k) { return String(k) in this.attributes; }
  closest() { return null; }
  contains() { return false; }
  focus() {}
  click() {}
  get firstChild() {
    if (this.children.length) return this.children[0];
    if (this._hasHtml) {
      if (!this._implicit) this._implicit = new FakeEl('div');
      return this._implicit;
    }
    return null;
  }
  get lastChild() { return this.children.length ? this.children[this.children.length - 1] : null; }
  get childElementCount() { return this.children.length; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }; }
}

function installDom() {
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
  };
  const head = new FakeEl('head');
  const body = new FakeEl('body');
  globalThis.document = {
    createElement: (tag) => new FakeEl(tag),
    getElementById: () => null,
    head,
    body,
    activeElement: null,
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
    documentElement: new FakeEl('html'),
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 720,
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  const timers = new Set();
  const prevSet = globalThis.setTimeout;
  const prevClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = prevSet(fn, ms, ...args);
    // The dock schedules a repaint 60ms after a service click. Running that
    // repaint against this stand-in document allocates without bound.
    if (ms === 60) timers.add(id);
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
    return prevClear(id);
  };
  return () => {
    for (const id of timers) prevClear(id);
    globalThis.setTimeout = prevSet;
    globalThis.clearTimeout = prevClear;
    if (prev.document === undefined) delete globalThis.document; else globalThis.document = prev.document;
    if (prev.window === undefined) delete globalThis.window; else globalThis.window = prev.window;
    if (prev.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prev.raf;
    if (prev.caf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prev.caf;
  };
}

function boot(sectorId, stationId) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [physics, world, economy] });
  const { state } = sim;
  state.mode = 'flight';
  state.meta = { ...(state.meta || {}), seed: SEED };
  const worldSystem = sim.registry.get('world');
  worldSystem.newGame();
  state.meta = { ...(state.meta || {}), seed: SEED };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: {},
  });
  state.playerId = player.id;
  worldSystem.enterSector(sectorId);
  state.player.credits = 2000;
  state.player.cargo = state.player.cargo || { usedVolume: 0, capVolume: 40, items: {} };
  state.fuel = state.fuel || { current: 40, max: 80 };
  state.ui.docked = true;
  state.ui.dockedStationId = stationId;
  state.simTime = 10;
  return { sim, state, player, bus, world: worldSystem, economy: sim.registry.get('economy') };
}

function poiRow(state, poiId) {
  const rows = state.world.activeSector && state.world.activeSector.pois;
  return (rows || []).find((row) => row && row.poiId === poiId) || null;
}

function carrier(state, row) {
  if (!row || row.id == null) return null;
  return (state.entities.get && state.entities.get(row.id)) || getDressingRow(state, row.id);
}

function movePoi(state, poiId, pos) {
  const row = poiRow(state, poiId);
  assert.ok(row && row.pos, `${poiId} is placed in the active sector`);
  row.pos.x = pos.x;
  row.pos.z = pos.z;
  const body = carrier(state, row);
  if (body && body.pos) {
    body.pos.x = pos.x;
    body.pos.z = pos.z;
  }
  return row;
}

function placeVaultOnBurn(state) {
  const hazard = (state.world.activeSector.hazards || []).find((zone) => zone && zone.type === 'radiation');
  assert.ok(hazard && hazard.center, 'Sedna keeps a live radiation hazard');
  return movePoi(state, VAULT, { x: hazard.center.x, z: hazard.center.z });
}

function mountDock(hosted) {
  const root = new FakeEl('div');
  const ctx = {
    bus: hosted.bus,
    state: hosted.state,
    screenMemory: { read: () => null, write: () => {}, get: () => null, set: () => {} },
  };
  createStationApp(root, ctx, { serviceQuote });
  const app = root.children[0];
  assert.ok(app, 'the dock mounted a station app');
  const vitals = app.querySelector('.sxb-vitals');
  return { root, app, vitals, html: vitals.innerHTML || '' };
}

function clickSurvey(vitals) {
  const html = vitals.innerHTML || '';
  assert.match(html, /data-vital-act="survey"/, 'the painted services column has a Survey control');
  assert.match(html, /Buy fix/, 'the Survey control says Buy fix');
  const handlers = vitals._listeners && vitals._listeners.click;
  assert.ok(handlers && handlers.length, 'the dock registered its own vitals click listener');
  handlers[0]({
    target: {
      closest(sel) {
        if (sel === '[data-hold]') return null;
        if (sel === '[data-vital-act]') {
          return { getAttribute: (name) => (name === 'data-vital-act' ? 'survey' : null) };
        }
        return null;
      },
    },
  });
}

function payoffPods(state, commodityId) {
  return state.entityList.filter((entity) => entity
    && entity.alive !== false
    && entity.data
    && entity.data.cachePayoff === true
    && (!commodityId || entity.data.commodityId === commodityId));
}

test('Sedna dock paints Buy fix and the click pays for a mark outside the cache', () => {
  const restore = installDom();
  try {
    const hosted = boot(SEDNA, 'station_sedna');
    const vault = placeVaultOnBurn(hosted.state);
    const before = hosted.state.player.credits;
    const dock = mountDock(hosted);
    clickSurvey(dock.vitals);
    assert.equal(hosted.state.player.credits, before - 240, 'the dock click charges 240');
    const fix = hosted.state.world.surveyFix && hosted.state.world.surveyFix[SEDNA];
    assert.ok(fix && fix.poiId === VAULT, 'the bearing names the vault');
    const course = hosted.state.nav.waypoint;
    assert.ok(course && course.reason === 'survey-fix', 'the course is the survey fix');
    assert.equal(course.pos.x, fix.mark.x);
    assert.equal(course.pos.z, fix.mark.z);
    const truth = vault.pos;
    const distance = Math.hypot(course.pos.x - truth.x, course.pos.z - truth.z);
    assert.ok(distance >= 400 + 120, `mark is ${distance.toFixed(1)} from the vault; it must stay at least a scan range plus 120 out`);
    assert.ok(distance <= fix.searchRadius + 1e-6, 'the vault sits inside the stated search disc');
    const toasts = [];
    hosted.bus.on('toast', (toast) => toasts.push(toast));
    // The spoken line was emitted during the click, before this listener.
    // Read it from the open fix, which the charge commit stored from that same line.
    assert.match(fix.spoken, /burn/i, 'the search crosses Sedna\'s burn, and the line says so');
    assert.equal(payoffPods(hosted.state, 'cmdty_crystal_lumin').length, 0, 'buying the fix does not open the vault');

    const again = hosted.state.player.credits;
    clickSurvey(dock.vitals);
    assert.equal(hosted.state.player.credits, again, 'a second buy while a fix is open charges nothing');
    assert.equal(hosted.state.world.surveyFix[SEDNA].poiId, VAULT);
  } finally {
    restore();
  }
});

test('a short purse still shows Buy fix and the click writes nothing', () => {
  const restore = installDom();
  try {
    const hosted = boot(SEDNA, 'station_sedna');
    placeVaultOnBurn(hosted.state);
    hosted.state.player.credits = 100;
    const dock = mountDock(hosted);
    clickSurvey(dock.vitals);
    assert.equal(hosted.state.player.credits, 100);
    assert.equal(hosted.state.world.surveyFix && hosted.state.world.surveyFix[SEDNA], undefined);
    assert.notEqual(hosted.state.nav.waypoint && hosted.state.nav.waypoint.reason, 'survey-fix');
  } finally {
    restore();
  }
});

test('Rhea paints no Survey control and a survey charge there does nothing', () => {
  const restore = installDom();
  try {
    const hosted = boot(RHEA, 'station_rhea_cinder');
    const dock = mountDock(hosted);
    assert.doesNotMatch(dock.html, /data-vital-act="survey"/, 'Cinder Claim has no survey lab');
    const before = hosted.state.player.credits;
    hosted.economy.handleService({ type: 'survey_fix' });
    assert.equal(hosted.state.player.credits, before);
    assert.equal(hosted.state.world.surveyFix && hosted.state.world.surveyFix[RHEA], undefined);
  } finally {
    restore();
  }
});

test('an identified vault takes the Survey control off the Sedna dock', () => {
  const restore = installDom();
  try {
    const hosted = boot(SEDNA, 'station_sedna');
    const disc = hosted.state.world.discovery[SEDNA];
    disc.pois[VAULT] = { ...(disc.pois[VAULT] || {}), discovered: true, identified: true };
    const dock = mountDock(hosted);
    assert.doesNotMatch(dock.html, /data-vital-act="survey"/);
  } finally {
    restore();
  }
});

test('the sold mark does not open the vault; standing on the vault does', () => {
  const restore = installDom();
  try {
    const hosted = boot(SEDNA, 'station_sedna');
    const vault = placeVaultOnBurn(hosted.state);
    const dock = mountDock(hosted);
    clickSurvey(dock.vitals);
    const course = hosted.state.nav.waypoint;
    hosted.player.pos.x = course.pos.x;
    hosted.player.pos.z = course.pos.z;
    hosted.world._tickPOIScan(hosted.state);
    const rec = hosted.state.world.discovery[SEDNA].pois[VAULT];
    assert.notEqual(rec && rec.identified, true, 'the mark is outside the scan range');
    assert.equal(payoffPods(hosted.state, 'cmdty_crystal_lumin').length, 0);

    hosted.player.pos.x = vault.pos.x;
    hosted.player.pos.z = vault.pos.z;
    hosted.world._tickPOIScan(hosted.state);
    const opened = hosted.state.world.discovery[SEDNA].pois[VAULT];
    assert.equal(opened.identified, true);
    assert.equal(opened.investigated, true);
    const pods = payoffPods(hosted.state, 'cmdty_crystal_lumin');
    assert.equal(pods.length, 1, 'identify drops one phosphor pod');
    assert.equal(pods[0].data.amount, 4);
    assert.equal(hosted.state.world.surveyFix[SEDNA], undefined, 'the bearing is spent');
    assert.notEqual(hosted.state.nav.waypoint && hosted.state.nav.waypoint.reason, 'survey-fix');
  } finally {
    restore();
  }
});

test('a sector sweep still skips the hidden vault', () => {
  const hosted = boot(SEDNA, 'station_sedna');
  hosted.world._scanning = true;
  hosted.world._scanT = 2;
  hosted.world._tickScan(1, hosted.state);
  const rec = hosted.state.world.discovery[SEDNA].pois[VAULT];
  assert.notEqual(rec && rec.discovered, true, 'a sweep does not discover a hidden cache');
});

test('Rhea\'s burned cache opens when the ship stands on it, with no fix bought', () => {
  const hosted = boot(RHEA, 'station_rhea_cinder');
  const claim = poiRow(hosted.state, CLAIM);
  assert.ok(claim && claim.pos, 'the burned cache is in the sector');
  hosted.player.pos.x = claim.pos.x;
  hosted.player.pos.z = claim.pos.z;
  hosted.world._tickPOIScan(hosted.state);
  const pods = payoffPods(hosted.state, 'cmdty_ore_goldium');
  assert.equal(pods.length, 1, 'stumbling onto the cache drops the gold');
  assert.equal(pods[0].data.amount, 2);
  const rec = hosted.state.world.discovery[RHEA].pois[CLAIM];
  assert.equal(rec.investigated, true);
});
