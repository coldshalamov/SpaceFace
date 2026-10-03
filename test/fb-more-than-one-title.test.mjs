// FB-060 — more than one title.
//
// Packet law: three authored counter titles — LIFELINE (survivor pods delivered to custody),
// RAZORLINE (swing releases rated razor), QUIET-CLEAR (WANTED windows ended with no kill) — each
// earnable by its own script and not by the others', each with the aura law, earned/succession/
// vacant news lines, and the shared succession path. Aura stacks are mutually exclusive: a
// wingmate under two held titles takes only the strongest.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIFELINE,
  LIFELINE_TITLE_ID,
  QUIET_CLEAR,
  QUIET_CLEAR_TITLE_ID,
  RAZORLINE,
  RAZORLINE_TITLE_ID,
  TITLES,
  THUNDERCHILD_TITLE_ID,
} from '../src/data/titles.js';
import { createTitlesSystem } from '../src/systems/titles.js';
import { titleAuraForWingmate, wingMorale } from '../src/systems/wingMorale.js';

class TestBus {
  constructor() { this.listeners = new Map(); this.emissions = []; }
  on(event, fn) {
    const l = this.listeners.get(event) || [];
    l.push(fn);
    this.listeners.set(event, l);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const l = this.listeners.get(event) || [];
    this.listeners.set(event, l.filter((x) => x !== fn));
  }
  emit(event, payload) {
    this.emissions.push({ event, payload });
    for (const fn of [...(this.listeners.get(event) || [])]) fn(payload, event);
  }
  emitted(event) { return this.emissions.filter((e) => e.event === event).map((e) => e.payload); }
}

function playerShip() {
  return {
    id: 1, type: 'ship', alive: true, team: 0, factionId: 'faction_free',
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel' },
  };
}

