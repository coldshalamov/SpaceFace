// Brood family presentation — the authored tell heard, and the late debut card dealt.
//
// GAP A — swarm:broodTelegraph carried every family's authored {bark,line,cue} and nobody
// listened: three emit sites, zero subscribers. survivalAnnounce (the run's combat net,
// already the subscriber for the sibling swarm:pressureTelegraph) now speaks the tell
// through the same finite-ttl alert -> voice floor every warning uses, rate-limited so a
// burst of cells is one line per family per window, never a chorus.
//
// GAP B — swarmBroodNewcomerFor read only the base roster, so the late families (the
// burrower/splitter/brood_mother rows and the w31-55 band) debuted in silence: no slam card.
// The lookup now consults the folded set the wave actually fields.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  BROOD_TELEGRAPH_GAP_S,
  MAX_BROOD_TELEGRAPH_LINES_PER_WAVE,
  survivalAnnounce,
} from '../src/systems/survivalAnnounce.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { swarmBroodFamily, swarmBroodNewcomerFor } from '../src/data/swarmBrood.js';
import {
  SWARM_BROOD_LATE_FAMILIES,
  swarmBroodLateFamily,
} from '../src/data/swarmBroodLate.js';

const SEED = 4242;
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

function liveRun(state, { phase = 'active', wave = 37 } = {}) {
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
  };
}

/** The juice detector on the same shape — the slam card lives on its run:wavePlanned. */
function bootJuice(opts = {}) {
  const state = createGameState(SEED);
  const { bus, emitted } = spyBus();
  liveRun(state, opts);
  state.simTime = 0;
  swarmJuice.init({ state, bus, helpers: {} });
  return { state, bus, emitted };
}

/** The real engine and the real subscriber on one bus — the emitted payload is the contract. */
function bootEngine({ wave = 37 } = {}) {
  const state = createGameState(SEED);
  const { bus, emitted } = spyBus();
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 400, hull: 200, hullMax: 200,
  };
  const rock = {
    id: state.nextEntityId++, alive: true, type: 'asteroid', collides: true,
    pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 18,
  };
  state.entities.set(player.id, player);
  state.entities.set(rock.id, rock);
  state.entityList.push(player, rock);
  state.playerId = player.id;
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [rock] };
  liveRun(state, { wave });
  state.mode = 'flight';
  state.simTime = 0;
  survivalAnnounce.init({ state, bus, helpers: {} });
  const engine = createBroodEngine({
    bus,
    getState: () => state,
    fieldList: () => [],
    routeDamage: () => ({ ok: true }),
  });
  return { state, bus, emitted, player, rock, engine,
    alerts: () => emitted.filter((e) => e.event === 'alert') };
}

function telegraph(bus, familyId) {
  const fam = swarmBroodLateFamily(familyId) || swarmBroodFamily(familyId);
  bus.emit('swarm:broodTelegraph', {
    familyId,
    bark: fam.telegraph.bark,
    line: fam.telegraph.line,
    cue: fam.telegraph.cue,
    pos: { x: 0, z: 0 },
  });
}

// --- GAP A: the tell reaches the floor ----------------------------------------------------

test('a telegraphing family surfaces exactly one line per window, authored text verbatim', () => {
  const h = bootAnnounce();
  const fam = swarmBroodLateFamily('burrower');
  // Many cells commit in the same breath — the burst is one tell, not a chorus.
  telegraph(h.bus, 'burrower');
  telegraph(h.bus, 'burrower');
  telegraph(h.bus, 'burrower');
  assert.equal(h.alerts().length, 1, 'three buried burrowers, one spoken line');
  const line = h.alerts()[0].payload;
  assert.equal(line.text, fam.telegraph.line, 'the line is the authored tell, verbatim');
  assert.equal(line.key, 'brood-telegraph:burrower');
  assert.equal(line.sev, 'warn', 'a warn tell, not a danger line');
  assert.ok(Number.isFinite(line.ttl), 'finite ttl — a pill with no clear seam is the alerts.js defect');

  h.state.simTime += BROOD_TELEGRAPH_GAP_S - 0.5;
  telegraph(h.bus, 'burrower');
  assert.equal(h.alerts().length, 1, 'inside the gap the family stays spent');
  h.state.simTime += 1; // past the window
  telegraph(h.bus, 'burrower');
  assert.equal(h.alerts().length, 2, 'the family may warn again once the window passes');
  survivalAnnounce.destroy();
});

test('different families each get a tell — up to the per-wave bound', () => {
  const h = bootAnnounce();
  for (const id of ['burrower', 'splitter', 'brood_mother', 'gloomcap']) telegraph(h.bus, id);
  const alerts = h.alerts();
  assert.equal(alerts.length, MAX_BROOD_TELEGRAPH_LINES_PER_WAVE,
    'four committing families is still a bounded beat');
  assert.equal(alerts[0].payload.key, 'brood-telegraph:burrower');
  assert.equal(alerts[1].payload.key, 'brood-telegraph:splitter');
  assert.equal(alerts[1].payload.text, swarmBroodLateFamily('splitter').telegraph.line);
  survivalAnnounce.destroy();
});

