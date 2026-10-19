// CR situation 1206 — THE FIRE SALE. An MTS line hauler is mid-lane when its manifest dies:
// the receiving berth's board glutted on the commodity while it burned in. The glut is real —
// the encounter reads the berth's live market for a consume-role good and injects the actual
// `boom` market event through the economy owner's own mission:forceEvent route, so docking there
// shows the price the hail claimed.
//
// The verb under test is the missing one: buying a physical cargo lot off a hull in space —
// cash on the wire, custody pod kicked out, the player's margin is the real market spread.
// Haggling costs standing; shooting costs the hull and marks the freight.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { factions } from '../src/systems/factions.js';
import { combat } from '../src/systems/combat.js';
import { lootShards } from '../src/systems/lootShards.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { FIRE_SALE } from '../src/data/encounters/1206-the-fire-sale.js';
import { SECTORS } from '../src/data/sectors.js';
import { COMMODITIES } from '../src/data/commodities.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SEED = 4242;
const SECTOR = 'sector_tethys_junction';
const ANCHOR = Object.freeze({ x: 900, z: 2200 });
const SHAPE = 'the_fire_sale';

function sectorStations(sectorId) {
  const sec = SECTORS.find((s) => s.id === sectorId);
  return (sec && sec.stations || []).map((st, i) => ({
    ...st, pos: { x: 400 + i * 420, z: -1500 },
  }));
}

async function boot(extraSystems = []) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, economy, cargo, factions, lootShards, 'collisionConsequences', 'physics', combat, ...extraSystems],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x + 120, z: ANCHOR.z - 120 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  state.world.activeSector = {
    stations: sectorStations(SECTOR), fields: [], hazards: [], pois: [], gates: [],
  };
  state.player.credits = 5000;
  const events = [];
  for (const name of [
    'encounter:resolved', 'encounter:voice', 'encounter:choiceOffered',
    'economy:eventStarted', 'economy:chargeCredits', 'economy:grantCredits',
    'faction:repDelta', 'news:publish', 'pickup:collected', 'credits:changed',
  ]) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_fire_sale', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'trade_lane', zoneRadius: 700, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  assert.ok(live, 'the fire sale went live');
  const w = live.data.fireSale;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  return { host, state, bus, director, live, w, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const charges = (h) => h.events.filter((e) => e.name === 'economy:chargeCredits').map((e) => e.p.amount);
const reps = (h) => h.events.filter((e) => e.name === 'faction:repDelta').map((e) => ({ factionId: e.p.factionId, delta: e.p.delta, reason: e.p.reason }));
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });
const choose = (h, id) => h.host.withFeatures(() => h.bus.emit('encounter:choose', { encounterId: h.live.id, choiceId: id }));

/** Fly the player onto the pod by teleport — the physics pickup sweep does the real collection. */
function standOnPod(h) {
  const pod = h.ent(h.w.podId);
  const player = h.ent(h.state.playerId);
  assert.ok(pod && pod.alive !== false, 'pod is still on the field');
  player.pos.x = pod.pos.x;
  player.pos.z = pod.pos.z;
  player.vel.x = 0; player.vel.z = 0;
}

test('the fire sale is registered on the MTS lanes as a civilian minor', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'civilian');
  assert.deepEqual([...enc.zoneTypes], ['trade_lane']);
  assert.deepEqual([...enc.gates.sectorIds], ['sector_tethys_junction', 'sector_helios_prime']);
  assert.equal(enc.shape.situation, 'trade');
  assert.equal(enc.shape.actor, 'faction_mts');
});

