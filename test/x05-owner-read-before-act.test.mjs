// X-05 (row 563): read the owner before the act. A titled chip carries its cutter's name, and
// the first owned lot inside reach speaks its consequence once — anchored to the lot.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { createSimulation } from '../src/core/sim.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { mining } from '../src/systems/mining.js';
import { onboarding } from '../src/systems/onboarding.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { FIRST_USE_LINE, firstUseAttachKind } from '../src/ui/hudAttention.js';

function bargeBoot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [world, traffic, npcJobsRuntime, mining] });
  sim.state.mode = 'flight';
  sim.state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
    radius: 12, hull: 100, hullMax: 100 }).id;
  sim.registry.get('world').enterSector('sector_helios_prime');
  sim.step(1 / 60);
  const rec = sim.state.traffic.freighters.find((r) => r.role === 'ore_carrier');
  const barge = sim.state.entities.get(rec.id);
  const refinery = sim.state.entityList.find((e) => e.data?.stationId === 'station_helios');
  return { sim, rec, barge, refinery, owner: sim.registry.get('traffic') };
}

function cutChip(h, wrId) {
  // A claim chip off the starter seam, titled by the next barge pass — the body shape
  // npcMiningSource produces in production.
  const chip = {
    id: 9000 + h.sim.state.entityList.length, type: 'pickup', alive: true,
    pos: { x: h.barge.pos.x + 40, z: h.barge.pos.z }, vel: { x: 0, z: 0 }, radius: 4,
    data: {
      amount: 6, commodityId: 'cmdty_silicate',
      npcMiningSource: { fieldId: 'f_helios_starter', minerWorldRecordId: wrId },
    },
  };
  h.sim.state.entities.set(chip.id, chip);
  h.sim.state.entityList.push(chip);
  if (h.sim.state.entityIndex && Array.isArray(h.sim.state.entityIndex.pickups)) {
    h.sim.state.entityIndex.pickups.push(chip);
  }
  return chip;
}

test('X-05 a barge titling a chip stamps ownerId AND the cutter name', () => {
  const h = bargeBoot();
  const chip = cutChip(h, h.barge.data.worldRecordId);
  h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
  assert.equal(chip.data.ownerId, h.barge.data.worldRecordId,
    'title rides the cutter stable record');
  assert.equal(chip.data.ownerName,
    h.barge.name || h.barge.data.name || 'Claim crew',
    'the panel Owner: fact resolves off the freighter row');
  h.sim.dispose();
});

test('X-05 a cutter-less title falls back to Claim crew', () => {
  const h = bargeBoot();
  const chip = cutChip(h, 'wr_ghost_cutter'); // no freighter row resolves this record
  h.owner._stepHeliosOreCarrier(h.barge, h.rec, [h.refinery], h.sim.state);
  assert.equal(chip.data.ownerId, 'wr_ghost_cutter');
  assert.equal(chip.data.ownerName, 'Claim crew', 'an unresolvable cutter still names an owner');
  h.sim.dispose();
});

function onboardingRig(entities, { railActive = false } = {}) {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 };
  const state = {
    mode: 'flight', playerId: 1, simTime: 0, tick: 0, meta: { seed: 4242 }, rng: mulberry32(4242),
    player: { hints: {}, cargo: { items: {} } },
    input: { aimAngle: 0, fireGroup: 0, actions: {} },
    entities: new Map([[1, player], ...entities.map((e) => [e.id, e])]),
    entityList: [player, ...entities],
    world: { currentSectorId: 'sector_helios_prime' },
    onboarding: { active: railActive, finished: !railActive },
    settings: { gameplay: {} }, ui: {},
    missions: { active: [] },
  };
  const bus = createBus();
  const hints = [];
  bus.on('hud:firstUse', (p) => hints.push(p));
  const ob = { ...onboarding };
  ob.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } }, registry: { get: () => null } });
  return { state, bus, hints, player, ob };
}

