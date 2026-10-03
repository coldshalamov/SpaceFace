// Row 227 — M4 first proofs (build_map §I): two alien proofs on real ordinary routes,
// driven through the REAL world system (world.enterSector → world.update), not a mocked
// harness. Seed 4242, simTime/tick-driven, systems boot exactly like the registered loop.
//
// Proof A — one ecological intervention with a durable, readable consequence:
//   the player's industrial beam cuts the Cinder Nursery relay node through the same
//   asteroidSites.applyWorldSiteBeamOperation call mining._runWorldSiteBeam makes;
//   the authored consequence intent (alienEcology:relaySevered) rides the real bus into
//   world's own listener, flips the site's ecology record, fires the warn toasts, grants
//   the dead-matter coil through the real ships writer, and persists through
//   world.serialize()/asteroidSites.serialize() into a fresh boot where the site
//   rematerializes dead — the severed-morphology ring, no ambient spill, no re-fire.
//   A second leg culls a nursery organism through the real entity:killed route and shows
//   the scar (deadFauna, panic wave, permanent cast loss) surviving the same wire.
//
// Proof B — one consequential precursor-machine work cycle:
//   entering sector_io_reach on the ordinary jump route materializes the Listening Field;
//   world.update ticks the courier through mint → physical pod custody → signing dwell →
//   receiver intake via evaluateReceiverAcceptance/commitReceiverAcceptance exactly once
//   → machine:tokenDelivered + comms + an audible intake cue → save/load where the
//   settled token re-mints nothing and the ledger receipt survives. A second leg shows
//   intercepted mail still closing custody through the same receiver when the player
//   carries it home — same commit, same consequence event, same cue.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { ships } from '../src/systems/ships.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { addCargo } from '../src/systems/cargo.js';

const SEED = 4242;
const DT = 1 / 60;
const CHARON = 'sector_charon_expanse';
const IO_REACH = 'sector_io_reach';
const NURSERY_SITE = 'cinder_nursery';
const NURSERY_WORLD_SITE = 'world_site_charon_cinder_nursery';
const IO_SITE = 'io_listening_field';
const TOKEN_CMDTY = 'cmdty_gate_handshake';
const SEVERED_PALETTE = new Set(['dead_crown', 'silt_root', 'mineral_root', 'calcified_collar']);

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

function nurseryFauna(state) {
  return state.entityList.filter((e) => e && e.alive !== false && e.type === 'fauna'
    && e.data && e.data.ecology && e.data.ecology.siteId === NURSERY_SITE);
}

function tokenPods(state) {
  return state.entityList.filter((e) => e && e.alive !== false && e.type === 'payload'
    && e.data && e.data.machineToken);
}

function nurseryGrowthRows(state) {
  const rows = (state.world && state.world.dressing && state.world.dressing.rows) || [];
  return rows.filter((row) => row && row.data && row.data.siteId === NURSERY_SITE
    && row.data.alienEcology === true);
}

function eventsOf(h, type) {
  return h.events.filter((e) => e.type === type);
}

