// SWARM-06 §6.4 — an elite trick's first sight, heard.
//
// swarmElites stamps a marked hull and emits swarm:affix (affix, affix2, affixes[], veteran)
// and nobody listened: a shielded or volatile hostile arrived with no vocabulary for what made
// it different. survivalAnnounce — the run's combat net, already the subscriber for the sibling
// swarm:broodTelegraph — now speaks each affix TYPE's authored tell once per run through the
// same finite-ttl alert -> voice floor every warning uses: one line per affix type, never per
// body, paced per wave so a room full of tricks is a lesson, not a wall of text.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { SWARM_AFFIX_BY_ID } from '../src/data/swarmThreats.js';
import {
  MAX_AFFIX_LINES_PER_WAVE,
  MAX_LINES_PER_WAVE,
  survivalAnnounce,
} from '../src/systems/survivalAnnounce.js';
import { swarmElites } from '../src/systems/swarmElites.js';

const SEED = 73311;
const DT = 1 / 60;

function spyBus() {
  const raw = createBus();
  const emitted = [];
  return {
    bus: {
      on: raw.on.bind(raw),
      off: raw.off.bind(raw),
      once: raw.once.bind(raw),
      emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
    },
    emitted,
  };
}

function liveRun(state, { phase = 'active', wave = 25 } = {}) {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  run.phase = phase;
  run.wave = wave;
  state.run = run;
  return run;
}

/** The combat net on a live swarm run, listening on a recording bus. */
function bootAnnounce(opts = {}) {
  const state = createGameState(SEED);
  const { bus, emitted } = spyBus();
  liveRun(state, opts);
  state.simTime = 0;
  survivalAnnounce.init({ state, bus, helpers: {} });
  return {
    state, bus, emitted,
    alerts: () => emitted.filter((e) => e.event === 'alert'),
    affixAlerts: () => emitted.filter((e) => e.event === 'alert'
      && typeof e.payload.key === 'string' && e.payload.key.startsWith('swarm-affix:')),
  };
}

/** The stamp receipt the way swarmElites emits it — the payload is the contract under test. */
function stamp(bus, primary, { id = 1, second = null, wave = 25 } = {}) {
  const nameOf = (a) => (SWARM_AFFIX_BY_ID[a] ? SWARM_AFFIX_BY_ID[a].name : null);
  bus.emit('swarm:affix', {
    id,
    affix: primary,
    name: nameOf(primary),
    affix2: second,
    name2: nameOf(second),
    affixes: second ? [primary, second] : [primary],
    veteran: second != null,
    wave,
    pos: { x: 0, z: 0 },
  });
}

/** A wave rollover with an empty plan — the wave bound resets, the run bound must not. */
function nextWave(h, wave) {
  h.bus.emit('run:wavePlanned', { wave, plan: {} });
}

// --- (a) the first sight of a trick speaks exactly one line -------------------------------

test('a first-sight affix speaks one warn line carrying the authored name and tell', () => {
  const h = bootAnnounce();
  stamp(h.bus, 'volatile');
  assert.equal(h.alerts().length, 1);
  const line = h.alerts()[0].payload;
  assert.equal(line.key, 'swarm-affix:volatile');
  assert.equal(line.sev, 'warn', 'a lesson, not a danger line');
  assert.equal(line.text, `${SWARM_AFFIX_BY_ID.volatile.name}: ${SWARM_AFFIX_BY_ID.volatile.blurb}`,
    'the authored blurb is the tell, verbatim');
  assert.ok(Number.isFinite(line.ttl), 'finite ttl — a pill with no clear seam is the alerts.js defect');
  survivalAnnounce.destroy();
});

// --- (d) zero spam: a room full of one trick is one line -----------------------------------

test('N bodies stamped with the same affix still speak exactly once', () => {
  const h = bootAnnounce();
  for (let i = 0; i < 6; i++) stamp(h.bus, 'shielded', { id: 100 + i });
  assert.equal(h.alerts().length, 1, 'six shielded hulls is one lesson');
  assert.equal(h.alerts()[0].payload.key, 'swarm-affix:shielded');
  survivalAnnounce.destroy();
});

// --- (b) the bound is per run, not per wave ------------------------------------------------

test('the run bound survives a wave rollover; a new trick still speaks', () => {
  const h = bootAnnounce();
  stamp(h.bus, 'volatile', { id: 1 });
  nextWave(h, 26);
  stamp(h.bus, 'volatile', { id: 2, wave: 26 });
  assert.equal(h.affixAlerts().length, 1, 'one volatile tell per run, not per wave');
  stamp(h.bus, 'splitter', { id: 3, wave: 26 });
  assert.equal(h.affixAlerts().length, 2, 'a trick the run has not taught still gets its line');
  assert.equal(h.affixAlerts()[1].payload.key, 'swarm-affix:splitter');
  survivalAnnounce.destroy();
});

// --- (c) a veteran's second trick announces independently ----------------------------------

test('a veteran names its unseen second trick — one line per affix type, never per body', () => {
  const h = bootAnnounce();
  stamp(h.bus, 'volatile', { id: 1 });
  stamp(h.bus, 'volatile', { id: 2, second: 'splitter' });
  assert.deepEqual(
    h.alerts().map((a) => a.payload.key),
    ['swarm-affix:volatile', 'swarm-affix:splitter'],
    'the veteran line is only the trick the run has not met',
  );
  survivalAnnounce.destroy();

  const both = bootAnnounce();
  stamp(both.bus, 'shielded', { id: 7, second: 'commander' });
  assert.deepEqual(
    both.alerts().map((a) => a.payload.key),
    ['swarm-affix:shielded', 'swarm-affix:commander'],
    'a veteran both of whose tricks are new teaches both, in payload order',
  );
  survivalAnnounce.destroy();
});

