// SFQ-B064: the first verb-changing fit is felt on the first undock. Seed 4242.
// Acceptance: the complete earn-buy-fit-undock-use cycle works without debug inventory and avoids
// a dead-end purchase. Refuse: no inaccessible late-tier hardware as bait.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { ships } from '../src/systems/ships.js';
import { onboarding } from '../src/systems/onboarding.js';
import { resolveActionLabel } from '../src/systems/input.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { FIT_FEEL, fitFeelRowFor, pickFitFelt } from '../src/onboarding/fitFeel.js';
import { describeOutfittingPurchase } from '../src/ui/station/outfittingGuidance.js';
import { buildSlotList } from '../src/systems/ships.js';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...v) { v.forEach((x) => this.values.add(x)); }
  remove(...v) { v.forEach((x) => this.values.delete(x)); }
  toggle(v, f) { if (f === undefined ? !this.values.has(v) : f) this.values.add(v); else this.values.delete(v); }
  contains(v) { return this.values.has(v); }
}
class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document; this.tagName = String(tagName).toUpperCase(); this.children = [];
    this.attributes = new Map(); this.classList = new FakeClassList(); this.className = ''; this.style = {};
    this.textContent = ''; this.id = ''; this.innerHTML = '';
  }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(n, v) { this.attributes.set(n, String(v)); }
  getAttribute(n) { return this.attributes.get(n) ?? null; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
class FakeDocument {
  constructor() { this.head = new FakeElement(this, 'head'); this.body = new FakeElement(this, 'body'); }
  createElement(t) { return new FakeElement(this, t); }
  getElementById() { return null; }
}

function boot({ hintsOn = true } = {}) {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const sim = createSimulation({ seed: 4242, systems: [ships, onboarding] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  state.playerId = player.id;
  const shipsSys = sim.registry.get('ships');
  shipsSys.newGame && shipsSys.newGame();
  state.player.credits = 9000;
  state.player.hints = {};
  state.settings = state.settings || {};
  state.settings.gameplay = { ...(state.settings.gameplay || {}), tutorialHints: hintsOn };
  state.onboarding = { active: false, finished: true };
  state.ui = { ...(state.ui || {}), docked: false, dockedStationId: null };
  const felt = [];
  bus.on('hud:firstUse', (p) => felt.push(p));
  const ctx = {
    sim, state, bus, shipsSys, felt,
    dock() { state.ui.docked = true; state.ui.dockedStationId = 'station_helios'; bus.emit('dock:docked', { stationId: 'station_helios' }); },
    undock() { state.ui.docked = false; state.ui.dockedStationId = null; bus.emit('dock:undocked', {}); },
    fit(defId) {
      const owned = state.player.ownedShips[state.player.activeShipIndex || 0];
      const slots = buildSlotList(SHIPS.find((s) => s.id === owned.defId));
      const def = MODULES.concat(WEAPONS).find((m) => m.id === defId);
      const matching = slots.map((slot, i) => ({ slot, i })).filter(({ slot }) => slot.type === def.slotType && slot.size === def.size);
      const slotIndex = (matching.find(({ i }) => !owned.fittings[i]) || matching[0] || { i: -1 }).i;
      assert.ok(slotIndex >= 0, `a ${def.slotType} ${def.size} slot for ${defId}`);
      assert.equal(shipsSys.buyModule({ defId, fitSlotIndex: slotIndex }), true, `${defId} bought and fitted`);
      return slotIndex;
    },
    restore() {
      try { sim.registry.get('onboarding').destroy(); } catch (_) {}
      sim.dispose();
      globalThis.document = prevDoc;
      globalThis.window = prevWin;
    },
  };
  return ctx;
}

const fitFelt = (felt) => felt.filter((p) => String(p.verbId).startsWith('fitFelt:'));

const DEFS = MODULES.concat(WEAPONS);
const defOf = (id) => DEFS.find((d) => d.id === id);

test('every felt line is a short, stat-free sentence and every row matches a real definition', () => {
  assert.ok(FIT_FEEL.length >= 10);
  const keyOf = (action, empty) => `[${action}|${empty || ''}]`;
  for (const row of FIT_FEEL) {
    const def = DEFS.find((d) => row.match(d));
    assert.ok(def, `${row.verbId} matches a real module or weapon`);
    const line = row.line(keyOf, def);
    assert.ok(line.length < 150, `${row.verbId} stays short (${line.length})`);
    assert.ok(!/\d/.test(line), `${row.verbId} carries no stats`);
  }
  assert.equal(fitFeelRowFor(defOf('mod_repulsion_trap_s')), null, 'the trap already speaks at the fit');
  assert.equal(fitFeelRowFor(defOf('mod_transverse_snare_m')), null, 'and so does the snare head');
});

test('siblings and Mk2 variants share their verb row (keyed on what the module does)', () => {
  for (const flag of ['swingDrive', 'hullBurst', 'weaponHeatDissipPct', 'impulseChargeCapacity']) {
    const family = MODULES.filter((m) => m.mods && m.mods[flag]);
    assert.ok(family.length >= 2, `${flag} has siblings`);
    const rows = new Set(family.map((m) => (fitFeelRowFor(m) || {}).verbId));
    assert.equal(rows.size, 1, `${flag} siblings all read the same line`);
    assert.ok([...rows][0], `${flag} maps to a row`);
  }
});

test('a line is never false for the live fit: Veil Step replaces boost, so boost-verb rows stay silent', () => {
  const veil = defOf('mod_veil_step');
  const swing = MODULES.find((m) => m.mods && m.mods.swingDrive);
  const burst = MODULES.find((m) => m.mods && m.mods.hullBurst);
  const blinking = { phaseBlink: true, swingDrive: true, hullBurstKind: 'gravity' };
  assert.equal(pickFitFelt([swing, burst, veil], blinking, {}).row.verbId, 'veilStep', 'the Veil Step line speaks instead');
  assert.equal(pickFitFelt([swing, burst], blinking, {}), null, 'swing/burst lines would lie while a blink replaces boost');
  assert.equal(pickFitFelt([swing], { swingDrive: true }, {}).row.verbId, 'swingDrive');
  assert.equal(pickFitFelt([swing], { swingDrive: false }, {}), null, 'a module that derived to nothing says nothing');
  assert.equal(pickFitFelt([veil], blinking, { 'fitFelt:veilStep': true }), null, 'a spent verb stays spent');
});

test('buy and fit Veil Step at Helios with starting credits: the first undock speaks once, naming the live key', () => {
  const t = boot();
  try {
    t.dock();
    t.fit('mod_veil_step');
    assert.equal(fitFelt(t.felt).length, 0, 'nothing is said at the counter');
    t.undock();
    const shown = fitFelt(t.felt);
    assert.equal(shown.length, 1, 'exactly one felt line at the first undock');
    const key = resolveActionLabel(t.state, 'boost', { empty: 'BOOST' });
    assert.equal(shown[0].verbId, 'fitFelt:veilStep');
    assert.equal(shown[0].text, `Veil Step fitted \u2014 ${key} now blinks you: hold to aim, release to arrive.`);
    t.dock();
    t.undock();
    assert.equal(fitFelt(t.felt).length, 1, 'the second undock is silent');
  } finally { t.restore(); }
});

test('tutorial hints off keeps it silent and spends nothing', () => {
  const t = boot({ hintsOn: false });
  try {
    t.dock();
    t.fit('mod_veil_step');
    t.undock();
    assert.equal(fitFelt(t.felt).length, 0);
    assert.equal(t.state.player.hints['fitFelt:veilStep'], undefined);
  } finally { t.restore(); }
});

test('a refit of the same module later is silent', () => {
  const t = boot();
  try {
    t.dock();
    const slot = t.fit('mod_veil_step');
    t.undock();
    assert.equal(fitFelt(t.felt).length, 1);
    t.dock();
    t.shipsSys.unfitModule && t.shipsSys.unfitModule({ slotIndex: slot });
    t.state.player.ownedShips[0].fittings[slot] = null;
    t.fit('mod_veil_step');
    t.undock();
    assert.equal(fitFelt(t.felt).length, 1, 'once per module per profile');
  } finally { t.restore(); }
});

test('two verb-changers in one dock: the most verb-changing speaks now, the other at the next undock', () => {
  const t = boot();
  try {
    t.state.player.credits = 30000;
    t.dock();
    t.fit('wpn_autocannon_s');
    t.fit('mod_veil_step');
    t.undock();
    assert.deepEqual(fitFelt(t.felt).map((p) => p.verbId), ['fitFelt:veilStep']);
    t.dock();
    t.undock();
    assert.deepEqual(fitFelt(t.felt).map((p) => p.verbId), ['fitFelt:veilStep', 'fitFelt:autocannon']);
    t.dock();
    t.undock();
    assert.equal(fitFelt(t.felt).length, 2, 'then nothing is left to say');
  } finally { t.restore(); }
});

test('a module with no felt line, and the snare/trap that already speak at the fit, stay out of the table', () => {
  const t = boot();
  try {
    const plain = MODULES.find((m) => ['cargo', 'thruster', 'shield'].includes(m.slotType) && m.size === 'S'
      && !m.requiresTech && !fitFeelRowFor(m) && (m.price || 0) < 9000 && m.id !== 'mod_shield_booster_s');
    assert.ok(plain, 'a plain shield module to fit');
    t.dock();
    t.fit(plain.id);
    t.undock();
    assert.equal(fitFelt(t.felt).length, 0);
  } finally { t.restore(); }
});

test('a module that fits no slot on any owned hull is a dead end: labelled, not offered as a buy', () => {
  const owned = [{ defId: 'ship_wasp', fittings: [] }];
  const hull = SHIPS.find((s) => s.id === 'ship_wasp');
  const slots = buildSlotList(hull);
  const medium = MODULES.find((m) => m.size === 'M' && m.slotType === 'utility' && !slots.some((s) => s.type === 'utility' && s.size === 'M'));
  assert.ok(medium, 'a medium utility module exists that the Wasp cannot take');
  const purchase = describeOutfittingPurchase(medium, { credits: 99999, ownedShips: owned, researchedNodes: [medium.requiresTech].filter(Boolean) },
    slots, [], hull, { stationId: 'station_helios' });
  assert.equal(purchase.state, 'noberth');
  assert.equal(purchase.label, 'No berth on your hull can take this');
  assert.equal(purchase.disabled, true, 'no Buy to Inventory');
  const withBigHull = describeOutfittingPurchase(medium, { credits: 99999, ownedShips: [...owned, { defId: 'ship_mule', fittings: [] }], researchedNodes: [medium.requiresTech].filter(Boolean) },
    slots, [], hull, { stationId: 'station_helios' });
  const muleHasBerth = buildSlotList(SHIPS.find((s) => s.id === 'ship_mule')).some((s) => s.type === 'utility' && s.size === 'M');
  assert.equal(withBigHull.state === 'inventory', muleHasBerth, 'another owned hull with a berth keeps the inventory path');
});

test('the demo end card behavior is unchanged: it still arms on a docked fit and waits for IS_DEMO', async () => {
  const t = boot();
  try {
    t.dock();
    t.fit('mod_veil_step');
    const sys = t.sim.registry.get('onboarding');
    assert.equal(sys._demoFittedThisDock === null || sys._demoFittedThisDock === undefined, true,
      'outside the demo build the end card never arms');
    const pushed = [];
    t.bus.on('ui:pushScreen', (p) => pushed.push(p));
    t.undock();
    assert.equal(pushed.filter((p) => p.id === 'demoEnd').length, 0);
  } finally { t.restore(); }
});

test('a line the tutorial rail deferred drains when the rail releases the voice, not at a later undock', () => {
  const t = boot();
  try {
    t.dock();
    t.fit('mod_veil_step');
    t.state.onboarding = { active: true, finished: false };
    t.undock();
    assert.equal(fitFelt(t.felt).length, 0, 'the rail owns the voice at the undock');
    const sys = t.sim.registry.get('onboarding');
    t.state.mode = 'flight';
    sys._tickFitFelt(t.state);
    assert.equal(fitFelt(t.felt).length, 0, 'still deferred while the rail holds the voice');
    t.state.onboarding = { active: true, finished: true };
    sys._tickFitFelt(t.state);
    assert.deepEqual(fitFelt(t.felt).map((p) => p.verbId), ['fitFelt:veilStep'], 'it speaks the moment the rail lets go');
    sys._tickFitFelt(t.state);
    assert.equal(fitFelt(t.felt).length, 1, 'and only once');
  } finally { t.restore(); }
});

test('a save/load in the middle of a dock loses nothing: the owed line is re-derived at the undock', () => {
  const t = boot();
  try {
    t.dock();
    t.fit('mod_veil_step');
    t.bus.emit('save:loaded', {});
    t.state.ui.docked = true;
    t.undock();
    assert.deepEqual(fitFelt(t.felt).map((p) => p.verbId), ['fitFelt:veilStep']);
  } finally { t.restore(); }
});

test('legacy string-form ownedShips entries are read as defIds by the dead-end guard', () => {
  const hull = SHIPS.find((s) => s.id === 'ship_wasp');
  const slots = buildSlotList(hull);
  const medium = MODULES.find((m) => m.size === 'M' && m.slotType === 'utility' && !slots.some((s) => s.type === 'utility' && s.size === 'M'));
  const player = (ownedShips) => ({ credits: 99999, ownedShips, researchedNodes: [medium.requiresTech].filter(Boolean) });
  assert.equal(describeOutfittingPurchase(medium, player(['ship_wasp']), slots, [], hull, { stationId: 'station_helios' }).state, 'noberth');
  const muleHasBerth = buildSlotList(SHIPS.find((s) => s.id === 'ship_mule')).some((s) => s.type === 'utility' && s.size === 'M');
  assert.equal(describeOutfittingPurchase(medium, player(['ship_wasp', 'ship_mule']), slots, [], hull, { stationId: 'station_helios' }).state === 'inventory', muleHasBerth);
});
