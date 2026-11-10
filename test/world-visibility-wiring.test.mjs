// World-visibility batch: the previously-dead/offscreen channels must produce player-visible,
// durable, deterministic consequences on the default route.
//
//   • sectorsim:intel     → a lane brief on entry + throttled wire reports for offscreen drift
//   • sectorsim:reconcile → a "while away" toast when a long-absent sector is re-entered
//   • traffic_density     → retained embodiment recipe tilts ambient count + role mix
//   • panic-jettison pod  → owner/affiliation/route truth on a real persistent pickup
//   • gate verdict        → gate:verdict event mirroring the comms/toll/wing consequence
//   • scan:completed      → formation discovery once every member body has been surveyed
//   • chronicler          → five new fact registrations normalize, ingest, and persist
//
// Headless; fixed seeds; no wall clock.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createSimulation } from '../src/core/sim.js';
import { world as worldSystem } from '../src/systems/world.js';
import { traffic, trafficRoleMixForSector, ambientCountForSector } from '../src/systems/traffic.js';
import { gateControlDirector } from '../src/systems/gateControlDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { asteroidFormations, formationBodyKey } from '../src/systems/asteroidFormations.js';
import { chronicler } from '../src/systems/chronicler.js';
import { restoreMemory } from '../src/chronicler/persistence.js';

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';

// ── world boot (same harness shape as m2-embodiment-world-integration) ──────────────────────────

function bootWorld(seed = 42) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, bus, helpers, world, player };
}

function signal(sectorId, over = {}) {
  return {
    sectorId,
    ownerId: 'faction_scn',
    danger: 0.7,
    pricePressure: 0.3,
    influence: { faction_scn: 0.9 },
    dominantFactionId: 'faction_scn',
    dominantInfluence: 0.9,
    contestMargin: 0.9,
    trend: { danger: 0, pricePressure: 0, influence: 0 },
    ...over,
  };
}

// ── sectorsim:intel / sectorsim:reconcile ───────────────────────────────────────────────────────

test('sectorsim:intel emits a lane brief on entry and a throttled wire report offscreen', () => {
  const { state, bus } = bootWorld();
  state.world.currentSectorId = HELIOS;
  const voice = [];
  bus.on('voice:say', (p) => voice.push(p));

  // Entry intel for the sector just entered → one comms lane brief.
  bus.emit('sectorsim:intel', {
    reason: 'sector_entry', sectorId: HELIOS, sectorName: 'Helios Prime',
    signal: signal(HELIOS), transit: { incidentChance: 0.5 },
  });
  const brief = voice.find((v) => v.kind === 'lane_brief');
  assert.ok(brief, 'entry intel produces a lane brief');
  assert.equal(brief.channel, 'comms');
  assert.match(brief.text, /HELIOS PRIME/);
  assert.match(brief.text, /prices running hot/);
  assert.match(brief.text, /departure corridor unstable/);

  // Entry intel for a DIFFERENT sector must not lie to the pilot about where they are.
  bus.emit('sectorsim:intel', {
    reason: 'sector_entry', sectorId: TETHYS, sectorName: 'Tethys Junction',
    signal: signal(TETHYS), transit: { incidentChance: 0.1 },
  });
  assert.equal(voice.filter((v) => v.kind === 'lane_brief').length, 1,
    'entry intel for a non-current sector stays silent');

  // Offscreen threshold crossing → the wire, on the news channel.
  bus.emit('sectorsim:intel', {
    reason: 'threshold_crossing', sectorId: TETHYS, sectorName: 'Tethys Junction',
    signal: signal(TETHYS, { danger: 0.85, contestMargin: 0.05 }),
  });
  const wires = voice.filter((v) => v.kind === 'wire_report');
  assert.equal(wires.length, 1, 'offscreen drift reaches the player once');
  assert.equal(wires[0].channel, 'news');
  assert.match(wires[0].text, /WIRE · Tethys Junction/);
  assert.match(wires[0].text, /control contested/);

  // Same-sector cooldown: a churning field cannot re-report every quantum.
  bus.emit('sectorsim:intel', {
    reason: 'threshold_crossing', sectorId: TETHYS, sectorName: 'Tethys Junction',
    signal: signal(TETHYS, { danger: 0.85, contestMargin: 0.05 }),
  });
  assert.equal(voice.filter((v) => v.kind === 'wire_report').length, 1, 'cooldown suppresses repeat');

  state.simTime += 400; // past WIRE_REPORT_COOLDOWN_S
  bus.emit('sectorsim:intel', {
    reason: 'threshold_crossing', sectorId: TETHYS, sectorName: 'Tethys Junction',
    signal: signal(TETHYS, { danger: 0.85, contestMargin: 0.05 }),
  });
  assert.equal(voice.filter((v) => v.kind === 'wire_report').length, 2, 'cooldown expiry re-arms');
});