// --- the wave bound paces, never loses ------------------------------------------------------

test('a wave debuting many tricks paces them; the crowded-out tell lands next wave', () => {
  const h = bootAnnounce();
  stamp(h.bus, 'volatile', { id: 1 });
  stamp(h.bus, 'splitter', { id: 2 });
  stamp(h.bus, 'magnetic', { id: 3 });
  assert.equal(h.alerts().length, MAX_AFFIX_LINES_PER_WAVE, 'three debuts is a bounded beat');
  // Re-stamping the crowded-out trick inside the same wave cannot jump the bound.
  stamp(h.bus, 'magnetic', { id: 4 });
  assert.equal(h.alerts().length, MAX_AFFIX_LINES_PER_WAVE);
  nextWave(h, 26);
  stamp(h.bus, 'magnetic', { id: 5, wave: 26 });
  assert.equal(h.alerts().length, MAX_AFFIX_LINES_PER_WAVE + 1,
    'marked on announce, not on sight — the lesson is deferred, never lost');
  assert.equal(h.alerts()[2].payload.key, 'swarm-affix:magnetic');
  survivalAnnounce.destroy();
});

test('a spent wave line budget defers the tell instead of losing it', () => {
  const h = bootAnnounce();
  for (let t = 0; t < MAX_LINES_PER_WAVE; t++) {
    h.bus.emit('swarm:pressureTelegraph', { wave: 25, stored: 3, tick: t });
  }
  stamp(h.bus, 'volatile', { id: 1 });
  assert.equal(h.alerts().length, 0, 'the shared bound is hard — the affix line yields');
  nextWave(h, 26);
  stamp(h.bus, 'volatile', { id: 2, wave: 26 });
  assert.equal(h.alerts().length, 1, 'the lesson finds the next open wave');
  survivalAnnounce.destroy();
});

// --- (e) quiet when nothing real stamps -----------------------------------------------------

test('unaffixed stamps, unknown ids, malformed payloads, and a dead run all say nothing', () => {
  const h = bootAnnounce();
  h.bus.emit('swarm:affix', { id: 1, wave: 25 });                 // threat-marked body, no affix
  h.bus.emit('swarm:affix', { id: 2, wave: 25, affixes: [] });
  h.bus.emit('swarm:affix', { id: 3, wave: 25, affix: 'bogus', affixes: ['bogus'] });
  h.bus.emit('swarm:affix', null);
  h.bus.emit('swarm:affix', {});
  assert.equal(h.alerts().length, 0, 'silence, never a raw identifier on the floor');

  const dead = bootAnnounce({ phase: 'inactive' });
  stamp(dead.bus, 'volatile');
  assert.equal(dead.alerts().length, 0, 'no live run, no tell');
  survivalAnnounce.destroy();
});

// --- the real stamp path feeds the voice -----------------------------------------------------

test('the real swarmElites stamp path drives the voice end to end', () => {
  const state = createGameState(SEED);
  const { bus, emitted } = spyBus();
  liveRun(state, { wave: 50 });
  state.simTime = 0;
  survivalAnnounce.init({ state, bus, helpers: {} });
  swarmElites.init({
    state, bus,
    helpers: {
      spawnBudget: { request: (n) => n, bindEntity: () => true, releaseSome: () => {} },
      spawnEntity: (spec) => ({ ...spec, id: 'spawned' }),
      routeCombatDamage: () => {},
    },
    registry: { get: () => null },
  });

  const bodies = [];
  for (let i = 0; i < 48; i++) {
    const b = {
      id: 2000 + i, alive: true, pos: { x: 0, z: 0 }, type: 'ship',
      hull: 100, hullMax: 100, armor: 0, armorMax: 0, shield: 0, shieldMax: 0,
      maxSpeed: 60, combatSpeed: 50, thrust: 40,
      data: { runCohort: 'survival', runWave: 50, runRole: 'fodder', swarmChampion: true },
    };
    state.entities.set(b.id, b);
    bodies.push(b);
  }
  swarmElites.update(DT, state);

  const stamped = new Set();
  for (const b of bodies) {
    if (b.data.swarmAffix) stamped.add(b.data.swarmAffix);
    if (b.data.swarmAffix2) stamped.add(b.data.swarmAffix2);
  }
  assert.ok(stamped.size > 0, 'sanity: the room really stamped tricks');
  const affixAlerts = () => emitted.filter((e) => e.event === 'alert'
    && typeof e.payload.key === 'string' && e.payload.key.startsWith('swarm-affix:'));
  const first = affixAlerts();
  assert.ok(first.length >= 1, 'the first stamps reached the floor');
  assert.ok(first.length <= MAX_AFFIX_LINES_PER_WAVE, 'a room of tricks is still a bounded beat');
  for (const a of first) {
    const id = a.payload.key.slice('swarm-affix:'.length);
    assert.ok(stamped.has(id), 'every spoken tell names a trick the room really carries');
  }

  // Re-scans of the same stamped room never repeat a tell.
  for (let i = 0; i < 4; i++) swarmElites.update(DT, state);
  assert.equal(affixAlerts().length, first.length, 'a stamped room stays taught');
  survivalAnnounce.destroy();
  swarmElites.destroy();
});
