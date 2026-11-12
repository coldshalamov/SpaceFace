// PQ-163 — the first ten minutes, measured: the opening timeline and the refusable choice.
//
// Drives the REAL onboarding rail over one bus on a fixed seed, with the REAL missions,
// lawSecurity, and heat systems wired behind it. The claimed-salvage beat is the opening's
// first REFUSABLE choice ("Claimed salvage. Take it anyway, or leave it."): this file proves
// both branches land with visible consequences —
//   take  → a real lawSecurity receipt the heat owner accepts (the world remembers, in-session:
//           heatLastIncident carries the payload_theft), then the search ring is outrun for real;
//   leave → the tableau stands itself down after CLAIMED_WINDOW_S and the rail moves on —
//           no wall, no heat, refusal is first-class.
// It also walks the rest of the rail to the dock so the ledger shows where the first JOB
// offer and the first JOB choice (HAUL / BOUNTY / SURVEY) fire.
//
// DRIVEN-CLOCK HONESTY: the printed sim seconds measure the RAIL's cadence (the ≥4 s silence
// gate plus the staged encounter distances), not a human's hands. No unaided-playtest number
// is invented here; the funnel events remain the honest telemetry for real players.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { FLIGHT_DRILL_BURST_SHOTS } from '../src/onboarding/flightDrill.js';
import {
  RESCUE_PROOF_SEED,
  rescuePodAtBeacon,
  rescueScoutAtAsteroid,
} from '../src/onboarding/rescueOpening.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import {
  ONBOARDING_CHOICE_SOURCE,
  missions as missionsProto,
} from '../src/systems/missions.js';
import { BEATS, onboarding } from '../src/systems/onboarding.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

// ── Minimal DOM stub (the system builds its status panel on the presentation route) ──────
function stubElement() {
  return {
    children: [], style: {}, dataset: {}, textContent: '', innerHTML: '',
    classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
    appendChild() {}, prepend() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  head: stubElement(),
  body: stubElement(),
  documentElement: null,
  createElement: () => stubElement(),
};

const SEED = RESCUE_PROOF_SEED;
const HELIOS = 'sector_helios_prime';

// ── Harness: real onboarding + real missions + real law + real heat on one bus ───────────
function makeState() {
  // Base the fixture on the real new-game state (wallet, cargo, settings, ui) so mission
  // acceptance reads the same player shape the live route hands missions.
  const state = createGameState(SEED);
  const player = makeEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
    data: {
      weapons: [{ defId: 'pulse_laser_s', _heat: 0, heatMax: 100 }],
      combat: {}, ai: {},
    },
  });
  player.id = 1;
  state.mode = 'flight';
  state.simTime = 10;
  state.tick = 40;
  state.playerId = 1;
  state.player.hints = {};
  state.player.targetId = null;
  state.player.heat = 0;
  state.player.credits = NEW_GAME.credits; // the live boot applies the starter bank on new game
  state.entities = new Map([[1, player]]);
  state.entityList = [player];
  state.nextEntityId = 10;
  state.nav = {};
  state.combat = { attachments: { byId: {} } };
  state.world.currentSectorId = HELIOS;
  if (!state.world.activeSector) state.world.activeSector = { stations: [], gates: [] };
  state.story = { beatIndex: 0 };
  if (!state.ui) state.ui = {};
  state.ui.dockedStationId = null;
  if (!state.input) state.input = {};
  state.settings.gameplay = Object.assign({}, state.settings.gameplay, { tutorialHints: true });
  return state;
}

