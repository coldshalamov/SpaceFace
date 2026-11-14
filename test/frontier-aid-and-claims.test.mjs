// frontier-aid-and-claims — the aid marker waits in clear space beside the
// creditor (F), and a claimed wreck is pinned persistent for the claim's life
// so a dispute survives Save/Continue (G).
//
// F: `_postDebt` places the marker just outside the creditor's hull on the
// side facing the debtor — a dynamic 12 t persistent tetherable body. When no
// bearing is clear the board posts nothing and lets the offer timer retry.
//
// G: a disputed wreck that no other owner persists gains
// `flags.persistent` + `data.persistenceOwner = 'frontierClaim'` while the
// claim is open; both leave with the claim; another owner's persistence is
// never touched; a restore re-finds the same wreck for the open dispute.
//
// Run: node --test test/frontier-aid-and-claims.test.mjs

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
  FRONTIER_SALVAGE_CLAIMS,
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

const frame = (sim, x = 0, z = 0) => sim.spawn({
  type: 'station', team: 0, factionId: 'faction_free',
  pos: { x, z }, radius: FRONTIER_FRAME.radius, mass: 1e6,
  hull: 2000, hullMax: 2000, collides: true,
  data: { homesteadFrame: true, typeId: FRONTIER_FRAME.typeId },
});

function raiseStead(sim, x = 0, z = 0) {
  const f = frame(sim, x, z);
  for (const m of FRONTIER_MODULES) {
    sim.spawn({
      type: 'payload', team: 0, factionId: 'faction_free',
      pos: { x: x + FRONTIER_FRAME.snapRange - 60, z: z + (m.mass % 40) - 20 },
      radius: m.radius, mass: m.mass, hull: 100, hullMax: 100, collides: true,
      data: { homesteadModule: m.id, name: m.label },
    });
  }
  sim.runTicks(Math.ceil(FRONTIER_BARN_RAISING.weldTimeS * 60) + 10);
  assert.equal(f.data.homestead, true, 'the frame became the homestead');
  return f;
}

const recOf = (state, entityId) =>
  ensureFrontierState(state).homesteads.find((r) => r.entityId === entityId);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

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

test('the marker waits in clear space off the creditor\'s hull, facing the debtor', () => {
  const h = boot();
  try {
    const p = pair(h);
    const d = h.owner._postDebt(h.state, p.f, p.debtor, p.creditor);
    assert.ok(d, 'the board posted the aid debt');
    const marker = h.state.entities.get(d.markerId);
    assert.ok(marker, 'the marker pod exists');
    // Just outside the creditor's hull — not inside it, not across the map.
    const r = dist(marker.pos, p.creditor.ent.pos);
    const hullR = Number(p.creditor.ent.radius) || 0;
    assert.ok(r > hullR, 'the pocket is outside the hull');
    assert.ok(r <= hullR + 100, 'the pocket rides just off the ring');
    // On the side facing the debtor — the errand reads off the geometry.
    const toDebtor = Math.atan2(
      p.debtor.ent.pos.z - p.creditor.ent.pos.z,
      p.debtor.ent.pos.x - p.creditor.ent.pos.x);
    const toMarker = Math.atan2(
      marker.pos.z - p.creditor.ent.pos.z,
      marker.pos.x - p.creditor.ent.pos.x);
    let delta = Math.abs(toDebtor - toMarker) % (Math.PI * 2);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    assert.ok(delta <= Math.PI / 4 + 1e-9, 'the marker faces the debtor\'s way');
    // A dynamic 12 t persistent tetherable body with the honest label.
    assert.equal(marker.mass, 12);
    assert.equal(marker.data.masslineTetherable, true);
    assert.equal(marker.flags?.persistent, true);
    assert.equal(marker.physicsBody?.mass, 12);
    assert.equal(marker.physicsBody?.dynamic, true);
    assert.equal(marker.data.scanLabel, `MUTUAL AID · 12t · to ${p.debtor.rec.name}`);
    assert.equal(marker.data.frontierAidId, d.id);
  } finally { h.sim.dispose(); }
});

