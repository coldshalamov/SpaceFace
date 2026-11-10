// weight-frontier-532 — W-FRONTIER (build_map §34.5 row 532, bible 02 §7).
//
// Proves the row's done-when on the real data and the runtime owner:
//   data/factions/free.js      six modules, the frame, Barn Raising, Weld Head, the mark
//   systems/faction_frontier.js modules snap onto frame slots; all six starts the welders
//                               and the homestead is raised (E-21); a missed window leaves
//                               a half-built homestead, damaged; raised homesteads persist,
//                               gain traffic and ask for supply runs; the Weld Head bonds
//                               the held object where it touches
//
// Run: node --test test/weight-frontier-532.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  frontierHomesteads,
  ensureFrontierState,
} from '../src/systems/faction_frontier.js';
import faction, {
  FRONTIER_MODULES,
  FRONTIER_FRAME,
  FRONTIER_BARN_RAISING,
  FRONTIER_WELD_HEAD,
  FRONTIER_HOMESTEAD,
} from '../src/data/factions/free.js';

const SEED = 4242;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [frontierHomesteads] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_io_reach';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -4000, z: -4000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

const frame = (sim, x = 0, z = 0) => sim.spawn({
  type: 'station', team: 0, factionId: 'faction_free',
  pos: { x, z }, radius: FRONTIER_FRAME.radius, mass: 1e6,
  hull: 2000, hullMax: 2000, collides: true,
  data: { homesteadFrame: true, typeId: FRONTIER_FRAME.typeId },
});

const moduleFor = (sim, kind, x, z) => {
  const spec = FRONTIER_MODULES.find((m) => m.id === kind);
  return sim.spawn({
    type: 'payload', team: 0, factionId: 'faction_free',
    pos: { x, z }, radius: spec.radius, mass: spec.mass,
    hull: 100, hullMax: 100, collides: true,
    data: { homesteadModule: kind, name: spec.label },
  });
};

test('data: six modules and a frame; the raising, the head and the mark are authored', () => {
  assert.equal(FRONTIER_MODULES.length, 6, 'six snap-together modules');
  assert.deepEqual(FRONTIER_MODULES.map((m) => m.id),
    ['habitat', 'tank', 'solar', 'dock', 'garden', 'mast']);
  assert.equal(FRONTIER_FRAME.moduleSlots, 6, 'the frame takes all six');
  assert.equal(FRONTIER_BARN_RAISING.id, 'E-21');
  assert.ok(FRONTIER_BARN_RAISING.windowS > FRONTIER_BARN_RAISING.weldTimeS,
    'the welders can finish inside the window');
  assert.equal(FRONTIER_WELD_HEAD.id, 'head_weld');
  assert.ok(FRONTIER_HOMESTEAD.strandedAfterS > FRONTIER_HOMESTEAD.trafficPeriodS);
  assert.equal(faction.custom.alliesWhoNeedCover, true);
});

test('a towed module snaps to an open slot on the frame and rides it', () => {
  const { sim, state, bus } = boot();
  try {
    const f = frame(sim);
    const hab = moduleFor(sim, 'habitat', FRONTIER_FRAME.snapRange - 40, 0);
    const snaps = [];
    bus.on('frontier:moduleSnapped', (p) => snaps.push(p));
    sim.step();
    assert.equal(snaps.length, 1, 'the module snapped on');
    assert.equal(snaps[0].kind, 'habitat');
    assert.equal(hab.data.snapped, true);
    assert.equal(f.data.slots.habitat, hab.id);
    // It rides the ring — kinematic on the frame, not a free body anymore.
    f.pos.x += 100;
    sim.step();
    assert.equal(hab.pos.x, f.pos.x + hab.data.slotOffset.dx, 'it rides the frame');
    assert.equal(hab.vel.x, 0);
    assert.ok(Number.isFinite(f.data.raiseDeadline), 'the first snap started the window');
  } finally {
    sim.dispose();
  }
});

test('E-21: all six snapped runs the welders — the homestead is raised and persists', () => {
  const { sim, state, bus } = boot();
  try {
    const f = frame(sim);
    for (const m of FRONTIER_MODULES) moduleFor(sim, m.id, FRONTIER_FRAME.snapRange - 60, 0);
    const raised = [];
    bus.on('frontier:homesteadRaised', (p) => raised.push(p));
    sim.runTicks(Math.ceil(FRONTIER_BARN_RAISING.weldTimeS * 60) + 10);
    assert.equal(raised.length, 1, 'the homestead was raised');
    assert.equal(raised[0].modules.length, 6, 'all six modules are hers');
    const rec = ensureFrontierState(state).homesteads[0];
    assert.equal(rec.entityId, f.id, 'a homestead on the chart');
    assert.equal(rec.partial, false);
    assert.equal(f.data.homestead, true, 'the frame became the homestead');
    // It stays raised — the window closing afterwards costs it nothing.
    sim.runTicks(60);
    assert.equal(ensureFrontierState(state).homesteads.length, 1);
  } finally {
    sim.dispose();
  }
});

