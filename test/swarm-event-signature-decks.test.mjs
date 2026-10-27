// Iter 41: the two thin signature decks fill out.
//
// lagrange_crucible and cryo_drift tabled only two signature cards each — with the 70/30
// own-vs-shared draw their event rounds repeated the same trick run after run. Each room
// now deals four: pylon_flip (the swing's chord, inverted to a shove), sling_tide (the
// sling as a cross-room river), thaw_burst (the freeze letting go from the middle) and
// cold_snap (a snare that lands where the player is at the fire line). All four spend
// through the shipped pulse machinery — no new mechanism.
//
// Deterministic: seeded picks, simTime windows, no wall clock.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SWARM_EVENT_BY_ID,
  SWARM_EVENT_TABLES,
  isSwarmEventWave,
  swarmEventFor,
  swarmMinorEventPool,
  validateSwarmEvents,
} from '../src/data/swarmEvents.js';
import {
  createSwarmEventDirector,
  swarmEventFrame,
  SWARM_EVENT_BOUNTY_REASON,
} from '../src/systems/swarmEvents.js';

const SEED = 4242;
const NEW_SIGNATURES = {
  lagrange_crucible: ['pylon_flip', 'sling_tide'],
  cryo_drift: ['thaw_burst', 'cold_snap'],
};

/** Find the (seed, wave) whose seeded draw is `eventId` for `arenaId` — seed 4242 first. */
function drawFor(arenaId, eventId) {
  for (const seed of [SEED, 7, 13, 77, 99, 555]) {
    for (let wave = 1; wave <= 400; wave++) {
      const draw = swarmEventFor({ arenaId, wave, seed });
      if (draw && draw.id === eventId) return { wave, seed };
    }
  }
  return null;
}

/** A live director on a mock bus — same harness as the wager/minor-band suites. */
function armedDirector({ arenaId, wave, seed = SEED, phase = 'active' }) {
  const emitted = [];
  const subs = [];
  const bus = {
    on(event, handler) { subs.push([event, handler]); return () => {}; },
    emit(event, payload) {
      emitted.push({ event, payload });
      for (const [type, handler] of subs) if (type === event) handler(payload);
    },
  };
  const writes = [];
  const registered = [];
  const spawned = [];
  const fields = {
    updateExternal(id, patch) { writes.push({ id, ...patch }); return { id }; },
    unregisterExternal() { return true; },
    registerEnvironmental(spec) { registered.push(spec); return spec; },
  };
  const state = {
    simTime: 0,
    playerId: 1,
    entities: new Map([[1, { id: 1, team: 1, pos: { x: 40, z: -15 } }]]),
    run: { kind: 'survival', ruleset: 'swarm', phase, arenaId, wave, seed },
  };
  const director = createSwarmEventDirector({
    state,
    bus,
    helpers: { spawnEntity(spec) { spawned.push(spec); return { id: 'pod-1' }; } },
    registry: { get: (name) => (name === 'fields' ? fields : null) },
  });
  director.init();
  director.setFrame(swarmEventFrame({ at: { x: 0, z: 0 }, laneGate: 'front', seed, wave }));
  director.setInstalledFields([{ id: 'room_field', strength: 40 }]);
  return { director, bus, state, emitted, writes, registered, spawned };
}

const named = (h, event) => h.emitted.filter((entry) => entry.event === event);
const telegraphed = (h) => named(h, 'swarm:eventTelegraphed').map((entry) => entry.payload);
const eventVerbs = (h) => named(h, 'swarm:event').map((entry) => entry.payload && entry.payload.verb);
const bounties = (h) => named(h, 'run:awardRequested')
  .filter((entry) => entry.payload && entry.payload.reason === SWARM_EVENT_BOUNTY_REASON)
  .map((entry) => entry.payload);