function boot() {
  const bus = createBus();
  const state = makeState();
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
    hash32,
    mulberry32,
    voice: { say: () => true },
  };
  const systems = new Map();
  const registry = { get: (name) => systems.get(name) || null };

  const missions = Object.create(missionsProto);
  missions.init({ state, bus, helpers, registry });
  systems.set('missions', missions);

  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers, registry });
  systems.set('lawSecurity', law);

  const heatSys = Object.create(heat);
  heatSys.init({ state, bus, helpers, registry });
  systems.set('heat', heatSys);

  const sys = Object.create(onboarding);
  sys.init({ state, bus, helpers, registry });

  // Helios protection ring owns the opening's jurisdiction: a station_helios entity inside
  // the 1400 wu starter radius is what the real law intake resolves the report against.
  helpers.spawnEntity({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: 620, z: 140 }, radius: 42,
    data: { stationId: 'station_helios', name: 'Helios Station', dockRadius: 80, factionId: 'faction_scn' },
  });

  const ledger = [];
  const mark = (row, extra = {}) => {
    ledger.push({ row, atS: Math.round((state.simTime || 0) * 10) / 10, ...extra });
    process.stdout.write(`  ${String(row).padEnd(34)} t=${String(ledger.at(-1).atS).padStart(6)}s${extra.note ? `  ${extra.note}` : ''}\n`);
  };
  return { bus, state, sys, helpers, missions, law, heat: heatSys, ledger, mark };
}

// ── Drive helpers (real events, real cadence; the state writes stand in for hands) ───────
// tick advances the sim clock by dt and steps the real onboarding + heat owners.
function tick(h, dt = 0.25) {
  h.state.simTime += dt;
  h.sys.update(dt, h.state);
  h.heat.update(dt, h.state);
}

function advance(h, seconds = 5) {
  const steps = Math.round(seconds / 0.25);
  for (let i = 0; i < steps; i++) tick(h);
}

function settle(h, seconds = 5) { // silence-gate wait, then one beat advance
  tick(h, seconds);
}

function playerOf(h) { return h.state.entities.get(h.state.playerId); }

function rescueActor(h, slot) {
  const id = h.state.onboarding.rescue && h.state.onboarding.rescue.ids[slot];
  return id == null ? null : h.state.entities.get(id);
}

// Drive the rail from `game:started` to the moment the claimed choice is OFFERED.
// Returns the live claimed record. Every ledger row is stamped by the real cadence.
function driveToChoiceOffered(h) {
  h.bus.emit('game:started', {});
  h.mark('new game: rescue staged');
  tick(h); // B0 thrust opens — the premise caption and the bound 47-A mark are already up
  h.mark('first verb: thrust');

  // Twenty seconds of flying first: past forty, then back under ten.
  const player = playerOf(h);
  player.vel.x = 41; player.vel.z = 0;
  tick(h);
  assert.ok(h.state.onboarding.beatDoneAt.thrust != null, 'the rail opens on the thrust beat');
  h.mark('thrust past forty');
  settle(h, 5);
  player.vel.x = 0; player.vel.z = 0;
  tick(h);
  assert.ok(h.state.onboarding.beatDoneAt.brake != null, 'the brake beat follows');
  h.mark('brake below ten');

  // The signature latch — the derelict the tether beat staged.
  settle(h, 5);
  assert.equal(BEATS[h.state.onboarding.currentBeat].key, 'tether', 'the latch lesson follows the flight warm-up');
  h.mark('first verb: tether');
  const derelictId = h.sys._derelictId;
  assert.ok(derelictId != null, 'tether lesson stages its derelict');
  h.state.player.targetId = derelictId;
  h.bus.emit('tether:latched', { targetId: derelictId });
  h.bus.emit('tether:reel', { targetId: derelictId, before: 80, after: 58 });
  h.bus.emit('tether:released', { targetId: derelictId });
  tick(h);
  h.mark('first attach (latch + winch + cut)');

  // The rescue swing rides the tether gap: rock through the wreck.
  settle(h, 5);
  assert.equal(h.state.onboarding.rescue.current, 'swing');
  const rock = rescueActor(h, 'rock');
  const wreck = rescueActor(h, 'derelict');
  h.bus.emit('tether:latched', { targetId: rock.id });
  h.bus.emit('tether:reel', { targetId: rock.id, before: 80, after: 50 });
  h.bus.emit('tether:released', { targetId: rock.id });
  rock.pos.x = wreck.pos.x + 20;
  rock.pos.z = wreck.pos.z;
  rock.vel.x = -30;
  rock.vel.z = 0;
  tick(h);
  assert.equal(h.state.onboarding.rescue.beats.swing.state, 'done', 'swing completes');
  h.mark('swing-release payoff (scrap shakes loose)');

  // First encounter: the raid tableau.
  settle(h, 5);
  assert.equal(BEATS[h.state.onboarding.currentBeat].key, 'raid', 'the raid beat follows the swing');
  const raid = h.state.onboarding.raid;
  assert.ok(raid && raid.ids.raider != null, 'the raid stages its raider');
  h.mark('first encounter opens: the raid', { note: 'enemy mid-raid beside the wall' });
  const raider = h.state.entities.get(raid.ids.raider);
  raider.vel.x = 200;
  h.bus.emit('tether:latched', { targetId: raider.id });
  h.bus.emit('tether:released', { targetId: raider.id });
  h.bus.emit('entity:killed', { id: raider.id, killerId: h.state.playerId, type: 'ship' });
  tick(h);
  assert.ok(h.state.onboarding.beatDoneAt.raid != null, 'the momentum kill resolves the raid');
  h.mark('momentum kill (raider thrown into the rock)');

  // THE CHOICE: claimed salvage, take it or leave it.
  settle(h, 5);
  assert.equal(BEATS[h.state.onboarding.currentBeat].key, 'claimed', 'the claimed choice follows the raid');
  const claimed = h.state.onboarding.claimed;
  assert.ok(claimed && claimed.ids.pickups.length >= 1, 'the spill is staged');
  const spill = h.state.entities.get(claimed.ids.pickups[0]);
  const spillDist = Math.hypot(spill.pos.x - player.pos.x, spill.pos.z - player.pos.z);
  assert.ok(spillDist <= 260, `the choice is staged in view, not a commute (${spillDist.toFixed(0)} wu)`);
  assert.ok(claimed.ids.patrol != null, 'a law cutter stands witness');
  h.mark('FIRST REFUSABLE CHOICE offered: take the salvage or leave it', {
    note: `spill ${spillDist.toFixed(0)} wu out, witness on site`,
  });
  return claimed;
}