function npcShip(id, worldRecordId, overrides = {}) {
  return {
    id, type: 'ship', alive: true, team: 2, factionId: 'faction_reach',
    pos: { x: id * 40, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    hull: 80, hullMax: 80,
    data: { worldRecordId, shipDefId: 'ship_wasp', displayName: `Hull ${id}` },
    ...overrides,
  };
}

function setup({ withPlayer = true, npcs = [] } = {}) {
  const entities = [];
  if (withPlayer) entities.push(playerShip());
  entities.push(...npcs);
  const state = {
    story: {},
    tick: 0,
    simTime: 0,
    playerId: withPlayer ? 1 : 0,
    meta: { seed: 4242 },
    entities: new Map(entities.map((e) => [e.id, e])),
    entityList: [...entities],
    world: { currentSectorId: 'sector_helios_prime' },
    player: {
      activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
    },
  };
  const bus = new TestBus();
  const system = createTitlesSystem();
  system.init({ state, bus, helpers: {} });
  return { state, bus, system };
}

const rec = (state, id) => state.story.titles.byId[id];
const progress = (state, id, key) => (rec(state, id).progress[key] || 0);

// Each script is the minimum sequence of canonical events that earns its title — and nothing else.
function rescueScript(bus, n = LIFELINE.counterTarget, base = 0) {
  for (let i = 0; i < n; i++) {
    bus.emit('survivorPod:rescued', {
      id: `survivor:${base + i}`, entityId: base + i,
      reason: 'station_delivery', stationId: 'station_helios', t: i,
    });
  }
}
function razorScript(bus, n = RAZORLINE.counterTarget, base = 0) {
  for (let i = 0; i < n; i++) {
    bus.emit('tether:releaseRated', {
      targetId: `pod-${base + i}`, classification: 'razor',
      observedTick: 100 + base + i, deliberate: true,
    });
  }
}
function quietScript(bus, state, n = QUIET_CLEAR.counterTarget) {
  for (let i = 0; i < n; i++) {
    state.tick += 60;   // a new window is a new tick — the receipt key is tick-keyed
    bus.emit('heat:changed', { value: 12, wanted: true, wantedCrossed: true, reason: 'test' });
    state.tick += 60;
    bus.emit('heat:changed', { value: 0, wanted: false, wantedCrossed: true, reason: 'test' });
  }
}

test('three counter titles are authored alongside Thunderchild', () => {
  assert.deepEqual(TITLES.map((t) => t.id), [
    THUNDERCHILD_TITLE_ID, LIFELINE_TITLE_ID, RAZORLINE_TITLE_ID, QUIET_CLEAR_TITLE_ID,
  ]);
  for (const def of [LIFELINE, RAZORLINE, QUIET_CLEAR]) {
    assert.ok(def.counter && def.counterTarget > 0 && def.aura && def.news.earnedSuffix
      && def.news.successionPrefix && def.news.successionSuffix && def.news.vacant,
      `${def.id} is a complete title record`);
  }
});

test('the rescue script earns Lifeline and moves no other counter', () => {
  const { state, bus } = setup();
  rescueScript(bus, LIFELINE.counterTarget - 1);
  assert.equal(rec(state, LIFELINE_TITLE_ID).status, 'vacant', 'under target it only accrues');
  assert.equal(progress(state, LIFELINE_TITLE_ID, 'player'), LIFELINE.counterTarget - 1);

  rescueScript(bus, 1, 90);
  const own = rec(state, LIFELINE_TITLE_ID);
  assert.equal(own.status, 'held');
  assert.equal(own.holderKey, 'player');
  assert.equal(own.holder.displayName, 'Tessera', 'the news names the ship, not a stranger');

  assert.equal(progress(state, RAZORLINE_TITLE_ID, 'player'), 0, 'rescues did not count as razors');
  assert.equal(progress(state, QUIET_CLEAR_TITLE_ID, 'player'), 0);
  assert.equal(rec(state, THUNDERCHILD_TITLE_ID).status, 'vacant');

  const earned = bus.emitted('title:earned').find((e) => e.titleId === LIFELINE_TITLE_ID);
  assert.ok(earned);
  const news = bus.emitted('news:publish').find((e) => e.titleId === LIFELINE_TITLE_ID);
  assert.match(news.text, /Tessera has earned the title Lifeline\./);
});

test('the razor script earns Razorline and moves no other counter', () => {
  const { state, bus } = setup();
  razorScript(bus);
  const own = rec(state, RAZORLINE_TITLE_ID);
  assert.equal(own.status, 'held');
  assert.equal(own.holderKey, 'player');
  assert.equal(progress(state, LIFELINE_TITLE_ID, 'player'), 0);
  assert.equal(progress(state, QUIET_CLEAR_TITLE_ID, 'player'), 0);
  assert.ok(bus.emitted('title:earned').some((e) => e.titleId === RAZORLINE_TITLE_ID));
});

test('a clean wanted window earns Quiet-Clear; a kill inside the window voids it', () => {
  const { state, bus } = setup();
  // First window spoiled: the player kills while WANTED.
  bus.emit('heat:changed', { value: 12, wanted: true, wantedCrossed: true });
  bus.emit('entity:killed', { id: 77, killerId: 1 });
  state.tick += 30;
  bus.emit('heat:changed', { value: 0, wanted: false, wantedCrossed: true });
  assert.equal(progress(state, QUIET_CLEAR_TITLE_ID, 'player'), 0, 'a kill in the window is no clear');

  quietScript(bus, state, QUIET_CLEAR.counterTarget);
  const own = rec(state, QUIET_CLEAR_TITLE_ID);
  assert.equal(own.status, 'held');
  assert.equal(own.holderKey, 'player');
  assert.equal(progress(state, LIFELINE_TITLE_ID, 'player'), 0);
  assert.equal(progress(state, RAZORLINE_TITLE_ID, 'player'), 0);
  assert.ok(bus.emitted('title:earned').some((e) => e.titleId === QUIET_CLEAR_TITLE_ID));
});

test('an NPC hull can hold a counter title, and the death of the holder runs the same succession', () => {
  // A durable rescue hull delivers three pods while the player already holds Lifeline — the NPC
  // qualifies and queues; when the holder dies, the record resolves by the shared law.
  const npc = npcShip(9, 'world:rescue-nine');
  const { state, bus } = setup({ npcs: [npc] });
  rescueScript(bus); // player holds first
  assert.equal(rec(state, LIFELINE_TITLE_ID).holderKey, 'player');

  for (let i = 0; i < LIFELINE.counterTarget; i++) {
    bus.emit('survivorPod:delivered', {
      rescueHullId: npc.id, podEntityId: `pod-${i}`, stationId: 'station_helios', simTime: i,
    });
  }
  const own = rec(state, LIFELINE_TITLE_ID);
  assert.equal(own.holderKey, 'player', 'a qualified hull queues behind the live holder');
  assert.equal(own.candidates[0].holderKey, 'world:rescue-nine');

  // The holder's death passes the title to the deepest candidate — same law as Thunderchild.
  bus.emit('entity:killed', { id: state.playerId, killerId: 9 });
  const after = rec(state, LIFELINE_TITLE_ID);
  assert.equal(after.holderKey, 'world:rescue-nine');
  assert.equal(after.successionCount, 1);
  const succession = bus.emitted('title:succession').find((e) => e.titleId === LIFELINE_TITLE_ID);
  assert.ok(succession);
  const news = bus.emitted('news:publish').at(-1);
  assert.match(news.text, /The Lifeline is dead\. Hull 9 carries the title now\./);
});

test('a holder death with no candidate leaves the title vacant and says so', () => {
  const { state, bus } = setup();
  razorScript(bus);
  assert.equal(rec(state, RAZORLINE_TITLE_ID).holderKey, 'player');
  bus.emit('entity:killed', { id: state.playerId });
  const own = rec(state, RAZORLINE_TITLE_ID);
  assert.equal(own.status, 'vacant');
  assert.equal(own.holderKey, null);
  const news = bus.emitted('news:publish').at(-1);
  assert.match(news.text, /The Razorline is dead\. The title waits\./);
});

test('a pod cannot be counted twice across the two rescue receipts', () => {
  // A durable hull claims the pod (survivorPod:rescued, reason 'rescue_hull') and later hands it
  // to the station (survivorPod:delivered) — one pod, one receipt key, one mark.
  const npc = npcShip(9, 'world:rescue-nine');
  const { state, bus } = setup({ npcs: [npc] });
  bus.emit('survivorPod:rescued', { entityId: 42, reason: 'rescue_hull', rescueHullId: 9 });
  bus.emit('survivorPod:delivered', { rescueHullId: 9, podEntityId: 42, stationId: 'station_helios' });
  assert.equal(progress(state, LIFELINE_TITLE_ID, 'world:rescue-nine'), 1,
    'one pod is one rescue, however the world reported it');
});

test('aura stacks are mutually exclusive — the wingmate takes only the strongest', () => {
  const { state, bus } = setup();
  rescueScript(bus);   // player holds Lifeline (morale 0.12)
  razorScript(bus);    // player also holds Razorline (morale 0.08)

  // A wingmate beside the player.
  const wingmate = {
    id: 5, type: 'ship', alive: true, team: 0,
    pos: { x: 40, y: 0, z: 0 }, data: {},
  };
  state.entities.set(wingmate.id, wingmate);
  const aura = titleAuraForWingmate(state, wingmate);
  assert.equal(aura.def.id, LIFELINE_TITLE_ID, '0.12 beats 0.08 — the weaker aura never adds');
  assert.equal(aura.holder.id, state.playerId);

  // A Thunderchild holder NPC (0.15, radius 1200) beside the same wingmate outranks both.
  const npc = npcShip(9, 'world:storm', { team: 0, pos: { x: 60, y: 0, z: 0 } });
  state.entities.set(npc.id, npc);
  state.entityList.push(npc);
  state.story.titles.byId[THUNDERCHILD_TITLE_ID] = {
    status: 'held', holderKey: 'world:storm',
    holder: { shipDefId: 'ship_wasp', factionId: 'faction_reach', displayName: 'Hull 9' },
    earnedTick: 1, killMarks: 2, successionCount: 0,
    activeHolds: {}, candidates: [], history: [], processedReceiptIds: [],
  };
  const best = titleAuraForWingmate(state, wingmate);
  assert.equal(best.def.id, THUNDERCHILD_TITLE_ID, 'the strongest applicable aura wins alone');

  // And the scatter law applies exactly one aura factor.
  const morale = Object.create(wingMorale);
  morale.init({ state, bus, helpers: {} });
  const before = wingmate.data;
  morale._scatter(wingmate, { squadId: 'sq', reason: 'leader_killed', t: 10, duration: 8,
    destruction: { cause: 'generic' }, shockMultiplier: 1, leaderId: 9, survivorIds: [5] }, { pos: { x: 0, z: 0 } });
  const until = before.ai._wingMoraleUntil;
  assert.ok(Math.abs(until - (10 + 8 * (1 - 0.15))) < 1e-9,
    'one 0.15 aura shortens the scatter — 0.15 + 0.12 + 0.08 never compounds');
});
