// SFQ-B078 — the nursery claim crew: one cross-system set piece where human salvage law
// collides with the living ecology and the machine-layer work record. Driven through the
// REAL world system (world.enterSector → world.update), not a mocked harness. Seed 4242,
// simTime/tick-driven, systems boot exactly like the registered loop (template: the row-227
// M4 first proofs).
//
// The crew is authored human traffic (src/data/alienEcology.js NURSERY_CLAIM_CREW); their
// torches feed the nursery's declared industrial-work intake (asteroidSites.
// applyWorldSiteBeamOperation — the same record, cursor and once-rules the player's mining
// beam uses), and the site answers through its own chains: the N16 torch setpiece + L11
// evidence + cast investigate shift, then extract_cyst_cluster's authored consequence
// (nursery_bloom intent → bloom handler + released filament sample payload).
//
// Proofs:
//   1. the collision beat + the "let them work" approach — N16 fires once on foreign torch
//      work, the cut completes through the shared record, the bloom + payload release settle
//      exactly once, and the settled world replays nothing after save/restore;
//   2. the "protect" approach — killing the crew through the real entity:killed route drives
//      the claim off, partial torch progress stays on the record, and the failure world stays
//      resolvable: after restore the player's own beam finishes the cut and the bloom fires
//      for the first time;
//   3. the race — player and crew interleave on the same work record; whoever completes it,
//      the consequence fires exactly once and the losing side lapses without a second beat.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { ships } from '../src/systems/ships.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { ALIEN_SITES, NURSERY_CLAIM_CREW } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';

const SEED = 4242;
const DT = 1 / 60;
const CHARON = 'sector_charon_expanse';
const NURSERY_SITE = 'cinder_nursery';
const NURSERY_WORLD_SITE = 'world_site_charon_cinder_nursery';

function bootGame(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const events = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (type, payload) => {
    events.push({ type, payload });
    return rawEmit(type, payload);
  };
  const helpers = {};
  const systems = {};
  const registry = { get: (name) => systems[name] || null };
  const ctx = { state, bus, helpers, registry };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 8, mass: 12,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.vel = player.vel || { x: 0, z: 0 };
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  systems.world = world;
  const sites = Object.assign(Object.create(asteroidSites), {});
  sites.init(ctx);
  systems.asteroidSites = sites;
  const shipsSys = Object.assign(Object.create(ships), {});
  shipsSys.init(ctx);
  systems.ships = shipsSys;
  return { state, bus, events, helpers, registry, world, sites, ships: shipsSys, player };
}

function tick(h, seconds) {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    h.state.tick += 1;
    h.state.simTime += DT;
    h.world.update(DT, h.state);
  }
}

function siteGlobal(sectorId, local) {
  return sectorLocalToGlobalForSector({ x: local.x, z: local.z }, sectorId);
}

function cuttersOf(h) {
  return h.state.entityList.filter((e) => e && e.alive !== false
    && e.data && e.data.nurseryClaimCrew === NURSERY_SITE);
}

function receiptCount(h) {
  return h.events.filter((e) => e.type === 'worldSite:operationReceipt'
    && e.payload && e.payload.operationId === NURSERY_CLAIM_CREW.operationId).length;
}

function bloomCount(h) {
  return h.events.filter((e) => e.type === 'alienEcology:nurseryBloom').length;
}

function torchToastCount(h) {
  return h.events.filter((e) => e.type === 'toast' && e.payload
    && /Industrial torchlight/.test(e.payload.text)).length;
}

/** The same per-frame call mining._runWorldSiteBeam makes while the beam is on target. */
function beamWork(h, amountPerTick, maxTicks = 4000) {
  let result = null;
  for (let i = 0; i < maxTicks; i += 1) {
    h.state.tick += 1;
    h.state.simTime += DT;
    result = h.sites.applyWorldSiteBeamOperation({
      siteId: NURSERY_WORLD_SITE,
      componentId: NURSERY_CLAIM_CREW.componentId,
      verb: NURSERY_CLAIM_CREW.verb,
      amount: amountPerTick,
      requestStreamId: NURSERY_CLAIM_CREW.requestStreamId,
      requestSequence: h.state.tick,
      tick: h.state.tick,
    });
    if (!result.ok || (result.receipt && result.receipt.complete)) break;
  }
  return result;
}

function saveWorld(h) {
  return JSON.parse(JSON.stringify({
    world: h.world.serialize(),
    sites: h.sites.serialize(),
  }));
}

function restoreGame(wire, seed = SEED) {
  const h = bootGame(seed);
  h.world.deserialize(wire.world);
  h.sites.deserialize(wire.sites);
  return h;
}

