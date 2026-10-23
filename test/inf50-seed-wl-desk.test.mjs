// Standing clients: progress on the board, a numbered relief run, tow/bulk/salvage,
// one varied axis after the third cycle, and a display name that leaves the desk id alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hash32 } from '../src/core/rng.js';
import {
  noteStandingOrderCompletion, syncCaptainStandingOrders, standingOrderProgressLines,
  reliefOfferShape, deskClientName, STANDING_CLIENT_TYPES,
} from '../src/systems/captainStandingOrders.js';
import { contractAcceptHoldNote, createContractsScreen } from '../src/ui/station/screens/contracts.js';
import { stampDestinationRail, STATION_HELP } from '../src/ui/station/stationApp.js';
import { createCommandDock } from '../src/ui/station/dock.js';

const SEED = 4242;
const STATION = 'station_helios';

function host(extra = {}) {
  return {
    state: {
      simTime: 0,
      rng: { seed: SEED },
      traffic: { captainRoster: [] },
      missions: { standingOrders: [], captainOrderCycles: {}, active: [], receipts: [] },
      ...extra,
    },
  };
}

function finish(state, type, n, start = 0) {
  for (let i = 0; i < n; i++) {
    noteStandingOrderCompletion(state, {
      id: `${type}-${start + i}`, stationId: STATION, type, source: 'economyContract',
      reward_cr: 200, factionId: 'faction_mts', params: { taskTime: 10 },
    });
  }
}

test('seed 4242: tow, bulk and salvage each pin a standing client at three, and not before', () => {
  assert.equal(STANDING_CLIENT_TYPES.includes('tow_recovery'), true);
  assert.equal(STANDING_CLIENT_TYPES.includes('bulk_trade'), true);
  assert.equal(STANDING_CLIENT_TYPES.includes('salvage_retrieval'), true);
  for (const type of ['tow_recovery', 'bulk_trade', 'salvage_retrieval']) {
    const h = host();
    finish(h.state, type, 2);
    assert.deepEqual(standingOrderProgressLines(h.state, STATION), [`2 of 3 ${type.replaceAll('_', ' ')}`]);
    const early = { slots: [] };
    syncCaptainStandingOrders(h, { id: STATION, name: 'Helios', factionId: 'faction_mts' }, early);
    assert.equal(early.slots.length, 0);
    finish(h.state, type, 1, 2);
    assert.deepEqual(standingOrderProgressLines(h.state, STATION), []);
    const board = { slots: [] };
    assert.equal(syncCaptainStandingOrders(h, { id: STATION, name: 'Helios', factionId: 'faction_mts' }, board), true);
    const offer = board.slots.find((row) => row.type === type);
    assert.ok(offer);
    assert.equal(offer.giverId, `desk:${STATION}:${type}`);
    assert.equal(offer.clientId, offer.giverId);
    assert.equal(offer.title.includes(deskClientName(STATION, type)), true);
    assert.equal(offer.cause.tag, 'standing_client');
  }
});

