// CR situation 1205 — THE SECOND BITE (Hyperion Cut's signature major). A claim platform's auger
// went into a hollow pocket; the platform is dead, six crew ride a real causal survivor pod on the
// real oxygen clock, the claim's ore and a volatile fuel rack drift loose, two escorts hold the
// perimeter, and a Reach scav pack lands mid-scene on the mayday bearing.
//
// The pod is owned by survivorPod — booted here as the live system — so rescue, ransom, capture,
// and expiry all resolve through the pod's own receipts, and the encounter only reads the world:
// the pod stamp, the platform's salvage pool, and the squad ledger for who killed what.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { survivorPod, CAUSAL_POD_TTL_S } from '../src/systems/survivorPod.js';
import { lootShards } from '../src/systems/lootShards.js';
import { combat } from '../src/systems/combat.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { SECOND_BITE } from '../src/data/encounters/1205-the-second-bite.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const SEED = 4242;
const SECTOR = 'sector_hyperion_cut';
const ANCHOR = Object.freeze({ x: 7000, z: -6000 });
const SHAPE = 'the_second_bite';

async function boot(extraSystems = []) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, survivorPod, encounterDirector, lootShards, 'collisionConsequences', 'physics', combat, ...extraSystems],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x + 150, z: ANCHOR.z + 150 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of [
    'encounter:resolved', 'encounter:telegraph', 'encounter:voice',
    'economy:grantCredits', 'faction:repDelta', 'news:publish',
    'survivorPod:ejected', 'survivorPod:rescued', 'survivorPod:abandoned', 'survivorPod:resolved',
  ]) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_second_bite', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'mining_belt', zoneRadius: 800, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  const w = live.data.secondBite;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  return { host, state, bus, director, live, w, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const reps = (h) => h.events.filter((e) => e.name === 'faction:repDelta').map((e) => ({ factionId: e.p.factionId, delta: e.p.delta, reason: e.p.reason }));
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });

test('the second bite is registered as Hyperion Cut\'s civilian major on the seams', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.tier, 'major');
  assert.equal(enc.deck, 'civilian');
  assert.deepEqual([...enc.zoneTypes], ['mining_belt']);
  assert.deepEqual([...enc.gates.sectorIds], [SECTOR]);
  assert.equal(enc.shape.situation, 'distress');
});

test('one look: dead platform, causal crew pod on the clock, loose claim ore, fuel rack, two escorts', async () => {
  const h = await boot();
  try {
    const w = h.w;
    const platform = h.ent(w.platformId);
    assert.equal(platform.type, 'wreck');
    assert.equal(platform.data.scanLabel, 'BITE TWO — CLAIM PLATFORM — AUGER IN THE ROCK');
    assert.ok(w.poolAtStart > 0, 'the platform carries the claim\'s pool');

    const pod = h.ent(w.podId);
    assert.ok(pod, 'the crew pod is a live body');
    assert.equal(pod.type, 'payload');
    assert.equal(pod.data.payloadType, 'survivor_pod', 'survivorPod owns it — not the encounter');
    assert.equal(pod.flags.persistent, true);
    assert.equal(pod.data.masslineTetherable, true);
    assert.ok(isAttachable(pod, h.state.playerId, h.state), 'the Massline can take the pod');
    assert.equal(pod.data.scanLabel, 'BITE TWO CREW POD — SIX SOULS — O2 LOW');
    const stamp = pod.data.survivorPodCausal;
    assert.equal(stamp.phase, 'adrift');
    assert.equal(stamp.memoryId, w.podMemoryId);
    assert.ok(stamp.expireAt - stamp.ejectedAt <= CAUSAL_POD_TTL_S, 'the oxygen clock is the pod\'s own');
    assert.ok(h.events.some((e) => e.name === 'survivorPod:ejected' && e.p.entityId === pod.id), 'the pod\'s own owner announced it');

    assert.equal(w.oreIds.length, SECOND_BITE.orePods);
    assert.equal(h.ent(w.rackId).data.commodityId, 'cmdty_fuel_cells');
    assert.equal(w.escortIds.length, 2);
    for (const id of w.escortIds) {
      const escort = h.ent(id);
      assert.equal(escort.factionId, 'faction_dmc');
      assert.equal(escort.team, 2);
      assert.equal(escort.data.ai.passive, true, 'escorts hold the perimeter, they do not fight for you');
    }
    h.host.assertBodies([platform, pod, h.ent(w.rackId), ...w.oreIds.map(h.ent), ...w.escortIds.map(h.ent)], 'second bite bodies');
    h.host.step(120);
    assert.deepEqual(outcomes(h), [], 'nothing resolves on its own');
  } finally { h.host.dispose(); }
});

