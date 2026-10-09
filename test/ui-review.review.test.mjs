import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BLUEPRINTS } from '../src/data/blueprints.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import { stationScreen } from '../src/ui/station/stationScreen.js';
import { attemptIndustryBuild, industryBlocker, industryReadiness } from '../src/ui/station/screens/industry.js';
import { marketCardDrivers } from '../src/ui/marketDriverPresenter.js';

function installMinimalDom() {
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...values) { values.forEach((value) => this.values.add(value)); }
    remove(...values) { values.forEach((value) => this.values.delete(value)); }
    contains(value) { return this.values.has(value); }
    toggle(value, force) {
      const enabled = force === undefined ? !this.values.has(value) : force;
      if (enabled) this.values.add(value); else this.values.delete(value);
      return enabled;
    }
  }
  class FakeElement {
    constructor() {
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.dataset = {};
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this.hidden = false;
      this.disabled = false;
      this.inert = false;
      this.isConnected = true;
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parentNode = null;
      child.isConnected = false;
      return child;
    }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll() { return []; }
    contains(candidate) {
      for (let node = candidate; node; node = node.parentNode) if (node === this) return true;
      return false;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    focus() { document.activeElement = this; }
  }
  const body = new FakeElement();
  const screens = new FakeElement();
  const backdrop = new FakeElement();
  const hud = new FakeElement();
  body.appendChild(screens);
  body.appendChild(backdrop);
  body.appendChild(hud);
  const elements = new Map([['screens', screens], ['modal-backdrop', backdrop], ['hud', hud]]);
  globalThis.document = {
    body,
    documentElement: body,
    activeElement: body,
    createElement() { return new FakeElement(); },
    getElementById(id) { return elements.get(id) || null; },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (callback) => { callback(0); return 1; };
}

function makeBus() {
  const events = [];
  return {
    events,
    on() { return () => {}; },
    emit(type, payload) { events.push({ type, payload }); },
  };
}

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  return matches.at(-1)?.[1] || '';
}

test('screen manager destruction disposes each mounted screen definition', () => {
  installMinimalDom();
  const bus = makeBus();
  const state = { mode: 'flight', ui: { screenStack: [], docked: false, fulfillmentBlackoutActive: false } };
  const timeEffects = { set() {}, clear() {} };
  let disposed = 0;
  const manager = createScreenManager({ state, bus, timeEffects });
  manager.register({ id: 'probe', mount() {}, dispose() { disposed += 1; } });
  manager.pushScreen('probe');
  manager.destroy();
  manager.destroy();
  assert.equal(disposed, 1, 'a cached screen must release its listeners and timers exactly once');
});

test('the live station adapter exposes its app teardown to the screen manager', () => {
  assert.equal(typeof stationScreen.dispose, 'function');
});

test('Industry blocks an augment when its source module is not owned', () => {
  const blueprint = BLUEPRINTS.find((item) => item.id === 'bp_aug_shield_s_to_m');
  const cargo = Object.fromEntries(Object.entries(blueprint.inputs).map(([id, quantity]) => [id, quantity]));
  const state = {
    player: {
      researchedNodes: [blueprint.requiresTech],
      cargo: { items: cargo },
      moduleInventory: [],
      ownedShips: [],
    },
  };
  assert.deepEqual(industryReadiness(blueprint, state, 'fab'), {
    state: 'source',
    label: 'Needs Shield Booster S',
  });
  state.player.moduleInventory.push({ instanceId: 'loose-source', defId: blueprint.fromModule });
  assert.deepEqual(industryReadiness(blueprint, state, 'fab'), {
    state: 'ready',
    label: 'Ready to build',
  });
  state.player.moduleInventory.length = 0;
  state.player.ownedShips.push({ fittings: [blueprint.fromModule] });
  assert.deepEqual(industryReadiness(blueprint, state, 'fab'), {
    state: 'ready',
    label: 'Ready to build',
  });
});

test('a rejected Industry build does not play the acceptance cue', () => {
  const bus = makeBus();
  const accepted = attemptIndustryBuild({
    crafting: { build() { return false; } },
    bus,
    bpId: 'bp_aug_shield_s_to_m',
    stationId: 'station_test',
  });
  assert.equal(accepted, false);
  assert.equal(bus.events.some((event) => event.type === 'audio:cue' && event.payload?.id === 'ui_accept'), false);
});

