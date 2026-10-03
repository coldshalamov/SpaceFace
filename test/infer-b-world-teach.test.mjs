// WORLD-39, WORLD-41, TEACH-07, TEACH-08. Seed 4242. Focused pins only.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from '../src/core/rng.js';
import { createBus } from '../src/core/eventBus.js';
import { buildReply } from '../src/ui/station/barContacts.js';
import {
  aftermathChartMarkers,
  buildMapModel,
  buildSystemModel,
  installAftermathChartListener,
} from '../src/ui/galaxyMap.js';
import {
  bindReturningPilotSummary,
  buildDockArrival,
  finishReturnSummary,
  returningPilotLine,
  writeBerthArrival,
} from '../src/ui/dockArrival.js';
import { formatOfflineReceiptLine } from '../src/ui/automationPayoff.js';
import {
  buildDefeatReceipt,
  isSlackLineSnapDeath,
} from '../src/combat/playerDefeat.js';
import { RANGE_RAIL_ROWS, rangeRungIndex } from '../src/ui/screens/range.js';
import { deathRangeOfferText, gameOverScreen } from '../src/ui/screens/gameOver.js';

const SEED = 4242;

function seeded(extra = {}) {
  return {
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    tick: 4242,
    simTime: 4242,
    ...extra,
  };
}

test('WORLD-39 a lot already in the world is a sector-named bar line, and a claim removes it', () => {
  const state = seeded({
    world: { currentSectorId: 'sector_helios_prime' },
    ui: {
      barGhostConvoys: [{
        id: 'ghost-convoy:ceres',
        text: 'A ghost convoy still runs the Ceres lane.',
        sectorId: 'sector_ceres_belt',
        stationId: 'station_helios',
      }],
    },
    npcJobs: {
      lots: {
        sector_ceres_belt: {
          lotId: 'lot:j1:l0',
          kind: 'ore',
          postedBy: 'miner-1',
          sectorId: 'sector_ceres_belt',
        },
      },
    },
  });
  const bus = createBus();
  const reply = buildReply('barkeep', 'rumors', { state, bus }, 'station_helios', null);
  assert.match(reply.text, /Ceres Belt/);
  assert.match(reply.text, /posted ore lot/);
  assert.match(reply.text, /ghost convoy/i);
  assert.equal(reply.missionOffer, undefined);

  state.npcJobs.lots.sector_ceres_belt = null;
  const after = buildReply('barkeep', 'rumors', { state, bus }, 'station_helios', null);
  assert.ok(!/posted ore lot/i.test(after.text || ''));
  assert.match(after.text, /ghost convoy/i);
});

test('WORLD-41 a retired aftermath wreck leaves the chart model and its cause line', () => {
  const marker = {
    markerId: 'aw-4242',
    sectorId: 'sector_ceres_belt',
    pos: { x: 120, z: 40 },
    victimLabel: 'Hauler',
    zoneName: 'the belt',
    headline: 'Aftermath reported in the belt: Hauler wreckage now drifting in the open.',
    cause: { actor: 'a reaver', motiveId: 'raid', line: 'A reaver raid left this wreck in the belt.' },
  };
  const state = seeded({
    entities: new Map(),
    world: { currentSectorId: 'sector_ceres_belt', sectors: {}, discovery: {} },
    player: { flags: {}, uniqueWrecks: { bearings: {} } },
    ui: {},
    aftermathWrecks: { bySector: { sector_ceres_belt: [marker] }, causes: { keep: { fingerprint: 'keep' } } },
  });
  const before = buildSystemModel(state, 'sector_ceres_belt');
  const listed = before.wrecks.find((row) => row.markerId === 'aw-4242');
  assert.ok(listed, 'the chart model lists the wreck');
  assert.equal(listed.causeLine, 'A reaver raid left this wreck in the belt.');
  assert.ok(before.points.some((point) => point.markerId === 'aw-4242' && point.statusLine === listed.causeLine));
  assert.equal(buildMapModel(state, 2).level, 'system');
  assert.equal(aftermathChartMarkers(state, 'sector_ceres_belt').length, 1);

  const bus = createBus();
  installAftermathChartListener(bus, state);
  bus.emit('aftermathWreck:retired', {
    markerId: 'aw-4242',
    entityId: 9,
    sectorId: 'sector_ceres_belt',
    reason: 'arena_cap',
  });
  assert.equal(state.aftermathWrecks.bySector.sector_ceres_belt.length, 1, 'the sim wreck is not retired early');
  assert.ok(state.aftermathWrecks.causes.keep, 'cause records stay with the wreck system');

  const after = buildSystemModel(state, 'sector_ceres_belt');
  assert.equal(after.wrecks.length, 0);
  assert.ok(!after.points.some((point) => point.markerId === 'aw-4242' || point.id === 'wreck:aw-4242'));
  assert.ok(!after.points.some((point) => point.statusLine && point.statusLine.includes('reaver raid')));
  assert.equal(buildMapModel(state, 2).wrecks.length, 0);
});

