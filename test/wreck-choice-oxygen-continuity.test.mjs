import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createPromptDeck } from '../src/ui/promptDeck.js';
import { wreckChoicePrompt } from '../src/ui/wreckChoicePrompt.js';
import { survivorRescueQuote } from '../src/systems/survivorPod.js';

function boot(now = 5, { offer = null, podRecord = true } = {}) {
  const previous = globalThis.document;
  const doc = promptDeckDocument(900, 900); globalThis.document = doc;
  offer = offer || { id: 'rescue-offer', source: 'salvage', salvagePointId: 'pod', title: 'Survivor',
    reward_cr: 750,
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
    assert.match(f.text(), /AIR SPENT · PAYS 716 cr/);
    const choices = []; f.bus.on('survivorPod:choose', p => choices.push(p));
    f.deck.choose('wreck-choice:rescue-offer', 'rescue', 'test');
    assert.equal(choices[0]?.optionId, 'rescue');
    assert.equal(f.deck.size, 1, 'an intent alone is not acceptance');
    f.bus.emit('mission:accepted', { sourceOfferId: 'rescue-offer' });
    assert.equal(f.deck.size, 0);
  } finally { f.close(); }
});

test('the status string is rebuilt only when the displayed whole second changes', () => {
  const f = boot();
  try {
    const patches = [];
    const updateDecision = f.deck.updateDecision;
    f.deck.updateDecision = (id, patch) => { patches.push(patch); return updateDecision(id, patch); };
    f.deck.tick(); f.deck.tick();
    const first = patches.length;
    f.state.simTime = 5.4; f.deck.tick();
    f.state.simTime = 5.9; f.deck.tick();
    assert.equal(patches.length, first, 'a tick inside the same displayed second rebuilds nothing');
    f.state.simTime = 6; f.deck.tick();
    assert.equal(patches.length, first + 1, 'crossing the second boundary rebuilds once');
    assert.match(f.text(), /AIR 4s/);
    f.state.simTime = 30; f.deck.tick(); f.deck.tick();
    assert.match(f.text(), /AIR SPENT · PAYS 716 cr/);
    const spent = patches.length;
    f.state.simTime = 30.4; f.deck.tick(); f.deck.tick();
    assert.equal(patches.length, spent, 'same displayed second, same rebuild');
    f.state.simTime = 31.2; f.deck.tick();
    assert.equal(patches.length, spent + 1, 'the falling price still rebuilds once a second');
    f.state.simTime = 300; f.deck.tick(); f.deck.tick();
    assert.match(f.text(), /AIR SPENT · PAYS 338 cr/);
    const floored = patches.length;
    f.state.simTime = 320; f.deck.tick(); f.deck.tick();
    assert.equal(patches.length, floored, 'at the floor the status is a stable value');
  } finally { f.close(); }
});

