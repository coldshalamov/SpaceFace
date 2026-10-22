// weight-choir-528 — W-CHOIR (build_map §34.5 row 528, bible 02 §8).
//
// Proves the row's done-when on the real data and the runtime owner:
//   data/factions/choir.js   the Bell table, ribbon spec, Carried Relic, Bell Head, shrine
//   systems/faction_choir.js bells hum crystal then shatter it; shatters chain (E-23);
//                            the relic pings you to every Choir ship, cracks on a hard
//                            rock hit, and tributes when delivered cracked (E-22);
//                            the Bell Head rings whatever the Line slams
//
// Run: node --test test/weight-choir-528.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  choirResonance,
  ensureChoirState,
  isCrystal,
} from '../src/systems/faction_choir.js';
import faction, {
  CHOIR_BELLS,
  CHOIR_RIBBONS,
  CHOIR_CARRIED_RELIC,
  CHOIR_BELL_HEAD,
} from '../src/data/factions/choir.js';

const SEED = 4242;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [choirResonance] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_vesta_forge';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -3000, z: -3000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

const bell = (sim, x, z) => sim.spawn({
  type: 'ship', team: 1, factionId: 'faction_choir',
  pos: { x, z }, radius: 22, mass: 90, hull: 500, hullMax: 500, collides: true,
  data: { choirBell: true, role: 'bell-ship', name: 'Choir Bell' },
});

const crystal = (sim, x, z, r = 14) => sim.spawn({
  type: 'asteroid', team: 0, pos: { x, z }, radius: r, mass: 200,
  hull: 100, hullMax: 100, collides: true,
  data: { material: 'crystal', typeId: 'ast_crystalline' },
});

test('data: bells are telegraphed resonators; the relic, the head and the look are authored', () => {
  assert.equal(CHOIR_BELLS.id, 'E-23');
  assert.ok(CHOIR_BELLS.pulseRadius > CHOIR_BELLS.chainRadius, 'the field outreaches the chain');
  assert.ok(CHOIR_BELLS.humDurationS > CHOIR_BELLS.chainHumS, 'the chain accelerates');
  assert.ok(CHOIR_RIBBONS.ribbonCount > 0 && CHOIR_RIBBONS.chantLightPulse, 'ribbons ride every pulse');
  assert.equal(CHOIR_CARRIED_RELIC.id, 'E-22');
  assert.ok(CHOIR_CARRIED_RELIC.shrineRadius < CHOIR_CARRIED_RELIC.pingRadius,
    'you hear the ping before you owe the shrine');
  assert.ok(CHOIR_CARRIED_RELIC.crackImpactSpeed > 0, 'the casing cracks on a hard hit');
  assert.equal(CHOIR_BELL_HEAD.id, 'head_bell');
  assert.ok(faction.shipRoles.some((r) => r.role === 'bell-ship'), 'Bell on the roster');
  assert.equal(faction.custom.resonators, true);
});

test('E-23: a Bell pulse hums crystal, then shatters it — ribbon event rides the pulse', () => {
  const { sim, state, bus } = boot();
  try {
    bell(sim, 0, 0);
    const c = crystal(sim, CHOIR_BELLS.pulseRadius - 100, 0);
    const rock = sim.spawn({
      type: 'asteroid', team: 0, pos: { x: 200, z: 0 }, radius: 14, mass: 300,
      hull: 100, hullMax: 100, collides: true, data: { material: 'rock', typeId: 'ast_rock' },
    });
    const pulses = [];
    bus.on('choir:bellPulse', (p) => pulses.push(p));
    sim.step();
    assert.equal(pulses.length, 1, 'the bell spoke on the beat');
    assert.equal(pulses[0].ribbons.count, CHOIR_RIBBONS.ribbonCount, 'ribbons trail the pulse');
    assert.equal(c.data.choirHumAt, state.simTime, 'the crystal answers — hum, not instant death');
    assert.equal(rock.data.choirHumAt, undefined, 'plain rock does not sing');

    // It hums through its duration, then lets go.
    sim.runTicks(Math.ceil(CHOIR_BELLS.humDurationS * 60) - 5);
    assert.equal(c.alive !== false, true, 'still humming, still here');
    sim.runTicks(10);
    assert.equal(state.entities.get(c.id)?.alive === false || !state.entities.get(c.id), true,
      'the crystal shattered at the end of its hum');
    assert.equal(ensureChoirState(state).shatters, 1);
    assert.equal(rock.alive !== false, true, 'the rock outlived the bell');
  } finally {
    sim.dispose();
  }
});

test('E-23: a shatter hums crystal near it — thrown crystal chains beyond the field', () => {
  const { sim, state } = boot();
  try {
    bell(sim, 0, 0);
    const near = crystal(sim, CHOIR_BELLS.pulseRadius - 50, 0);
    // The thrown one: outside the Bell's reach but close enough to hear the near one die.
    const thrown = crystal(sim, CHOIR_BELLS.pulseRadius + 100, 0);
    const dNear = Math.hypot(thrown.pos.x - near.pos.x, thrown.pos.z - near.pos.z);
    assert.ok(dNear <= CHOIR_BELLS.chainRadius, 'it hears the first shatter');
    assert.ok(thrown.pos.x > CHOIR_BELLS.pulseRadius, 'the bell itself cannot reach it');

    sim.step();
    assert.equal(thrown.data.choirHumAt, undefined, 'no direct hum — it is out of the field');
    sim.runTicks(Math.ceil((CHOIR_BELLS.humDurationS + CHOIR_BELLS.chainHumS) * 60) + 10);
    assert.equal(ensureChoirState(state).shatters, 2, 'the chain carried the shatter');
  } finally {
    sim.dispose();
  }
});

