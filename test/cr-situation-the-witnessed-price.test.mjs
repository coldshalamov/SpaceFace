// CR situation 1207 — THE WITNESSED PRICE (Helios Prime law beat). A Reach mark vents an MTS
// hauler on the freight spine under a customs cutter's eyes; the dead line posts a field price
// on the killer's hull and any registry that drops it collects. The missing mirror of the law:
// NPC-on-NPC murder finally answers with a claimable bounty instead of silence.
//
// Everything routes through live owners: the mark is a real zone_hostile hull (lawSecurity
// adjudicates the player's kill as lawful bounty work — no charge), the estate pods are real
// owner-stamped jettisoned freight (the stolen-cargo path prices a witnessed grab itself where
// a jurisdiction reaches), the cutter is a lawful witness marker, and credits/rep/news ride the
// director's intents. The world remembers the outcome through the durable situation ledger.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { lootShards } from '../src/systems/lootShards.js';
import { combat } from '../src/systems/combat.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { WITNESSED_PRICE } from '../src/data/encounters/1207-the-witnessed-price.js';

const SEED = 4242;
const SECTOR = 'sector_helios_prime';
const ANCHOR = Object.freeze({ x: 9000, z: -4000 });
const SHAPE = 'the_witnessed_price';

async function boot(extraSystems = []) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, lawSecurity, encounterDirector, lootShards, 'collisionConsequences', 'physics', combat, ...extraSystems],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x + 180, z: ANCHOR.z + 180 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of [
    'encounter:resolved', 'encounter:telegraph', 'encounter:voice',
    'economy:grantCredits', 'faction:repDelta', 'news:publish', 'law:killedAdjudicated',
  ]) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_witnessed_price', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'trade_lane', zoneRadius: 800, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  const w = live.data.witnessedPrice;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  return { host, state, bus, director, live, w, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const reps = (h) => h.events.filter((e) => e.name === 'faction:repDelta').map((e) => ({ factionId: e.p.factionId, delta: e.p.delta, reason: e.p.reason }));
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });
const kill = (h, id, byPlayer = true) => {
  const e = h.ent(id);
  e.alive = false;
  h.host.withFeatures(() => h.bus.emit('entity:killed', {
    id, killerId: byPlayer ? h.state.playerId : 999999, type: 'ship', pos: { ...e.pos },
  }));
};

test('the witnessed price is registered as a Helios freight-lane combat beat', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'combat');
  assert.deepEqual([...enc.zoneTypes], ['trade_lane', 'patrol_corridor']);
  assert.deepEqual([...enc.gates.sectorIds], [SECTOR]);
  assert.equal(enc.shape.situation, 'hunt');
});

test('one look: the dead hauler, estate freight, the marked hull holding its loot, a lawful witness', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const wreck = h.ent(w.wreckId);
    assert.equal(wreck.type, 'wreck');
    assert.equal(wreck.data.scanLabel, 'MTS HAULER GALLANT LINE — VENTED MINUTES AGO');
    assert.equal(wreck.factionId, 'faction_mts');

    // The estate's freight is real owner-stamped jettisoned cargo — the stolen-cargo law path
    // reads it the same as a pod dumped off any civilian hull.
    assert.equal(w.podIds.length, WITNESSED_PRICE.podCount);
    for (const id of w.podIds) {
      const pod = h.ent(id);
      assert.equal(pod.data.ownerId, 'victim:mts_gallant_line', 'estate-stamped ownership');
      assert.equal(pod.data.factionId, 'faction_mts');
      assert.equal(pod.data.jettisonedCargo, true, 'the stolen-cargo law path reads these');
      assert.equal(pod.data.scanLabel, 'GALLANT LINE FREIGHT — ESTATE MANIFEST');
    }

    const mark = h.ent(w.markId);
    assert.equal(mark.factionId, 'faction_reach');
    assert.equal(mark.data.wantedTier, 'bounty', 'the scanner paints the posted hull');
    assert.equal(mark.data.scanLabel, 'MARKED KILLER — FIELD PRICE POSTED');
    assert.equal(mark.data.ai.passive, false, 'a lawful hostile — killing it is bounty work');
    assert.equal(mark.data.ai.activity.kind, 'loiter', 'circling the corpse, guns cold');
    assert.equal(mark.data.ai.roe, 'hold_fire');

    const witness = h.ent(w.witnessId);
    assert.equal(witness.factionId, 'faction_scn');
    assert.equal(witness.data.ai.lawful, true, 'the desk\'s eyes are real lawful witness');
    assert.equal(witness.data.lawWitness, true);
    assert.equal(witness.data.ai.passive, true, 'a cutter holds the picture; it does not duel');
    h.host.step(120);
    assert.deepEqual(outcomes(h), [], 'nothing resolves on its own');
  } finally { h.host.dispose(); }
});

test('drop the marked hull: the desk pays the posted price and the law clears the kill', async () => {
  const h = await boot();
  try {
    const w = h.w;
    kill(h, w.markId, true);
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['price_claimed']);
    assert.ok(grants(h).includes(WITNESSED_PRICE.postedCr), 'the posted price was wired');
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts' && r.delta === 4 && r.reason === 'the_witnessed_price_claimed'));
    assert.ok(reps(h).some((r) => r.factionId === 'faction_scn' && r.delta === 2 && r.reason === 'the_witnessed_price_lawful_work'));
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the sector keeps the claim');
    assert.equal(memory(h).outcome, 'price_claimed');
    // The real adjudication path read the same kill: a zone_hostile mark is a lawful drop,
    // witnessed by the cutter that posted the scene — no charge, no heat.
    const adjudicated = h.events.filter((e) => e.name === 'law:killedAdjudicated')
      .map((e) => e.p).find((p) => p.victimEntityId === w.markId);
    assert.ok(adjudicated, 'lawSecurity adjudicated the claim');
    assert.equal(adjudicated.outcome, 'lawful');
    assert.equal(adjudicated.clearlyHostile, true);
  } finally { h.host.dispose(); }
});