/** Enter Charon and close on the living nursery — the ordinary approach that arms the beat. */
function approachNursery(h) {
  h.world.enterSector(CHARON);
  const g = siteGlobal(CHARON, ALIEN_SITES[NURSERY_SITE].center);
  h.player.pos.x = g.x + 500; // inside spawnRadius (620), inside the close arrival band
  h.player.pos.z = g.z;
  return g;
}

function componentRecord(h) {
  return h.state.sites.worldById[NURSERY_WORLD_SITE].components[NURSERY_CLAIM_CREW.componentId];
}

function crewRecord(h) {
  return ensureAlienEcologyState(h.state).sites[NURSERY_SITE].claimCrew;
}

// ── Proof 1: the collision beat, then the let-them-work approach settles once ──────────────
test('the claim crew cuts a living nursery — the torch beat, the bloom, and a settled world that replays nothing', () => {
  const h = bootGame();
  const g = approachNursery(h);

  // The ordinary approach arms the beat: the crew burns in and announces its claim.
  tick(h, 4);
  const crew = crewRecord(h);
  assert.equal(crew.state, 'working', 'the armed beat materializes the crew as working traffic');
  assert.equal(cuttersOf(h).length, NURSERY_CLAIM_CREW.crewSize, 'two cutters stand off the barge');
  assert.ok(h.events.some((e) => e.type === 'comms:log' && /posted for salvage/.test(e.payload.text)),
    'the claim announcement reaches the player');
  assert.equal(torchToastCount(h), 0, 'no beat before foreign work actually lands');

  // The torches reach the cut: the first foreign batch fires the N16 collision beat —
  // toast, evidence, once-flag — and the cast answers through the ordinary drive routes.
  tick(h, 25);
  const ae = ensureAlienEcologyState(h.state);
  assert.equal(ae.setpieces.N16_claim_torches, true, 'the torch beat fires on foreign work');
  assert.equal(torchToastCount(h), 1, 'the beat narrates itself exactly once');
  assert.ok(ae.evidence.L11, 'the collision files its L11 evidence row');
  assert.ok(h.events.some((e) => e.type === 'ecology:setpiece' && e.payload.id === 'N16_claim_torches'),
    'the beat emits the setpiece event on the real bus');
  const cast = h.state.entityList.filter((e) => e && e.alive !== false && e.type === 'fauna'
    && e.data && e.data.ecology && e.data.ecology.siteId === NURSERY_SITE);
  assert.ok(cast.length > 0, 'the nursery cast stands');
  assert.ok(cast.some((e) => e.data.ecology.driveState === 'investigate'),
    'the cast turns toward the torch point');
  const rec = ae.sites[NURSERY_SITE];
  assert.ok(rec.signals.some((s) => s.kind === 'agitation'),
    'the site interaction buffer carries the agitation signal');

  // Their work lands on the SHARED record: real operation receipts, real progress —
  // the same writer the player's mining beam feeds, no bespoke path.
  const receiptsBefore = receiptCount(h);
  const progressBefore = componentRecord(h).progress[NURSERY_CLAIM_CREW.operationId] || 0;
  assert.ok(receiptsBefore > 0, 'the crew torches emit real operation receipts');
  assert.ok(progressBefore > 0, 'the shared component record carries crew torch progress');

  // Let them work: the cut completes through the shared record and the authored
  // consequence chain settles — bloom intent once, released physical payload, paid claim.
  tick(h, 70);
  assert.equal(bloomCount(h), 1, 'the nursery_bloom consequence fires exactly once');
  assert.equal(rec.state, 'bloom', 'the site record reads the bloom');
  const record = h.state.sites.worldById[NURSERY_WORLD_SITE];
  assert.ok(record.completedOperations[NURSERY_CLAIM_CREW.operationId],
    'the completed operation is on the record');
  assert.equal(record.payloads.filament_sample.status, 'released',
    'the filament sample payload released through the manifest route');
  const pods = h.state.entityList.filter((e) => e && e.alive !== false
    && e.type === 'payload' && e.data && e.data.worldSitePayloadId === 'filament_sample');
  assert.equal(pods.length, 1, 'exactly one physical sample pod materialized');
  assert.equal(pods[0].data.transientSector, false, 'the sample pod is save-persistent');
  assert.ok(h.events.some((e) => e.type === 'economy:grantCredits'
    && e.payload && e.payload.reason === 'filament_sample_recovery'),
    'the extraction reward intent rides the real consequence chain');
  assert.equal(crew.state, 'settled', 'the paid claim settles the crew');
  assert.ok(h.events.some((e) => e.type === 'comms:log' && /contract paid/.test(e.payload.text)),
    'the paid close narrates itself');

  // The crew burns out on its own clock — and nothing settles twice.
  tick(h, 9);
  assert.equal(cuttersOf(h).length, 0, 'the settled crew leaves play');
  assert.equal(bloomCount(h), 1, 'still exactly one bloom');
  assert.equal(torchToastCount(h), 1, 'still exactly one beat');

  // Save → restore → re-enter: the settled beat replays nothing.
  const wire = saveWorld(h);
  const r = restoreGame(wire);
  r.world.enterSector(CHARON);
  const g2 = siteGlobal(CHARON, ALIEN_SITES[NURSERY_SITE].center);
  r.player.pos.x = g2.x + 500; r.player.pos.z = g2.z;
  tick(r, 5);
  const ae2 = ensureAlienEcologyState(r.state);
  assert.equal(ae2.sites[NURSERY_SITE].claimCrew.state, 'settled',
    'the settled claim survives the wire');
  assert.equal(cuttersOf(r).length, 0, 'a settled claim never re-materializes its crew');
  assert.equal(torchToastCount(r), 0, 'the torch beat never replays');
  assert.equal(bloomCount(r), 0, 'the bloom never replays');
  assert.equal(ae2.evidence.L11 ? 1 : 0, 1, 'the evidence row survives');
  const record2 = r.state.sites.worldById[NURSERY_WORLD_SITE];
  assert.ok(record2.completedOperations[NURSERY_CLAIM_CREW.operationId], 'the receipt survives');
  assert.equal(record2.payloads.filament_sample.status, 'released', 'the release survives');
  const pods2 = r.state.entityList.filter((e) => e && e.alive !== false
    && e.type === 'payload' && e.data && e.data.worldSitePayloadId === 'filament_sample');
  assert.equal(pods2.length, 1, 'the released sample rematerializes as the same physical prize');
});