test('the tables validate and both thin decks now deal four signatures', () => {
  assert.deepEqual(validateSwarmEvents(), []);
  assert.deepEqual(SWARM_EVENT_TABLES.lagrange_crucible,
    ['well_swing', 'sling_gust', 'pylon_flip', 'sling_tide']);
  assert.deepEqual(SWARM_EVENT_TABLES.cryo_drift,
    ['freeze_front', 'plate_shatter', 'thaw_burst', 'cold_snap']);
  for (const [arenaId, table] of Object.entries(SWARM_EVENT_TABLES)) {
    assert.ok(table.length >= 3, `${arenaId} deals at least three signature tricks`);
  }
  // The quiet band is untouched: neither new card is minor-tagged.
  assert.deepEqual(swarmMinorEventPool('lagrange_crucible').slice().sort(),
    ['mine_drift', 'sling_gust', 'supply_drop']);
  assert.deepEqual(swarmMinorEventPool('cryo_drift').slice().sort(),
    ['mine_drift', 'supply_drop']);
});

test('existing decks are unchanged — untouched tables and the four older signatures hold', () => {
  assert.deepEqual(SWARM_EVENT_TABLES.helios_core,
    ['shutter_storm', 'furnace_flare', 'plate_drift', 'sprocket_crate']);
  assert.deepEqual(SWARM_EVENT_TABLES.cinder_sluice,
    ['sluice_surge', 'undertow_snap', 'slag_spill']);
  assert.deepEqual(SWARM_EVENT_TABLES.storm_lattice,
    ['relay_arc', 'grid_surge', 'reef_surge']);
  assert.deepEqual(SWARM_EVENT_TABLES.asteroid_mill,
    ['mill_surge', 'seam_burst', 'rock_rain']);
  assert.deepEqual(SWARM_EVENT_TABLES.the_hive,
    ['spore_breath', 'wall_bloom', 'egg_drift', 'lantern_drift', 'shepherd_pulse']);

  const swing = SWARM_EVENT_BY_ID.well_swing;
  assert.equal(swing.kind, 'pulse');
  assert.equal(swing.field.bearing, 'across');
  assert.equal(swing.telegraph, 'WELL SWING — a pull is walking the room');
  const gust = SWARM_EVENT_BY_ID.sling_gust;
  assert.equal(gust.kind, 'surge');
  assert.equal(gust.factor, 1.8);
  assert.equal(gust.minor, true);
  const front = SWARM_EVENT_BY_ID.freeze_front;
  assert.equal(front.kind, 'pulse');
  assert.equal(front.field.kind, 'cone');
  assert.equal(front.field.bearing, 'lane');
  const shatter = SWARM_EVENT_BY_ID.plate_shatter;
  assert.equal(shatter.kind, 'surge');
  assert.equal(shatter.install.cover, true);
  assert.equal(shatter.wager.timeout, 'accept');
});

test('every signature in both decks is drawable through the real seeded path', () => {
  for (const [arenaId, ids] of Object.entries(NEW_SIGNATURES)) {
    for (const eventId of ids) {
      const hit = drawFor(arenaId, eventId);
      assert.ok(hit, `${eventId} is drawn in ${arenaId} inside the seeded sweep`);
      assert.ok(isSwarmEventWave(hit.wave), `${eventId} lands on a real event wave`);
    }
    // Distribution, not just existence: over a seed sweep each signature deals its share
    // and the shared cards keep their minority.
    const counts = {};
    for (let seed = 1; seed <= 30; seed++) {
      for (let wave = 1; wave <= 200; wave++) {
        const draw = swarmEventFor({ arenaId, wave, seed });
        if (draw) counts[draw.id] = (counts[draw.id] || 0) + 1;
      }
    }
    for (const eventId of SWARM_EVENT_TABLES[arenaId]) {
      assert.ok(counts[eventId] > 0, `${eventId} deals within the sweep`);
      for (const shared of ['mine_drift', 'supply_drop']) {
        assert.ok(counts[eventId] > counts[shared],
          `${eventId} out-deals ${shared} — signatures stay the headline`);
      }
    }
  }
});