// Walk the seam + the first dock + the post-dock drills + the remaining rescue verbs and the
// missing three to the point where the job choice is the only beat left (OPENING-1 order).
function driveToDock(h) {
  const player = playerOf(h);
  // Back inside the pocket after the wanted escape: the rescue verbs read distances from
  // the pilot, so the drills run where the opening happened.
  player.pos.x = 0;
  player.pos.z = 0;

  // The claimed beat is resolved by the caller (take or leave). The seam lesson follows —
  // it mines the rock the rail bound at entry (the bound 47-A source while it lives).
  settle(h, 5);
  assert.equal(BEATS[h.state.onboarding.currentBeat].key, 'seam', 'the seam lesson follows the claimed choice');
  const seamRock = h.state.entities.get(h.sys._miningRockId);
  assert.ok(seamRock, 'the seam beat stages its marked rock');
  for (let i = 0; i < 3; i++) {
    h.bus.emit('mining:yield', { minerId: h.state.playerId, qty: 1, pos: { x: seamRock.pos.x, z: seamRock.pos.z } });
  }
  tick(h);
  assert.ok(h.state.onboarding.beatDoneAt.seam != null, 'seam resolves');
  h.mark('the seam lesson mines the bound 47-A sample');

  // First dock — Helios. The berth itself: selling, fitting and the next job all happen here.
  settle(h, 5);
  assert.equal(BEATS[h.state.onboarding.currentBeat].key, 'dock', 'the first dock follows the seam');
  h.state.ui.dockedStationId = 'station_helios';
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  h.bus.emit('economy:tradeCompleted', { side: 'sell', commodityId: 'cmdty_ore_iron', qty: 3 });
  tick(h);
  assert.ok(h.state.onboarding.beatDoneAt.dock != null, 'the dock beat resolves at the berth');
  h.mark('first dock: Helios — the firing drills resume behind it');
  h.bus.emit('dock:undocked', { stationId: 'station_helios' });

  // Behind the first dock (the 15–40 minute slot): marker, focus, burst, disengage — one at
  // a time on their existing gates.
  settle(h, 5);
  let trainer = h.state.entities.get(h.sys._trainerId);
  assert.ok(trainer, 'the marker beat stages its trainer');
  trainer.pos.x = player.pos.x + 100;
  trainer.pos.z = player.pos.z;
  tick(h);
  assert.ok(h.state.onboarding.beatDoneAt.marker != null, 'marker resolves');
  settle(h, 5);
  trainer = h.state.entities.get(h.sys._trainerId);
  h.bus.emit('flybyFocus:start', { targetId: trainer.id });
  tick(h);
  assert.ok(h.state.onboarding.beatDoneAt.focus != null, 'focus resolves');
  settle(h, 5);
  player.data.weapons[0]._heat = 36;
  for (let i = 0; i < FLIGHT_DRILL_BURST_SHOTS; i++) {
    h.bus.emit('combat:fire', { ownerId: player.id, weaponId: 'pulse_laser_s' });
  }
  player.data.weapons[0]._heat = 2;
  tick(h);
  assert.ok(h.state.onboarding.beatDoneAt.burst != null, 'burst resolves');
  h.mark('gun lesson done — the shove is open');

  // Rescue shove: the taught verb is the tow, not a kill. Set the scout into the wall ring
  // at proof speed (the gun-impulse route to this same predicate is pinned in
  // test/rescue-opening.test.mjs LIVE GATE).
  assert.equal(h.state.onboarding.rescue.current, 'shove');
  const scout = rescueActor(h, 'scout');
  const wall = rescueActor(h, 'asteroid');
  scout.vel.x = 15; scout.vel.z = 0;
  scout.pos.x = wall.pos.x - 40;
  scout.pos.z = wall.pos.z;
  assert.ok(rescueScoutAtAsteroid(scout, wall), 'the shove predicate reads a real contact+speed');
  tick(h);
  assert.equal(h.state.onboarding.rescue.beats.shove.state, 'done', 'shove completes');
  h.mark('scout shoved into the rock');

  // Disengage, then the grab-and-run.
  settle(h, 5);
  trainer = h.state.entities.get(h.sys._trainerId);
  trainer.pos.x = player.pos.x + 901;
  trainer.pos.z = player.pos.z;
  tick(h);
  assert.ok(h.state.onboarding.beatDoneAt.disengage != null, 'disengage resolves');
  assert.equal(h.state.onboarding.rescue.current, 'grab');
  const pod = rescueActor(h, 'pod');
  const beacon = rescueActor(h, 'beacon');
  h.bus.emit('tether:latched', { targetId: pod.id });
  pod.pos.x = beacon.pos.x;
  pod.pos.z = beacon.pos.z;
  assert.ok(rescuePodAtBeacon(pod, beacon), 'the delivery reads');
  tick(h);
  assert.equal(h.state.onboarding.rescue.beats.grab.state, 'done', 'grab completes');
  h.mark('pod grabbed and run to the beacon');

  // The missing three (boost, stroke, well — plus the repulsor and clearing cone the rail
  // grew) ride the grab run's exit behind the first dock — the job choice waits while any of
  // them is current, and through the between-verb silences too.
  settle(h, 5);
  h.state.input.boost = true;
  tick(h);
  h.state.input.boost = false;
  assert.ok(h.state.onboarding.missingThree.beats.boost.state === 'done', 'boost completes');
  settle(h, 5);
  h.state.input.autoTargetPath = { points: [{ x: 0, z: 0 }, { x: 10, z: 0 }], drawing: true };
  tick(h);
  h.state.input.autoTargetPath = null;
  assert.ok(h.state.onboarding.missingThree.beats.stroke.state === 'done', 'stroke completes');
  settle(h, 5);
  h.bus.emit('fields:deployed', { kind: 'well', sourceId: h.state.playerId });
  tick(h);
  assert.ok(h.state.onboarding.missingThree.beats.well.state === 'done', 'well completes');
  settle(h, 5);
  h.bus.emit('fields:deployed', { kind: 'repulsor', sourceId: h.state.playerId });
  tick(h);
  assert.ok(h.state.onboarding.missingThree.beats.repulsor.state === 'done', 'repulsor completes');
  settle(h, 5);
  h.bus.emit('fields:coneToggled', { active: true, sourceId: h.state.playerId });
  tick(h);
  assert.ok(h.state.onboarding.missingThree.beats.cone.state === 'done', 'cone completes');
  assert.equal(h.state.onboarding.missingThree.completed, true, 'the verb rail completes');
  h.mark('boost / draw-to-fly / well (+ plow, cone) taught by doing');
}

