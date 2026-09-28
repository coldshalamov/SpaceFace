import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';

const SECTOR = 'sector_pallas_drift';
const ANCHOR = Object.freeze({ x: 9000, z: 9000 });

function makeHarness(opts = {}) {
  const sim = createSimulation({
    seed: opts.seed || 43,
    systems: [spawnBudget, encounterDirector],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: opts.playerPos || { x: ANCHOR.x + 500, z: ANCHOR.z + 500 },
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('comms:log', (p) => events.push({ name: 'comms', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  return { sim, state, bus, player, events };
}

function fireHandoff(sim) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'off_book_handoff',
    encounterId: 'test_handoff_1',
    sectorId: SECTOR,
    anchor: { ...ANCHOR },
    zoneType: 'outlaw_zone',
    zoneRadius: 500,
    force: true,
  });
}

function castOf(state, live, role) {
  return live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === role);
}

function liveOf(state) {
  return Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'off_book_handoff');
}

function podsOf(state, live) {
  const ids = new Set(live.data.pods || []);
  return (state.entityList || []).filter((e) => e && ids.has(e.id));
}

test('off_book_handoff is a registered authored shape in the hollow pockets', () => {
  const enc = ENCOUNTERS.off_book_handoff;
  assert.ok(enc, 'shape must be in the shipped catalog');
  assert.equal(enc.deck, 'civilian', 'the deal spends civilian pressure, not combat budget');
  assert.equal(enc.shape.situation, 'trade');
  assert.ok(enc.zoneTypes.includes('outlaw_zone') && enc.zoneTypes.includes('derelict_field'));
  assert.ok(enc.gates.maxSecurity <= 0.75, 'lawless pockets only');
});

test('the pairing: Quiet seller and MTS buyer nose-to-nose, contraband mid-line', () => {
  const { sim, state } = makeHarness();
  const res = fireHandoff(sim);
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  const live = liveOf(state);
  assert.ok(live);

  const seller = castOf(state, live, 'hauler')[0];
  const buyer = castOf(state, live, 'raider')[0];
  assert.ok(seller && buyer, 'both parties spawned');
  assert.equal(seller.factionId, 'faction_quiet', 'the seller is Quiet');
  assert.equal(buyer.factionId, 'faction_mts', 'the buyer is MTS — the pairing that should not be');

  const gap = Math.hypot(buyer.pos.x - seller.pos.x, buyer.pos.z - seller.pos.z);
  assert.ok(gap < 80 && gap > 40, `nose-to-nose (gap=${gap.toFixed(0)})`);
  for (const ship of [seller, buyer]) {
    assert.equal(ship.data.ai.activity?.kind, 'loiter', 'parked for the deal');
    assert.equal(ship.data.ai.roe, 'hold_fire');
    assert.equal(ship.vel.x + ship.vel.z, 0, 'stationary');
  }

  const pods = podsOf(state, live);
  assert.equal(pods.length, 4, 'four pods crawl the gap');
  const commodities = new Set(pods.map((p) => p.data.commodityId));
  assert.ok(commodities.has('cmdty_stolen_goods') && commodities.has('cmdty_narcotics'),
    'contraband manifests, not ore');
  for (const p of pods) {
    assert.equal(p.data.payloadType, JETTISONED_CARGO_PAYLOAD_TYPE);
    assert.equal(p.data.ownerId, seller.id, 'the manifest is still the seller\u2019s');
    // Strung between the two bows, drifting toward the buyer.
    const vx = buyer.pos.x - seller.pos.x, vz = buyer.pos.z - seller.pos.z;
    const vl = Math.hypot(vx, vz) || 1;
    const al = (p.pos.x - seller.pos.x) * (vx / vl) + (p.pos.z - seller.pos.z) * (vz / vl);
    assert.ok(al > 5 && al < vl - 5, 'the pod is on the line between them');
    const drift = p.vel.x * (vx / vl) + p.vel.z * (vz / vl);
    assert.ok(drift > 0, 'the pod drifts toward the buyer');
  }
});

test('pods that reach the buyer are restamped paid and park', () => {
  const { sim, state } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const buyer = castOf(state, live, 'raider')[0];
  const pod = podsOf(state, live)[0];
  // Deliver it the physical way: parked at the buyer's hull.
  pod.pos.x = buyer.pos.x + 10;
  pod.pos.z = buyer.pos.z;
  sim.runTicks(90);
  assert.equal(pod.data.deliveredBy, live.id, 'the pod is marked received');
  assert.equal(pod.data.ownerId, buyer.id, 'paid freight belongs to the buyer');
  assert.equal(pod.data.ownerName, 'BOUGHT — OFF-BOOK MANIFEST');
  assert.equal(live.data.delivered, 1);
  assert.equal(live.outcome, null, 'a partial transfer does not end the deal');
});

test('take_taken: scooping a pod mid-line is a robbery — crews scatter, Quiet remembers', () => {
  const { sim, state, bus, events } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const pods = podsOf(state, live);
  // The player's hold takes a pod — it leaves the world without ever delivering.
  pods[0].alive = false; // collected removes it; mark + remove from list
  const list = state.entityList;
  list.splice(list.indexOf(pods[0]), 1);
  sim.runTicks(90);
  assert.equal(live.outcome, 'take_taken');
  assert.ok(events.some((e) => e.name === 'repDelta'
    && e.payload.factionId === 'faction_quiet' && e.payload.delta < 0), 'robbery costs Quiet rep');
  for (const ship of [...castOf(state, live, 'hauler'), ...castOf(state, live, 'raider')]) {
    assert.ok(!ship.data?.encounter?.despawnAt, 'scattered crews release unstamped');
  }
});

test('contact_made: standing inside the ring unarmed buys a Quiet contact', () => {
  const { sim, state, player, events } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const seller = castOf(state, live, 'hauler')[0];
  player.pos.x = seller.pos.x + 100;
  player.pos.z = seller.pos.z;
  sim.runTicks(60 * 8);
  assert.equal(live.outcome, 'contact_made');
  assert.ok(events.some((e) => e.name === 'repDelta'
    && e.payload.factionId === 'faction_quiet' && e.payload.delta > 0), 'a Quiet contact pays rep');
  assert.ok(events.some((e) => e.name === 'grant' && e.payload.reason === 'handoff:quiet_lay'),
    'a cut for the careful');
});

test('deal_burned: a dead party ends the deal, the survivor runs', () => {
  const { sim, state, bus } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const buyer = castOf(state, live, 'raider')[0];
  const seller = castOf(state, live, 'hauler')[0];
  bus.emit('entity:killed', { id: buyer.id, killerId: state.playerId, pos: buyer.pos });
  buyer.alive = false;
  sim.runTicks(90);
  assert.equal(live.outcome, 'deal_burned');
  assert.equal(seller.data.ai.forceFlee, true, 'the seller scatters with the record');
});

test('deal_done: every pod delivered ends the deal quietly', () => {
  const { sim, state } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const buyer = castOf(state, live, 'raider')[0];
  for (const pod of podsOf(state, live)) {
    pod.pos.x = buyer.pos.x + 8;
    pod.pos.z = buyer.pos.z;
  }
  sim.runTicks(90);
  assert.equal(live.outcome, 'deal_done');
  assert.equal(live.data.delivered, 4, 'all four pods transferred');
});
