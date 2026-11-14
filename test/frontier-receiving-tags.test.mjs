// frontier-receiving-tags — the transient beacons that ring where a frontier ask
// wants its delivery, plus the household's one-line-per-moment speech.
//
// Tags are reconciler output, not ticks: they appear on board events, sector
// transitions, and restores — never from a per-tick entity scan. Each rides the
// body that receives the delivery and is never saved.
//
// Run: node --test test/frontier-receiving-tags.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  frontierHomesteads,
  ensureFrontierState,
  FRONTIER_MUTUAL_AID,
  FRONTIER_SALVAGE_CLAIMS,
} from '../src/systems/faction_frontier.js';
import {
  FRONTIER_FRAME,
  FRONTIER_MODULES,
  FRONTIER_BARN_RAISING,
  FRONTIER_HOMESTEAD,
  FRONTIER_HOUSEHOLD_LINES,
} from '../src/data/factions/free.js';

const SEED = 9091;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [frontierHomesteads] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_io_reach';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -40000, z: -40000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  const logs = [];
  bus.on('comms:log', (p) => logs.push(p));
  const owner = sim.registry.get('frontierHomesteads');
  return { sim, state, bus, player, logs, owner };
}

const tags = (h) => h.state.entityList.filter(
  (e) => e && e.alive !== false && e.data?.frontierReceivingTag === true);
const tagFor = (h, key) => tags(h).find(
  (e) => e.data?.frontierReceivingKey === key) || null;
const recOf = (h, entityId) =>
  ensureFrontierState(h.state).homesteads.find((r) => r.entityId === entityId);
const lineHeard = (h, text) => h.logs.filter((l) => l.text === text).length;

function raiseStead(h, x = 0, z = 0) {
  const f = h.sim.spawn({
    type: 'station', team: 0, factionId: 'faction_free',
    pos: { x, z }, radius: FRONTIER_FRAME.radius, mass: 1e6,
    hull: 2000, hullMax: 2000, collides: true,
    data: { homesteadFrame: true, typeId: FRONTIER_FRAME.typeId },
  });
  for (const m of FRONTIER_MODULES) {
    h.sim.spawn({
      type: 'payload', team: 0, factionId: 'faction_free',
      pos: { x: x + FRONTIER_FRAME.snapRange - 60, z: z + (m.mass % 40) - 20 },
      radius: m.radius, mass: m.mass, hull: 100, hullMax: 100, collides: true,
      data: { homesteadModule: m.id, name: m.label },
    });
  }
  h.sim.runTicks(Math.ceil(FRONTIER_BARN_RAISING.weldTimeS * 60) + 10);
  assert.equal(f.data.homestead, true, 'the frame became the homestead');
  return f;
}

test('the site frame wears E-21 RECEIVING that counts its snaps', () => {
  const h = boot();
  try {
    h.owner._tickSiteSeeding(h.state);
    const site = h.state.frontier.sites.sector_io_reach;
    const f = h.state.entities.get(site.frameId);
    assert.ok(f && f.data?.homesteadFrame === true, 'a real frame was planted');
    h.sim.step();
    const tag = tagFor(h, `frame:${f.id}`);
    assert.ok(tag, 'the frame advertises its intake ring');
    assert.equal(tag.type, 'beacon');
    assert.equal(tag.data.scanLabel, `E-21 RECEIVING · 0/${FRONTIER_FRAME.moduleSlots}`);
    assert.equal(tag.data.ringRadius, FRONTIER_FRAME.snapRange);
    assert.equal(tag.collides, false, 'nonphysical — it never blocks the ring');
    assert.equal(tag.data.tetherable, false);
    assert.equal(tag.data.masslineTetherable, false);
    assert.notEqual(tag.flags?.persistent, true, 'transient — never saved');
    assert.ok(Math.abs(tag.pos.x - f.pos.x) < 1 && Math.abs(tag.pos.z - f.pos.z) < 1,
      'the tag sits on the receiving body');

    // Snap one real module: the tag relabels on the board event, not a scan.
    const mod = h.state.entityList.find((e) => e?.data?.homesteadModule === 'habitat');
    mod.pos.x = f.pos.x + FRONTIER_FRAME.snapRange - 20; mod.pos.z = f.pos.z;
    h.sim.step();
    assert.equal(f.data.slots.habitat, mod.id, 'the module snapped');
    h.sim.step();
    assert.equal(tagFor(h, `frame:${f.id}`)?.data.scanLabel,
      `E-21 RECEIVING · 1/${FRONTIER_FRAME.moduleSlots}`, 'the tag relabels on the snap');
    assert.equal(lineHeard(h, FRONTIER_HOUSEHOLD_LINES.firstSnap), 1, 'first snap said once');
  } finally { h.sim.dispose(); }
});