function tickScan(h, ticks = 20) {
  for (let i = 0; i < ticks; i++) {
    h.state.tick += 1; h.state.simTime += 1 / 60;
    h.ob.update(0.25, h.state);
  }
}

test('X-05 an owned lot within 220 wu after the rail speaks once, anchored to the lot', () => {
  const pod = { id: 50, type: 'payload', alive: true, pos: { x: 180, z: 0 }, vel: { x: 0, z: 0 },
    data: { payloadType: 'jettisoned_cargo', ownerId: 'wr_miner_ves' } };
  const pod2 = { id: 51, type: 'payload', alive: true, pos: { x: 150, z: 0 }, vel: { x: 0, z: 0 },
    data: { payloadType: 'jettisoned_cargo', ownerId: 'wr_other' } };
  const h = onboardingRig([pod, pod2]);
  tickScan(h);
  const lines = h.hints.filter((e) => e.verbId === 'firstOwnedGoods');
  assert.equal(lines.length, 1, 'exactly one read');
  assert.ok(lines[0].entityId === 50 || lines[0].entityId === 51, 'anchored to an owned lot');
  assert.equal(h.state.player.hints.firstOwnedGoods, true);
  tickScan(h, 40);
  assert.equal(h.hints.filter((e) => e.verbId === 'firstOwnedGoods').length, 1, 'and never again');
});

test('X-05 the player own lot, a custody pod, and an untitled chip stay silent', () => {
  const own = { id: 60, type: 'payload', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    data: { payloadType: 'jettisoned_cargo', ownerId: 1 } }; // the player's own lot
  const custody = { id: 61, type: 'payload', alive: true, pos: { x: 110, z: 0 }, vel: { x: 0, z: 0 },
    data: { payloadType: 'jettisoned_cargo', ownerId: 'wr_hauler_9', freightCustodyPod: true } };
  const scrap = { id: 62, type: 'pickup', alive: true, pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 },
    data: { amount: 3, commodityId: 'cmdty_silicate' } };
  const h = onboardingRig([own, custody, scrap]);
  tickScan(h, 40);
  assert.equal(h.hints.filter((e) => e.verbId === 'firstOwnedGoods').length, 0);
});

test('X-05 review: only what the law files as theft speaks — never a ship, a station, free loot, a string player id, or a venue', () => {
  const ship = { id: 80, type: 'ship', alive: true, pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 }, ownerId: 777,
    data: { ownerId: 777 } }; // a launched fighter / owned hull is not a lot
  const station = { id: 81, type: 'station', alive: true, pos: { x: 70, z: 0 }, vel: { x: 0, z: 0 },
    data: { ownerId: 'faction_reach' } };
  const shard = { id: 82, type: 'pickup', alive: true, pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 },
    data: { amount: 2, commodityId: 'cmdty_silicate', ownerId: 'wr_dead_raider' } }; // free kill loot
  const prop = { id: 83, type: 'payload', alive: true, pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
    data: { payloadType: 'cut_panel', ownerId: 'wr_encounter' } }; // not a law-filed pod
  const ownStr = { id: 84, type: 'payload', alive: true, pos: { x: 95, z: 0 }, vel: { x: 0, z: 0 },
    data: { payloadType: 'jettisoned_cargo', ownerId: '1' } }; // the player's own, string id
  const h = onboardingRig([ship, station, shard, prop, ownStr]);
  tickScan(h, 40);
  assert.equal(h.hints.filter((e) => e.verbId === 'firstOwnedGoods').length, 0);

  const pod = { id: 85, type: 'payload', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    data: { payloadType: 'jettisoned_cargo', ownerId: 'wr_miner_ves' } };
  const venue = onboardingRig([pod]);
  venue.state.physicsVenueSession = true;
  tickScan(venue, 40);
  assert.equal(venue.hints.length, 0, 'a venue never spends the read');
  assert.equal(venue.state.player.hints.firstOwnedGoods == null, true);
});

