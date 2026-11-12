import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createPromptDeck } from '../src/ui/promptDeck.js';
import { wreckChoicePrompt } from '../src/ui/wreckChoicePrompt.js';

function boot(now = 5, { offer = null, podRecord = true } = {}) {
  const previous = globalThis.document;
  const doc = promptDeckDocument(900, 900); globalThis.document = doc;
  offer = offer || { id: 'rescue-offer', source: 'salvage', salvagePointId: 'pod', title: 'Survivor',
    params: { survivorPodId: 'pod' }, survivorPod: { oxygenDueAt: 10 },
    choice: { prompt: 'Rescue or strip the pod?', options: [{ id: 'rescue', label: 'Rescue' }, { id: 'strip', label: 'Strip' }] } };
  const pointId = offer.salvagePointId || (offer.params && offer.params.salvagePointId);
  const state = { mode: 'flight', simTime: now, ui: {}, world: { currentSectorId: 'ceres' },
    missions: { boards: { station: { slots: [offer] } } },
    survivorPod: podRecord
      ? { promotedByPoint: { pod: { oxygenDueAt: 10, sectorId: 'ceres', rescueSelected: false, stripped: false } } }
      : { promotedByPoint: {} } };
  const bus = createBus();
  const deck = createPromptDeck({ document: doc, state, bus });
  const adapter = Object.create(wreckChoicePrompt); adapter.init({ state, bus });
  bus.emit('salvage:communicatorFound', { salvagePointId: pointId });
  const text = node => [node.textContent, ...(node.children || []).map(text)].join(' ');
  return { state, bus, deck, adapter, text: () => text(deck.el), offer,
    close() { adapter.destroy(); deck.destroy(); globalThis.document = previous; } };
}

test('real deck keeps rescue and strip usable after the oxygen boundary', () => {
  const f = boot();
  try {
    assert.match(f.text(), /AIR 5s/);
    f.state.simTime = 30; f.deck.tick();
    assert.equal(f.deck.size, 1);
    assert.match(f.text(), /SURVIVOR STABLE/);
    const choices = []; f.bus.on('survivorPod:choose', p => choices.push(p));
    f.deck.choose('wreck-choice:rescue-offer', 'rescue', 'test');
    assert.equal(choices[0]?.optionId, 'rescue');
    assert.equal(f.deck.size, 1, 'an intent alone is not acceptance');
    f.bus.emit('mission:accepted', { sourceOfferId: 'rescue-offer' });
    assert.equal(f.deck.size, 0);
  } finally { f.close(); }
});

test('refused rescue retains latch advice while its oxygen status changes', () => {
  const f = boot();
  try {
    f.bus.emit('survivorPod:rescueBlocked', { salvagePointId: 'pod', reason: 'tow_required' });
    f.state.simTime = 30; f.deck.tick();
    assert.match(f.text(), /TETHER REQUIRED/); assert.match(f.text(), /Latch the pod/);
    assert.match(f.text(), /SURVIVOR STABLE/);
    assert.equal(f.deck.size, 1);
  } finally { f.close(); }
});

test('Continue restores overdue actionable pods, but not committed or stripped pods', () => {
  const f = boot(60);
  try {
    f.bus.emit('save:loaded', {}); f.deck.tick(); assert.equal(f.deck.size, 1);
    f.state.survivorPod.promotedByPoint.pod.rescueSelected = true;
    f.bus.emit('save:loaded', {}); assert.equal(f.deck.size, 0);
    f.state.survivorPod.promotedByPoint.pod.rescueSelected = false;
    f.state.survivorPod.promotedByPoint.pod.stripped = true;
    f.bus.emit('save:loaded', {}); assert.equal(f.deck.size, 0);
  } finally { f.close(); }
});

test('strip completion and player dismissal still remove the card', () => {
  const f = boot(60);
  try {
    f.bus.emit('survivorPod:stripped', { salvagePointId: 'pod' }); assert.equal(f.deck.size, 0);
    f.bus.emit('salvage:communicatorFound', { salvagePointId: 'pod' });
    f.deck.choose('wreck-choice:rescue-offer', 'leave', 'test'); assert.equal(f.deck.size, 0);
    assert.equal(f.state.missions.boards.station.slots.length, 1, 'leave does not withdraw the contract');
  } finally { f.close(); }
});