// P02 — the Industry ladder reads the FREE, unsealed quantity: freight sealed for an active
// contract still rides in the hold, so "have" must never count it as buildable stock.
test('Industry readiness and input counts read free quantity, not sealed freight', () => {
  const blueprint = BLUEPRINTS.find((item) => item.id === 'bp_refine_metals');
  const state = {
    player: {
      researchedNodes: [],
      cargo: { items: { cmdty_ore_iron: 6, cmdty_ore_titanium: 1 } },
      moduleInventory: [],
      ownedShips: [],
    },
    missions: {
      active: [{
        id: 'm_sealed', type: 'cargo_delivery', status: 'active',
        preloadedCargo: true, params: { cmdtyId: 'cmdty_ore_iron', qty: 3 },
      }],
    },
  };
  // held 6, sealed 3 → free 3 ≥ need 3: the rung is buildable and spends only the free units.
  assert.equal(industryReadiness(blueprint, state, 'refinery').state, 'ready');
  state.missions.active[0].params.qty = 6;
  // held 6, sealed 6 → free 0: the manifest is custody, not stock.
  assert.equal(industryReadiness(blueprint, state, 'refinery').state, 'materials');
});

// P10 — a blocker names its own remedy: only a facility mismatch sends the player to the
// chart; missing research opens the tech tree and a missing source module goes to this
// station's Shipworks — never "another station" for a recipe this fabricator could run.
test('Industry blockers route each readiness reason to its own remedy', () => {
  const shieldBp = BLUEPRINTS.find((item) => item.id === 'bp_aug_shield_s_to_m');
  const refineBp = BLUEPRINTS.find((item) => item.id === 'bp_refine_metals');
  const base = {
    player: {
      researchedNodes: [],
      cargo: { items: {} },
      moduleInventory: [],
      ownedShips: [],
    },
  };
  // Missing tech at a valid fabricator → the tech tree, not the sector chart.
  const techR = industryReadiness(shieldBp, base, 'fab');
  const techBlock = industryBlocker(shieldBp, techR);
  assert.equal(techR.state, 'tech');
  assert.equal(techBlock.verb, 'tech');
  assert.match(techBlock.note, /Deflector Theory/i, 'the blocker names the missing research');
  // Missing source module at a valid fabricator → Shipworks, not another station.
  const sourceR = { ...techR, state: 'source', label: 'Needs Shield Booster S' };
  const sourceBlock = industryBlocker(shieldBp, sourceR);
  assert.equal(sourceBlock.verb, 'shipworks');
  assert.match(sourceBlock.verbLabel, /Shipworks/i);
  // A real facility mismatch keeps the chart way out.
  const stationR = industryReadiness(refineBp, base, 'fab');
  const stationBlock = industryBlocker(refineBp, stationR);
  assert.equal(stationR.state, 'station');
  assert.equal(stationBlock.verb, 'chart');
  assert.match(stationBlock.verbLabel, /refinery/i);
  // Ready and materials rows carry no blocked plate at all.
  assert.equal(industryBlocker(refineBp, { state: 'materials', label: 'Missing materials' }), null);
  assert.equal(industryBlocker(refineBp, { state: 'ready', label: 'Ready to build' }), null);
});

test('Market cards omit station-wide and neutral driver repetition', () => {
  const drivers = [
    { id: 'role', direction: 'up', value: null },
    { id: 'geography', direction: 'tight', value: 0.9 },
    { id: 'conflict', direction: 'flat', value: 1 },
    { id: 'cycle', direction: 'variable', value: 'stable' },
  ];
  assert.deepEqual(marketCardDrivers(drivers).map((driver) => driver.id), ['role']);
  drivers[2] = { id: 'conflict', direction: 'up', value: 1.25 };
  drivers[3] = { id: 'cycle', direction: 'up', value: 'rising' };
  assert.deepEqual(marketCardDrivers(drivers).map((driver) => driver.id), ['role', 'conflict', 'cycle']);
});

// The station's "final cascade" sheet (station-berth.css) is gone: the station sits on the kit
// (styles/kit.css + styles/station.css, Frontend Task C). Its rule-shape tests went with it.

test('the Market transaction console does not repeat the selected unit quote', () => {
  const source = readFileSync(new URL('../src/ui/station/screens/market.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /sx-trade__unit/);
});