test('each new card spends its field spec — no dead authored params', () => {
  for (const [arenaId, ids] of Object.entries(NEW_SIGNATURES)) {
    for (const eventId of ids) {
      const { wave, seed } = drawFor(arenaId, eventId);
      const card = SWARM_EVENT_BY_ID[eventId];
      assert.equal(card.kind, 'pulse');
      const h = armedDirector({ arenaId, wave, seed });
      h.bus.emit('run:waveStarted', { wave });
      h.state.simTime = card.windupS + 0.5;
      h.director.update(0.016, h.state);
      assert.ok(eventVerbs(h).includes('spend'), `${eventId} spent at its fire line`);
      assert.equal(h.registered.length, 1, `${eventId} registers one temporary field`);
      const spec = h.registered[0];
      assert.equal(spec.id, 'swarm_event_field');
      assert.equal(spec.kind, card.field.kind);
      assert.equal(spec.radius, card.field.radius);
      assert.equal(spec.strength, card.field.strength);
      assert.equal(spec.falloff, card.field.falloff);
      // damping is a spec key only when authored — and when authored it must arrive.
      assert.equal(spec.damping, card.field.damping);
      assert.equal(spec.halfAngleRad, card.field.halfAngleRad);
      h.director.destroy();
    }
  }
});

test('pylon_flip shoves where well_swing would gather — same chord, opposite sign', () => {
  const { wave, seed } = drawFor('lagrange_crucible', 'pylon_flip');
  const card = SWARM_EVENT_BY_ID.pylon_flip;
  const h = armedDirector({ arenaId: 'lagrange_crucible', wave, seed });
  h.bus.emit('run:waveStarted', { wave });
  h.state.simTime = card.windupS + 0.5;
  h.director.update(0.016, h.state);
  const spec = h.registered[0];
  assert.equal(spec.kind, 'repulsor');
  // The 'across' bearing at the authored dist: center sits on the frame's across line.
  const frame = swarmEventFrame({ at: { x: 0, z: 0 }, laneGate: 'front', seed, wave });
  assert.deepEqual(spec.center, {
    x: frame.at.x + frame.across.x * card.field.dist,
    z: frame.at.z + frame.across.z * card.field.dist,
  });
  h.director.destroy();
});

test('sling_tide pours THROUGH the fight — apex up-current, dir down-tide', () => {
  const { wave, seed } = drawFor('lagrange_crucible', 'sling_tide');
  const card = SWARM_EVENT_BY_ID.sling_tide;
  const h = armedDirector({ arenaId: 'lagrange_crucible', wave, seed });
  h.bus.emit('run:waveStarted', { wave });
  h.state.simTime = card.windupS + 0.5;
  h.director.update(0.016, h.state);
  const spec = h.registered[0];
  assert.equal(spec.kind, 'cone');
  const frame = swarmEventFrame({ at: { x: 0, z: 0 }, laneGate: 'front', seed, wave });
  // The cone's dir IS the across bearing — a unit vector the tide pours along.
  assert.ok(Math.abs(Math.hypot(spec.dir.x, spec.dir.z) - 1) < 1e-9, 'cone dir is a unit bearing');
  assert.ok(Math.abs(spec.dir.x - frame.across.x) < 1e-9
    && Math.abs(spec.dir.z - frame.across.z) < 1e-9, 'dir is the frame\'s across bearing');
  // A negative authored dist puts the apex UP-current: center - at reads -|dist| along dir,
  // so the wedge covers the anchor instead of starting past it.
  const along = (spec.center.x - frame.at.x) * spec.dir.x + (spec.center.z - frame.at.z) * spec.dir.z;
  assert.ok(Math.abs(along - card.field.dist) < 1e-9, 'apex sits at the authored offset along dir');
  const anchorAlong = (frame.at.x - spec.center.x) * spec.dir.x + (frame.at.z - spec.center.z) * spec.dir.z;
  assert.ok(anchorAlong > 0 && anchorAlong < spec.radius, 'the fight anchor rides inside the wedge');
  h.director.destroy();
});

