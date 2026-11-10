// ECON-07: an uninsured death names hull insurance and the premium that would have
// applied; an insured death names the deductible only. Seed 4242. The recovery charge
// stays the existing quote.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from '../src/core/rng.js';
import { buildRecoveryPlan } from '../src/combat/playerDefeat.js';
import { INSURANCE_DEFAULTS } from '../src/systems/economy.js';
import { gameOverScreen } from '../src/ui/screens/gameOver.js';

function player(defId) {
  return {
    id: 1,
    type: 'ship',
    alive: false,
    pos: { x: 0, z: 0 },
    data: { defId },
  };
}

function stateFor(defId, insurance, { locale = 'en-US', credits = 50000 } = {}) {
  return {
    tick: 4242,
    simTime: 42,
    meta: { seed: 4242 },
    rng: mulberry32(4242),
    settings: { locale, gameplay: { difficulty: 'standard' } },
    player: {
      credits,
      insurance,
      ownedShips: [{ defId }],
      activeShipIndex: 0,
      cargo: { items: {} },
    },
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: { stations: [{ stationId: 'station_helios', pos: { x: 320, z: -80 } }] },
    },
  };
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.id = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  addEventListener(event, fn) { this.listeners.set(event, fn); }
  focus() { this.ownerDocument.activeElement = this; }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.head = new FakeElement(this, 'head');
  }
  createElement(tagName) { return new FakeElement(this, tagName); }
  getElementById() { return null; }
}

function showDeath(state, plan) {
  const previous = globalThis.document;
  const document = new FakeDocument();
  globalThis.document = document;
  try {
    state.combat = {
      lastPlayerDefeat: {
        fatalSummary: 'Hull breached under fire',
        cause: 'Hull breached under fire',
        direction: 'AFT',
        dominantLayer: 'hull',
        vitalsPct: { shield: 0, armor: 0, hull: 0 },
        recovery: plan,
      },
    };
    const root = document.createElement('div');
    const ctx = {
      state,
      bus: { on() { return () => {}; }, emit() {} },
      screenManager: { top() { return 'gameOver'; }, popScreen() {}, pushScreen() {} },
      telemetry: { getSessionStats() { return { deathLog: [] }; } },
    };
    gameOverScreen.mount(root, ctx);
    gameOverScreen.onShow(ctx);
    return gameOverScreen._summaryEls.insurance.textContent;
  } finally {
    globalThis.document = previous;
  }
}

test('seed 4242 names the hull policy on an uninsured death and only the deductible when insured', () => {
  const hull = player('ship_pelican');
  const uninsured = { rate: 0.6, deductibleCr: 800, insuredModules: false, lastStationId: 'station_helios' };
  const open = buildRecoveryPlan(stateFor('ship_pelican', uninsured), hull);

  assert.equal(open.policyName, 'hull insurance');
  assert.equal(open.premiumCr, 800, 'premium is the on-file insurance quote, not the hull-share charge');
  assert.equal(open.deductibleCr, null);
  assert.equal(open.quotedCostCr, 6000);
  assert.equal(open.costCr, 6000);
  assert.equal(open.insuranceStatus, 'UNINSURED · 40% HULL SHARE');
  assert.equal(open.coverageNote, 'UNINSURED · 40% HULL SHARE · hull insurance · 800 cr premium');
  assert.doesNotMatch(open.coverageNote, /purchase|buy|insure now/i);

  const insured = { ...uninsured, insuredModules: true };
  const covered = buildRecoveryPlan(stateFor('ship_pelican', insured), hull);
  assert.equal(covered.policyName, null);
  assert.equal(covered.premiumCr, null);
  assert.equal(covered.deductibleCr, 800);
  assert.equal(covered.quotedCostCr, 800);
  assert.equal(covered.costCr, 800);
  assert.equal(covered.insuranceStatus, 'INSURED · COVERED 5,200 CR');
  assert.equal(covered.coverageNote, '800 cr deductible');
  assert.doesNotMatch(covered.coverageNote, /hull insurance|premium|covered/i);

  const unnamed = buildRecoveryPlan(stateFor('ship_pelican', {}), hull);
  assert.equal(unnamed.policyName, 'hull insurance');
  assert.equal(unnamed.premiumCr, INSURANCE_DEFAULTS.deductibleCr);
  assert.equal(unnamed.premiumCr, 500);
  assert.equal(unnamed.quotedCostCr, 15000, 'a missing rate still prices the full hull');

  const german = buildRecoveryPlan(stateFor('ship_pelican', {
    rate: INSURANCE_DEFAULTS.rate,
    deductibleCr: INSURANCE_DEFAULTS.deductibleCr,
    insuredModules: true,
    lastStationId: 'station_helios',
  }, { locale: 'de-DE' }), hull);
  assert.equal(german.deductibleCr, 500);
  assert.equal(german.policyName, null);
  assert.equal(german.premiumCr, null);
  assert.equal(german.quotedCostCr, 500);
  assert.equal(german.insuranceStatus, 'INSURED · COVERED 5.500 CR');
  assert.equal(german.coverageNote, '500 cr deductible');

  const openLine = showDeath(stateFor('ship_pelican', uninsured), open);
  assert.equal(openLine, 'Coverage: UNINSURED · 40% HULL SHARE · hull insurance · 800 cr premium');
  const coveredLine = showDeath(stateFor('ship_pelican', insured), covered);
  assert.equal(coveredLine, 'Coverage: 800 cr deductible');
  assert.doesNotMatch(coveredLine, /purchase|hull insurance|premium/i);
});
