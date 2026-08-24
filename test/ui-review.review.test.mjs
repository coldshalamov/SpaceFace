import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BLUEPRINTS } from '../src/data/blueprints.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import { stationScreen } from '../src/ui/station/stationScreen.js';
import { attemptIndustryBuild, industryReadiness } from '../src/ui/station/screens/industry.js';
import { marketCardDrivers } from '../src/ui/marketDriverPresenter.js';

function installMinimalDom() {
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...values) { values.forEach((value) => this.values.add(value)); }
    remove(...values) { values.forEach((value) => this.values.delete(value)); }
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

test('the final station cascade lets the named static-grid labels wrap without ellipses', () => {
  const css = readFileSync(new URL('../styles/station-berth.css', import.meta.url), 'utf8');
  for (const selector of [
    '.sx-app .sx-ind-row__name',
    '.sx-app .sx-ind-row__tier',
    '.sx-app .sx-fac-row__name',
    '.sx-app .sx-fac-node__copy b',
    '.sx-app .sx-fac-node__copy em',
  ]) {
    const rule = ruleBody(css, selector);
    assert.match(rule, /white-space:\s*normal/);
    assert.match(rule, /text-overflow:\s*clip/);
    assert.match(rule, /overflow-wrap:\s*anywhere/);
  }
});

test('ship blueprints and disabled fabrication controls have distinct final-cascade treatments', () => {
  const css = readFileSync(new URL('../styles/station-berth.css', import.meta.url), 'utf8');
  assert.match(ruleBody(css, '.sx-app .sx-ind-process[data-process="ship"] .sx-ind-process__items'), /grid-template-columns:\s*1fr/);
  const shipName = ruleBody(css, '.sx-app .sx-ind-process[data-process="ship"] .sx-ind-row__name');
  assert.match(shipName, /font-size:\s*var\(--sxb-t-body\)/);
  assert.match(shipName, /font-weight:\s*700/);
  const disabled = ruleBody(css, '.sx-app .sx-ind__console .sx-btn-primary:disabled');
  assert.match(disabled, /background:\s*var\(--sxb-panel-hi\)/);
  assert.match(disabled, /color:\s*var\(--sxb-ink-3\)/);
});

test('the Market transaction console does not repeat the selected unit quote', () => {
  const source = readFileSync(new URL('../src/ui/station/screens/market.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /sx-trade__unit/);
});
