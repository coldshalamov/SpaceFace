// After a dedicated barn raising, one first supply crate waits outside the new
// stead's ring. Staged on real transitions only; old saves never mint one.
// Run: node --test test/frontier-first-provision.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  frontierHomesteads,
  ensureFrontierState,
} from '../src/systems/faction_frontier.js';
import { FRONTIER_HOMESTEAD } from '../src/data/factions/free.js';

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
  const logs = [];
  const grants = [];
  bus.on('comms:log', (p) => logs.push(p));
  bus.on('economy:grantCredits', (p) => grants.push(p));
  return { sim, state, bus, player, logs, grants };
}

const ownerOf = (h) => h.sim.registry.get('frontierHomesteads');

function barnMission(id = 'm_barn_1') {
  return {
    id, status: 'active', type: 'tow_recovery', storyTag: 'campaign47a:b4:operation',
    params: { bookScene: 'barn_raising', frontierBarnRaisingVersion: 1 },
  };
}

/** Accept the real barn job; the attempt plants its own frame in Io Reach. */
function accept(h, m = barnMission()) {
  h.state.missions.active.push(m);
  h.bus.emit('mission:accepted', { missionId: m.id, type: m.type, storyTag: m.storyTag });
  return m;
}

/** Snap all six modules, let the welders finish, and settle the contract. */
function completeBarn(h, m) {
  const o = ownerOf(h);
  const attempt = h.state.frontier.barnAttempt;
  const frame = h.state.entities.get(attempt.frameId);
  for (const e of h.state.entityList) {
    if (e?.data?.frontierMissionId === m.id && typeof e.data?.homesteadModule === 'string') {
      e.pos.x = frame.pos.x; e.pos.z = frame.pos.z;
    }
  }
  o._tickRaising(h.state, 13);
  assert.equal(frame.data.homestead, true, 'the raised frame is the homestead');
  const rec = ensureFrontierState(h.state).homesteads.find((r) => r.entityId === frame.id);
  assert.ok(rec, 'the homestead record exists');
  // The real missions emit: { missionId, type, factionId, repMult, rewardCr, frontierReceipt }.
  const receipt = {
    version: 1, missionId: m.id, siteId: attempt.siteId, frameId: frame.id,
    frameGen: frame.occupantGeneration, moduleIds: { ...attempt.moduleIds },
    raisedAt: rec.raisedAt,
  };
  h.bus.emit('mission:completed', {
    missionId: m.id, type: 'tow_recovery', frontierReceipt: receipt,
  });
  assert.equal(attempt.status, 'completed');
  return { attempt, frame, rec };
}

const crateOf = (h, attempt) => h.state.entityList.filter((e) => e && e.alive !== false
  && e.data?.supplyCargo === true && e.data?.frontierSite === attempt.siteId);

test('a completed dedicated barn job stages one first crate outside the ring', () => {
  const h = boot();
  try {
    const m = accept(h);
    const { attempt, frame, rec } = completeBarn(h, m);
    assert.equal(attempt.firstProvision, 'issued');
    const crates = crateOf(h, attempt);
    assert.equal(crates.length, 1, 'exactly one first crate');
    const crate = crates[0];
    assert.equal(crate.type, 'payload');
    assert.equal(crate.mass, 10);
    assert.equal(crate.radius, 6);
    assert.equal(crate.flags?.persistent, true);
    assert.equal(crate.data?.masslineTetherable, true);
    assert.equal(crate.data?.scanLabel, 'HOMESTEAD SUPPLIES · 10t');
    const d = Math.hypot(crate.pos.x - frame.pos.x, crate.pos.z - frame.pos.z);
    assert.ok(d > FRONTIER_HOMESTEAD.supplyRadius, 'the crate waits outside the ring');
    assert.ok([320, 420, 520].includes(Math.round(d)), 'on a staging ring');
    assert.ok(h.logs.some((l) => l.text === 'First crate\'s outside the ring.'
      && l.speaker === rec.name), 'the stead announces its crate');
    // A second stage call mints nothing — the pod already rides the site.
    ownerOf(h)._stageFirstProvision(h.state);
    assert.equal(crateOf(h, attempt).length, 1);
  } finally { h.sim.dispose(); }
});