test('E-22: a sealed relic pings you to every Choir ship; sealed at the shrine, the choir comes', () => {
  const { sim, state, bus } = boot();
  try {
    const shrine = sim.spawn({
      type: 'station', team: 1, factionId: 'faction_choir', pos: { x: 0, z: 0 },
      radius: 60, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
      data: { choirShrine: true, name: 'Ceres Shrine' },
    });
    const chorus = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_choir', pos: { x: 5000, z: 5000 },
      radius: 12, mass: 30, hull: 100, hullMax: 100, collides: true, data: {},
    });
    const relic = sim.spawn({
      type: 'payload', team: 0, pos: { x: CHOIR_CARRIED_RELIC.pingRadius - 100, z: 0 },
      radius: 5, mass: 4, hull: 10, hullMax: 10, collides: true,
      data: { carriedRelic: true, name: 'Certified Relic' },
    });
    const pings = [];
    bus.on('choir:relicPing', (p) => pings.push(p));
    sim.step();
    assert.equal(pings.length, 1, 'the relic reports home');
    assert.ok(chorus.data.relicPing, 'every Choir ship heard it');
    assert.equal(chorus.data.relicPing.x, relic.pos.x);

    // Cross the shrine radius sealed — the whole choir is behind you.
    relic.pos.x = CHOIR_CARRIED_RELIC.shrineRadius - 50;
    sim.step();
    assert.ok(chorus.data.relicHunt, 'the choir knows what you carry');
    assert.equal(ensureChoirState(state).alarms, 1);
  } finally {
    sim.dispose();
  }
});

test('E-22: crack the casing on a rock above impact speed — the reporting stops, tribute lands', () => {
  const { sim, state, bus } = boot();
  try {
    sim.spawn({
      type: 'station', team: 1, factionId: 'faction_choir', pos: { x: 0, z: 0 },
      radius: 60, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
      data: { choirShrine: true },
    });
    const rock = sim.spawn({
      type: 'asteroid', team: 0, pos: { x: CHOIR_CARRIED_RELIC.pingRadius - 300, z: 0 },
      radius: 20, mass: 500, hull: 200, hullMax: 200, collides: true,
      data: { material: 'rock', typeId: 'ast_rock' },
    });
    const relic = sim.spawn({
      type: 'payload', team: 0, pos: { x: rock.pos.x - rock.radius - 6, z: 0 },
      vel: { x: CHOIR_CARRIED_RELIC.crackImpactSpeed + 20, z: 0 },
      radius: 5, mass: 4, hull: 10, hullMax: 10, collides: true,
      data: { carriedRelic: true },
    });
    const cracked = [];
    bus.on('choir:relicCracked', (p) => cracked.push(p));
    sim.step();
    assert.equal(relic.data.casingCracked, true, 'the casing gave on the hit');
    assert.equal(cracked.length, 1);

    // Cracked and delivered: no ping, no alarm — the shrine piles up what you brought.
    relic.vel.x = 0;
    relic.pos.x = CHOIR_CARRIED_RELIC.shrineRadius - 50;
    sim.runTicks(Math.ceil(CHOIR_CARRIED_RELIC.pingPeriodS * 60) + 4);
    const c = ensureChoirState(state);
    assert.equal(c.tribute.length, 1, 'the shrine keeps the relic you brought');
    assert.equal(c.alarms, 0, 'cracked relics do not call the choir down');
  } finally {
    sim.dispose();
  }
});

test('Bell Head: whatever your Line slams rings, and the ring shatters nearby crystal', () => {
  const { sim, state, bus } = boot();
  try {
    const holder = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
      hull: 100, hullMax: 100, collides: true,
      data: { name: 'RINGER', lineHeadId: CHOIR_BELL_HEAD.id },
    });
    const wall = sim.spawn({
      type: 'asteroid', team: 0, pos: { x: 500, z: 0 }, radius: 30, mass: 900,
      hull: 200, hullMax: 200, collides: true, data: { material: 'rock' },
    });
    const thrown = sim.spawn({
      type: 'payload', team: 0, pos: { x: wall.pos.x - wall.radius - 8, z: 0 },
      vel: { x: CHOIR_BELL_HEAD.ringMinImpactSpeed + 30, z: 0 },
      radius: 8, mass: 10, hull: 10, hullMax: 10, collides: true, data: {},
    });
    const nearby = crystal(sim, wall.pos.x + CHOIR_BELL_HEAD.ringRadius - 100, 0);
    holder.tether = { active: true, targetId: thrown.id };

    const rings = [];
    bus.on('choir:bellHeadRing', (p) => rings.push(p));
    sim.step();
    assert.equal(rings.length, 1, 'the slam rang');
    assert.equal(rings[0].hitId, wall.id);
    assert.equal(nearby.data.choirHumAt, state.simTime, 'the ring hummed the crystal');
    sim.runTicks(Math.ceil(CHOIR_BELL_HEAD.humDurationS * 60) + 5);
    assert.equal(ensureChoirState(state).shatters >= 1, true, 'the crystal answered the ring');
  } finally {
    sim.dispose();
  }
});