test('seed 4242: a rescued captain counts the run, then changes exactly one axis', () => {
  const captain = {
    id: 'cap-4242', name: 'Mira Holt', alive: true,
    outcomes: { rescued: 1 }, homeStationId: STATION,
  };
  function offerAt(cycle) {
    const h = host();
    h.state.traffic.captainRoster = [captain];
    h.state.missions.captainOrderCycles = { [captain.id]: { cycle, dueAtS: 0 } };
    const board = { slots: [] };
    syncCaptainStandingOrders(h, { id: STATION, name: 'Helios', factionId: 'faction_mts' }, board);
    return board.slots.find((row) => row.giverId === captain.id);
  }
  const first = offerAt(0);
  const second = offerAt(1);
  assert.equal(first.title, 'Mira Holt — standing relief run');
  assert.equal(second.title, first.title);
  assert.equal(first.params.cmdtyId, 'cmdty_food');
  assert.equal(first.reward_cr, 360);
  assert.equal(second.params.cmdtyId, first.params.cmdtyId);
  assert.equal(second.reward_cr, first.reward_cr);
  assert.equal(second.destStationId, first.destStationId);
  const numbered = offerAt(2);
  assert.equal(numbered.title, 'Mira Holt — standing relief run #2');
  assert.equal(numbered.params.cmdtyId, 'cmdty_food');
  assert.equal(numbered.reward_cr, 360);
  assert.equal(numbered.destStationId, first.destStationId);
  const later = offerAt(4);
  assert.match(later.title, /#4$/);
  const shape = reliefOfferShape(captain.id, 4, STATION);
  const diffs = [
    later.params.cmdtyId !== first.params.cmdtyId,
    later.reward_cr !== first.reward_cr,
    later.destStationId !== first.destStationId,
  ].filter(Boolean);
  assert.equal(diffs.length, 1);
  assert.equal(later.params.cmdtyId, shape.cmdtyId);
  assert.equal(later.reward_cr, shape.reward_cr);
  assert.equal(later.destStationId, shape.dest.id);
  assert.equal(hash32(captain.id, 4) % 3 >= 0, true);
});

test('seed 4242: the accept key says hold before the first trade, and the rail speaks every help line', () => {
  const fresh = { missions: { active: [], receipts: [] } };
  assert.equal(contractAcceptHoldNote(fresh, 0), 'hold');
  assert.equal(contractAcceptHoldNote(fresh, 40), 'hold');
  const cold = { missions: { active: [{ id: 'c', storyTag: 'campaign47a:b0:recovery' }], receipts: [] } };
  assert.equal(contractAcceptHoldNote(cold, 0), 'hold');
  const coldDone = { missions: { active: [], receipts: [{ storyTag: 'campaign47a:b0:recovery' }] } };
  assert.equal(contractAcceptHoldNote(coldDone, 0), 'hold');
  const coldSettled = {
    missions: {
      active: [],
      receipts: [{
        id: 'm_1:completed',
        missionId: 'm_1',
        sourceOfferId: 'contract_47a_b0_recovery',
        type: 'salvage_retrieval',
        outcome: 'completed',
      }],
    },
  };
  assert.equal(contractAcceptHoldNote(coldSettled, 0), 'hold');
  const traded = {
    missions: {
      active: [],
      receipts: [{ id: 'm_2:completed', sourceOfferId: 'offer-9', type: 'cargo_delivery', outcome: 'completed' }],
    },
  };
  assert.equal(contractAcceptHoldNote(traded, 0), '');
  const flown = { missions: { active: [{ id: 'm' }], receipts: [] } };
  assert.equal(contractAcceptHoldNote(flown, 0), '');
  assert.equal(contractAcceptHoldNote(flown, 40), 'hold');
  const ids = Object.keys(STATION_HELP);
  assert.equal(ids.length, 7);
  const tiles = new Map();
  const dock = {
    querySelector(sel) {
      const id = /data-nav="([^"]+)"/.exec(sel)?.[1];
      return tiles.get(id) || null;
    },
  };
  for (const id of ids) {
    const tile = {
      attrs: {},
      children: [],
      ownerDocument: { createElement: () => ({ className: '', textContent: '' }) },
      getAttribute(name) { return this.attrs[name] ?? null; },
      setAttribute(name, value) { this.attrs[name] = value; },
      querySelector() { return this.children[0] || null; },
      appendChild(child) { this.children.push(child); return child; },
    };
    tiles.set(id, tile);
  }
  const stamped = stampDestinationRail(dock);
  assert.equal(stamped.length, 7);
  for (const row of stamped) {
    const tile = tiles.get(row.id);
    assert.equal(row.line, STATION_HELP[row.id][1]);
    assert.equal(tile.getAttribute('aria-label').includes(row.line), true);
    assert.equal(tile.children[0].textContent, row.line);
  }
});