/** The same per-frame call mining._runWorldSiteBeam makes while the beam is on target. */
function beamWork(h, { siteId, componentId, verb }, amountPerTick, maxTicks = 4000) {
  let result = null;
  for (let i = 0; i < maxTicks; i += 1) {
    h.state.tick += 1;
    h.state.simTime += DT;
    result = h.sites.applyWorldSiteBeamOperation({
      siteId,
      componentId,
      verb,
      amount: amountPerTick,
      requestStreamId: 'player-industrial-beam',
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

// ── Proof A1: severing the nursery relay on the ordinary route ───────────────────────────
test('the industrial beam severs the nursery relay — ecology state, cues, and a dead field that persists', () => {
  const h = bootGame();
  h.world.enterSector(CHARON);

  // The ordinary route materializes both layers: the nursery's authored world-site
  // proxies (the beam's real targets) and the ecology cast + growth ring.
  const relayProxy = h.state.entityList.find((e) => e && e.alive !== false
    && e.data && e.data.worldSiteId === NURSERY_WORLD_SITE
    && e.data.worldSiteComponentId === 'relay_choir_node');
  assert.ok(relayProxy, 'the relay node materializes as a targetable component on sector entry');
  const castBefore = nurseryFauna(h.state);
  assert.equal(castBefore.length, 10, 'the authored cast (6+2+1+1) stands on entry');

  // A living site announces itself: crossing the mid band fires the staged reveal and
  // the growth ring carries living morphology (the dead palette is asserted post-restore).
  const g = siteGlobal(CHARON, ALIEN_SITES[NURSERY_SITE].center);
  h.player.pos.x = g.x + 1400; // inside arrivalBands.mid (1500), outside close (520)
  h.player.pos.z = g.z;
  tick(h, 0.5);
  const rec0 = ensureAlienEcologyState(h.state).sites[NURSERY_SITE];
  assert.equal(rec0.beats.mid, true, 'the mid-band arrival beat fires on approach');
  assert.ok(h.events.some((e) => e.type === 'toast' && /turn together/.test(e.payload.text)),
    'the synchronized-turn beat narrates the living site');
  assert.ok(nurseryGrowthRows(h.state).some((row) => !SEVERED_PALETTE.has(row.data.moduleId)),
    'the growth ring draws living morphology before the cut');

  // The intervention: the industrial beam cuts relay_choir_node — same call, same
  // request stream, same per-tick amount the mining system issues on a live target.
  const result = beamWork(h, {
    siteId: NURSERY_WORLD_SITE, componentId: 'relay_choir_node', verb: 'cut',
  }, 18 * DT);
  assert.ok(result && result.ok && result.receipt && result.receipt.complete,
    `the cut completes on accumulated beam work, got ${JSON.stringify(result && result.reason)}`);

  // Consequence rides the real bus: the authored intent, the operation receipt, and the
  // ecology handler's own response — world state really changed.
  assert.equal(eventsOf(h, 'alienEcology:relaySevered').length, 1,
    'the relay_severed consequence intent emits once');
  const receipts = eventsOf(h, 'worldSite:operationReceipt')
    .filter((e) => e.payload && e.payload.operationId === 'sever_relay_node');
  assert.ok(receipts.length > 0, 'the beam work emits operation receipts');
  assert.equal(receipts.filter((e) => e.payload.receipt && e.payload.receipt.complete === true).length, 1,
    'exactly one completion receipt — progress ticks are not consequences');
  const ae = ensureAlienEcologyState(h.state);
  const rec = ae.sites[NURSERY_SITE];
  assert.equal(rec.state, 'severed');
  assert.equal(rec.relaySevered, true);
  assert.ok(ae.revelation >= 2, 'the sever teaches the revelation ladder');
  const record = h.state.sites.worldById[NURSERY_WORLD_SITE];
  assert.equal(record.components.relay_choir_node.status, 'severed',
    'the world-site component record carries the cut');
  assert.ok(record.completedOperations.sever_relay_node, 'the completed operation is on the record');

  // Readable cue: the warn toast names what the player did, and the dead-matter coil
  // grant rides the real ships writer (module lands in the inventory).
  assert.ok(h.events.some((e) => e.type === 'toast' && /pale emitter goes dark/.test(e.payload.text)),
    'the sever narrates itself to the player');
  const coilToast = h.events.some((e) => e.type === 'toast' && /field coil/.test(e.payload.text));
  const coilItem = h.state.player.moduleInventory
    .some((m) => m && m.defId === 'mod_resonant_massline_m');
  assert.ok(coilToast && coilItem, 'the severed relay yields its resonant massline coil once');

  // Exactly once: a second beam pass on the severed node is a durable no-op — the intent
  // does not re-fire, no second toast, no second coil.
  const replay = h.sites.applyWorldSiteBeamOperation({
    siteId: NURSERY_WORLD_SITE, componentId: 'relay_choir_node', verb: 'cut',
    amount: 24, requestStreamId: 'player-industrial-beam',
    requestSequence: h.state.tick + 1, tick: h.state.tick + 1,
  });
  assert.equal(replay.duplicate, true, 'the completed operation settles replays as no-ops');
  assert.equal(eventsOf(h, 'alienEcology:relaySevered').length, 1, 'the severed cue never repeats');

  // The severed-only setpiece fires on approach — the live tick's own consequence.
  h.player.pos.x = g.x + 400; // inside N10 radius (500)
  h.player.pos.z = g.z;
  tick(h, 0.5);
  assert.equal(ae.setpieces.N10_nursery_grief, true,
    'approaching the severed nursery fires its authored grief beat');
  assert.ok(ae.evidence.L04, 'the severed nursery files its L04 evidence');
  assert.ok(h.events.some((e) => e.type === 'toast' && /reads empty/.test(e.payload.text)),
    'the grief beat narrates the aftermath');

  // Save → restore → re-enter: the severed world persists and rematerializes dead.
  const wire = saveWorld(h);
  const r = restoreGame(wire);
  r.world.enterSector(CHARON);
  const ae2 = ensureAlienEcologyState(r.state);
  const rec2 = ae2.sites[NURSERY_SITE];
  assert.equal(rec2.state, 'severed', 'the severed site record survives the wire');
  assert.equal(rec2.relaySevered, true);
  assert.ok(ae2.revelation >= 2, 'revelation survives');
  assert.equal(ae2.setpieces.N10_nursery_grief, true, 'the fired setpiece never refires');
  const record2 = r.state.sites.worldById[NURSERY_WORLD_SITE];
  assert.equal(record2.components.relay_choir_node.status, 'severed');
  assert.ok(record2.completedOperations.sever_relay_node, 'the receipt survives');
  const growth = nurseryGrowthRows(r.state);
  assert.ok(growth.length >= 6, 'the growth ring rematerializes');
  assert.ok(growth.every((row) => SEVERED_PALETTE.has(row.data.moduleId)),
    `the severed site draws the dead palette, got ${[...new Set(growth.map((r2) => r2.data.moduleId))]}`);
  assert.equal(growth.filter((row) => row.data.ambient === true).length, 0,
    'a severed site stops its ambient spill entirely');
  tick(r, 0.5);
  assert.equal(eventsOf(r, 'alienEcology:relaySevered').length, 0,
    'a restored severed site does not replay its consequence intent');
});

// ── Proof A2: culling fauna on the live route scars the cast ────────────────────────────
test('killing a nursery organism on the ordinary route scars the cast — and the scar persists', () => {
  const h = bootGame();
  h.world.enterSector(CHARON);

  const victim = nurseryFauna(h.state).find((e) => e.data.ecology.speciesId === 'needle_swarm');
  assert.ok(victim, 'a cullable organism stands in the cast');
  const faunaKey = victim.data.ecology.faunaKey;
  const castBefore = nurseryFauna(h.state).length;

  // The real combat route: the entity dies, combat emits entity:killed, world's own
  // listener hands the ecology handler the kill — no handler is invoked by hand.
  victim.alive = false;
  h.bus.emit('entity:killed', {
    id: victim.id, killerId: h.player.id, type: victim.type,
    pos: { x: victim.pos.x, z: victim.pos.z },
  });

  const ae = ensureAlienEcologyState(h.state);
  const rec = ae.sites[NURSERY_SITE];
  assert.equal(rec.deadFauna[faunaKey], true, 'the dead set records the culled organism');
  assert.ok(rec.fleeWave && rec.fleeWave.until > h.state.simTime,
    'the kill posts a flee wave the site answers');
  assert.ok(rec.signals.some((s) => s.kind === 'panic'), 'a panic signal lands in the site buffer');

  // The wave propagates on the real tick: same-species panic now, the rest after the
  // authored propagation delay — observable consequence inside the same sector visit.
  h.player.pos.x = victim.pos.x + 3000; h.player.pos.z = victim.pos.z;
  tick(h, 2.5);
  const survivors = nurseryFauna(h.state);
  assert.ok(survivors.some((e) => e.data.ecology.driveState === 'flee'),
    'the surviving cast scatters on the panic wave');

  // Persistence: the dead set survives the wire and the re-materialized cast is smaller.
  const wire = saveWorld(h);
  const r = restoreGame(wire);
  r.world.enterSector(CHARON);
  const ae2 = ensureAlienEcologyState(r.state);
  assert.equal(ae2.sites[NURSERY_SITE].deadFauna[faunaKey], true,
    'the culled organism stays dead across save/load');
  const restored = nurseryFauna(r.state);
  assert.equal(restored.length, castBefore - 1,
    'the cast rematerializes without the culled member');
  assert.ok(!restored.some((e) => e.data.ecology.faunaKey === faunaKey),
    'the exact organism never respawns');
});

// ── Proof B1: the courier work cycle settles real mail through the real receiver ─────────
test('the courier work cycle delivers physical mail through the receiver — once, audibly, and never twice', () => {
  const h = bootGame();
  h.world.enterSector(IO_REACH);
  const site = MACHINE_SITES[IO_SITE];
  const g = siteGlobal(IO_REACH, site.center);

  // Ordinary reach: the player jumps in, flies to the site, and the lattice notices.
  h.player.pos.x = g.x + 500;
  h.player.pos.z = g.z;
  tick(h, 2);
  const ae = ensureAlienEcologyState(h.state);
  const siteRec = ae.machineSites[IO_SITE];
  assert.equal(siteRec.seen, true, 'the site observation beat fires on approach');
  assert.ok(h.events.some((e) => e.type === 'toast' && /Seven receivers/.test(e.payload.text)),
    'the authored site beat reaches the player');
  assert.equal(ae.machineProtocol, 'observed', 'first contact teaches the protocol ladder');

  // The work cycle: the frame mints one durable token and tows one physical pod.
  const courier = h.state.entityList.find((e) => e && e.alive !== false
    && e.type === 'machine' && e.data && e.data.machine && e.data.machine.kind === 'courier');
  assert.ok(courier, 'the courier frame materialized with the site');
  const token = siteRec.courierToken;
  assert.ok(token, 'the courier minted its durable token record');
  assert.equal(token.status, 'in_transit');
  const pods = tokenPods(h.state);
  assert.equal(pods.length, 1, 'exactly one token body exists in space');
  const pod = pods[0];
  assert.equal(pod.collides, true, 'the mail is a colliding body');
  assert.equal(pod.flags && pod.flags.persistent, true, 'the mail is save-persistent');
  assert.equal(pod.data.ownerId, courier.id, 'the frame holds custody');
  assert.equal(pod.data.salvagePool[TOKEN_CMDTY], 1, 'the pod carries the route instrument');

  // Machine dwell: the recipient countersigns only after the mail has ridden
  // mailDwellS — early custody inside the intake radius settles nothing.
  assert.ok(token.readyAt > h.state.simTime, 'the signing dwell still holds');
  tick(h, 4);
  assert.equal(token.status, 'in_transit', 'the receiver waits out the dwell even with the pod near');

  // Fast-forward through the dwell (sim time is the clock; nothing else time-gates the
  // loop), then run the real tick until the pod crosses the intake radius.
  h.state.simTime = token.readyAt + 0.5;
  tick(h, 30);
  assert.equal(token.status, 'delivered', 'the receiver commits the delivery');
  assert.equal(pod.alive, false, 'the body is consumed at handoff');
  const receiver = ae.machineSites[token.destSiteId].courierReceiver;
  assert.ok(receiver && receiver.acceptedReceipts[token.receiptId] === 1,
    'the world-site receiver ledger holds exactly one committed receipt');
  assert.equal(eventsOf(h, 'machine:tokenDelivered').length, 1,
    'one consequence event, ever');
  assert.ok(h.events.some((e) => e.type === 'comms:log' && /ROUTE MAIL ACCEPTED/.test(e.payload.text)),
    'the custody close narrates itself to the player');
  assert.equal(eventsOf(h, 'audio:cue').filter((e) => e.payload && e.payload.id === 'presentation.dock.capture').length, 1,
    'the intake is audible — the authored dock-capture cue at the acceptance point');
  tick(h, 4);
  assert.equal(tokenPods(h.state).length, 0, 'a settled token re-mints nothing');
  assert.equal(eventsOf(h, 'machine:tokenDelivered').length, 1, 'no second delivery');

  // Save → restore → re-enter: settled custody survives; nothing re-mints or re-delivers.
  const wire = saveWorld(h);
  const r = restoreGame(wire);
  r.world.enterSector(IO_REACH);
  tick(r, 3);
  const ae2 = ensureAlienEcologyState(r.state);
  const token2 = ae2.machineSites[IO_SITE].courierToken;
  assert.equal(token2.status, 'delivered', 'settled custody survives the wire');
  const receiver2 = ae2.machineSites[token2.destSiteId].courierReceiver;
  assert.ok(receiver2.acceptedReceipts[token2.receiptId] === 1, 'the receipt survives');
  assert.equal(tokenPods(r.state).length, 0, 'no duplicate mail after restore');
  assert.equal(eventsOf(r, 'machine:tokenDelivered').length, 0, 'the delivery never replays');
});

// ── Proof B2: intercepted mail still closes custody through the receiver ────────────────
test('intercepted mail carried home settles through the same receiver — late delivery counts once', () => {
  const h = bootGame();
  h.world.enterSector(IO_REACH);
  const site = MACHINE_SITES[IO_SITE];
  const g = siteGlobal(IO_REACH, site.center);
  h.player.pos.x = g.x + 500;
  h.player.pos.z = g.z;
  tick(h, 2);
  const ae = ensureAlienEcologyState(h.state);
  const token = ae.machineSites[IO_SITE].courierToken;
  const pod = tokenPods(h.state)[0];
  assert.ok(token && pod, 'the mail is in transit');

  // The player scoops the pod: cargo's committed pickup receipt is the custody transfer
  // — world's own listener settles the token on it, files L06, and fires N08.
  h.bus.emit('pickup:collected', {
    pickupId: pod.id, collectorId: h.player.id, kind: 'cargo',
    amount: 1, commodityId: TOKEN_CMDTY, acceptedAmount: 1,
    pos: { x: pod.pos.x, z: pod.pos.z },
  });
  assert.equal(token.status, 'intercepted');
  assert.ok(ae.evidence.L06, 'intercepting the mail files L06');
  assert.equal(ae.machineSites[IO_SITE].setpieces.N08, true, 'the intercept setpiece fires');
  addCargo(h.state, TOKEN_CMDTY, 1, 'test_intercept'); // the hold write the receipt implies

  // Carrying the held unit inside the intake radius closes custody through the same
  // receiver — late delivery is still a delivery.
  h.player.pos.x = token.destPos.x;
  h.player.pos.z = token.destPos.z;
  tick(h, 1);
  assert.equal(token.status, 'delivered', 'the held token comes home');
  assert.equal(h.state.player.cargo.items[TOKEN_CMDTY] || 0, 0,
    'the receiver takes the unit through the cargo writer');
  const receiver = ae.machineSites[token.destSiteId].courierReceiver;
  assert.ok(receiver.acceptedReceipts[token.receiptId] === 1,
    'the same single receipt commits');
  assert.equal(eventsOf(h, 'machine:tokenDelivered').length, 1,
    'a late handoff fires the same consequence event');
  assert.ok(h.events.some((e) => e.type === 'comms:log' && /LATE DELIVERY ACCEPTED/.test(e.payload.text)),
    'the late close narrates itself');
  assert.equal(eventsOf(h, 'audio:cue').filter((e) => e.payload && e.payload.id === 'presentation.dock.capture').length, 1,
    'the late intake is audible too');
  tick(h, 3);
  assert.equal(eventsOf(h, 'machine:tokenDelivered').length, 1, 'still exactly once');
});