test('E-21 FF: miss the window and a half-built homestead survives, damaged', () => {
  const { sim, state, bus } = boot();
  try {
    const f = frame(sim);
    moduleFor(sim, 'habitat', FRONTIER_FRAME.snapRange - 40, 0);
    moduleFor(sim, 'tank', FRONTIER_FRAME.snapRange - 40, 60);
    const partial = [];
    bus.on('frontier:barnPartial', (p) => partial.push(p));
    // Only two snapped — the tide wins the window.
    sim.runTicks(Math.ceil(FRONTIER_BARN_RAISING.windowS * 60) + 10);
    assert.equal(partial.length, 1, 'a half-built homestead survives');
    const rec = ensureFrontierState(state).homesteads[0];
    assert.equal(rec.partial, true);
    assert.equal(rec.modules.length, 2, 'it keeps what you snapped on');
    assert.equal(f.data.damaged, true);
    assert.ok(f.hull <= Math.ceil(f.hullMax * FRONTIER_BARN_RAISING.partialPenaltyHull),
      'it stands, damaged');
  } finally {
    sim.dispose();
  }
});

test('a raised homestead gains traffic, asks for supply runs when stranded, takes supplies', () => {
  const { sim, state, bus, player } = boot();
  try {
    const f = frame(sim);
    for (const m of FRONTIER_MODULES) moduleFor(sim, m.id, FRONTIER_FRAME.snapRange - 60, 0);
    sim.runTicks(Math.ceil(FRONTIER_BARN_RAISING.weldTimeS * 60) + 10);
    const rec = ensureFrontierState(state).homesteads[0];

    // Traffic on the beat.
    sim.runTicks(FRONTIER_HOMESTEAD.trafficPeriodS * 60 + 5);
    assert.ok(rec.traffic >= 1, 'the homestead gains traffic on the chart');

    // Stranded: left alone, it asks the board.
    const asks = [];
    bus.on('frontier:supplyRunAsked', (p) => asks.push(p));
    sim.runTicks(Math.ceil(FRONTIER_HOMESTEAD.strandedAfterS * 60) + 30);
    assert.equal(asks.length, 1, 'it asked for a supply run');
    assert.equal(rec.stranded, true);
    assert.equal(ensureFrontierState(state).supplyRuns.length, 1);

    // Deliver: a supply pod inside the radius lands and the ask clears.
    sim.spawn({
      type: 'payload', team: 0, pos: { x: f.pos.x + 50, z: 0 }, radius: 6, mass: 10,
      hull: 10, hullMax: 10, collides: true, data: { supplyCargo: true },
    });
    const landed = [];
    bus.on('frontier:supplyDelivered', (p) => landed.push(p));
    sim.step();
    assert.equal(landed.length, 1, 'the supplies landed');
    assert.equal(rec.supplies, 1);
    assert.equal(rec.stranded, false, 'the homestead is provisioned');
  } finally {
    sim.dispose();
  }
});

test('Weld Head: the held object welds where it touches — the bond outlives the Line', () => {
  const { sim, state, bus, player } = boot();
  try {
    player.data = { ...(player.data || {}), lineHeadId: FRONTIER_WELD_HEAD.id };
    player.pos.x = 0; player.pos.z = 0;
    const wall = sim.spawn({
      type: 'asteroid', team: 0, pos: { x: 200, z: 0 }, radius: 40, mass: 900,
      hull: 300, hullMax: 300, collides: true, vel: { x: 10, z: 0 },
      data: { material: 'rock' },
    });
    const held = sim.spawn({
      type: 'payload', team: 0, pos: { x: wall.pos.x - wall.radius - 10, z: 0 },
      radius: 8, mass: 20, hull: 10, hullMax: 10, collides: true, data: {},
    });
    player.tether = { active: true, targetId: held.id };
    const welds = [];
    bus.on('frontier:welded', (p) => welds.push(p));
    // The arc needs its dwell — hold it on the joint.
    sim.runTicks(Math.ceil(FRONTIER_WELD_HEAD.weldTimeS * 60) + 10);
    assert.equal(welds.length, 1, 'the weld took');
    assert.equal(held.data.weldedTo, wall.id);

    // Drop the Line: the bond persists — the held object rides the joint.
    player.tether = { active: false, targetId: null };
    const dx = held.pos.x - wall.pos.x, dz = held.pos.z - wall.pos.z;
    wall.pos.x += 500;
    sim.step();
    assert.equal(held.pos.x, wall.pos.x + dx, 'it rides the joint it was welded to');
    assert.equal(held.data.weldedTo, wall.id, 'the bond outlived the Line');
  } finally {
    sim.dispose();
  }
});