test('wire-report cooldown does not carry across newGame or a restore', () => {
  const { state, bus, world } = bootWorld();
  state.world.currentSectorId = HELIOS;
  const voice = [];
  bus.on('voice:say', (p) => voice.push(p));
  const report = () => bus.emit('sectorsim:intel', {
    reason: 'threshold_crossing', sectorId: TETHYS, sectorName: 'Tethys Junction',
    signal: signal(TETHYS, { danger: 0.85, contestMargin: 0.05 }),
  });
  const wireCount = () => voice.filter((v) => v.kind === 'wire_report').length;

  // Burn the per-sector stamp late in a run, then restart: simTime returns to 0, so a stale
  // stamp would suppress the fresh report for the whole 300s cooldown.
  state.simTime = 9000;
  report();
  assert.equal(wireCount(), 1);
  state.simTime = 0;
  world.newGame();
  state.world.currentSectorId = HELIOS;
  report();
  assert.equal(wireCount(), 2, 'newGame drops the old simTime stamp — early reports fire again');

  // A restore onto an older clock is the same hazard: burn late, then "load" earlier simTime.
  state.simTime = 4200;
  report();
  assert.equal(wireCount(), 3);
  state.simTime = 60;
  bus.emit('save:restoring', {});
  report();
  assert.equal(wireCount(), 4, 'save:restoring clears stamps so a loaded clock re-arms reports');
});

test('sectorsim:reconcile surfaces a while-away toast for the entered sector only', () => {
  const { state, bus } = bootWorld();
  state.world.currentSectorId = HELIOS;
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));

  // A reconcile for any sector other than the one being entered is not the player's news.
  bus.emit('sectorsim:reconcile', {
    sectorId: TETHYS, elapsedSimT: 1800, signal: signal(TETHYS), continuous: false,
  });
  assert.equal(toasts.length, 0);

  bus.emit('sectorsim:reconcile', {
    sectorId: HELIOS, elapsedSimT: 1800, signal: signal(HELIOS),
    sectorName: 'Helios Prime', continuous: false,
  });
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].text, /While away \(3d\)/);
  assert.match(toasts[0].text, /Helios Prime/);
});

// ── traffic_density recipe consumption ────────────────────────────────────────────────────────

function stateWithDensity(sectorId, payload) {
  return {
    world: {
      embodiment: {
        bySector: payload ? { [sectorId]: { intents: [{ kind: 'traffic_density', payload }] } } : {},
      },
    },
  };
}

test('retained traffic_density recipe scales ambient count and tilts the role mix', () => {
  const sector = { id: 'sector_density_probe', security: 0.4, trafficPerMin: 12 };
  const quiet = stateWithDensity(sector.id, null);
  const surging = stateWithDensity(sector.id, { densityMultiplier: 2.0 });
  const collapsed = stateWithDensity(sector.id, { densityMultiplier: 0.4 });

  const base = ambientCountForSector(sector, quiet);
  assert.ok(base > 0, 'authored density produces hulls');
  assert.ok(ambientCountForSector(sector, surging) > base,
    'field density surge increases the ambient pocket');
  assert.ok(ambientCountForSector(sector, collapsed) < base,
    'field density collapse thins the lanes');

  const baseMix = trafficRoleMixForSector(sector, quiet);
  const biasedState = stateWithDensity(sector.id, {
    densityMultiplier: 1,
    roleMixBias: { pirate: 4, miner: 0.25 },
  });
  const biasedMix = trafficRoleMixForSector(sector, biasedState);
  assert.ok(biasedMix.pirate > baseMix.pirate, 'roleMixBias boosts pirates');
  assert.ok(biasedMix.miner < baseMix.miner, 'roleMixBias suppresses miners');

  // A malformed/absent payload fails closed to the authored mix.
  const empty = stateWithDensity(sector.id, {});
  assert.equal(ambientCountForSector(sector, empty), base);
  assert.equal(trafficRoleMixForSector(sector, empty).pirate, baseMix.pirate);
});