// The job choice is the rail's last beat: it opens once the verb rail releases it, at the
// berth the dock beat was taken at (Helios under the OPENING-1 order), and accepting any real
// work ends the tutorial.
function driveDockAndChoice(h) {
  settle(h, 5);
  assert.equal(BEATS[h.state.onboarding.currentBeat].key, 'choice', 'the choice beat opens behind the post-dock drills');
  const stationId = h.state.onboarding.choiceStationId || 'station_helios';
  const choices = h.missions.ensureOnboardingChoiceOffers(stationId);
  assert.deepEqual(choices.map((offer) => offer.onboardingChoice.label), ['HAUL', 'BOUNTY', 'SURVEY']);
  h.mark('FIRST JOB CHOICE posted: HAUL / BOUNTY / SURVEY');

  assert.equal(h.missions.acceptMission(choices[0].id), true, 'the player takes one job');
  assert.equal(h.state.onboarding.finished, true, 'taking a real job ends the rail');
  h.mark('choice accepted — the first ten minutes end in a decision');
}

// ── The ledger ───────────────────────────────────────────────────────────────────────────
test('the first ten minutes: the opening timeline on a fixed seed', () => {
  const h = boot();
  const milestones = [];
  h.bus.on('firsthour:milestone', (p) => milestones.push(p));
  h.bus.on('law:reportIncidentReceipt', () => {});

  console.log('\nFIRST-TEN-MINUTES LEDGER (seed 47, driven clock — rail cadence, not human hands):');
  driveToChoiceOffered(h);

  const choiceAt = h.ledger.find((r) => r.row.startsWith('FIRST REFUSABLE')).atS;
  const attachAt = h.ledger.find((r) => r.row === 'first attach (latch + winch + cut)').atS;
  assert.ok(choiceAt < 300,
    `the refusable choice is offered inside the opening (t=${choiceAt}s driven)`);
  assert.ok(h.state.onboarding.beatDoneAt.claimed === undefined,
    'the choice waits for the player: neither branch has resolved');

  // TAKE the salvage: the real law intake validates the witnessed theft and the real heat
  // owner prices it. The world remembers — in-session, on the player record.
  const spill = h.state.entities.get(h.state.onboarding.claimed.ids.pickups[0]);
  const heatChanges = [];
  h.bus.on('heat:changed', (p) => heatChanges.push(p));
  h.bus.emit('pickup:collected', {
    pickupId: spill.id,
    collectorId: h.state.playerId,
    kind: 'cargo',
    commodityId: 'cmdty_salvage_electronics',
    amount: 4,
    pos: { x: spill.pos.x, z: spill.pos.z },
  });
  tick(h);
  const receipt = heatChanges[0] && heatChanges[0].incident;
  assert.ok(h.state.player.heat > 0, 'taking the claimed salvage raises real heat');
  assert.equal(receipt && receipt.kind, 'payload_theft', 'heat carries the convicting incident');
  assert.equal(h.state.player.heatLastIncident && h.state.player.heatLastIncident.kind, 'payload_theft',
    'the player record remembers why it is wanted');
  h.mark('CHOICE TAKEN: law accepts the witnessed theft', {
    note: `heat ${h.state.player.heat.toFixed(2)}, incident on record`,
  });

  // Outrun the search ring for real: leave the zone, let the heat owner decay it.
  const player = playerOf(h);
  player.pos.x = 2600;
  player.pos.z = 0;
  for (let i = 0; i < 160 && h.state.onboarding.beatDoneAt.claimed == null; i++) {
    tick(h); // 0.25 s at a time: heat drops a level per clear window outside the ring
  }
  assert.ok(h.state.onboarding.beatDoneAt.claimed != null, 'the wanted beat resolves by escape');
  assert.equal(h.state.player.heat, 0, 'the ring was outrun: heat is clear again');
  h.mark('search ring outrun — the consequence is over, the memory stays');

  driveToDock(h);
  driveDockAndChoice(h);

  // Rail-order bar (OPENING-1): the ship flies first, the story's beats run ahead of the
  // first dock, and the firing drills wait behind it.
  assert.ok(h.state.onboarding.beatDoneAt.thrust < h.state.onboarding.beatDoneAt.claimed,
    'the flight warm-up opens the rail');
  assert.ok(h.state.onboarding.beatDoneAt.claimed < h.state.onboarding.beatDoneAt.dock,
    'the refusable choice precedes the first dock');
  assert.ok(h.state.onboarding.beatDoneAt.dock < h.state.onboarding.beatDoneAt.marker,
    'the firing drills sit behind the first dock');
  const kill = milestones.find((m) => m.milestone === 'momentumKill');
  const wanted = milestones.find((m) => m.milestone === 'wantedBeat');
  assert.ok(kill && wanted, 'the thesis milestones fired: momentum kill + wanted beat');
  console.log(`\n  choice offered at t=${choiceAt}s, first attach at t=${attachAt}s (driven) — the story leads, the drills follow the first dock.\n`);
});