test('a committed rescue annotates the card instead of leaving strip silent', () => {
  const f = boot();
  try {
    f.bus.emit('survivorPod:stripBlocked', { salvagePointId: 'pod', reason: 'rescue_committed' });
    assert.equal(f.deck.size, 1);
    assert.match(f.text(), /RESCUE COMMITTED/);
    assert.match(f.text(), /strip claim is spent/);
    f.state.simTime = 30; f.deck.tick();
    assert.match(f.text(), /RESCUE COMMITTED/);
    assert.match(f.text(), /SURVIVOR STABLE/);
    assert.equal(f.deck.size, 1);
  } finally { f.close(); }
});

test('the status line crosses the air boundary on a single tick', () => {
  const f = boot(9);
  try {
    assert.match(f.text(), /AIR 1s/);
    f.state.simTime = 10; f.deck.tick();
    assert.match(f.text(), /SURVIVOR STABLE · PAYOUT DECAYING/);
    assert.doesNotMatch(f.text(), /AIR \d+s/);
    assert.equal(f.deck.size, 1, 'the decision survives its own boundary tick');
  } finally { f.close(); }
});

test('a pod missing its owner record counts down from the offer stamp', () => {
  const f = boot(5, { podRecord: false });
  try {
    // No promotedByPoint entry: the offer's stamped oxygenDueAt is the only clock.
    assert.match(f.text(), /AIR 5s/);
    f.state.simTime = 11; f.deck.tick();
    assert.match(f.text(), /SURVIVOR STABLE/);
    assert.equal(f.deck.size, 1);
  } finally { f.close(); }
});

test('an ordinary communicator offer keeps its untimed card and the choose seam', () => {
  const comms = { id: 'comms-offer', source: 'salvage', salvagePointId: 'claim', title: 'Wreck claim',
    summary: 'A contract rides on this wreck.' };
  const f = boot(5, { offer: comms, podRecord: false });
  try {
    assert.match(f.text(), /CONTRACT SIGNAL/);
    assert.match(f.text(), /A contract rides on this wreck\./);
    assert.doesNotMatch(f.text(), /AIR \d+s/);
    assert.doesNotMatch(f.text(), /— \d+s/, 'no oxygen deadline is rendered for a plain offer');
    f.state.simTime = 30; f.deck.tick();
    assert.equal(f.deck.size, 1, 'an untimed decision never expires on the oxygen clock');
    const choices = []; f.bus.on('wreckMission:choose', p => choices.push(p));
    f.deck.choose('wreck-choice:comms-offer', 'take', 'test');
    assert.equal(choices[0]?.offerId, 'comms-offer');
    assert.equal(choices[0]?.choiceId, 'take');
    assert.equal(f.deck.size, 0);
  } finally { f.close(); }
});