test('the weld crew says its line at six; the raised stead keeps no frame tag', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    assert.equal(lineHeard(h, FRONTIER_HOUSEHOLD_LINES.firstSnap), 1);
    const weldLines = h.logs.filter((l) => l.text === FRONTIER_HOUSEHOLD_LINES.weldGo);
    assert.equal(weldLines.length, 1, 'sixth snap said once');
    assert.equal(weldLines[0].speaker, 'E-21 weld crew');
    assert.equal(tagFor(h, `frame:${stead.id}`), null, 'a raised stead is no longer receiving');
  } finally { h.sim.dispose(); }
});

test('a stranded stead wears SUPPLIES WANTED until stores land', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    const rec = recOf(h, stead.id);
    rec.lastSupplyAt = h.state.simTime - FRONTIER_HOMESTEAD.strandedAfterS - 10;
    h.sim.step();
    assert.equal(rec.stranded, true);
    h.sim.step();
    const tag = tagFor(h, `stead:${stead.id}`);
    assert.ok(tag, 'the hungry stead advertises');
    assert.equal(tag.data.scanLabel, 'SUPPLIES WANTED');
    assert.equal(tag.data.ringRadius, FRONTIER_HOMESTEAD.supplyRadius);
    // Stores land — the ask is answered and the tag leaves on the event.
    h.sim.spawn({
      type: 'payload', team: 0, pos: { x: stead.pos.x + 40, z: stead.pos.z },
      radius: 6, mass: 10, hull: 10, hullMax: 10, collides: true, data: { supplyCargo: true },
    });
    h.sim.step();
    assert.equal(rec.stranded, false);
    assert.equal(tagFor(h, `stead:${stead.id}`), null, 'the ask is answered — tag retires');
  } finally { h.sim.dispose(); }
});

test('an open aid marker draws AID RECEIVING at the debtor and retires on settle', () => {
  const h = boot();
  try {
    const a = raiseStead(h, 0, 0);
    const b = raiseStead(h, 6000, 0);
    const f = ensureFrontierState(h.state);
    const recA = recOf(h, a.id); const recB = recOf(h, b.id);
    recA.lastSupplyAt = -400; recB.lastSupplyAt = h.state.simTime; recB.supplies = 2;
    f.nextDebtAt = 0;
    h.sim.step();
    const debt = f.debts.find((d) => d.state === 'open');
    assert.ok(debt, 'the board posted a marker');
    h.sim.step();
    const tag = tagFor(h, `aid:${debt.id}`);
    assert.ok(tag, 'the debtor wears the receiving ring');
    assert.equal(tag.data.scanLabel, 'AID · bring the marker');
    assert.equal(tag.data.ringRadius, FRONTIER_MUTUAL_AID.settleR + a.radius);
    assert.ok(Math.abs(tag.pos.x - a.pos.x) < 1, 'the tag is on the debtor, not the marker');
    // Settle it — the ring retires with the row.
    const marker = h.state.entities.get(debt.markerId);
    marker.pos.x = a.pos.x + 30; marker.pos.z = a.pos.z;
    h.sim.step();
    assert.equal(debt.state, 'paid');
    assert.equal(tagFor(h, `aid:${debt.id}`), null);
  } finally { h.sim.dispose(); }
});

test('an open dispute draws CLAIM RECEIVING on each claimant', () => {
  const h = boot();
  try {
    const a = raiseStead(h, 0, 0);
    const b = raiseStead(h, 800, 0);
    const wreck = h.sim.spawn({
      type: 'wreck', team: 0, pos: { x: 400, z: 0 }, radius: 20, mass: 200,
      hull: 200, hullMax: 200, collides: true, data: { derelict: true },
    });
    h.sim.step();
    const d = h.state.frontier.disputes.find((r) => r.state === 'open');
    assert.ok(d, 'the board filed the hulk');
    assert.ok(d.steadIds.length >= 2, 'two steads claim it');
    h.sim.step();
    for (const sid of d.steadIds) {
      const tag = tagFor(h, `claim:${d.id}:${sid}`);
      assert.ok(tag, `claimant ${sid} wears its filed-wreck ring`);
      assert.equal(tag.data.scanLabel, `CLAIM · ${h.state.frontier.homesteads.find((r) => r.entityId === sid).name}`);
      const ent = h.state.entities.get(sid);
      assert.equal(tag.data.ringRadius, FRONTIER_SALVAGE_CLAIMS.settleRadius + ent.radius);
    }
    // Claim lapses on the window — the rings retire.
    h.state.simTime = d.expiresAt + 1;
    h.sim.step();
    assert.notEqual(d.state, 'open');
    assert.equal(tagFor(h, `claim:${d.id}:${d.steadIds[0]}`), null);
    assert.equal(tagFor(h, `claim:${d.id}:${d.steadIds[1]}`), null);
    void wreck;
  } finally { h.sim.dispose(); }
});