test('close aboard or touch the estate and the mark answers — the claim is a fight', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const mark = h.ent(w.markId);
    const player = h.ent(h.state.playerId);
    // Closing inside the claim ring flips the mark weapons-free through the doctrine seam.
    // The director cadence is ~1 Hz (sim-time accumulator), so step a full second+ of ticks.
    player.pos.x = mark.pos.x + 60;
    player.pos.z = mark.pos.z;
    h.host.step(90);
    assert.equal(h.w.hotAt != null, true, 'the mark read the claim run');
    assert.equal(mark.data.ai.activity.kind, 'attack_run');
    assert.equal(mark.data.ai.roe, 'weapons_free');
    const wing = h.ent(w.wingIds[0]);
    assert.equal(wing.data.ai.activity.kind, 'attack_run', 'the wing fights for its mark');
    assert.deepEqual(outcomes(h), [], 'going hot does not settle anything');
  } finally { h.host.dispose(); }
});

test('rob the dead under the cutter\'s eyes and let the mark leave: the desk logs a scavenger', async () => {
  const h = await boot();
  try {
    const w = h.w;
    // Scoop the estate freight — pods leave the world the way collected cargo does.
    for (const id of [...w.podIds]) { const pod = h.ent(id); pod.alive = false; }
    h.host.step(90); // director cadence is ~1 Hz — give the live tick a full second of sim
    assert.equal(h.w.robbed, WITNESSED_PRICE.podCount, 'the cutter logged the empty cradles');
    assert.equal(h.w.hotAt != null, true, 'the mark answers a robbery like it answers a claim');
    // The desk's live window lapses with the estate stripped and no claim on the mark.
    h.state.simTime += WITNESSED_PRICE.windowS;
    runUntilResolved(h, 150);
    assert.deepEqual(outcomes(h), ['robbed_the_dead']);
    assert.ok(!grants(h).includes(WITNESSED_PRICE.postedCr), 'no claim was paid');
    assert.ok(reps(h).some((r) => r.factionId === 'faction_mts' && r.delta === -4 && r.reason === 'the_witnessed_price_robbed_estate'));
    assert.equal(memory(h).outcome, 'robbed_the_dead');
    assert.equal(memory(h).facts.robbed, true);
  } finally { h.host.dispose(); }
});

test('do nothing and the mark finishes the strip, bolts, and the price goes cold', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const mark = h.ent(w.markId);
    const player = h.ent(h.state.playerId);
    h.state.simTime += WITNESSED_PRICE.fleeAfterS + 2;
    h.host.step(6);
    assert.equal(h.w.fleeingAt != null, true, 'the mark bolted on schedule');
    assert.equal(mark.data.ai.activity.kind, 'transit', 'the bolt is a real run, not a despawn trick');
    // Clear of the relay reach, the desk's live window is over.
    mark.pos.x = player.pos.x + WITNESSED_PRICE.egressWu + 500;
    mark.pos.z = player.pos.z;
    runUntilResolved(h, 90);
    assert.deepEqual(outcomes(h), ['went_cold']);
    assert.ok(!grants(h).includes(WITNESSED_PRICE.postedCr), 'a cold mark pays nobody');
    assert.equal(memory(h).outcome, 'went_cold');
  } finally { h.host.dispose(); }
});

test('kill the witness and still take the mark: the desk pays the price and keeps the charge', async () => {
  const h = await boot();
  try {
    const w = h.w;
    kill(h, w.witnessId, true);
    h.host.step(6);
    assert.equal(h.w.witnessDown, true);
    assert.ok(reps(h).some((r) => r.factionId === 'faction_scn' && r.delta === -6 && r.reason === 'the_witnessed_price_witness_down'));
    assert.deepEqual(outcomes(h), [], 'a dead witness ends the eyes, not the posted price');
    kill(h, w.markId, true);
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['price_claimed']);
    assert.ok(grants(h).includes(WITNESSED_PRICE.postedCr), 'the wire still pays a registry that took the shot');
    assert.equal(memory(h).facts.witnessDown, true);
  } finally { h.host.dispose(); }
});

test('ordinary director roll: the seed-4242 planner books it on the Helios freight lane and nowhere else', async () => {
  const { planEncounters } = await import('../src/systems/encounterDirector.js');
  const { zonesForSector } = await import('../src/data/sectorZones.js');
  const enc = ENCOUNTERS[SHAPE];
  const zones = zonesForSector(SECTOR);
  const byId = new Map(zones.map((z) => [z.id, z]));
  let booked = null;
  for (let day = 0; day < 365 && !booked; day++) {
    booked = planEncounters(SEED, SECTOR, day, zones).find((item) => item.shapeId === SHAPE) || null;
  }
  assert.ok(booked, 'planner never books it in 365 days of Helios');
  const zone = byId.get(booked.zoneId);
  assert.ok(zone && enc.zoneTypes.includes(zone.type), `booked on ${booked.zoneId} (${zone && zone.type})`);
  for (const other of ['sector_vesta_forge', 'sector_ceres_belt', 'sector_dione_lane']) {
    for (let day = 0; day < 120; day++) {
      const bookedElsewhere = planEncounters(SEED, other, day, zonesForSector(other))
        .find((item) => item.shapeId === SHAPE);
      assert.ok(!bookedElsewhere, `${other}: booked outside its gates on day ${day}`);
    }
  }
});