test('no clear pocket beside the creditor posts no debt this time', () => {
  const h = boot();
  try {
    const p = pair(h);
    // Wall the creditor in — one huge collidable body on its position swallows
    // every probe ring the pocket check tries.
    h.sim.spawn({
      type: 'asteroid', team: 0, pos: { ...p.creditor.ent.pos },
      radius: (Number(p.creditor.ent.radius) || 60) + 200,
      mass: 1e9, hull: 9000, hullMax: 9000, collides: true,
    });
    const debtsBefore = p.f.debts.length;
    const d = h.owner._postDebt(h.state, p.f, p.debtor, p.creditor);
    assert.equal(d, null, 'no clear pocket, no marker');
    assert.equal(p.f.debts.length, debtsBefore, 'no debt row was posted');
  } finally { h.sim.dispose(); }
});

test('an open dispute pins an unpersisted wreck and releases it on close', () => {
  const h = boot();
  try {
    raiseStead(h.sim, 0, 0);
    raiseStead(h.sim, 800, 0);
    const f = ensureFrontierState(h.state);
    const wreck = h.sim.spawn({
      type: 'wreck', team: 0, pos: { x: 400, z: 0 }, radius: 24, mass: 400,
      hull: 200, hullMax: 200, collides: true, data: { name: 'DRIFTING HULK' },
    });
    assert.equal(wreck.flags?.persistent ?? false, false, 'unpersisted to start');
    h.owner._tickDisputes(h.state);
    const d = f.disputes.find((r) => r.state === 'open');
    assert.ok(d, 'the wreck is contested ground');
    assert.equal(d.wreckId, wreck.id);
    assert.equal(d.steadIds.length, 2, 'both steads filed');
    assert.equal(wreck.flags?.persistent, true, 'the claim pins the hulk');
    assert.equal(wreck.data.persistenceOwner, 'frontierClaim');
    // Lapse: the pin leaves with the claim; the hulk drifts free again.
    h.owner._closeDispute(h.state, d, 'lapsed', null);
    assert.equal(wreck.data.persistenceOwner, null);
    assert.equal(wreck.flags?.persistent, false);
    assert.equal(wreck.data.frontierDisputeId, null);
  } finally { h.sim.dispose(); }
});

test('a wreck another owner already persists is never repinned or touched', () => {
  const h = boot();
  try {
    raiseStead(h.sim, 0, 0);
    raiseStead(h.sim, 800, 0);
    const f = ensureFrontierState(h.state);
    // persistenceOwner set without flags.persistent — the claimable scan still
    // admits it, but the pin must not overwrite the other owner's mark.
    const wreck = h.sim.spawn({
      type: 'wreck', team: 0, pos: { x: 400, z: 0 }, radius: 24, mass: 400,
      hull: 200, hullMax: 200, collides: true,
      data: { name: 'SALVAGE YARD HULK', persistenceOwner: 'salvageYard' },
    });
    h.owner._tickDisputes(h.state);
    const d = f.disputes.find((r) => r.state === 'open');
    assert.ok(d, 'the dispute still opens on the claimable hulk');
    assert.equal(wreck.data.persistenceOwner, 'salvageYard', 'the other owner stays');
    assert.notEqual(wreck.flags?.persistent, true, 'no frontier pin over it');
    h.owner._closeDispute(h.state, d, 'lapsed', null);
    assert.equal(wreck.data.persistenceOwner, 'salvageYard', 'closing touches nothing');
  } finally { h.sim.dispose(); }
});