// ── Proof 2: the protect approach — a driven-off claim leaves a resolvable world ───────────
test('driving the crew off leaves partial work and a resolvable world — the player finishes it after restore', () => {
  const h = bootGame();
  approachNursery(h);
  tick(h, 4);
  tick(h, 25); // torches are on the cut: the beat fired, progress is real
  const ae = ensureAlienEcologyState(h.state);
  assert.equal(ae.setpieces.N16_claim_torches, true, 'the collision beat fired before the fight');
  const progressAtFight = componentRecord(h).progress[NURSERY_CLAIM_CREW.operationId] || 0;
  assert.ok(progressAtFight > 0, 'the crew had begun the cut');

  // The human route: the player kills a cutter through the real entity:killed combat route.
  const first = cuttersOf(h)[0];
  first.alive = false;
  h.bus.emit('entity:killed', {
    id: first.id, killerId: h.player.id, type: first.type,
    pos: { x: first.pos.x, z: first.pos.z },
  });
  const crew = crewRecord(h);
  assert.equal(crew.killed, 1, 'the combat death is accounted on the persisted record');
  tick(h, 0.5); // the hostile posture lands on the next cycle tick, not inside the kill event
  const survivor = cuttersOf(h)[0];
  assert.ok(survivor, 'a cutter survives the first kill');
  assert.equal(survivor.data.ai.archetype, NURSERY_CLAIM_CREW.archetypeHostile,
    'the surviving cutter takes the hostile posture');
  assert.equal(survivor.data.ai.passive, false, 'the survivor stops being passive traffic');
  assert.ok(h.events.some((e) => e.type === 'comms:log' && /you are the interference/.test(e.payload.text)),
    'the claim defense narrates itself');

  // The claim stands: the survivor keeps feeding the shared record.
  tick(h, 4);
  const progressAfterFirst = componentRecord(h).progress[NURSERY_CLAIM_CREW.operationId] || 0;
  assert.ok(progressAfterFirst >= progressAtFight, 'torch work continues under defense');
  assert.equal(crew.state, 'working', 'the claim is not dead while a cutter lives');

  // The second kill drives the claim off — no more torch receipts after that.
  survivor.alive = false;
  h.bus.emit('entity:killed', {
    id: survivor.id, killerId: h.player.id, type: survivor.type,
    pos: { x: survivor.pos.x, z: survivor.pos.z },
  });
  tick(h, 1);
  assert.equal(crew.state, 'driven_off', 'a full crew loss ends the claim');
  tick(h, 4);
  const receiptsAtEnd = receiptCount(h);
  const progressAtEnd = componentRecord(h).progress[NURSERY_CLAIM_CREW.operationId] || 0;
  assert.equal(bloomCount(h), 0, 'the unfinished cut never blooms');
  tick(h, 5);
  assert.equal(receiptCount(h), receiptsAtEnd, 'no torch receipts after the crew is gone');
  assert.ok(progressAtEnd > 0, 'partial torch progress stays on the record — resolvable, not erased');

  // Save → restore → re-enter: no respawn (combat-accounted), progress survives, and the
  // player's OWN beam finishes the cut — the failure world resolves through the same owner.
  const wire = saveWorld(h);
  const r = restoreGame(wire);
  r.world.enterSector(CHARON);
  const g2 = siteGlobal(CHARON, ALIEN_SITES[NURSERY_SITE].center);
  r.player.pos.x = g2.x + 500; r.player.pos.z = g2.z;
  tick(r, 4);
  const crew2 = ensureAlienEcologyState(r.state).sites[NURSERY_SITE].claimCrew;
  assert.equal(crew2.state, 'driven_off', 'a driven-off claim never re-materializes');
  assert.equal(cuttersOf(r).length, 0, 'no cutters respawn after a full crew loss');
  assert.equal(torchToastCount(r), 0, 'the beat never replays');
  const progress2 = componentRecord(r).progress[NURSERY_CLAIM_CREW.operationId] || 0;
  assert.ok(progress2 > 0, 'partial progress survives the wire');
  const result = beamWork(r, 18 * DT);
  assert.ok(result && result.ok && result.receipt && result.receipt.complete,
    'the player finishes the abandoned cut through the ordinary beam route');
  assert.equal(bloomCount(r), 1, 'the bloom fires for the first time — from the finishing work');
  assert.equal(ensureAlienEcologyState(r.state).sites[NURSERY_SITE].state, 'bloom',
    'the site reads the resolved bloom');
});