test('X-05 review: a titled claim chip speaks; a New Game tick rewind does not stall the scan', () => {
  const chip = { id: 90, type: 'pickup', alive: true, pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 },
    data: { amount: 4, commodityId: 'cmdty_silicate', ownerId: 'wr_cutter',
      npcMiningSource: { fieldId: 'f_helios_starter', minerWorldRecordId: 'wr_cutter' } } };
  const h = onboardingRig([chip]);
  h.ob._ownedScanAt = 500000; // stamp left by a long prior session
  tickScan(h, 40);
  const lines = h.hints.filter((e) => e.verbId === 'firstOwnedGoods');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].entityId, 90);
});

test('X-05 review 3: a lot the law would not charge stays silent — a priced-murder manifest pod, or a lot outside every jurisdiction', () => {
  // The player's witnessed murder of the hauler already carries the crime receipt; its spilled
  // manifest is not a second theft (`_reportStolenCargoPod` double-jeopardy rule).
  const manifest = { id: 96, type: 'payload', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    data: { payloadType: 'civilian_manifest', ownerId: 4321 } };
  const priced = onboardingRig([manifest]);
  priced.state.lawSecurity = { reportedIncidents: {
    'kill:entity:4321': { accepted: true, validatedCrime: true, victimEntityId: 4321 } } };
  tickScan(priced, 40);
  assert.equal(priced.hints.filter((e) => e.verbId === 'firstOwnedGoods').length, 0,
    'the priced kill already charged the scene');
  // Control: the same pod with no crime receipt (lawful / unwitnessed kill) is a live theft door.
  const open = onboardingRig([{ ...manifest, data: { ...manifest.data } }]);
  tickScan(open, 40);
  assert.equal(open.hints.filter((e) => e.verbId === 'firstOwnedGoods').length, 1);

  // Outside Helios' starter volume with no lawful station near, the law has no jurisdiction.
  const far = { id: 97, type: 'payload', alive: true, pos: { x: 5100, z: 0 }, vel: { x: 0, z: 0 },
    data: { payloadType: 'jettisoned_cargo', ownerId: 'wr_miner_ves' } };
  const lawless = onboardingRig([far]);
  lawless.player.pos = { x: 5000, z: 0 };
  tickScan(lawless, 40);
  assert.equal(lawless.hints.filter((e) => e.verbId === 'firstOwnedGoods').length, 0,
    'no jurisdiction, no charge, no read');
  assert.equal(lawless.state.player.hints.firstOwnedGoods == null, true, 'and the line is not spent');
});

test('X-05 the rail owns the voice — no read fires while it runs', () => {
  const pod = { id: 70, type: 'payload', alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    data: { payloadType: 'jettisoned_cargo', ownerId: 'wr_miner_ves' } };
  const h = onboardingRig([pod], { railActive: true });
  tickScan(h, 40);
  assert.equal(h.hints.length, 0, 'nothing speaks during the rail');
  assert.equal(h.state.player.hints.firstOwnedGoods == null, true, 'and the key is not spent');
});

test('X-05 the read attaches as rock; the line is the approved copy', () => {
  assert.equal(firstUseAttachKind('firstOwnedGoods'), 'rock');
  assert.equal(FIRST_USE_LINE.firstOwnedGoods,
    'Someone owns that lot. Lift it in sight, you\'re wanted.');
});

// Plan tests #5/#6 — pins that the read changed no behaviour: the magnet still leaves a titled
// chip alone, a witnessed contact scoop of it is still one payload_theft, and a defender
// auto-collecting ordinary kill shards (free loot, even when stamped by the dead raider) files
// nothing — and the owner read stays silent over those shards.
function lawBoot() {
  const sim = createSimulation({ seed: 4242, systems: [lawSecurity] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.tick = 40;
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 210, z: 50 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6 });
  state.playerId = player.id;
  sim.spawn({ type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 1280, z: -420 }, radius: 80,
    data: { stationId: 'station_helios', factionId: 'faction_scn' } });
  sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 220, z: 40 }, radius: 8,
    hull: 80, hullMax: 80,
    data: { worldRecordId: 'wr_helios_patrol', ai: { lawful: true, archetype: 'patrol_lawman' } } });
  const reports = [];
  bus.on('law:reportIncidentReceipt', (p) => reports.push(p));
  return { sim, state, bus, player, reports };
}

