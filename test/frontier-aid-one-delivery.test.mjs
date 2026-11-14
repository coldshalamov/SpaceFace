// A physical supply arrival that covers an aid debt counts one delivery, not two.
// Run: node --test test/frontier-aid-one-delivery.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  frontierHomesteads,
  ensureFrontierState,
  FRONTIER_MODULES,
} from '../src/systems/faction_frontier.js';
import {
  FRONTIER_FRAME,
  FRONTIER_BARN_RAISING,
} from '../src/data/factions/free.js';

const SEED = 9091;

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
  const grants = [];
  const reps = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('faction:repDelta', (p) => reps.push(p));
  return { sim, state, bus, player, grants, reps };
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

/** Raise a stead on the real path: six modules snap, welders finish. */
function raiseStead(sim, x = 0, z = 0) {
  const f = frame(sim, x, z);
  for (const m of FRONTIER_MODULES) {
    moduleFor(sim, m.id, x + FRONTIER_FRAME.snapRange - 60, z + (m.mass % 40) - 20);
  }
  sim.runTicks(Math.ceil(FRONTIER_BARN_RAISING.weldTimeS * 60) + 10);
  assert.equal(f.data.homestead, true, 'the frame became the homestead');
  return f;
}

const recOf = (state, entityId) =>
  ensureFrontierState(state).homesteads.find((r) => r.entityId === entityId);

const ownerOf = (h) => h.sim.registry.get('frontierHomesteads');

/** A stranded debtor stead and a provisioned creditor, far enough apart to pair. */
function pair(h) {
  const a = raiseStead(h.sim, 0, 0);
  const b = raiseStead(h.sim, 1500, 0);
  const f = ensureFrontierState(h.state);
  const ra = recOf(h.state, a.id);
  const rb = recOf(h.state, b.id);
  ra.stranded = true;
  rb.stranded = false;
  rb.supplies = 1;
  return { f, debtor: { ent: a, rec: ra }, creditor: { ent: b, rec: rb } };
}

function scenario() {
  const h = boot();
  const p = pair(h);
  const o = ownerOf(h);
  const d = o._postDebt(h.state, p.f, p.debtor, p.creditor);
  assert.ok(d, 'the board posted the aid debt');
  const marker = h.state.entities.get(d.markerId);
  assert.ok(marker, 'the marker pod exists');
  return { ...h, p, o, d, marker };
}

test('one real supply covers aid but records only one delivery and keeps both fees', () => {
  const h = scenario();
  try {
    const count = h.p.debtor.rec.supplies;
    const supply = h.sim.spawn({
      type: 'payload', pos: { x: 0, z: 0 }, radius: 6, mass: 10,
      hull: 10, hullMax: 10, data: { supplyCargo: true },
    });
    h.o._tickHomesteads(h.state);
    assert.equal(supply.alive, false, 'the pod is taken aboard');
    assert.equal(h.d.state, 'paid');
    assert.equal(h.d.how, 'covered');
    assert.equal(h.p.debtor.rec.supplies, count + 1, 'the intake counted it once');
    assert.equal(h.marker.alive, false, 'the spent marker is removed');
    assert.equal(h.grants.filter((g) => g.reason.startsWith('frontier_supply:')).length, 1);
    assert.equal(h.grants.filter((g) => g.reason === `frontier_aid:${h.d.id}`).length, 1);
    // A doubled settle replays nothing.
    h.o._tickHomesteads(h.state);
    h.o._settleDebt(h.state, h.d, 'covered');
    assert.equal(h.p.debtor.rec.supplies, count + 1);
    assert.equal(h.grants.filter((g) => g.reason === `frontier_aid:${h.d.id}`).length, 1);
  } finally { h.sim.dispose(); }
});

test('a carried marker still records exactly one delivery of its own', () => {
  const h = scenario();
  try {
    const count = h.p.debtor.rec.supplies;
    h.marker.pos = { ...h.p.debtor.ent.pos };
    h.o._tickDebts(h.state);
    assert.equal(h.d.state, 'paid');
    assert.equal(h.d.how, 'carried');
    assert.equal(h.p.debtor.rec.supplies, count + 1);
    h.o._tickDebts(h.state);
    assert.equal(h.p.debtor.rec.supplies, count + 1);
  } finally { h.sim.dispose(); }
});

test('a paid debt and its counted delivery survive a restore without replay', async () => {
  const { save } = await import('../src/save/saveSystem.js');
  const h = scenario();
  const fresh = boot();
  try {
    h.p.debtor.ent.flags.persistent = true;
    h.p.creditor.ent.flags.persistent = true;
    const count = h.p.debtor.rec.supplies;
    h.sim.spawn({
      type: 'payload', pos: { ...h.p.debtor.ent.pos }, radius: 6, mass: 10,
      hull: 10, hullMax: 10, data: { supplyCargo: true },
    });
    h.o._tickHomesteads(h.state);
    assert.equal(h.d.state, 'paid');
    // Serialize the live world and restore it into a fresh session.
    const saver = Object.assign(Object.create(save), {
      state: h.state, bus: h.bus, helpers: h.sim.helpers, registry: h.sim.registry,
    });
    const rows = saver._serializeEntities().persistent;
    const data = structuredClone(h.o.serialize());
    const remap = new Map();
    const restorer = Object.assign(Object.create(save), {
      state: fresh.state, bus: fresh.bus, helpers: fresh.sim.helpers, registry: fresh.sim.registry,
    });
    for (let cursor = 0; cursor < rows.length;) {
      const next = restorer._spawnPersistentEntities(
        structuredClone(rows), remap, { startIndex: cursor, clearStale: cursor === 0 });
      assert.ok(next > cursor);
      cursor = next;
    }
    const fo = ownerOf(fresh);
    fo.deserialize(data);
    fresh.state.sessionEntityIdRemap = remap;
    fresh.bus.emit('save:loaded', {});
    const debt = fresh.state.frontier.debts.find((d) => d.id === h.d.id);
    assert.equal(debt.state, 'paid');
    const rec = fo._steadRec(fresh.state, debt.debtorId);
    assert.equal(rec.supplies, count + 1);
    fo._tickDebts(fresh.state);
    fo._tickHomesteads(fresh.state);
    assert.equal(rec.supplies, count + 1);
    assert.equal(fresh.grants.filter((g) => g.reason === `frontier_aid:${debt.id}`).length, 0);
  } finally { h.sim.dispose(); fresh.sim.dispose(); }
});