// ── Proof 3: the race — one shared record settles the consequence exactly once ─────────────
test('racing the crew on the same work record pays the consequence once and lapses the loser', () => {
  const h = bootGame();
  approachNursery(h);
  tick(h, 4);
  tick(h, 25); // the crew is mid-cut on the shared record
  const progressMid = componentRecord(h).progress[NURSERY_CLAIM_CREW.operationId] || 0;
  assert.ok(progressMid > 0, 'the crew hold on the record is real');
  const crewReceipts = receiptCount(h);

  // The player feeds the SAME stream and finishes the cut first.
  const result = beamWork(h, 18 * DT);
  assert.ok(result && result.ok && result.receipt && result.receipt.complete,
    'the player completes the cut through the shared record');
  assert.equal(bloomCount(h), 1, 'the consequence fires exactly once for the shared work');
  assert.equal(ensureAlienEcologyState(h.state).sites[NURSERY_SITE].state, 'bloom',
    'the site blooms no matter whose torch finished it');

  // The kernel's once-rule settles the crew's next batch as a no-op; the claim lapses.
  tick(h, 2.5);
  const crew = crewRecord(h);
  assert.equal(crew.state, 'lapsed', 'the losing side breaks off');
  assert.ok(h.events.some((e) => e.type === 'comms:log' && /beat the torches/.test(e.payload.text)),
    'the lapse narrates itself');
  tick(h, 4);
  assert.equal(bloomCount(h), 1, 'still exactly one bloom');
  assert.equal(receiptCount(h) - crewReceipts > 0, true, 'the crew hold left real receipts');

  // A second player pass on the finished cut is a durable no-op.
  const replay = h.sites.applyWorldSiteBeamOperation({
    siteId: NURSERY_WORLD_SITE,
    componentId: NURSERY_CLAIM_CREW.componentId,
    verb: NURSERY_CLAIM_CREW.verb,
    amount: 24,
    requestStreamId: NURSERY_CLAIM_CREW.requestStreamId,
    requestSequence: h.state.tick + 1,
    tick: h.state.tick + 1,
  });
  assert.equal(replay.duplicate, true, 'the settled operation replays as a no-op');
  assert.equal(bloomCount(h), 1, 'the bloom never refires');

  // Save → restore: the lapsed claim persists, the crew burns out, nothing re-fires.
  const wire = saveWorld(h);
  const r = restoreGame(wire);
  r.world.enterSector(CHARON);
  const g2 = siteGlobal(CHARON, ALIEN_SITES[NURSERY_SITE].center);
  r.player.pos.x = g2.x + 500; r.player.pos.z = g2.z;
  tick(r, 9);
  const ae2 = ensureAlienEcologyState(r.state);
  assert.equal(ae2.sites[NURSERY_SITE].claimCrew.state, 'lapsed', 'the lapse survives the wire');
  assert.equal(cuttersOf(r).length, 0, 'the lapsed crew leaves play after restore');
  assert.equal(bloomCount(r), 0, 'the bloom never replays after restore');
  assert.equal(torchToastCount(r), 0, 'the beat never replays after restore');
});