test('one look: a held hauler, a real lot priced off the board, and the glut on the market itself', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const hauler = h.ent(w.haulerId);
    assert.ok(hauler && hauler.alive !== false, 'the hauler is a live body');
    assert.equal(hauler.factionId, 'faction_mts');
    assert.equal(hauler.data.ai.passive, true, 'a selling hull holds, it does not pick fights');
    assert.equal(h.live.phase, 'offer');

    // The berth is a real station in this sector and the commodity is one its market consumes.
    const stationIds = sectorStations(SECTOR).map((s) => s.id);
    assert.ok(stationIds.includes(w.stationId), `story berth ${w.stationId} is a real station in ${SECTOR}`);
    const def = CMDTY_BY_ID.get(w.commodityId);
    assert.ok(def && def.legality === 'legal', 'the lot is a legal trade good');
    const market = h.state.economy.markets[w.stationId];
    assert.ok(market && market[w.commodityId], 'the named berth really lists the commodity');
    assert.equal(market[w.commodityId].role, 'consume', 'the story picks a good the berth actually buys');

    // The deal is priced under the healthy mid — the spread is the player's margin.
    assert.ok(w.qty >= FIRE_SALE.qtyMin && w.qty <= FIRE_SALE.qtyMax);
    assert.ok(w.ask > 0 && w.ask < Math.round(w.qty * def.basePrice), `ask ${w.ask} under catalog ${w.qty * def.basePrice}`);
    assert.ok(w.squeezeAsk < w.ask, 'the beaten-down figure is lower than the ask');

    // The cause is on the market: a real boom event landed on the berth's board for this good,
    // unless the board already showed the surplus.
    const glut = w.gluttedAlready
      || h.state.economy.econEvents.some((e) => e.stationId === w.stationId && e.commodityId === w.commodityId && e.type === 'boom');
    assert.ok(glut, 'the voided manifest is a real market event');
    assert.ok(h.events.some((e) => e.name === 'encounter:choiceOffered'
      && e.p.options.some((o) => o.id === 'buy' && o.available === true)), 'the ask is on the wire');
    assert.equal(h.live.vars.amount, w.ask, 'the credit gate is the ask');
  } finally { h.host.dispose(); }
});

test('wire the ask: credits move through the sole writer, the pod kicks out paid, scooping settles', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const before = h.state.player.credits;
    choose(h, 'buy');
    h.host.step(6);
    assert.deepEqual(charges(h), [w.ask], 'the exact ask left the wallet once');
    assert.equal(h.state.player.credits, before - w.ask);
    assert.equal(h.live.phase, 'lot_out');
    const pod = h.ent(w.podId);
    assert.ok(pod && pod.alive !== false, 'the custody pod is a real body');
    assert.equal(pod.type, 'pickup');
    assert.equal(pod.data.commodityId, w.commodityId);
    assert.equal(pod.data.amount, w.qty);
    assert.match(pod.data.freightCustodyPod.ownerName, /PAID LOT/, 'custody reads paid, not stolen');
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts' && r.delta === FIRE_SALE.repBuy), 'a straight wire is remembered');
    assert.deepEqual(outcomes(h), [], 'nothing settles until the freight moves');

    standOnPod(h);
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['bought']);
    assert.ok(h.state.player.cargo.items[w.commodityId] > 0, 'the lot is in the hold');
    assert.equal(memory(h).outcome, 'bought');
    assert.equal(memory(h).facts.paidCr, w.ask);
    assert.equal(memory(h).facts.stationId, w.stationId);
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the wire keeps the sale');
  } finally { h.host.dispose(); }
});

test('beat the price down: cheaper wire, the desk files a squeeze', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const before = h.state.player.credits;
    choose(h, 'squeeze');
    h.host.step(6);
    assert.deepEqual(charges(h), [w.squeezeAsk], 'the squeezed figure moved, not the ask');
    assert.equal(h.state.player.credits, before - w.squeezeAsk);
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts' && r.delta === FIRE_SALE.repSqueeze), 'the desk remembers the squeeze');
    const pod = h.ent(w.podId);
    assert.ok(pod && pod.alive !== false);
    standOnPod(h);
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['squeezed']);
    assert.equal(memory(h).facts.paidCr, w.squeezeAsk);
  } finally { h.host.dispose(); }
});

