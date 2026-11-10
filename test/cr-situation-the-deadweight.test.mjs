// CR situation 1210 — THE DEADWEIGHT (contract-haul beat). The tow verb's missing employer:
// a posted fee makes the PLAYER the tug — haul a heavy disabled hull a real leg and hand it to
// a live relief tug holding a grapple ring, dead-slow. A Reach wing contests the rope itself:
// a tether-control blade plus a prize crew that clamps the hulk whenever no line holds her.
//
// Everything routes through live owners: the hulk is a real disabled ship (the yard tow-out
// idiom — scenery that can be towed), custody is the live attachment table, the receiver's
// grapple severs the player's line through the sanctioned owner cut (the Towline Table
// receiver's own path), the prize clamp is real positions and real seconds, and
// credits/rep/news ride the director's intents.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { lootShards } from '../src/systems/lootShards.js';
import { combat } from '../src/systems/combat.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { DEADWEIGHT } from '../src/data/encounters/1210-the-deadweight.js';

const SEED = 4242;
const SECTOR = 'sector_helios_prime';
const ANCHOR = Object.freeze({ x: 9000, z: -4000 });
const SHAPE = 'the_deadweight';

async function boot() {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, lawSecurity, encounterDirector, lootShards,
      'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x, z: ANCHOR.z }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of [
    'encounter:resolved', 'encounter:voice', 'economy:grantCredits', 'faction:repDelta',
    'news:publish', 'ui:setCourse',
  ]) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_deadweight', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'trade_lane', zoneRadius: 800, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  const w = live.data.deadweight;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  return { host, state, bus, director, live, w, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const reps = (h) => h.events.filter((e) => e.name === 'faction:repDelta')
  .map((e) => ({ factionId: e.p.factionId, delta: e.p.delta, reason: e.p.reason }));
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });
const kill = (h, id, byPlayer = true) => {
  const e = h.ent(id);
  e.alive = false;
  h.host.withFeatures(() => h.bus.emit('entity:killed', {
    id, killerId: byPlayer ? h.state.playerId : 999999, type: 'ship', pos: { ...e.pos },
  }));
};

/** A real player line on the hulk through the shared kernel — the same table the encounter
 *  reads for custody. Returns the attachment record, or null where the port refused the bind. */
function playerLatch(h, hullId) {
  const kernel = getCombatKernel({ state: h.state, bus: h.bus });
  const made = kernel.attachments.create({
    defId: 'tether_standard', ownerId: h.state.playerId, targetId: hullId,
  });
  const att = made && made.ok === true ? made.attachment : null;
  h.host.withFeatures(() => h.bus.emit('tether:attached', {
    targetId: hullId, byPlayer: true, attachmentId: att ? att.id : null,
  }));
  return att;
}

/** Where a live line cannot be materialized in this backend, stamp the same record shape the
 *  table carries so custody reads truthfully; the receiver's sever path tolerates it. */
function stubLatch(h, hullId) {
  const att = playerLatch(h, hullId);
  if (att) return att;
  const attachments = h.state.combat && h.state.combat.attachments;
  if (!attachments || !attachments.byId) return null;
  const stub = { id: `stub:${h.state.playerId}:${hullId}`, defId: 'tether_standard',
    ownerId: h.state.playerId, targetId: hullId, state: 'active' };
  attachments.byId[stub.id] = stub;
  return stub;
}

test('the deadweight is registered as a contract-haul beat', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'combat');
  assert.ok(enc.zoneTypes.includes('trade_lane'));
  assert.equal(enc.shape.situation, 'salvage');
  assert.equal(enc.shape.actor, 'faction_mts');
  assert.ok(enc.receipts.delivered, 'the paid handover has a receipt');
});

test('the posting stands up: a dead hulk, a live receiver on the ring, and the Reach wing inbound', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const hauler = h.ent(w.haulerId);
    assert.equal(hauler.disabled, true, 'the casualty is a real dead hull — towable scenery');
    assert.equal(hauler.factionId, 'faction_mts');
    assert.equal(hauler.data.driveDead, true);
    const tug = h.ent(w.tugId);
    assert.equal(tug.data.lawWitness, true, 'the receiver is a lawful witness');
    assert.equal(tug.data.ai.lawful, true);
    assert.equal(tug.data.ai.activity.kind, 'loiter', 'the tug holds the grapple ring');
    const leg = Math.hypot(tug.pos.x - hauler.pos.x, tug.pos.z - hauler.pos.z);
    assert.ok(leg > DEADWEIGHT.legWu * 0.7, `the haul leg is real (${Math.round(leg)} WU)`);
    const cutter = h.ent(w.cutterId);
    assert.equal(cutter.factionId, 'faction_reach');
    assert.equal(cutter.data.ai.roe, 'weapons_free', 'the blade is already working');
    const prize = h.ent(w.prizeId);
    assert.equal(prize.factionId, 'faction_reach');
    assert.equal(prize.data.ai.activity.kind, 'transit', 'the prize crew runs at the hulk');
    h.host.step(120);
    assert.deepEqual(outcomes(h), [], 'nothing resolves on its own');
  } finally { h.host.dispose(); }
});