test('quiet when nothing telegraphs — and silent when the run is not live', () => {
  const h = bootAnnounce();
  assert.equal(h.alerts().length, 0, 'the voice does not invent tells');
  // Malformed payloads say nothing rather than leaking noise.
  h.bus.emit('swarm:broodTelegraph', { familyId: 'burrower' });
  h.bus.emit('swarm:broodTelegraph', { familyId: 42, line: 'a number is not a family' });
  assert.equal(h.alerts().length, 0);

  const dead = bootAnnounce({ phase: 'inactive' });
  telegraph(dead.bus, 'burrower');
  assert.equal(dead.alerts().length, 0, 'no live run, no tell');
  survivalAnnounce.destroy();
});

test('the real eruption reaches the floor once — every gloomcap in the rock, one line', () => {
  const h = bootEngine({ wave: 37 });
  h.engine.prepareWave(h.state.run, 37);
  h.engine.spawnWave(h.state);
  // Park beside the rock every buried family sleeps in: the whole cohort erupts at once.
  h.player.pos.x = h.rock.pos.x;
  h.player.pos.z = h.rock.pos.z + 20;
  for (let t = 0; t < 12; t++) {
    h.state.simTime += DT;
    h.engine.step(h.state);
  }
  const gloomAlerts = h.alerts().filter((a) => a.payload.key === 'brood-telegraph:gloomcap');
  assert.equal(gloomAlerts.length, 1, 'every gloomcap in the room is still one spoken tell');
  assert.equal(gloomAlerts[0].payload.text, swarmBroodLateFamily('gloomcap').telegraph.line,
    'the floor carries the family\'s authored eruption line');
  assert.ok(h.alerts().length <= MAX_BROOD_TELEGRAPH_LINES_PER_WAVE,
    'a whole room erupting cannot shout past the wave bound');
  assert.ok(
    h.emitted.some((e) => e.event === 'swarm:broodTelegraph' && e.payload.familyId === 'gloomcap'),
    'sanity: the engine really emitted the tell this test consumed',
  );
  survivalAnnounce.destroy();
});

// --- GAP B: the late debut deals the same slam card -----------------------------------------

test('every late family first-arrival now resolves through the folded roster', () => {
  for (const fam of SWARM_BROOD_LATE_FAMILIES) {
    const newcomer = swarmBroodNewcomerFor(fam.fromWave);
    assert.ok(newcomer, `wave ${fam.fromWave} resolves no newcomer`);
    assert.equal(newcomer.id, fam.id, `wave ${fam.fromWave} names ${newcomer.id}, not ${fam.id}`);
  }
});

test('the slam card carries a late debut with its authored counter', () => {
  const h = bootJuice();
  h.bus.emit('run:wavePlanned', { wave: 37, plan: {} });
  const slams = h.emitted.filter((e) => e.event === 'swarm:roundSlam');
  assert.equal(slams.length, 1);
  const card = slams[0].payload.newcomer;
  const fam = swarmBroodLateFamily('gloomcap');
  assert.equal(card.enemyId, 'gloomcap');
  assert.equal(card.name, fam.name);
  assert.equal(card.counter, fam.counter, 'the counter line rides the card verbatim');
  assert.equal(card.brood, true, 'the brood lane marks its own card');
  swarmJuice.destroy();
});

test('the base roster is unchanged: early newcomers and ship precedence hold', () => {
  assert.equal(swarmBroodNewcomerFor(1), null, 'wave 1 has no newcomer by definition');
  assert.equal(swarmBroodNewcomerFor(3).id, 'spitter');
  assert.equal(swarmBroodNewcomerFor(17).id, 'bellows');
  assert.equal(swarmBroodNewcomerFor(20), null, 'no family debuts on the champion row');
  assert.equal(swarmBroodNewcomerFor(22), null, 'the ship lane owns wave 22');

  const h = bootJuice();
  h.bus.emit('run:wavePlanned', { wave: 17, plan: {} });
  const card = h.emitted.filter((e) => e.event === 'swarm:roundSlam')[0].payload.newcomer;
  assert.equal(card.enemyId, 'bellows', 'a base-family debut still deals its card');
  h.bus.emit('run:wavePlanned', { wave: 5, plan: {} });
  const shipCard = h.emitted.filter((e) => e.event === 'swarm:roundSlam')[1].payload.newcomer;
  assert.equal(shipCard.enemyId, 'detonator_dart', 'a ship debut still outranks a brood debut');
  assert.ok(!shipCard.brood);
  swarmJuice.destroy();
});