test('thaw_burst lets go from the middle; cold_snap lands where the player is at fire time', () => {
  const burst = drawFor('cryo_drift', 'thaw_burst');
  const burstCard = SWARM_EVENT_BY_ID.thaw_burst;
  const b = armedDirector({ arenaId: 'cryo_drift', wave: burst.wave, seed: burst.seed });
  b.bus.emit('run:waveStarted', { wave: burst.wave });
  b.state.simTime = burstCard.windupS + 0.5;
  b.director.update(0.016, b.state);
  assert.equal(b.registered[0].kind, 'repulsor');
  assert.deepEqual(b.registered[0].center, { x: 0, z: 0 }, 'the burst centers the fight anchor');
  b.director.destroy();

  const snap = drawFor('cryo_drift', 'cold_snap');
  const snapCard = SWARM_EVENT_BY_ID.cold_snap;
  const c = armedDirector({ arenaId: 'cryo_drift', wave: snap.wave, seed: snap.seed });
  c.bus.emit('run:waveStarted', { wave: snap.wave });
  // The player moves during the windup — the snare resolves the live position, not the arm's.
  c.state.entities.get(1).pos = { x: -120, z: 60 };
  c.state.simTime = snapCard.windupS + 0.5;
  c.director.update(0.016, c.state);
  const spec = c.registered[0];
  assert.equal(spec.kind, 'well');
  assert.equal(spec.damping, snapCard.field.damping, 'the freeze snare carries its drag');
  assert.deepEqual(spec.center, { x: -120, z: 60 }, 'the grab lands on the player at the fire line');
  c.director.destroy();
});

test('the wager honors telegraph and verdict — accept pays, refuse stands the room down', () => {
  const { wave, seed } = drawFor('lagrange_crucible', 'sling_tide');
  const card = SWARM_EVENT_BY_ID.sling_tide;
  const h = armedDirector({ arenaId: 'lagrange_crucible', wave, seed });
  h.bus.emit('run:waveStarted', { wave });

  const offer = telegraphed(h)[0];
  assert.equal(offer.eventId, 'sling_tide');
  assert.equal(offer.name, card.name);
  assert.equal(offer.telegraph, card.telegraph);
  assert.equal(offer.kind, 'pulse');
  assert.equal(offer.band, 'major');
  assert.equal(offer.deadlineAt, card.windupS);
  assert.deepEqual(offer.wager, { score: card.wager.score, timeout: 'accept' });
  const alert = named(h, 'alert').map((entry) => entry.payload)
    .find((entry) => entry.text === card.telegraph);
  assert.equal(alert.sev, 'warn', 'a major wager speaks in the warn voice');

  h.bus.emit('swarm:eventVerdict', { wave, eventId: 'sling_tide', accept: true, source: 'test' });
  h.state.simTime = card.windupS + 0.5;
  h.director.update(0.016, h.state);
  assert.ok(eventVerbs(h).includes('spend'));
  assert.equal(h.registered.length, 1);
  assert.deepEqual(bounties(h), [
    { score: card.wager.score, reason: SWARM_EVENT_BOUNTY_REASON, wave },
  ]);
  h.director.destroy();

  const r = armedDirector({ arenaId: 'lagrange_crucible', wave, seed });
  r.bus.emit('run:waveStarted', { wave });
  r.bus.emit('swarm:eventVerdict', { wave, eventId: 'sling_tide', accept: false, source: 'test' });
  assert.deepEqual(eventVerbs(r), ['declined']);
  r.state.simTime = card.windupS + 2;
  r.director.update(0.016, r.state);
  assert.equal(r.registered.length, 0, 'a refused tide never registers');
  assert.equal(bounties(r).length, 0, 'a refused wager never pays');
  r.director.destroy();
});

test('an unanswered new card resolves to its authored accept — opt-out pressure holds', () => {
  const { wave, seed } = drawFor('cryo_drift', 'cold_snap');
  const card = SWARM_EVENT_BY_ID.cold_snap;
  const h = armedDirector({ arenaId: 'cryo_drift', wave, seed });
  h.bus.emit('run:waveStarted', { wave });
  h.state.simTime = card.windupS + 1;
  h.director.update(0.016, h.state);
  assert.ok(eventVerbs(h).includes('spend'), 'silence is consent — the snap still lands');
  assert.equal(bounties(h).length, 1);
  h.director.destroy();
});