test('a claimed wreck survives Save/Continue and the dispute re-finds it', async () => {
  const { save } = await import('../src/save/saveSystem.js');
  const h = boot();
  const fresh = boot();
  try {
    const a = raiseStead(h.sim, 0, 0);
    const b = raiseStead(h.sim, 800, 0);
    a.flags = { ...(a.flags || {}), persistent: true };
    b.flags = { ...(b.flags || {}), persistent: true };
    const f = ensureFrontierState(h.state);
    const wreck = h.sim.spawn({
      type: 'wreck', team: 0, pos: { x: 400, z: 0 }, radius: 24, mass: 400,
      hull: 200, hullMax: 200, collides: true, data: { name: 'DRIFTING HULK' },
    });
    h.owner._tickDisputes(h.state);
    const d = f.disputes.find((r) => r.state === 'open');
    assert.ok(d);
    assert.equal(wreck.flags?.persistent, true, 'pinned for the claim');
    // Serialize the live world and restore it into a fresh session — the pin
    // is what carries the hulk through the persistent-entity list.
    const saver = Object.assign(Object.create(save), {
      state: h.state, bus: h.bus, helpers: h.sim.helpers, registry: h.sim.registry,
    });
    const rows = saver._serializeEntities().persistent;
    const wreckRow = rows.find((r) => r.id === wreck.id);
    assert.ok(wreckRow, 'the pinned hulk rides the persistent list');
    const data = structuredClone(h.owner.serialize());
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
    const fo = fresh.owner;
    fo.deserialize(data);
    fresh.state.sessionEntityIdRemap = remap;
    fresh.bus.emit('save:loaded', {});
    // The restored world still has the hulk under its restored id, and the
    // open dispute row re-found it through the remap.
    const fd = fresh.state.frontier.disputes.find((r) => r.id === d.id);
    assert.ok(fd, 'the dispute row survived');
    assert.equal(fd.state, 'open');
    const live = fresh.state.entities.get(fd.wreckId);
    assert.ok(live && live.alive !== false, 'the same hulk is still there');
    assert.equal(live.data.frontierDisputeId, fd.id, 'its claim tag is intact');
    assert.equal(live.data.persistenceOwner, 'frontierClaim', 'the pin persisted');
    assert.equal(live.flags?.persistent, true);
    // A tick on the restored world neither removes the hulk nor lapses the row.
    fo._tickDisputes(fresh.state);
    assert.equal(fd.state, 'open');
    assert.equal(live.alive !== false, true, 'the hulk stays in the world');
  } finally { h.sim.dispose(); fresh.sim.dispose(); }
});

test('the two-rings line speaks once when both claimant rings hold the haul', () => {
  const h = boot();
  try {
    const a = raiseStead(h.sim, 0, 0);
    const b = raiseStead(h.sim, 800, 0);
    const f = ensureFrontierState(h.state);
    const wreck = h.sim.spawn({
      type: 'wreck', team: 0, pos: { x: 400, z: 0 }, radius: 24, mass: 400,
      hull: 200, hullMax: 200, collides: true, data: { name: 'DRIFTING HULK' },
    });
    h.owner._tickDisputes(h.state);
    const d = f.disputes.find((r) => r.state === 'open');
    assert.equal(d.steadIds.length, 2);
    // Park the hulk where both settle rings overlap it — steads 800 apart,
    // settle reach 260+60 each: midpoint 400 is 400 from either, too far.
    // Nudge it inside BOTH rings is geometrically impossible at 800 apart —
    // so bring the steads closer instead: move them onto a shared patch.
    a.pos = { x: -260, z: 0 };
    b.pos = { x: 260, z: 0 };
    wreck.pos = { x: 0, z: 0 };
    // The player is hauling it — that's what makes the board call the choice.
    h.state.player = h.state.player || {};
    h.state.player.tether = { active: true, targetId: wreck.id };
    h.owner._tickDisputes(h.state);
    const said = h.logs.filter((l) => l.text === FRONTIER_HOUSEHOLD_LINES.twoRings).length;
    assert.equal(d.twoRingsSaid, true, 'the board called the choice');
    // The line may speak at most once even if the settlement also fired.
    assert.ok(said <= 1, 'it speaks at most once');
    assert.ok(said === 1 || d.state === 'settled',
      'the line landed, or the same tick settled the claim');
  } finally { h.sim.dispose(); }
});