test('the fixed tick never reconciles and allocates nothing when unchanged', () => {
  const h = boot();
  try {
    h.owner._tickSiteSeeding(h.state);
    h.sim.step();
    const site = h.state.frontier.sites.sector_io_reach;
    assert.ok(tagFor(h, `frame:${site.frameId}`), 'the frame tag exists');
    // Spy AFTER the transition reconcile: the fixed tick must never call it.
    const orig = h.owner._syncReceivingTags;
    let syncCalls = 0;
    h.owner._syncReceivingTags = (...a) => { syncCalls++; return orig(...a); };
    let spawns = 0;
    const origSpawn = h.owner.helpers.spawnEntity;
    h.owner.helpers.spawnEntity = (s) => { spawns++; return origSpawn(s); };
    const entitiesBefore = h.state.entityList.length;
    const mapBefore = h.owner._receivingTags;
    const mapSize = mapBefore.size;
    h.sim.runTicks(600);
    assert.equal(syncCalls, 0, 'no transition, no reconcile');
    assert.equal(spawns, 0, 'the fixed tick mints no tag bodies');
    assert.equal(h.state.entityList.length, entitiesBefore, 'no entities created or swept');
    assert.equal(h.owner._receivingTags, mapBefore, 'the tag map is stable state, not rebuilt');
    assert.equal(h.owner._receivingTags.size, mapSize);
  } finally { h.sim.dispose(); }
});

test('a tag rides its receiving body when the body moves', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    const rec = recOf(h, stead.id);
    rec.lastSupplyAt = -400;
    h.sim.step(); h.sim.step();
    const tag = tagFor(h, `stead:${stead.id}`);
    assert.ok(tag);
    stead.pos.x += 500; stead.pos.z += 120;
    h.sim.step();
    assert.ok(Math.abs(tag.pos.x - stead.pos.x) < 1 && Math.abs(tag.pos.z - stead.pos.z) < 1,
      'the ring follows the towed stead');
  } finally { h.sim.dispose(); }
});

test('the household speaks its moments once each', () => {
  const h = boot();
  try {
    const stead = raiseStead(h);
    const rec = recOf(h, stead.id);
    // The player far away hears nothing; the first close pass says it once.
    h.sim.step();
    assert.equal(lineHeard(h, FRONTIER_HOUSEHOLD_LINES.household), 0);
    h.player.pos.x = stead.pos.x + 300; h.player.pos.z = stead.pos.z;
    h.sim.step();
    assert.equal(lineHeard(h, FRONTIER_HOUSEHOLD_LINES.household), 1, 'welders-gone line, once');
    h.player.pos.x += 2000;
    h.sim.step();
    h.player.pos.x = stead.pos.x + 100;
    h.sim.step();
    assert.equal(lineHeard(h, FRONTIER_HOUSEHOLD_LINES.household), 1, 'never twice per stead');
    // First stores aboard after that — the household line follows the hailed moment.
    h.sim.spawn({
      type: 'payload', team: 0, pos: { x: stead.pos.x + 30, z: stead.pos.z },
      radius: 6, mass: 10, hull: 10, hullMax: 10, collides: true, data: { supplyCargo: true },
    });
    h.sim.step();
    assert.equal(lineHeard(h, FRONTIER_HOUSEHOLD_LINES.stores), 1, 'stores line once');
    h.sim.spawn({
      type: 'payload', team: 0, pos: { x: stead.pos.x + 30, z: stead.pos.z },
      radius: 6, mass: 10, hull: 10, hullMax: 10, collides: true, data: { supplyCargo: true },
    });
    h.sim.step();
    assert.equal(lineHeard(h, FRONTIER_HOUSEHOLD_LINES.stores), 1, 'not per delivery');
    // Two claimant rings around the player's haul — the board names the choice.
    const b = raiseStead(h, stead.pos.x + 560, stead.pos.z);
    const wreck = h.sim.spawn({
      type: 'wreck', team: 0,
      pos: { x: stead.pos.x + 280, z: stead.pos.z }, radius: 20, mass: 200,
      hull: 200, hullMax: 200, collides: true, data: { derelict: true },
    });
    h.sim.step();
    const d = h.state.frontier.disputes.find((r) => r.state === 'open' && r.wreckId === wreck.id);
    assert.ok(d && d.steadIds.length >= 2, 'two steads filed the hulk');
    wreck.data.thrownBy = 'player';
    h.sim.step();
    // Inside both rings + the player's haul: the warning plays once, then a claimant takes it.
    assert.ok(lineHeard(h, FRONTIER_HOUSEHOLD_LINES.twoRings) >= 1,
      'the board warns while both rings reach the haul');
    void rec; void b;
  } finally { h.sim.dispose(); }
});