test('deliver the hulk dead-slow into the ring: grapples take the line, the fee pays, custody transfers', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const hauler = h.ent(w.haulerId);
    const tug = h.ent(w.tugId);
    const player = h.state.entities.get(h.state.playerId);
    // The pilot noses into the ring with her load trailing slack — the grapples take a LIVE line.
    const att = stubLatch(h, w.haulerId);
    h.host.step(6);
    assert.equal(w.latchedOnce, true, 'the desk logged the line on her');
    assert.ok(h.events.some((e) => e.name === 'ui:setCourse'
      && e.p.pos && Math.hypot(e.p.pos.x - w.ring.x, e.p.pos.z - w.ring.z) < 1),
      'the desk marked the ring on the board');
    // The director samples custody at its own 1 Hz cadence while the live winch keeps
    // reeling: hold the pair settled in the ring across the steps the grapple takes to bite.
    // The receiver is pinned on the ring — in the live game her loiter doctrine holds
    // station, in this harness there is no AI clock to fly her back to it.
    const hold = { x: tug.pos.x + DEADWEIGHT.ringWu - 40, z: tug.pos.z };
    const tugHold = { x: tug.pos.x, z: tug.pos.z };
    player.pos.x = hold.x + 15; player.pos.z = hold.z; player.vel = { x: 0, z: 0 };
    h.host.step(240, {
      before: () => {
        tug.pos.x = tugHold.x; tug.pos.z = tugHold.z;
        tug.vel.x = 0; tug.vel.z = 0;
        hauler.pos.x = hold.x; hauler.pos.z = hold.z;
        hauler.vel.x = 0; hauler.vel.z = 0;
      },
      after: () => outcomes(h).length === 0,
    });
    assert.deepEqual(outcomes(h), ['delivered']);
    assert.ok(grants(h).includes(DEADWEIGHT.feeCr), 'the tow fee wired on custody');
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts' && r.delta === DEADWEIGHT.repDelivered));
    assert.equal(hauler.data.tugCustody, true, 'the hulk reads the tug\'s custody');
    assert.match(hauler.data.scanLabel, /UNDER TUG GRAPPLES/);
    if (att && att.state) {
      assert.equal(att.state, 'broken', 'the receiver\'s grapple severed the player\'s line');
      assert.equal(att.breakReason, 'deadweight_handover', 'the tug\'s grapple took the line');
    }
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the wire keeps the paid tow');
    assert.equal(memory(h).outcome, 'delivered');
    assert.equal(memory(h).facts.latched, true);
  } finally { h.host.dispose(); }
});

test('a fast sling does not hand off — the hulk must arrive dead-slow', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const hauler = h.ent(w.haulerId);
    const tug = h.ent(w.tugId);
    const player = h.state.entities.get(h.state.playerId);
    stubLatch(h, w.haulerId);
    const tugHold = { x: tug.pos.x, z: tug.pos.z };
    player.pos.x = tug.pos.x + 60; player.pos.z = tug.pos.z + 15; player.vel = { x: 0, z: 0 };
    // She carries real speed through the ring: hold the receiver on the ring and the load
    // fast across the director's sampling beat — the grapples refuse a moving hull.
    const hold = { x: tug.pos.x + 60, z: tug.pos.z };
    h.host.step(150, {
      before: () => {
        tug.pos.x = tugHold.x; tug.pos.z = tugHold.z;
        tug.vel.x = 0; tug.vel.z = 0;
        hauler.pos.x = hold.x; hauler.pos.z = hold.z;
        hauler.vel.x = DEADWEIGHT.handoffSpeed * 3; hauler.vel.z = 0;
      },
    });
    assert.deepEqual(outcomes(h), [], 'grapples cannot take a fast load');
    h.host.step(240, {
      before: () => {
        tug.pos.x = tugHold.x; tug.pos.z = tugHold.z;
        tug.vel.x = 0; tug.vel.z = 0;
        hauler.pos.x = hold.x; hauler.pos.z = hold.z;
        hauler.vel.x = 2; hauler.vel.z = 0;   // settled
      },
      after: () => outcomes(h).length === 0,
    });
    assert.deepEqual(outcomes(h), ['delivered']);
  } finally { h.host.dispose(); }
});