// Same minimal DOM contract used by the existing prompt-deck suite.
function promptDeckDocument(width, height) {
  const listeners = new Map();
  const make = (tagName) => {
    const node = {
      tagName, id: '', className: '', textContent: '', hidden: false, disabled: false,
      children: [], attrs: {}, dataset: {}, listeners: {}, parentNode: null,
      style: { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } },
      get firstElementChild() { return this.children[0] || null; },
      get lastElementChild() { return this.children.at(-1) || null; },
      get nextElementSibling() {
        const siblings = this.parentNode?.children || [];
        return siblings[siblings.indexOf(this) + 1] || null;
      },
      get childElementCount() { return this.children.length; },
      appendChild(child) { detach(child); child.parentNode = this; this.children.push(child); return child; },
      append(...children) { for (const child of children) this.appendChild(child); },
      insertBefore(child, ref) {
        if (child === ref) return child;
        detach(child); child.parentNode = this;
        const index = ref ? this.children.indexOf(ref) : -1;
        if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
        return child;
      },
      replaceChildren(...children) { for (const child of [...this.children]) detach(child); this.append(...children); },
      remove() { detach(this); },
      contains(target) { return target === this || this.children.some((child) => child.contains(target)); },
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name] ?? null; },
      removeAttribute(name) { delete this.attrs[name]; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); },
      click() { for (const fn of this.listeners.click || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); },
    };
    function detach(child) {
      const siblings = child.parentNode?.children;
      const index = siblings?.indexOf(child) ?? -1;
      if (index >= 0) siblings.splice(index, 1);
      child.parentNode = null;
    }
    node.classList = {
      add(...names) { node.className = [...new Set([...node.className.split(/\s+/), ...names])].filter(Boolean).join(' '); },
      remove(...names) { node.className = node.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
      contains(name) { return node.className.split(/\s+/).includes(name); },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !node.classList.contains(name) : !!force;
        if (shouldAdd) node.classList.add(name); else node.classList.remove(name);
        return shouldAdd;
      },
    };
    return node;
  };
  const head = make('head');
  const body = make('body');
  body.id = 'ui-root';
  const documentElement = make('html');
  documentElement.classList.add('sf-reduce-motion');
  const viewListeners = new Map();
  const defaultView = {
    innerWidth: width,
    innerHeight: height,
    addEventListener(type, fn) { (viewListeners.get(type) || viewListeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { viewListeners.get(type)?.delete(fn); },
  };
  const doc = {
    head, body, documentElement, defaultView,
    createElement: make,
    getElementById(id) {
      if (id === 'ui-root') return body;
      const find = (node) => node.id === id ? node : node.children.map(find).find(Boolean) || null;
      return find(head) || find(body);
    },
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event) { for (const fn of listeners.get(type) || []) fn({ ...event, preventDefault() {}, stopImmediatePropagation() {} }); },
  };
  return doc;
}

function wreckEntity(id, pointId, pos = { x: 100, z: 0 }) {
  return {
    id,
    type: 'wreck',
    alive: true,
    pos,
    radius: 8,
    data: {
      parentType: 'debris',
      salvagePointId: pointId,
      salvagePool: { cmdty_scrap_metal: 2 },
      scanLabel: 'Wreck Debris',
    },
  };
}

function makeState() {
  const a = wreckEntity(501, 'zone_tethys_derelict:sal0');
  const b = wreckEntity(502, 'zone_tethys_derelict:sal1', { x: 160, z: 40 });
  return {
    meta: { seed: 991 },
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: { credits: 1000, tether: { active: false, targetId: null } },
    factions: { faction_scn: { rep: 0 } },
    missions: { active: [] },
    ui: {},
    world: {
      currentSectorId: 'sector_tethys_junction',
      sectors: { sector_tethys_junction: { id: 'sector_tethys_junction', name: 'Tethys Junction' } },
    },
    entities: new Map([
      [1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, hull: 100 }],
      [a.id, a],
      [b.id, b],
    ]),
    salvage: {
      plannedSectorId: 'sector_tethys_junction',
      points: [
        { id: 'zone_tethys_derelict:sal0', sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_derelict', pos: { x: a.pos.x, z: a.pos.z }, entityId: a.id, isCommunicator: false, wreckMissionId: null, offered: false },
        { id: 'zone_tethys_derelict:sal1', sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_derelict', pos: { x: b.pos.x, z: b.pos.z }, entityId: b.id, isCommunicator: false, wreckMissionId: null, offered: false },
      ],
    },
  };
}


test('canonical promoted-pod owner still accepts a tethered rescue after oxygen depletion', async () => {
  const { survivorPod } = await import('../src/systems/survivorPod.js');
  const state = makeState(), bus = createBus(), owner = Object.create(survivorPod);
  owner.init({ state, bus, helpers: {} });
  try {
    bus.emit('salvage:placed', { sectorId: 'sector_tethys_junction', count: 2, communicators: 0 });
    const point = state.salvage.points.find(p => p.survivorPod);
    assert.ok(point);
    const rec = state.survivorPod.promotedByPoint[point.id];
    state.simTime = rec.oxygenDueAt + 1000;
    state.player.tether = { active: true, targetId: point.entityId };
    bus.on('survivorPod:rescueSelected', p => {
      assert.equal(p.oxygenExpired, true);
      state.missions.active.push({ id: 'accepted', status: 'active', params: { survivorPodId: p.salvagePointId } });
    });
    bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });
    assert.equal(rec.rescueSelected, true);
    assert.equal(state.missions.active.length, 1);
  } finally { owner.destroy(); }
});