test('the complication lands mid-scene: a Reach scav pack comes in on the mayday bearing', async () => {
  const h = await boot();
  try {
    h.state.simTime += SECOND_BITE.scavengerDelayS + 1;
    h.host.step(90);
    assert.equal(h.w.raiderIds.length, 3, 'the pack spawned');
    for (const id of h.w.raiderIds) {
      const raider = h.ent(id);
      assert.ok(raider && raider.alive !== false);
      assert.equal(raider.factionId, 'faction_reach');
      assert.equal(raider.team, 1);
      assert.equal(raider.data.ai.passive, false, 'the pack is hostile, not staged');
      assert.equal(raider.data.ai.activity && raider.data.ai.activity.kind, 'attack_run', 'converging on the wreck');
    }
    assert.ok(h.events.some((e) => e.name === 'encounter:voice' && /mayday bearing/.test(e.p.text)), 'the escorts call the bearing');
    assert.deepEqual(outcomes(h), [], 'the pack arriving does not settle the crew');
  } finally { h.host.dispose(); }
});

test('tow the pod into a lawful bubble: the pod\'s own machinery rescues, the claim pays', async () => {
  const h = await boot();
  try {
    const pod = h.ent(h.w.podId);
    const player = h.ent(h.state.playerId);
    // The Cut Claim Outpost bubble: a lawful DMC station in the lane.
    const station = h.host.runtime.spawn({
      type: 'station', alive: true, collides: true,
      pos: { x: pod.pos.x + 260, z: pod.pos.z }, radius: 90, mass: 1e7,
      factionId: 'faction_dmc', hull: 1, hullMax: 1, flags: {},
      data: { stationId: 'station_hyperion_claim', factionId: 'faction_dmc', size: 'S' },
    });
    assert.ok(station);
    // Player latched and inside handoff range — the real tow's terminal state.
    pod.pos.x = station.pos.x - 120;
    pod.pos.z = station.pos.z;
    player.pos.x = pod.pos.x - 20;
    player.pos.z = pod.pos.z;
    h.state.player.tether = { active: true, targetId: pod.id };

    runUntilResolved(h, 4 * 60);
    assert.equal(h.events.filter((e) => e.name === 'survivorPod:rescued').length, 1, 'survivorPod wrote the rescue');
    assert.equal(h.events.find((e) => e.name === 'survivorPod:rescued').p.reason, 'station_delivery');
    assert.deepEqual(outcomes(h), ['crew_saved']);
    assert.ok(grants(h).includes(SECOND_BITE.crewSavedPay), 'the claim desk paid');
    assert.ok(grants(h).includes(420), 'the pod\'s own salvage fee paid through the same owners');
    assert.ok(reps(h).some((r) => r.factionId === 'faction_dmc' && r.delta === 5 && r.reason === 'the_second_bite_crew_saved'));
    assert.ok(reps(h).some((r) => r.reason === 'survivorPod:rescued'), 'the pod\'s own rep path fired too');
    assert.equal(memory(h).outcome, 'crew_saved');
    assert.equal(memory(h).facts.via, 'line');
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the sector keeps the story');
  } finally { h.host.dispose(); }
});

test('fight off the pack and the scene stays open — the combat buys the tow, it is not the tow', async () => {
  const h = await boot();
  try {
    h.state.simTime += SECOND_BITE.scavengerDelayS + 1;
    h.host.step(90);
    assert.equal(h.w.raiderIds.length, 3);
    // The player guns down all three raiders.
    for (const id of h.w.raiderIds) {
      const raider = h.ent(id);
      raider.alive = false;
      h.host.withFeatures(() => h.bus.emit('entity:killed', { id, killerId: h.state.playerId, type: 'ship', pos: { ...raider.pos } }));
    }
    h.host.step(3 * 60);
    assert.equal(h.w.playerFought, true);
    assert.deepEqual(outcomes(h), [], 'killing the pack alone does not save the crew');
    // The tow still resolves through the pod's own owners.
    const pod = h.ent(h.w.podId);
    const station = h.host.runtime.spawn({
      type: 'station', alive: true, collides: true,
      pos: { x: pod.pos.x + 260, z: pod.pos.z }, radius: 90, mass: 1e7,
      factionId: 'faction_dmc', hull: 1, hullMax: 1, flags: {},
      data: { stationId: 'station_hyperion_claim', factionId: 'faction_dmc', size: 'S' },
    });
    const player = h.ent(h.state.playerId);
    pod.pos.x = station.pos.x - 120;
    pod.pos.z = station.pos.z;
    player.pos.x = pod.pos.x - 20;
    player.pos.z = pod.pos.z;
    h.state.player.tether = { active: true, targetId: pod.id };
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['crew_saved']);
    assert.equal(memory(h).facts.via, 'line');
    assert.equal(memory(h).facts.playerFought, true);
  } finally { h.host.dispose(); }
});