class DeskText {
  constructor(text) { this.nodeType = 3; this.textContent = String(text); this.parentNode = null; }
}
class DeskClassList {
  constructor() { this.values = new Set(); }
  reset(value) { this.values = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const active = force === undefined ? !this.values.has(value) : !!force;
    if (active) this.values.add(value); else this.values.delete(value);
    return active;
  }
}
class DeskEl {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = String(tag).toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.style = { setProperty() {}, removeProperty() {} };
    this.dataset = {};
    this.attributes = new Map();
    this.classList = new DeskClassList();
    this._className = '';
    this.hidden = false;
    this.disabled = false;
    this.isConnected = true;
    this.offsetWidth = 120;
    this.offsetHeight = 40;
  }
  get className() { return this._className; }
  set className(value) { this._className = String(value || ''); this.classList.reset(this._className); }
  set innerHTML(value) {
    this.children.length = 0;
    parseDesk(this, String(value || ''));
  }
  get textContent() { return this.children.map((child) => child.textContent || '').join(''); }
  set textContent(value) {
    this.children.length = 0;
    if (value != null && String(value) !== '') this.appendChild(new DeskText(String(value)));
  }
  appendChild(child) {
    if (!child) return null;
    if (child.parentNode && child.parentNode.removeChild) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  insertBefore(child, ref) {
    if (child && child.parentNode && child.parentNode.removeChild) child.parentNode.removeChild(child);
    if (child) child.parentNode = this;
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at < 0) this.children.push(child); else this.children.splice(at, 0, child);
    return child;
  }
  insertAdjacentElement(where, node) {
    if (where === 'afterbegin') return this.insertBefore(node, this.children[0] || null);
    if (where === 'beforeend') return this.appendChild(node);
    const parent = this.parentNode;
    if (!parent) return null;
    if (where === 'beforebegin') return parent.insertBefore(node, this);
    const next = parent.children[parent.children.indexOf(this) + 1] || null;
    if (!next) return parent.appendChild(node);
    return parent.insertBefore(node, next);
  }
  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
    if (child && child.parentNode === this) child.parentNode = null;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'class') this.className = text;
    if (name === 'hidden') this.hidden = true;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
      this.dataset[key] = text;
    }
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'hidden') this.hidden = false;
  }
  addEventListener() {}
  removeEventListener() {}
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const token = String(selector).trim().split(/\s+/).at(-1);
    const result = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.nodeType === 1 && deskMatches(child, token)) result.push(child);
        if (child.nodeType === 1) visit(child);
      }
    };
    visit(this);
    return result;
  }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 32, width: 80, height: 32 }; }
  focus() {}
  scrollIntoView() {}
  contains(node) { for (let p = node; p; p = p.parentNode) if (p === this) return true; return false; }
  closest(selector) {
    for (let node = this; node && node.nodeType === 1; node = node.parentNode) {
      if (deskMatches(node, selector)) return node;
    }
    return null;
  }
}
class DeskDocument {
  constructor() {
    this.body = new DeskEl(this, 'body');
    this.activeElement = this.body;
  }
  createElement(tag) { return new DeskEl(this, tag); }
  createElementNS(_ns, tag) { return this.createElement(tag); }
  createTextNode(text) { return new DeskText(text); }
  addEventListener() {}
  removeEventListener() {}
}
function parseDesk(parent, markup) {
  const stack = [parent];
  for (const token of markup.match(/<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (!token.startsWith('<')) {
      if (token.trim()) stack.at(-1).appendChild(new DeskText(token));
      continue;
    }
    const match = token.match(/^<\s*([\w:-]+)/);
    if (!match) continue;
    const element = parent.ownerDocument.createElement(match[1]);
    const attrs = token.slice(match[0].length, token.length - (token.endsWith('/>') ? 2 : 1));
    for (const attr of attrs.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
      element.setAttribute(attr[1], attr[2] ?? attr[3] ?? '');
    }
    stack.at(-1).appendChild(element);
    if (!token.endsWith('/>') && !['BR', 'IMG', 'INPUT'].includes(element.tagName)) stack.push(element);
  }
}
function deskMatches(element, selector) {
  let rest = String(selector || '').trim().replace(/^:scope\s*>\s*/, '');
  if (!rest) return false;
  let saw = false;
  while (rest) {
    if (rest.startsWith('.')) {
      const match = rest.match(/^\.([\w-]+)/);
      if (!match || !element.classList.contains(match[1])) return false;
      rest = rest.slice(match[0].length);
    } else if (rest.startsWith('[')) {
      const match = rest.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/);
      if (!match) return false;
      const actual = element.getAttribute(match[1]);
      if (match[2] === undefined ? actual == null : String(actual) !== match[2]) return false;
      rest = rest.slice(match[0].length);
    } else {
      const match = rest.match(/^[\w:-]+/);
      if (!match || element.tagName.toLowerCase() !== match[0].toLowerCase()) return false;
      rest = rest.slice(match[0].length);
    }
    saw = true;
  }
  return saw;
}