function awayReceipt(elapsedSec) {
  return {
    elapsedSec,
    credited: 80,
    upkeepCharged: 10,
    lost: 0,
    skipped: false,
  };
}

function dockState(slot) {
  return seeded({
    player: { heat: 0, cargo: { usedVolume: 0, items: {} } },
    missions: { active: [] },
    ui: {},
    save: { currentSlot: slot },
    stationLife: { traffic: [] },
    automation: { meta: {} },
  });
}

const HELIOS = { id: 'station_helios', name: 'Helios Station', services: ['trade'] };

function paintBerth(state, station = HELIOS) {
  const view = buildDockArrival(state, station);
  const newsEl = { textContent: '', hidden: false };
  writeBerthArrival({ newsEl, state }, view, '');
  return { view, newsEl };
}

test('TEACH-07 the berth prints one offline summary, then stays quiet', () => {
  const state = dockState('slot-1');
  const bus = createBus();
  bindReturningPilotSummary(bus, state);
  const receipt = awayReceipt(700);
  const line = formatOfflineReceiptLine(receipt);
  bus.emit('automation:offlineSummary', receipt);

  const first = paintBerth(state);
  assert.equal(first.view.returnSummary, line);
  assert.equal(first.view.lines.filter((entry) => entry === line).length, 1);
  assert.ok(first.newsEl.textContent.includes(line));

  const refresh = paintBerth(state);
  assert.ok(refresh.newsEl.textContent.includes(line));

  finishReturnSummary(state);
  bus.emit('automation:offlineSummary', awayReceipt(900));
  const later = paintBerth(state);
  assert.equal(later.view.returnSummary, null);
  assert.ok(!/while you were away/i.test(later.newsEl.textContent));
  assert.equal(returningPilotLine(state), null);
});

test('TEACH-07 a fresh save and a save inside one sim day show no summary line', () => {
  const freshState = dockState(null);
  const freshBus = createBus();
  bindReturningPilotSummary(freshBus, freshState);
  freshBus.emit('automation:offlineSummary', awayReceipt(700));
  const fresh = paintBerth(freshState);
  assert.equal(fresh.view.returnSummary, null);
  assert.deepEqual(fresh.view.lines, ['Take a local contract']);
  assert.ok(!/while you were away/i.test(fresh.newsEl.textContent));

  const youngState = dockState('slot-1');
  youngState.automation.meta.lastOfflineReceipt = awayReceipt(30);
  const young = paintBerth(youngState);
  assert.equal(young.view.returnSummary, null);
  assert.ok(!/while you were away/i.test(young.newsEl.textContent));

  const exactState = dockState('slot-1');
  exactState.automation.meta.lastOfflineReceipt = awayReceipt(600);
  const exact = paintBerth(exactState);
  assert.equal(exact.view.returnSummary, null);
  assert.ok(!/while you were away/i.test(exact.newsEl.textContent));
});

function defeatState() {
  const player = {
    id: 1,
    type: 'ship',
    alive: false,
    pos: { x: 0, z: 0 },
    rot: 0,
    data: { defId: 'ship_kestrel' },
  };
  const attacker = {
    id: 9,
    type: 'ship',
    alive: true,
    factionId: 'faction_reach',
    pos: { x: 0, z: 80 },
    data: { defId: 'ship_drifter', lootTableId: 'reaver_pirate', shipClass: 'gunship' },
  };
  return seeded({
    playerId: 1,
    settings: { gameplay: { difficulty: 'standard' } },
    player: {
      credits: 5000,
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' },
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      activeShipIndex: 0,
      cargo: { items: {}, usedVolume: 0 },
    },
    entities: new Map([[1, player], [9, attacker]]),
    entityList: [player, attacker],
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: { stations: [{ stationId: 'station_helios', pos: { x: 320, z: -80 } }] },
    },
    ui: {},
  });
}

const VITALS = {
  dominantLayer: 'hull',
  after: { shield: 0, shieldMax: 55, armor: 0, armorMax: 30, hull: 0, hullMax: 140 },
};

function masslineSnapLethal() {
  return {
    origin: { kind: 'massline_whip', id: 'mass-1' },
    packet: { source: { kind: 'massline_whip', massId: 'mass-1' } },
    result: VITALS,
  };
}

