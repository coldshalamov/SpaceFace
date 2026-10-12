// Starter progression: the Swing Drive bought at the B5 berth is felt at the departure that
// ends the rail — one voice, the live bound key — and never after the fit stops providing it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { ships } from '../src/systems/ships.js';
import { onboarding } from '../src/systems/onboarding.js';
import { resolveActionLabel } from '../src/systems/input.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
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
const swingIdx = (t) => t.state.player.ownedShips[0].fittings.indexOf('mod_drill_amp');

function railOnChoice(t) {
  t.state.onboarding = {
    active: true, finished: false, currentBeat: 99, beatDoneAt: {}, firedFollowups: {},
  };
  const ob = t.sim.registry.get('onboarding');
  // Find the live B5 index from the production table through its own advance path.
  for (let i = 0; i < 40; i += 1) {
    t.state.onboarding.currentBeat = i;
    if (ob._tutorialRailOwnsVoice() && typeof ob._onUndockedFromChoice === 'function') {
      const probe = { ...t.state.onboarding };
      ob._onUndockedFromChoice();
      const isChoice = t.state.onboarding.finished === true;
      t.state.onboarding = { ...probe, active: true, finished: false };
      if (isChoice) return i;
    }
  }
  throw new Error('no B5 beat');
}

test('starter-progression: Swing Drive bought at the B5 berth speaks once at the departure that retires the rail', () => {
  const t = boot();
  try {
    t.state.player.credits = 5172;
    t.dock();
    railOnChoice(t);
    const slot = swingIdx(t);
    assert.ok(slot >= 0, 'the Hitch starts with the drill amp in its small utility bay');
    assert.equal(t.shipsSys.buyModule({ defId: 'mod_swing_drive_s', fitSlotIndex: slot }), true);
    t.undock();
    assert.equal(t.state.onboarding.finished, true, 'leaving B5 without a job retires the rail');
    const shown = fitFelt(t.felt);
    assert.equal(shown.length, 1, 'one felt line, no second voice');
    const key = resolveActionLabel(t.state, 'boost', { empty: 'BOOST' });
    assert.equal(shown[0].verbId, 'fitFelt:swingDrive');
    assert.match(shown[0].text, new RegExp(`^Swing Drive S fitted \u2014 ${key} on a taut Massline`));
  } finally { t.restore(); }
});

test('starter-progression: a Swing Drive removed before departure is never announced, and stays owed for its refit', () => {
  const t = boot();
  try {
    t.state.player.credits = 20000;
    t.dock();
    const slot = swingIdx(t);
    assert.equal(t.shipsSys.buyModule({ defId: 'mod_swing_drive_s', fitSlotIndex: slot }), true);
    t.shipsSys.unfitModule({ slotIndex: slot });
    assert.equal(t.state.player.ownedShips[0].fittings[slot], null);
    t.undock();
    assert.equal(fitFelt(t.felt).length, 0, 'the current fit no longer swings: say nothing');
    t.dock();
    const inv = t.state.player.moduleInventory.find((m) => m.defId === 'mod_swing_drive_s');
    assert.ok(inv, 'the unfitted drive sits in inventory');
    t.shipsSys.fitModule({ slotIndex: slot, instanceId: inv.instanceId });
    t.undock();
    assert.deepEqual(fitFelt(t.felt).map((p) => p.verbId), ['fitFelt:swingDrive'],
      'refitting it later earns the line it was owed');
  } finally { t.restore(); }
});