test('refused rescue retains latch advice while its oxygen status changes', () => {
  const f = boot();
  try {
    f.bus.emit('survivorPod:rescueBlocked', { salvagePointId: 'pod', reason: 'tow_required' });
    f.state.simTime = 30; f.deck.tick();
    assert.match(f.text(), /TETHER REQUIRED/); assert.match(f.text(), /Latch the pod/);
    assert.match(f.text(), /AIR SPENT · PAYS 716 cr/);
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

test('completed re-entry seams rebuild the live card; a session dismissal stays down', () => {
  const f = boot();
  try {
    assert.equal(f.deck.size, 1);
    f.bus.emit('sector:exit', {}); assert.equal(f.deck.size, 0);
    f.bus.emit('sector:enter', { sectorId: 'ceres' });
    assert.equal(f.deck.size, 1, 'salvage never re-discovers a boarded offer — the seam rebuilds it');
    f.bus.emit('dock:docked', {}); assert.equal(f.deck.size, 0);
    f.bus.emit('dock:undocked', {});
    assert.equal(f.deck.size, 1, 'undocking in the pod\'s sector rebuilds it too');
    f.deck.choose('wreck-choice:rescue-offer', 'leave', 'test');
    assert.equal(f.deck.size, 0);
    f.bus.emit('sector:exit', {});
    f.bus.emit('sector:enter', { sectorId: 'ceres' });
    assert.equal(f.deck.size, 0, 'LEAVE IT is the session answer — re-entry does not resurrect it');
    f.bus.emit('dock:docked', {}); f.bus.emit('dock:undocked', {});
    assert.equal(f.deck.size, 0);
    f.bus.emit('save:loaded', {});
    assert.equal(f.deck.size, 1, 'a restored session still re-prompts every eligible pod');
    // The owner marks the record terminal before it announces the outcome.
    f.state.survivorPod.promotedByPoint.pod.stripped = true;
    f.bus.emit('survivorPod:stripped', { salvagePointId: 'pod' });
    f.bus.emit('sector:exit', {});
    f.bus.emit('sector:enter', { sectorId: 'ceres' });
    assert.equal(f.deck.size, 0, 'a terminal outcome never comes back on a re-entry seam');
  } finally { f.close(); }
});

test('a pod in another sector does not re-prompt on this sector\'s re-entry', () => {
  const f = boot();
  try {
    f.state.survivorPod.promotedByPoint.pod.sectorId = 'elsewhere';
    f.bus.emit('sector:exit', {});
    f.bus.emit('sector:enter', { sectorId: 'ceres' });
    assert.equal(f.deck.size, 0);
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
    assert.match(f.text(), /AIR SPENT · PAYS 716 cr/);
    assert.equal(f.deck.size, 1);
  } finally { f.close(); }
});

test('the status line crosses the air boundary on a single tick', () => {
  const f = boot(9);
  try {
    assert.match(f.text(), /AIR 1s/);
    f.state.simTime = 10; f.deck.tick();
    assert.match(f.text(), /AIR SPENT · PAYS 750 cr/);
    assert.doesNotMatch(f.text(), /AIR \d+s/);
    assert.doesNotMatch(f.text(), /SURVIVOR STABLE/);
    assert.equal(f.deck.size, 1, 'the decision survives its own boundary tick');
  } finally { f.close(); }
});

test('a pod missing its owner record counts down from the offer stamp', () => {
  const f = boot(5, { podRecord: false });
  try {
    // No promotedByPoint entry: the offer's stamped oxygenDueAt is the only clock, and its
    // stamped reward_cr is the only price the card can honestly name.
    assert.match(f.text(), /AIR 5s/);
    f.state.simTime = 11; f.deck.tick();
    assert.match(f.text(), /AIR SPENT · PAYS 750 cr/);
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

// The real promotion route: core+state up, the pod owner promotes a salvage point on
// salvage:placed, and (with missions up) mission:offered stamps + boards the rescue row so
// survivorPod:choose commits through missions' synchronous accept — the ordinary player path.
async function bootPodRoute({ withMissions = true } = {}) {
  const { survivorPod } = await import('../src/systems/survivorPod.js');
  const { createGameState } = await import('../src/core/gameState.js');
  const { core } = await import('../src/core/coreSystem.js');
  const state = createGameState(991), bus = createBus(), helpers = {};
  core.init({ state, bus, helpers });
  core.preStep(1 / 60, state);
  const owner = Object.create(survivorPod);
  let missionsOwner = null;
  state.simTime = 100; state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  const player = helpers.spawnEntity({ type: 'ship', pos: { x: 0, z: 0 }, radius: 10,
    mass: 100, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  state.player.tether = { active: false, targetId: null };
  const a = wreckEntity(501, 'zone_tethys_derelict:sal0');
  const b = wreckEntity(502, 'zone_tethys_derelict:sal1', { x: 160, z: 40 });
  state.entities.set(a.id, a); state.entities.set(b.id, b); state.entityList.push(a, b);
  state.salvage = {
    plannedSectorId: 'sector_tethys_junction',
    points: [
      { id: 'zone_tethys_derelict:sal0', sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_derelict', pos: { x: a.pos.x, z: a.pos.z }, entityId: a.id, isCommunicator: false, wreckMissionId: null, offered: false },
      { id: 'zone_tethys_derelict:sal1', sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_derelict', pos: { x: b.pos.x, z: b.pos.z }, entityId: b.id, isCommunicator: false, wreckMissionId: null, offered: false },
    ],
  };
  owner.init({ state, bus, helpers });
  if (withMissions) {
    const { missions } = await import('../src/systems/missions.js');
    missionsOwner = Object.create(missions);
    missionsOwner.init({ state, bus, helpers, registry: { get: () => null } });
  }
  bus.emit('salvage:placed', { sectorId: 'sector_tethys_junction', count: 2, communicators: 0 });
  const point = state.salvage.points.find(p => p.survivorPod);
  const rec = point ? state.survivorPod.promotedByPoint[point.id] : null;
  return { state, bus, owner, missionsOwner, helpers, point, rec,
    close() { owner.destroy(); missionsOwner && missionsOwner.destroy?.(); core.destroy(); } };
}

// The ordinary discovery route: salvage emits mission:offered, the pod owner stamps the row
// (reward included) and missions boards it through _onExternalBoardOffer.
function boardRescueOffer(state, bus, point, rec) {
  const offer = { id: 'salvage-rescue-offer', source: 'salvage', salvagePointId: point.id,
    type: 'passenger_transport', stationId: rec.destStationId || 'station_tethys',
    params: { salvagePointId: point.id } };
  bus.emit('mission:offered', offer);
  return Object.values(state.missions.boards || {})
    .flatMap(board => (board && board.slots) || [])
    .find(row => row && row.id === offer.id) || null;
}

function acceptedPodMission(state, pointId) {
  return (state.missions.active || []).find(m => m && m.status === 'active'
    && m.params && m.params.survivorPodId === pointId) || null;
}

test('canonical promoted-pod owner still accepts a tethered rescue after oxygen depletion', async () => {
  const f = await bootPodRoute({ withMissions: false });
  const { state, bus, point, rec } = f;
  try {
    assert.ok(point);
    state.simTime = rec.oxygenDueAt + 1000;
    state.player.tether = { active: true, targetId: point.entityId };
    bus.on('survivorPod:rescueSelected', p => {
      assert.equal(p.oxygenExpired, true);
      state.missions.active.push({ id: 'accepted', status: 'active', params: { survivorPodId: p.salvagePointId } });
    });
    bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });
    assert.equal(rec.rescueSelected, true);
    assert.equal(state.missions.active.length, 1);
  } finally { f.close(); }
});

test('a rescue chosen while air remains pays the full stamped reward', async () => {
  const f = await bootPodRoute();
  const { state, bus, point, rec } = f;
  try {
    const boarded = boardRescueOffer(state, bus, point, rec);
    assert.ok(boarded, 'the communicator offer is a real board row');
    const stamped = boarded.reward_cr;
    assert.ok(Number.isFinite(stamped) && stamped > 0, 'the pod owner stamps the reward at offer time');
    state.simTime = rec.oxygenDueAt - 30;
    assert.equal(survivorRescueQuote(state, point.id).reward_cr, stamped,
      'with air remaining the quote IS the stamped price');
    state.player.tether = { active: true, targetId: point.entityId };
    bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });
    const accepted = acceptedPodMission(state, point.id);
    assert.ok(accepted, 'the canonical rescue accept runs synchronously inside the choice');
    assert.equal(accepted.reward_cr, stamped);
    assert.equal(rec.rescueSelected, true);
  } finally { f.close(); }
});

test('a rescue chosen 120 s after the air ran out pays the decayed quote', async () => {
  const f = await bootPodRoute();
  const { state, bus, point, rec } = f;
  try {
    const boarded = boardRescueOffer(state, bus, point, rec);
    const stamped = boarded.reward_cr;
    state.simTime = rec.oxygenDueAt + 120;
    const quote = survivorRescueQuote(state, point.id);
    assert.equal(quote.decaying, true);
    assert.ok(quote.reward_cr < stamped, 'waiting really costs money');
    assert.ok(quote.reward_cr > Math.round(quote.base_cr * rec.minRewardMultiplier),
      'mid-decay the quote is still above the floor');
    state.player.tether = { active: true, targetId: point.entityId };
    bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });
    const accepted = acceptedPodMission(state, point.id);
    assert.ok(accepted);
    assert.equal(accepted.reward_cr, quote.reward_cr,
      'the contract pays the quote re-read at commit, not the stale stamp');
    assert.ok(accepted.reward_cr < stamped);
  } finally { f.close(); }
});

test('a rescue chosen past the decay window pays exactly the floor', async () => {
  const f = await bootPodRoute();
  const { state, bus, point, rec } = f;
  try {
    const boarded = boardRescueOffer(state, bus, point, rec);
    const stamped = boarded.reward_cr;
    state.simTime = rec.oxygenDueAt + rec.oxygenDecayWindow_s + 60;
    const quote = survivorRescueQuote(state, point.id);
    assert.equal(quote.atFloor, true);
    assert.equal(quote.decaying, false, 'at the floor there is nothing left to decay');
    assert.equal(quote.reward_cr, Math.round(quote.base_cr * rec.minRewardMultiplier));
    state.player.tether = { active: true, targetId: point.entityId };
    bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });
    const accepted = acceptedPodMission(state, point.id);
    assert.ok(accepted);
    assert.equal(accepted.reward_cr, quote.reward_cr, 'the payout decays to exactly the floor');
    assert.ok(accepted.reward_cr < stamped);
  } finally { f.close(); }
});

test('a refused rescue accept leaves the board offer\'s stamped reward unchanged', async () => {
  const f = await bootPodRoute();
  const { state, bus, point, rec } = f;
  try {
    const boarded = boardRescueOffer(state, bus, point, rec);
    const stamped = boarded.reward_cr;
    state.simTime = rec.oxygenDueAt + 120;
    // The refusal fixture: a full contract book makes the real accept path refuse
    // (acceptMission's maxActive gate) with the offer row still up — the reprice must roll back.
    const cap = (state.missions.config && state.missions.config.maxActive) || 8;
    for (let i = 0; i < cap; i++) {
      state.missions.active.push({ id: `booked_${i}`, status: 'active', params: {} });
    }
    state.player.tether = { active: true, targetId: point.entityId };
    bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });
    assert.equal(boarded.reward_cr, stamped,
      'the refused commit restores the price the row advertises');
    assert.equal(rec.rescueSelected, false, 'no contract — the latch rolled back');
    // The retry proves the row still works: it commits at the quote now live, not the stamp.
    state.missions.active.length = 0;
    const retryQuote = survivorRescueQuote(state, point.id);
    bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });
    const accepted = acceptedPodMission(state, point.id);
    assert.ok(accepted, 'the retry lands the rescue');
    assert.equal(accepted.reward_cr, retryQuote.reward_cr);
  } finally { f.close(); }
});