test('TEACH-08 a massline snap offers the swing rung once and a weapon death does not', () => {
  const state = defeatState();
  const snap = masslineSnapLethal();
  assert.equal(isSlackLineSnapDeath(snap), true);
  const first = buildDefeatReceipt(state, state.entities.get(1), 9, snap);
  const second = buildDefeatReceipt(state, state.entities.get(1), 9, snap);
  assert.ok(first.rangeOffer);
  assert.equal(first.rangeOffer.rungId, 'swing_do_not_pull');
  assert.equal(first.rangeOffer.once, true);
  assert.equal(rangeRungIndex(first.rangeOffer.rungId) >= 0, true);
  assert.ok(RANGE_RAIL_ROWS.some((row) => row.id === first.rangeOffer.rungId));
  assert.match(first.rangeOffer.line, /Swing, do not pull/);
  assert.doesNotMatch(first.rangeOffer.line, /reel/i);
  assert.notEqual(first.rangeOffer.line, first.fatalSummary);
  assert.equal(second.rangeOffer, undefined);
  assert.equal(second.fatalSummary, first.fatalSummary);
  assert.equal(second.cause, first.cause);
  assert.equal(state.ui.deathRangeOfferedRung, 'swing_do_not_pull');

  const combatState = defeatState();
  const combat = buildDefeatReceipt(combatState, combatState.entities.get(1), 9, {
    attribution: 'slack line snap',
    origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
    packet: { source: { kind: 'weapon', weaponId: 'wpn_autocannon_s' } },
    result: { ...VITALS, subsystemId: 'drive' },
  });
  assert.equal(isSlackLineSnapDeath({
    attribution: 'slack line snap',
    origin: { kind: 'combat' },
  }), false);
  assert.equal(combat.rangeOffer, undefined);
  assert.equal(combatState.ui.deathRangeOfferedRung, undefined);
  assert.match(combat.fatalSummary, /Final hit from Reaver Pirate/);
});

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
    this.childNodes = this.children;
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.id = '';
    this.className = '';
    this.tabIndex = 0;
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  addEventListener(event, fn) { this.listeners.set(event, fn); }
  removeEventListener() {}
  focus() { this.ownerDocument.activeElement = this; }
  contains(node) { return this === node || this.children.some((child) => child.contains && child.contains(node)); }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.head = new FakeElement(this, 'head');
    this.body = new FakeElement(this, 'body');
  }
  createElement(tagName) { return new FakeElement(this, tagName); }
  getElementById() { return null; }
}

function showDeath(state, pushed) {
  const previous = globalThis.document;
  const document = new FakeDocument();
  globalThis.document = document;
  try {
    const root = document.createElement('div');
    const ctx = {
      state,
      bus: { on() { return () => {}; }, emit() {} },
      screenManager: {
        top() { return 'gameOver'; },
        popScreen() {},
        closeAll() {},
        replaceScreen() {},
        pushScreen(id) { pushed.push(id); },
      },
      screens: { pushScreen(id) { pushed.push(id); } },
      telemetry: { getSessionStats() { return { deathLog: [] }; } },
    };
    gameOverScreen.mount(root, ctx);
    return gameOverScreen._summaryEls;
  } finally {
    globalThis.document = previous;
  }
}

test('TEACH-08 the death screen shows the swing offer and does not open the Range', () => {
  const state = defeatState();
  const receipt = buildDefeatReceipt(state, state.entities.get(1), 9, masslineSnapLethal());
  state.combat = { lastPlayerDefeat: receipt };
  const pushed = [];
  const els = showDeath(state, pushed);
  assert.equal(els.rangeOffer.hidden, false);
  assert.equal(els.rangeOffer.textContent, receipt.rangeOffer.line);
  assert.match(els.rangeOffer.textContent, /Swing, do not pull/);
  assert.equal(els.rangeOffer.textContent, deathRangeOfferText(receipt));
  assert.equal(els.cause.textContent, receipt.fatalSummary);
  assert.ok(String(els.insurance.textContent).startsWith('Coverage:'));
  assert.ok(!pushed.includes('range'));

  const combatState = defeatState();
  const combat = buildDefeatReceipt(combatState, combatState.entities.get(1), 9, {
    origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
    result: VITALS,
  });
  combatState.combat = { lastPlayerDefeat: combat };
  const combatPushed = [];
  const combatEls = showDeath(combatState, combatPushed);
  assert.equal(combatEls.rangeOffer.hidden, true);
  assert.equal(combatEls.rangeOffer.textContent, '');
  assert.equal(deathRangeOfferText(combat), '');
  assert.ok(!combatPushed.includes('range'));
});