test('seed 4242: the live rail keeps its help line, and the board shows the count and the hold word', () => {
  globalThis.document = new DeskDocument();
  const destinations = Object.entries(STATION_HELP).map(([id, pair]) => ({ id, label: pair[0] }));
  const dock = createCommandDock({ destinations, actions: [], onNavigate() {}, onAction() {} });
  stampDestinationRail(dock.el);
  dock.setAttention('contracts', { badge: '!', title: 'Missions — recovery waiting' });
  const missions = dock.el.querySelector('[data-nav="contracts"]');
  const help = STATION_HELP.contracts[1];
  assert.equal(missions.getAttribute('aria-label').includes(help), true);
  assert.equal(missions.getAttribute('aria-label').includes('recovery waiting'), false);
  assert.equal(missions.querySelector('.sx-tile__gloss').textContent, help);
  assert.equal(missions.querySelector('[data-badge="contracts"]').textContent, '!');
  dock.setAttention(null);
  assert.equal(missions.getAttribute('aria-label').includes(help), true);
  assert.equal(missions.hasAttribute('title'), false);
  for (const [id, pair] of Object.entries(STATION_HELP)) {
    const tile = dock.el.querySelector(`[data-nav="${id}"]`);
    assert.equal(tile.querySelector('.sx-tile__gloss').textContent, pair[1]);
  }

  const offer = {
    id: 'offer-9', type: 'cargo_delivery', stationId: STATION, title: 'Mira Holt — standing relief run #2',
    summary: 'Carry two units of provisions.', reward_cr: 360, collateral_cr: 0, riskTier: 1,
    giverId: 'captain:mira', clientId: 'captain:mira',
    params: { cmdtyId: 'cmdty_food', qty: 2 },
  };
  const state = {
    ui: { dockedStationId: STATION },
    simTime: 0,
    player: { credits: 0, cargo: { capVolume: 10, usedVolume: 0 } },
    missions: {
      active: [],
      receipts: [{ id: 'm_1:completed', sourceOfferId: 'contract_47a_b0_recovery', type: 'salvage_retrieval' }],
      standingOrders: [{ stationId: STATION, type: 'tow_recovery', count: 2, template: {} }],
      boards: { [STATION]: { slots: [offer] } },
    },
  };
  const screen = createContractsScreen({ state, bus: { on() {}, off() {}, emit() {} } });
  screen.refresh({ state });
  const standing = screen.el.querySelector('[data-replay-standing-orders]');
  assert.match(standing.textContent, /2 of 3 tow recovery/);
  const note = screen.el.querySelector('.orr-lampkey__note');
  assert.ok(note, 'the Accept key shows a hold note');
  assert.equal(note.textContent, 'hold');
  screen.dispose();
});