// ── panic-jettisoned cargo ownership ───────────────────────────────────────────────────────────

test('a panic-jettisoned pod carries owner, affiliation, manifest and route truth', () => {
  const sim = createSimulation({ seed: 7, systems: [traffic] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = HELIOS;
  const destination = sim.spawn({
    type: 'station', team: 2, pos: { x: 900, z: 400 }, vel: { x: 0, z: 0 },
    radius: 40, hull: 1000, hullMax: 1000,
    data: { stationId: 'station_helios', name: 'Helios Station' },
  });
  const hauler = sim.spawn({
    type: 'ship', team: 2, pos: { x: 100, z: 0 }, vel: { x: 4, z: 0 },
    radius: 8, mass: 80, hull: 100, hullMax: 100, factionId: 'faction_mts',
    data: {
      trafficRole: 'hauler', name: 'MTS Freighter Kestrel',
      itinerary: { originStationId: 'station_port_low', destinationStationId: 'station_helios' },
      cargoManifest: {
        manifestId: 'manifest_kestrel_1',
        lines: [{ commodityId: 'cmdty_silicate', qty: 40 }],
        totalQty: 40,
      },
    },
  });
  const attacker = sim.spawn({
    type: 'ship', team: 1, pos: { x: 140, z: 0 }, vel: { x: 0, z: 0 },
    radius: 6, hull: 100, hullMax: 100, data: {},
  });
  const spills = [];
  bus.on('freight:cargoSpilled', (p) => spills.push(p));

  // createSimulation forks each registered system — call the live instance, not the import.
  const trafficSys = sim.registry.get('traffic');
  const pod = trafficSys._spillHaulerCargoFromViolence(hauler, attacker, 'combat_fire');
  assert.ok(pod, 'the spill materializes a real body');
  assert.equal(pod.type, 'payload');
  assert.equal(pod.flags && pod.flags.persistent, true, 'the pod is a persistent, scoopable body');
  assert.equal(pod.data.jettisonedCargo, true);
  assert.equal(pod.data.commodityId, 'cmdty_silicate');
  assert.equal(pod.data.amount, 10, 'a quarter of the manifest line dumps');
  // Ownership truth — scooping the pod tells the same story as hailing the hauler.
  assert.equal(pod.data.ownerId, hauler.id);
  assert.equal(pod.data.ownerName, 'MTS Freighter Kestrel');
  assert.equal(pod.data.originId, 'station_port_low');
  assert.equal(pod.data.destinationId, 'station_helios');
  assert.equal(pod.data.manifestId, 'manifest_kestrel_1');
  assert.equal(pod.data.carrierRole, 'hauler');
  assert.equal(pod.data.spillCause, 'combat_fire');
  assert.equal(pod.data.attackerId, attacker.id);
  assert.ok(pod.data.cargoIdentity, 'the pod carries a cargo identity block');
  assert.equal(pod.data.factionId, 'faction_mts', 'the pod keeps the hauler affiliation');

  // The manifest truthfully decrements; the hauler reads as having dumped.
  assert.equal(hauler.data.cargoManifest.lines[0].qty, 30);
  assert.equal(hauler.data.cargoDumped, true);
  assert.equal(hauler.data.carrying, false);

  // Journalism carries the same ownership fields the Chronicler normalizes.
  assert.equal(spills.length, 1);
  assert.equal(spills[0].ownerId, hauler.id);
  assert.equal(spills[0].ownerName, 'MTS Freighter Kestrel');
  assert.equal(spills[0].factionId, 'faction_mts');
  assert.equal(spills[0].attackerId, attacker.id);
  assert.equal(spills[0].manifestId, 'manifest_kestrel_1');
  assert.equal(spills[0].qty, 10);
  assert.deepEqual(spills[0].podIds, [pod.id]);

  // One dump per hauler — a second volley does not double-spill.
  assert.equal(trafficSys._spillHaulerCargoFromViolence(hauler, attacker), null);
  assert.equal(spills.length, 1);
  sim.dispose();
});

// SF-288: a bad throw's damage receipt names the flung mass — not generic gunfire — on the pod
// the mistake actually dislodged. The combat:damage event path is the real seam, not the helper.
test('a whip-flung mass that clips a hauler spills cargo naming the real cause', () => {
  const sim = createSimulation({ seed: 11, systems: [traffic] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = HELIOS;
  const hauler = sim.spawn({
    type: 'ship', team: 2, pos: { x: 100, z: 0 }, vel: { x: 4, z: 0 },
    radius: 8, mass: 80, hull: 100, hullMax: 100, factionId: 'faction_mts',
    data: {
      trafficRole: 'hauler', name: 'MTS Freighter Kestrel',
      itinerary: { originStationId: 'station_port_low', destinationStationId: 'station_helios' },
      cargoManifest: {
        manifestId: 'manifest_kestrel_1',
        lines: [{ commodityId: 'cmdty_silicate', qty: 40 }],
        totalQty: 40,
      },
    },
  });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 },
    radius: 6, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const spills = [];
  bus.on('freight:cargoSpilled', (p) => spills.push(p));

  // The route the throw actually takes: tether:whipImpact → combat kernel → combat:damage with
  // attackerId = the player and origin.kind = 'massline_whip'. Traffic spills on the receipt.
  bus.emit('combat:damage', {
    targetId: hauler.id,
    attackerId: player.id,
    applied: 12,
    type: 'kinetic',
    origin: { kind: 'massline_whip', id: 'payload_9' },
    pos: { x: hauler.pos.x, z: hauler.pos.z },
  });

  const pod = [...state.entities.values()].find((e) => (
    e.type === 'payload' && e.data && e.data.payloadType === 'jettisoned_cargo'));
  assert.ok(pod, 'the clipped hauler physically dislodges its load');
  assert.equal(pod.data.spillCause, 'massline_whip', 'the pod names the flung mass, not gunfire');
  assert.equal(pod.data.attackerId, player.id, 'the mistake attributes to the thrower');
  assert.equal(pod.data.ownerId, hauler.id, 'the freight still names its owner');
  assert.equal(hauler.data.cargoManifest.lines[0].qty, 30, 'manifest truthfully decrements');
  assert.equal(spills.length, 1);
  assert.equal(spills[0].cause, 'massline_whip', 'the chronicle reads the same cause');
  sim.dispose();
});

// ── gate verdict ───────────────────────────────────────────────────────────────────────────────

function bootGate(seed, sector) {
  const sim = createSimulation({ seed, systems: [spawnBudget, gateControlDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = sector.id;
  state.world.sectors = { [sector.id]: sector };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  return { sim, state, bus };
}

test('gate:verdict reports the seeded scene consequence — toll and scan wing alike', () => {
  // Concord high-sec checkpoint: a seeded two-ship scan wing.
  const a = bootGate(42, { id: 'sector_a', factionId: 'faction_scn', security: 0.9 });
  const verdicts = [];
  const charges = [];
  a.bus.on('gate:verdict', (p) => verdicts.push(p));
  a.bus.on('economy:chargeCredits', (p) => charges.push(p));
  a.bus.emit('jump:chargeStart', { via: 'gate', targetSectorId: 'sector_b', chargeNeeded: 3 });
  assert.equal(verdicts.length, 1, 'one verdict per scene');
  const v = verdicts[0];
  assert.equal(v.type, 'scn_scan');
  assert.equal(v.gateKey, 'sector_a>sector_b');
  assert.equal(v.sectorId, 'sector_a');
  assert.equal(v.gateTo, 'sector_b');
  assert.equal(v.factionId, 'faction_scn');
  assert.equal(v.wanted, false);
  assert.equal(v.tollAmount, 0);
  assert.equal(v.scanWing, 2);
  assert.equal(v.wingShips, 2, 'the scan wing physically spawned inside the budget');
  assert.ok(Number.isFinite(v.t));
  assert.equal(charges.length, 0, 'a scan scene never charges a toll');

  // Determinism: same seed + same gate-day → the same verdict, verbatim.
  const a2 = bootGate(42, { id: 'sector_a', factionId: 'faction_scn', security: 0.9 });
  const verdicts2 = [];
  a2.bus.on('gate:verdict', (p) => verdicts2.push(p));
  a2.bus.emit('jump:chargeStart', { via: 'gate', targetSectorId: 'sector_b', chargeNeeded: 3 });
  assert.deepEqual(verdicts2[0], v, 'same gate-day verdicts are byte-identical');

  // Meridian toll band: the charge rides the single-writer economy seam.
  const b = bootGate(9, { id: 'sector_m', factionId: 'faction_mts', security: 0.55 });
  const mVerdicts = [];
  const mCharges = [];
  b.bus.on('gate:verdict', (p) => mVerdicts.push(p));
  b.bus.on('economy:chargeCredits', (p) => mCharges.push(p));
  b.bus.emit('jump:chargeStart', { via: 'gate', targetSectorId: 'sector_n', chargeNeeded: 3 });
  assert.equal(mVerdicts.length, 1);
  assert.equal(mVerdicts[0].type, 'mts_toll');
  assert.ok(mVerdicts[0].tollAmount > 0);
  assert.equal(mVerdicts[0].wingShips, 0);
  assert.equal(mCharges.length, 1);
  assert.equal(mCharges[0].amount, mVerdicts[0].tollAmount);
  assert.equal(mCharges[0].reason, 'gate:toll');

  a.sim.dispose(); a2.sim.dispose(); b.sim.dispose();
});

// ── formation discovery via scan:completed ────────────────────────────────────────────────────

function rock(id, x, z, { radius = 8, mass = 500, typeId = 'rock_test_basalt', yieldU = 12 } = {}) {
  return { id, type: 'asteroid', alive: true, pos: { x, z }, radius, mass, data: { typeId, yieldU } };
}

function makeBus() {
  const emitted = [];
  const handlers = new Map();
  return {
    emitted,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

function bootFormations({ entities, seed = 47 } = {}) {
  const field = entities || [
    rock('ast_a', 0, 0), rock('ast_b', 14, 3), rock('ast_c', -3, 15), rock('ast_d', 12, 16),
    rock('ast_e', 900, 0, { typeId: 'rock_test_ice', yieldU: 30 }),
    rock('ast_f', -900, 400, { mass: 2200, radius: 16 }),
  ];
  const state = {
    meta: { seed },
    simTime: 120,
    world: {
      currentSectorId: 'sector_test_alpha',
      residentSectors: { sector_test_alpha: { epoch: 0 } },
    },
    entityList: field,
  };
  const bus = makeBus();
  const sys = Object.create(asteroidFormations);
  sys.init({ state, bus });
  return { sys, state, bus, field };
}

test('scan:completed discovers a formation only once every member body is surveyed', () => {
  const { sys, state, bus, field } = bootFormations();
  const model = sys.currentModel();
  const cluster = model.formations.find((f) => f.count >= 3)
    || model.formations.reduce((a, b) => (b.count > (a ? a.count : 0) ? b : a), null);
  assert.ok(cluster, 'the tight cluster derives a formation');

  // The kernel's memberIds are formationBodyKey()s; intersect the field on that same key.
  const clusterRocks = field.filter((r) => cluster.memberIds.includes(formationBodyKey(r)));
  assert.ok(clusterRocks.length >= 3, 'fixture cluster maps to ≥3 member bodies');
  const [first, second, ...rest] = clusterRocks;

  for (const r of [first, second]) r.data.scanHighlightUntil = state.simTime + 30;
  bus.emit('scan:completed', { sectorId: 'sector_test_alpha', found: { asteroids: 2 } });
  assert.equal(state.formations.order.length, 0, 'a partial survey cannot discover the formation');

  // The remaining members pulse-highlight on a later sweep → cumulative survey completes.
  for (const r of rest) r.data.scanHighlightUntil = state.simTime + 30;
  bus.emit('scan:completed', { sectorId: 'sector_test_alpha', found: { asteroids: rest.length } });
  assert.equal(state.formations.order.length, 1, 'the fully-surveyed formation is discovered');
  assert.equal(state.formations.order[0], cluster.id);

  const events = bus.emitted.filter((e) => e.name === 'formation:discovered');
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.formationId, cluster.id);
  assert.equal(events[0].payload.sectorId, 'sector_test_alpha');
  assert.ok(events[0].payload.designation, 'the event carries a name for journalism');

  // A later pulse touching already-surveyed bodies cannot re-discover or duplicate.
  for (const r of clusterRocks) r.data.scanHighlightUntil = state.simTime + 60;
  bus.emit('scan:completed', { sectorId: 'sector_test_alpha', found: { asteroids: clusterRocks.length } });
  assert.equal(state.formations.order.length, 1);
  assert.equal(bus.emitted.filter((e) => e.name === 'formation:discovered').length, 1);
});

test('surveyed body keys do not carry across an epoch boundary', () => {
  const { sys, state, bus } = bootFormations();
  const model = sys.currentModel();
  const cluster = model.formations.find((f) => f.count >= 3)
    || model.formations.reduce((a, b) => (b.count > (a ? a.count : 0) ? b : a), null);
  assert.ok(cluster, 'the fixture cluster derives a formation');
  const memberKeys = new Set(cluster.memberIds);
  const clusterRocks = state.entityList.filter((r) => memberKeys.has(formationBodyKey(r)));
  assert.ok(clusterRocks.length >= 3);

  // Survey every member in epoch 0 — that earns the epoch-0 formation, honestly.
  for (const r of clusterRocks) r.data.scanHighlightUntil = state.simTime + 30;
  bus.emit('scan:completed', { sectorId: 'sector_test_alpha', found: { asteroids: clusterRocks.length } });
  assert.equal(state.formations.order.length, 1);
  const epochZeroId = state.formations.order[0];
  assert.ok(sys._rt.surveyed.size >= clusterRocks.length, 'survey set is primed');

  // The field re-rolls in place: same physical rocks, new epoch. The epoch-scoped survey set
  // must reset with it — otherwise the stale quantized keys would auto-complete the new
  // formation on the first scan.
  state.world.residentSectors.sector_test_alpha.epoch = 9;
  sys.currentModel();
  assert.equal(sys._rt.surveyed.size, 0, 'surveyed set resets on the epoch boundary');
  assert.equal(state.formations.order.length, 1, 'no discovery rides on the stale survey set');

  // Earning it again still works: a fresh pulse over the same rocks discovers the new epoch's
  // formation under its own id (structure is body-derived; ids are seed-derived).
  state.simTime += 60;
  for (const r of clusterRocks) r.data.scanHighlightUntil = state.simTime + 30;
  bus.emit('scan:completed', { sectorId: 'sector_test_alpha', found: { asteroids: clusterRocks.length } });
  const epochNine = sys.currentModel().formations.find((f) => f.count === cluster.count)
    || sys.currentModel().formations[0];
  assert.ok(state.formations.order.length >= 2, 're-surveying discovers the new-epoch formation');
  assert.ok(state.formations.order.includes(epochNine.id), 'the epoch-9 id is what gets recorded');
  assert.notEqual(epochNine.id, epochZeroId);
});

// ── Chronicler registrations ───────────────────────────────────────────────────────────────────

test('chronicler normalizes, ingests, and persists the five world-visibility events', () => {
  const sim = createSimulation({ seed: 11, systems: [chronicler] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_x';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 100, hullMax: 100, data: { name: 'You' },
  });
  state.playerId = player.id;
  const raider = sim.spawn({
    type: 'ship', team: 1, pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 },
    radius: 6, hull: 60, hullMax: 60, data: { name: 'Red Vex' },
  });
  const hauler = sim.spawn({
    type: 'ship', team: 2, pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 80, hullMax: 80, data: { name: 'MTS Freighter Kestrel' },
  });

  bus.emit('encounter:ambientPredationTelegraph', {
    raidId: 'raid_x_1', raiderId: raider.id, targetId: hauler.id,
    manifestId: 'manifest_kestrel_1', sectorId: 'sector_x', telegraphS: 4.5, t: state.simTime,
  });
  bus.emit('freight:cargoSpilled', {
    carrierId: hauler.id, ownerId: hauler.id, ownerName: 'MTS Freighter Kestrel',
    factionId: 'faction_mts', attackerId: raider.id, encounterId: 'raid_x_1',
    manifestId: 'manifest_kestrel_1', cause: 'combat_fire',
    commodityId: 'cmdty_silicate', qty: 10, podCount: 1, podIds: [5001], t: state.simTime,
  });
  bus.emit('formation:discovered', {
    formationId: 'af_x_1', sectorId: 'sector_x',
    designation: 'Kite-Seven Vein', archetype: 'vein', archetypeName: 'Vein Cluster', count: 4,
  });
  bus.emit('gate:verdict', {
    gateKey: 'sector_x>sector_y', sectorId: 'sector_x', gateTo: 'sector_y',
    type: 'scn_scan', factionId: 'faction_scn', security: 0.9, wanted: false,
    tollAmount: 0, scanWing: 2, wingShips: 2, t: state.simTime,
  });
  bus.emit('claim:freightDelivered', { bodyId: 'body_depot_1', inbound: true, quantity: 120 });

  // Ingest the pending queue into stories.
  state.simTime += 1;
  sim.runTicks(3);

  const nodes = state.chronicler.stories.flatMap((s) => s.nodes);
  const byStage = new Map(nodes.map((f) => [f.stage, f]));
  for (const stage of ['spill', 'predation', 'survey', 'gate', 'delivery']) {
    assert.ok(byStage.has(stage), `chronicler retained a ${stage} fact`);
  }
  const spill = byStage.get('spill');
  assert.equal(spill.event, 'freight:cargoSpilled');
  assert.equal(spill.subject.name, 'MTS Freighter Kestrel');
  assert.equal(spill.details.commodityId, 'cmdty_silicate');
  assert.equal(spill.details.qty, 10);
  assert.equal(spill.details.manifestId, 'manifest_kestrel_1');
  assert.equal(spill.details.cause, 'combat_fire');
  // The telegraph and the spill share the raid's encounter group — one story, not two.
  const predation = byStage.get('predation');
  assert.equal(predation.group, 'encounter:raid_x_1');
  assert.equal(spill.group, 'encounter:raid_x_1');
  assert.equal(predation.actor.name, 'Red Vex');
  const survey = byStage.get('survey');
  assert.equal(survey.subject.name, 'Kite-Seven Vein');
  assert.equal(survey.details.count, 4);
  const gate = byStage.get('gate');
  assert.equal(gate.details.kind, 'scn_scan');
  assert.equal(gate.details.wingShips, 2);
  assert.equal(gate.details.gateTo, 'sector_y');
  const delivery = byStage.get('delivery');
  assert.equal(delivery.details.qty, 120);
  assert.equal(delivery.details.inbound, true);

  // Persistence: the snapshot round-trips through restoreMemory without a schema complaint.
  const snapshot = JSON.parse(JSON.stringify(state.chronicler));
  const restored = restoreMemory(snapshot, {}, state.simTime);
  const restoredStages = new Set(
    restored.stories.flatMap((s) => s.nodes.map((f) => f.stage)),
  );
  for (const stage of ['spill', 'predation', 'survey', 'gate', 'delivery']) {
    assert.ok(restoredStages.has(stage), `restored memory keeps the ${stage} fact`);
  }
  sim.dispose();
});