// ── The refusal branch ───────────────────────────────────────────────────────────────────
test('the choice is genuinely refusable: leaving the salvage stands the tableau down', () => {
  const h = boot();
  driveToChoiceOffered(h);
  const heatBefore = h.state.player.heat;
  assert.equal(heatBefore, 0, 'leaving the spill raises no heat');

  // The player flies on. The tableau stands down on its own — no wall, no nag.
  for (let i = 0; i < 140 && h.state.onboarding.beatDoneAt.claimed == null; i++) {
    advance(h, 1);
  }
  assert.ok(h.state.onboarding.beatDoneAt.claimed != null,
    'the claimed beat resolves on the decline path');
  assert.equal(h.state.onboarding.claimed.taken, false, 'nothing was taken');
  assert.equal(h.state.player.heat, 0, 'the refusal is not a crime');
  for (const id of h.state.onboarding.claimed.ids.pickups) {
    const entity = id != null ? h.state.entities.get(id) : null;
    assert.ok(!entity || entity.alive === false, 'the spill is cleaned up with the tableau');
  }
  h.mark('CHOICE REFUSED: tableau stands down, rail moves on', { note: 'no heat, no wall' });

  // The rail continues: the seam lesson opens after the refusal — the story moves on.
  settle(h, 5);
  assert.equal(BEATS[h.state.onboarding.currentBeat].key, 'seam', 'the seam lesson follows a refusal');
  const seamRock = h.state.entities.get(h.sys._miningRockId);
  assert.ok(seamRock, 'the seam beat stages its marked rock');
  for (let i = 0; i < 3; i++) {
    h.bus.emit('mining:yield', { minerId: h.state.playerId, qty: 1, pos: { x: seamRock.pos.x, z: seamRock.pos.z } });
  }
  tick(h);
  assert.ok(h.state.onboarding.beatDoneAt.seam != null, 'the rail moves on after a refusal');
});

// ── The staging stays honest under the choice ────────────────────────────────────────────
test('the choice tableau uses the live law cast, not a stub witness', () => {
  const h = boot();
  driveToChoiceOffered(h);
  const claimed = h.state.onboarding.claimed;
  const cutter = h.state.entities.get(claimed.ids.patrol);
  assert.ok(cutter, 'the claims cutter is staged');
  const spec = makeEnemySpawnSpec('patrol_lawman', 1, cutter.pos, { startedTick: h.state.tick });
  assert.ok(spec, 'the cutter comes from the live patrol spawn path');
  assert.equal(cutter.data.ai.lawful, true, 'the witness is lawful');
  assert.equal(cutter.data.lawWitness, true, 'the witness is marked for law intake');
});