test('pass on the wire: the hauler burns home with the lot and no credits move', async () => {
  const h = await boot();
  try {
    const before = h.state.player.credits;
    choose(h, 'pass');
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['hauled_off']);
    assert.equal(h.state.player.credits, before, 'no wire, no charge');
    assert.deepEqual(charges(h), []);
    assert.equal(h.w.podId, null, 'the lot never left the hauler');
    assert.equal(h.w.haulerFled, true, 'the hauler transits home with the dead manifest');
  } finally { h.host.dispose(); }
});

test('the wire going quiet at the deadline is the same as a pass', async () => {
  const h = await boot();
  try {
    h.state.simTime += FIRE_SALE.offerS + 1;
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['hauled_off']);
    assert.deepEqual(charges(h), []);
  } finally { h.host.dispose(); }
});

test('kill the seller: the lot drifts out marked and the Syndicate files it', async () => {
  const h = await boot();
  try {
    const hauler = h.ent(h.w.haulerId);
    hauler.alive = false;
    h.host.withFeatures(() => h.bus.emit('entity:killed', { id: hauler.id, killerId: h.state.playerId, type: 'ship', pos: { ...hauler.pos } }));
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['robbed']);
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts' && r.delta === FIRE_SALE.repRob), 'the kill is filed');
    const pod = h.ent(h.w.podId);
    assert.ok(pod && pod.alive !== false, 'the lot is physically there, marked');
    assert.match(pod.data.freightCustodyPod.ownerName, /VOID-MANIFEST/, 'custody reads stolen');
    assert.deepEqual(charges(h), [], 'robbery moves no credits');
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the lane keeps the story');
  } finally { h.host.dispose(); }
});

test('shoot the seller without killing it: the lot kicks loose marked and the hull runs', async () => {
  const h = await boot();
  try {
    const hauler = h.ent(h.w.haulerId);
    h.host.withFeatures(() => h.bus.emit('combat:damage', { attackerId: h.state.playerId, targetId: hauler.id, applied: 40 }));
    h.host.step(4);
    assert.equal(h.w.haulerShot, true);
    const pod = h.ent(h.w.podId);
    assert.ok(pod && pod.alive !== false, 'the lot was kicked loose to run light');
    assert.match(pod.data.freightCustodyPod.ownerName, /VOID-MANIFEST/);
    assert.equal(h.w.haulerFled, true, 'the hauler burns off the lane');
    assert.equal(h.live.phase, 'lot_out', 'the pod, not the clock, now decides the ending');
    standOnPod(h);
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['robbed'], 'walking off marked freight reads as robbery');
  } finally { h.host.dispose(); }
});

test('ordinary director roll: the seed-4242 planner books it on its gated lanes and nowhere else', async () => {
  const { planEncounters } = await import('../src/systems/encounterDirector.js');
  const { zonesForSector } = await import('../src/data/sectorZones.js');
  const enc = ENCOUNTERS[SHAPE];
  for (const sectorId of enc.gates.sectorIds) {
    const zones = zonesForSector(sectorId);
    const byId = new Map(zones.map((z) => [z.id, z]));
    let booked = null;
    for (let day = 0; day < 365 && !booked; day++) {
      booked = planEncounters(SEED, sectorId, day, zones).find((item) => item.shapeId === SHAPE) || null;
    }
    assert.ok(booked, `${sectorId}: planner never books it in 365 days`);
    const zone = byId.get(booked.zoneId);
    assert.ok(zone && enc.zoneTypes.includes(zone.type), `${sectorId}: booked on ${booked.zoneId} (${zone && zone.type})`);
  }
  for (const other of ['sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach']) {
    for (let day = 0; day < 120; day++) {
      const off = planEncounters(SEED, other, day, zonesForSector(other))
        .find((item) => item.shapeId === SHAPE);
      assert.ok(!off, `${other}: booked outside its gates on day ${day}`);
    }
  }
});
