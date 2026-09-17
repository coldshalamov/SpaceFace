// INFERENCE (WF-18) — the customs logic net declares comply/bribe/run but the patrol
// script offered a hardcoded submit/run, so the director's shape-side validation ate
// every submit click and the primary path only worked via timeout. The script now
// offers the shape's declared verbs, honors its window and timeout, and maps comply
// onto the submit machinery. Unknown ids are ignored, never submitted.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ENCOUNTERS } from '../src/data/encounters.js';
import { ENCOUNTER_SCRIPTS, createEncounterShapeMeter } from '../src/systems/encounterScripts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { createSimulation } from '../src/core/sim.js';

const SHAPE_ID = 'customs_logic_net';

function makeState({ credits = 500, contraband = false } = {}) {
  return {
    simTime: 100,
    tick: 6000,
    encounterShapeMeter: createEncounterShapeMeter(),
    encounterDirector: { live: {}, named: {} },
    player: {
      credits,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      cargo: { items: {}, usedVolume: 0, usedMass: 0 },
    },
    world: {},
    entities: new Map(),
    _contraband: contraband,
  };
}

function scriptDelegate(state, emitted) {
  const dir = Object.create(encounterDirector);
  dir.state = state;
  dir.emit = (name, payload) => { emitted.push({ name, payload }); };
  return {
    now: () => state.simTime,
    player: () => state.player,
    stream: () => () => 0.5,
    spawnShips: (live, ships) => ships.map((s, i) => {
      const id = `ent-${i}`;
      live.roles[id] = s.role || 'wing';
      state.entities.set(id, {
        id, alive: true, pos: { ...s.pos }, vel: { x: 0, z: 0 }, team: 1, data: { ai: {} },
      });
      return id;
    }),
    entsOf: (live, role) => Object.entries(live.roles || {})
      .filter(([, r]) => !role || r === role)
      .map(([id]) => state.entities.get(id))
      .filter((e) => e && e.alive !== false),
    aliveCount: (live, role) => Object.entries(live.roles || {})
      .filter(([, r]) => !role || r === role)
      .map(([id]) => state.entities.get(id))
      .filter((e) => e && e.alive !== false).length,
    minDist2ToSquad: () => 0,
    sectorSecurity: () => 0.6,
    hasContraband: () => state._contraband === true,
    fineEstimate: () => (state._contraband ? 400 : 0),
    dumpContraband: () => { state._contraband = false; return 2; },
    say: (live, channel, textOrId, vars, o) => {
      emitted.push({ name: `say:${channel}`, payload: { textOrId, vars, o } });
    },
    offerChoices: (live, ids, timeout, deadline) => dir.offerChoices(live, ids, timeout, deadline),
    despawnAll: (live, r) => { emitted.push({ name: 'despawnAll', payload: { r } }); },
    resolve: (live, outcome, o) => {
      emitted.push({ name: 'resolved', payload: { outcome, vars: (o && o.vars) || live.vars } });
      return outcome;
    },
    abort: (live, reason) => { emitted.push({ name: 'aborted', payload: { reason } }); return 'aborted'; },
    rep: (faction, delta, reason) => { emitted.push({ name: 'rep', payload: { faction, delta, reason } }); },
    setPassive: () => {},
    emit: (name, payload) => { emitted.push({ name, payload }); },
  };
}

function liveFor() {
  const shape = ENCOUNTERS[SHAPE_ID];
  return {
    id: 'live-customs-1',
    shapeId: SHAPE_ID,
    shape,
    script: 'patrolScan',
    plan: { zoneType: 'trade_lane', ships: [{ role: 'wing' }, { role: 'wing' }] },
    vars: {},
    data: {},
    roles: {},
    phase: 'telegraph',
    factionId: shape.factionId,
    sectorId: 'sector_test',
    zoneId: 'zone_test',
    anchor: { x: 400, z: 0 },
    zoneRadius: 800,
  };
}

// Route a click through the REAL director validation — the path that ate submit.
function clickThroughDirector(state, live, choiceId) {
  state.encounterDirector.live[live.id] = live;
  const dir = Object.create(encounterDirector);
  dir.state = state;
  dir.bus = { emit: () => {} };
  dir.emit = () => {};
  dir._onChoose({ encounterId: live.id, choiceId });
}

test('the net offers its declared verbs on its declared window', () => {
  const emitted = [];
  const state = makeState();
  const d = scriptDelegate(state, emitted);
  const live = liveFor();
  ENCOUNTER_SCRIPTS.patrolScan.fire(d, live, state);
  assert.equal(live.phase, 'offer');
  assert.equal(live.deadlineAt, 116, 'the declared 16 s window, not the legacy 10 s');
  const offer = emitted.find((e) => e.name === 'encounter:choiceOffered');
  assert.ok(offer);
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['comply', 'run'],
    'clean hold: bribe stays unoffered');
  assert.deepEqual(offer.payload.options.map((o) => o.label), ['Hold for scan', 'Break the cordon']);
  assert.equal(offer.payload.timeoutChoice, 'comply');
  assert.equal(offer.payload.deadlineAt, 116);
});