test('strip the platform while the crew suffocates: the claim remembers a scavenger', async () => {
  const h = await boot();
  try {
    const platform = h.ent(h.w.platformId);
    platform.data.salvagePool = {};                 // the salvage beam's own end state
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['stripped']);
    assert.ok(reps(h).some((r) => r.factionId === 'faction_dmc' && r.delta === -4));
    assert.equal(memory(h).facts.via, 'stood_off');
    assert.ok(h.events.some((e) => e.name === 'news:publish'));
    // The pod's own clock keeps running — the scene closed but the crew is still in the water.
    assert.ok(h.ent(h.w.podId).alive !== false);
  } finally { h.host.dispose(); }
});

test('fire on the claim\'s own people: the registry is logged', async () => {
  const h = await boot();
  try {
    const escort = h.ent(h.w.escortIds[0]);
    escort.alive = false;
    h.host.withFeatures(() => h.bus.emit('entity:killed', { id: escort.id, killerId: h.state.playerId, type: 'ship', pos: { ...escort.pos } }));
    runUntilResolved(h, 4 * 60);
    assert.equal(h.w.betrayed, true);
    assert.deepEqual(outcomes(h), ['betrayed']);
    assert.ok(reps(h).some((r) => r.factionId === 'faction_dmc' && r.delta === -6));
  } finally { h.host.dispose(); }
});

test('do nothing with the pack at the site: the Reach eats the claim while the pod dies', async () => {
  const h = await boot();
  try {
    h.state.simTime += SECOND_BITE.scavengerDelayS + 1;
    h.host.step(90);
    assert.equal(h.w.raiderIds.length, 3);
    // The pack closes on the wreck before the air runs out.
    const anchor = h.live.anchor;
    for (const id of h.w.raiderIds) {
      const raider = h.ent(id);
      raider.pos.x = anchor.x + 150;
      raider.pos.z = anchor.z + 90;
    }
    const pod = h.ent(h.w.podId);
    h.state.simTime = pod.data.survivorPodCausal.expireAt + 0.5;
    runUntilResolved(h, 4 * 60);
    assert.equal(h.events.filter((e) => e.name === 'survivorPod:abandoned').length, 1, 'the pod\'s clock resolved it');
    assert.deepEqual(outcomes(h), ['picked_clean']);
    assert.equal(memory(h).facts.raidersCame, true);
  } finally { h.host.dispose(); }
});

test('nobody comes and nobody answers: the pod simply runs out of air', async () => {
  const h = await boot();
  try {
    const pod = h.ent(h.w.podId);
    h.state.simTime = pod.data.survivorPodCausal.expireAt + 0.5;
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['lost_air']);
    assert.equal(h.events.filter((e) => e.name === 'survivorPod:abandoned').length, 1);
  } finally { h.host.dispose(); }
});

test('ordinary director roll: the seed-4242 planner books it on Hyperion seams and nowhere else', async () => {
  const { planEncounters } = await import('../src/systems/encounterDirector.js');
  const { zonesForSector } = await import('../src/data/sectorZones.js');
  const enc = ENCOUNTERS[SHAPE];
  const zones = zonesForSector(SECTOR);
  const byId = new Map(zones.map((z) => [z.id, z]));
  let booked = null;
  for (let day = 0; day < 365 && !booked; day++) {
    booked = planEncounters(SEED, SECTOR, day, zones).find((item) => item.shapeId === SHAPE) || null;
  }
  assert.ok(booked, 'planner never books it in 365 days of Hyperion');
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