function scoopBody(bus, body, collectorId) {
  bus.emit('pickup:collected', { collectorId, pickupId: body.id, acceptedAmount: 2,
    pos: { x: body.pos.x, z: body.pos.z } });
}

test('X-05 pin #5: the magnet leaves a titled chip; a witnessed contact scoop is still one payload_theft', () => {
  const h = bargeBoot();
  const chip = cutChip(h, h.barge.data.worldRecordId);
  chip.data.ownerId = h.barge.data.worldRecordId; // titled, as the barge pass stamps it
  chip.data.ownerName = 'Claim crew';
  const player = h.sim.state.entities.get(h.sim.state.playerId);
  chip.pos = { x: player.pos.x + 120, z: player.pos.z };
  chip.vel = { x: 0, z: 0 };
  const plain = h.sim.spawn({ type: 'pickup', pos: { x: player.pos.x + 120, z: player.pos.z + 40 },
    vel: { x: 0, z: 0 }, radius: 2.2,
    data: { kind: 'ore', commodityId: 'cmdty_silicate', amount: 1, despawnAt: 9999 } });
  h.sim.registry.get('mining')._updatePickups(1 / 60, h.sim.state);
  assert.ok(Math.hypot(chip.vel.x || 0, chip.vel.z || 0) < 1, 'the vacuum does not take a titled cut');
  assert.ok(Math.hypot(plain.vel.x || 0, plain.vel.z || 0) > 1, 'control: loose ore at the same range is vacuumed');
  assert.equal(chip.alive, true);
  h.sim.dispose();

  const law = lawBoot();
  const titled = law.sim.spawn({ type: 'pickup', team: 0, pos: { x: 200, z: 40 }, alive: true, radius: 1,
    data: { amount: 2, commodityId: 'cmdty_ore_iron', ownerId: 'wr_cutter', ownerName: 'Claim crew',
      npcMiningSource: { fieldId: 'f_helios_starter', minerWorldRecordId: 'wr_cutter' } } });
  scoopBody(law.bus, titled, law.player.id);
  assert.equal(law.reports.length, 1);
  assert.equal(law.reports[0].kind, 'payload_theft');
  assert.equal(law.reports[0].accepted, true, 'witnessed: the read told the truth');
  law.sim.dispose();
});

test('X-05 pin #6: a defender auto-collecting ordinary kill shards files no incident and hears no read', () => {
  const law = lawBoot();
  const plain = law.sim.spawn({ type: 'pickup', team: 0, pos: { x: 200, z: 40 }, alive: true, radius: 1,
    data: { amount: 2, commodityId: 'cmdty_scrap' } });
  const stamped = law.sim.spawn({ type: 'pickup', team: 0, pos: { x: 205, z: 45 }, alive: true, radius: 1,
    data: { amount: 2, commodityId: 'cmdty_scrap', ownerId: 'wr_dead_raider', ownerName: 'Raider' } });
  scoopBody(law.bus, plain, law.player.id);
  scoopBody(law.bus, stamped, law.player.id);
  assert.equal(law.reports.length, 0, 'the honest defender is never charged');
  assert.equal(law.state.lawSecurity && law.state.lawSecurity.reportedIncidents, undefined);
  law.sim.dispose();

  const shard = { id: 95, type: 'pickup', alive: true, pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
    data: { amount: 2, commodityId: 'cmdty_scrap', ownerId: 'wr_dead_raider' } };
  const ob = onboardingRig([shard]);
  tickScan(ob, 40);
  assert.equal(ob.hints.filter((e) => e.verbId === 'firstOwnedGoods').length, 0);
});