test('contraband aboard adds the fee to the offer', () => {
  const emitted = [];
  const state = makeState({ contraband: true });
  const d = scriptDelegate(state, emitted);
  const live = liveFor();
  ENCOUNTER_SCRIPTS.patrolScan.fire(d, live, state);
  const offer = emitted.find((e) => e.name === 'encounter:choiceOffered');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['comply', 'bribe', 'run']);
  const bribe = offer.payload.options.find((o) => o.id === 'bribe');
  assert.equal(bribe.label, 'Offer a fee');
  assert.equal(bribe.available, true, '500 cr covers the fee estimate');
});

test('a broke smuggler sees the fee greyed out, never burnable', () => {
  const emitted = [];
  const state = makeState({ credits: 10, contraband: true });
  const d = scriptDelegate(state, emitted);
  const live = liveFor();
  ENCOUNTER_SCRIPTS.patrolScan.fire(d, live, state);
  assert.equal(live.vars.amount, 120, 'staged fee matches the 30% charge expression');
  const offer = emitted.find((e) => e.name === 'encounter:choiceOffered');
  const bribe = offer.payload.options.find((o) => o.id === 'bribe');
  assert.equal(bribe.available, false, '10 cr cannot cover a 120 cr fee');
});

test('clicking comply submits through the production director — the recovered contract', () => {
  const sim = createSimulation({ seed: 32601, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_io_reach';
  const rows = [];
  for (const name of ['encounter:choiceOffered', 'patrol:proximity', 'encounter:resolved']) {
    sim.bus.on(name, (payload) => rows.push({ name, payload }));
  }
  const director = sim.registry.get('encounterDirector');
  const result = director.requestAuthoredEncounter({
    shapeId: SHAPE_ID, encounterId: 'customs-click:one',
    sectorId: 'sector_io_reach', anchor: { x: 300, z: 0 }, force: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const offer = rows.find((r) => r.name === 'encounter:choiceOffered');
  assert.ok(offer, 'the net opens its offer on the production route');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['comply', 'run']);

  // Before the fix the script offered `submit`, which the director's shape-side
  // validation rejected — the primary button silently did nothing.
  sim.bus.emit('encounter:choose', { encounterId: 'customs-click:one', choiceId: 'comply' });
  assert.ok(rows.some((r) => r.name === 'patrol:proximity'), 'comply runs the customs machinery');
  const resolved = rows.find((r) => r.name === 'encounter:resolved');
  assert.equal(resolved.payload.outcome, 'clean');
});

test('silence complies at the deadline; running nicks rep; garbage is ignored', () => {
  const emitted = [];
  const state = makeState();
  const d = scriptDelegate(state, emitted);
  const live = liveFor();
  ENCOUNTER_SCRIPTS.patrolScan.fire(d, live, state);
  ENCOUNTER_SCRIPTS.patrolScan.choose(d, live, state, 'bribe-without-cause');
  assert.equal(live.phase, 'offer', 'unknown ids never submit a scan');
  assert.ok(!emitted.some((e) => e.name === 'resolved'));
  state.simTime = 116;
  ENCOUNTER_SCRIPTS.patrolScan.tick(d, live, state, state.simTime);
  assert.ok(emitted.some((e) => e.name === 'patrol:proximity'), 'timeout complies');
  assert.equal(emitted.find((e) => e.name === 'resolved').payload.outcome, 'clean');

  const emitted2 = [];
  const state2 = makeState();
  const d2 = scriptDelegate(state2, emitted2);
  const live2 = liveFor();
  live2.id = 'live-customs-2';
  ENCOUNTER_SCRIPTS.patrolScan.fire(d2, live2, state2);
  ENCOUNTER_SCRIPTS.patrolScan.choose(d2, live2, state2, 'run');
  assert.deepEqual(
    emitted2.find((e) => e.name === 'rep').payload,
    { faction: 'faction_scn', delta: -3, reason: 'scan_refused' },
  );
  assert.equal(emitted2.find((e) => e.name === 'resolved').payload.outcome, 'ran');
});

test('a choiceless patrol shape keeps the legacy submit/run offer', () => {
  const emitted = [];
  const state = makeState({ contraband: true });
  const d = scriptDelegate(state, emitted);
  const live = liveFor();
  live.shape = { ...live.shape, choices: undefined, timeoutChoice: undefined, offerS: undefined };
  ENCOUNTER_SCRIPTS.patrolScan.fire(d, live, state);
  assert.equal(live.deadlineAt, 110, 'legacy 10 s window without a declared offer');
  const offer = emitted.find((e) => e.name === 'encounter:choiceOffered');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['submit', 'bribe', 'dump', 'run']);
  assert.equal(offer.payload.timeoutChoice, 'submit');
});