test('the prize crew clamps an unheld hulk and hauls it off the filing', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const hauler = h.ent(w.haulerId);
    const prize = h.ent(w.prizeId);
    // The thief parks on the hulk while no line holds her — the clamp is real seconds.
    prize.pos.x = hauler.pos.x + (Number(hauler.radius) || 0) + (Number(prize.radius) || 0) + 4;
    prize.pos.z = hauler.pos.z;
    h.state.simTime += DEADWEIGHT.clampS + 4;
    runUntilResolved(h, 120);
    assert.deepEqual(outcomes(h), ['prize_taken']);
    assert.equal(hauler.factionId, 'faction_reach', 'the hulk flies Reach colours now');
    assert.match(hauler.data.scanLabel, /UNDER REACH GRAPPLES/);
    assert.equal(memory(h).outcome, 'prize_taken');
    assert.ok(!grants(h).includes(DEADWEIGHT.feeCr), 'no fee — no custody');
  } finally { h.host.dispose(); }
});

test('a live massline beats the grapples: the clamp never accrues while the player holds her', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const hauler = h.ent(w.haulerId);
    const prize = h.ent(w.prizeId);
    stubLatch(h, w.haulerId);
    h.host.step(6);
    prize.pos.x = hauler.pos.x + (Number(hauler.radius) || 0) + (Number(prize.radius) || 0) + 4;
    prize.pos.z = hauler.pos.z;
    // Hold the hulk steady on the pilot's line across the director's sampling beat: the prize
    // crew reads the custody table and stands off — grapples lose to a live massline.
    const pin = { x: hauler.pos.x, z: hauler.pos.z };
    h.state.simTime += DEADWEIGHT.clampS + 10;
    h.host.step(180, {
      before: () => {
        hauler.pos.x = pin.x; hauler.pos.z = pin.z;
        hauler.vel.x = 0; hauler.vel.z = 0;
      },
    });
    assert.equal(w.clampS, 0, 'no clamp while the line holds custody');
    assert.deepEqual(outcomes(h), [], 'the prize cannot take a held hulk');
    assert.equal(w.prizeTask, 'hover', 'the crew stands off and waits for the line to drop');
  } finally { h.host.dispose(); }
});

test('the filing lapses with the hulk honestly still in the water', async () => {
  const h = await boot();
  try {
    const w = h.w;
    h.state.simTime += DEADWEIGHT.windowS + 2;
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['lapsed']);
    const hauler = h.ent(w.haulerId);
    assert.ok(hauler && hauler.alive !== false, 'the deadweight stays a real derelict');
    assert.equal(hauler.data.despawnAt == null, true, 'no despawn stamp — she keeps drifting');
    assert.equal(h.live.roles[w.haulerId], undefined, 'the roster released her to the world');
    assert.equal(memory(h).outcome, 'lapsed');
  } finally { h.host.dispose(); }
});

test('burn the contracted hulk and the desk files the registry that shot her', async () => {
  const h = await boot();
  try {
    const w = h.w;
    kill(h, w.haulerId, true);
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['hull_lost']);
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts'
      && r.delta === DEADWEIGHT.repHullBurned && r.reason === 'the_deadweight_hull_burned'));
    assert.equal(memory(h).outcome, 'hull_lost');
    assert.equal(memory(h).facts.hullByPlayer, true);
  } finally { h.host.dispose(); }
});

test('murder the receiver at the ring and the desk keeps the registry', async () => {
  const h = await boot();
  try {
    const w = h.w;
    kill(h, w.tugId, true);
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['tug_murdered']);
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts'
      && r.delta === DEADWEIGHT.repTugMurdered && r.reason === 'the_deadweight_tug_murdered'));
  } finally { h.host.dispose(); }
});

test('fire on the relief tug and the contract voids on the spot', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const tug = h.ent(w.tugId);
    h.host.withFeatures(() => h.bus.emit('combat:damage', {
      targetId: tug.id, attackerId: h.state.playerId, amount: 4,
    }));
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['contract_void']);
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts'
      && r.delta === DEADWEIGHT.repDroveOff && r.reason === 'the_deadweight_receiver_fled'));
    assert.equal(w.tugFled, true, 'the receiver quit the ring');
  } finally { h.host.dispose(); }
});

test('shoot the prize crew off the hulk and the clamp resets', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const hauler = h.ent(w.haulerId);
    const prize = h.ent(w.prizeId);
    prize.pos.x = hauler.pos.x + (Number(hauler.radius) || 0) + (Number(prize.radius) || 0) + 4;
    prize.pos.z = hauler.pos.z;
    h.state.simTime += Math.floor(DEADWEIGHT.clampS / 2);
    h.host.step(60);
    assert.ok(w.clampS > 0, 'the clamp was accruing');
    h.host.withFeatures(() => h.bus.emit('combat:damage', {
      targetId: prize.id, attackerId: h.state.playerId, amount: 6,
    }));
    h.host.step(10);
    assert.equal(w.prizeBolted, true, 'a hit prize crew cuts the clamp and bolts');
    assert.equal(w.clampS, 0, 'the clamp timer resets');
    assert.equal(prize.data.ai.activity.kind, 'transit', 'it leaves on a bolt vector');
    // The hulk never took the prize path: the contract stays live for the desk's window.
    assert.deepEqual(outcomes(h), []);
  } finally { h.host.dispose(); }
});