test('the staged crate lands as a real supply delivery when towed inside', () => {
  const h = boot();
  try {
    const m = accept(h);
    const { attempt, frame, rec } = completeBarn(h, m);
    const crate = crateOf(h, attempt)[0];
    crate.pos.x = frame.pos.x + 10; crate.pos.z = frame.pos.z + 10;
    ownerOf(h)._tickHomesteads(h.state);
    assert.equal(crate.alive, false, 'the crate is taken aboard');
    assert.equal(rec.supplies, 1);
    assert.equal(h.grants.filter((g) => g.reason.startsWith('frontier_supply:')).length, 1);
  } finally { h.sim.dispose(); }
});

test('an adopted ordinary site never owes a first crate', () => {
  const h = boot();
  try {
    // An unfinished ordinary site exists before the mission is accepted, so the
    // job adopts it instead of planting a dedicated frame.
    ownerOf(h)._tickSiteSeeding(h.state);
    const m = accept(h);
    const attempt = h.state.frontier.barnAttempt;
    // The adopted site's own staged pods already carry its site tag.
    const ownPods = crateOf(h, attempt).length;
    completeBarn(h, m);
    assert.equal(attempt.adoptedSite, true);
    assert.equal(attempt.firstProvision, undefined);
    assert.equal(crateOf(h, attempt).length, ownPods, 'no gift pod minted');
    assert.equal(h.logs.filter((l) => l.text === 'First crate\'s outside the ring.').length, 0);
  } finally { h.sim.dispose(); }
});

test('a blocked ring leaves the crate pending until the next transition', () => {
  const h = boot();
  try {
    const m = accept(h);
    const { attempt } = completeBarn(h, m);
    assert.equal(attempt.firstProvision, 'issued');
    // Re-pend as a restore boundary could leave it, with the ring obstructed.
    const crate = crateOf(h, attempt)[0];
    h.sim.helpers.removeEntity(crate.id);
    attempt.firstProvision = 'pending';
    const o = ownerOf(h);
    const orig = o._clearRingSpot;
    o._clearRingSpot = () => null;
    o._stageFirstProvision(h.state);
    assert.equal(attempt.firstProvision, 'pending', 'no clear pocket, no crate this time');
    assert.equal(crateOf(h, attempt).length, 0);
    o._clearRingSpot = orig;
    h.bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
    assert.equal(attempt.firstProvision, 'issued');
    assert.equal(crateOf(h, attempt).length, 1);
  } finally { h.sim.dispose(); }
});

test('a failed spawn keeps the crate pending and an existing site pod counts as staged', () => {
  const h = boot();
  try {
    const m = accept(h);
    const { attempt } = completeBarn(h, m);
    const crate = crateOf(h, attempt)[0];
    h.sim.helpers.removeEntity(crate.id);
    attempt.firstProvision = 'pending';
    const o = ownerOf(h);
    const origSpawn = o.helpers.spawnEntity;
    o.helpers.spawnEntity = (spec) => (spec?.data?.supplyCargo === true ? null : origSpawn(spec));
    o._stageFirstProvision(h.state);
    assert.equal(attempt.firstProvision, 'pending', 'a failed spawn never marks issued');
    o.helpers.spawnEntity = origSpawn;
    // Stock already riding the site counts as staged — no second gift.
    h.sim.spawn({
      type: 'payload', pos: { x: 900, z: 0 }, radius: 6, mass: 10,
      hull: 10, hullMax: 10, collides: true,
      data: { supplyCargo: true, frontierSite: attempt.siteId },
    });
    o._stageFirstProvision(h.state);
    assert.equal(attempt.firstProvision, 'issued');
    assert.equal(crateOf(h, attempt).length, 1, 'the live pod is the provision');
  } finally { h.sim.dispose(); }
});

test('a completed attempt from an old save mints no crate on restore', async () => {
  const { save } = await import('../src/save/saveSystem.js');
  const h = boot();
  const fresh = boot();
  try {
    const m = accept(h);
    const { attempt } = completeBarn(h, m);
    // Strip the new fields — an old save never carried them.
    delete attempt.firstProvision;
    const crateCount = crateOf(h, attempt).length;
    const data = structuredClone(ownerOf(h).serialize());
    delete data.barnAttempt.firstProvision;
    const rows = Object.assign(Object.create(save), {
      state: h.state, bus: h.bus, helpers: h.sim.helpers, registry: h.sim.registry,
    })._serializeEntities().persistent;
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
    const restored = fresh.state.frontier.barnAttempt;
    assert.equal(restored.status, 'completed');
    assert.equal(restored.firstProvision, undefined, 'no field, no crate');
    assert.equal(fresh.state.entityList.filter((e) => e?.alive !== false
      && e.data?.supplyCargo === true).length, crateCount);
  } finally { h.sim.dispose(); fresh.sim.dispose(); }
});
