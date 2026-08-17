import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { frontierRumorOffer } from '../src/data/frontierRumors.js';
import { PALLAS_HIDDEN_CACHE } from '../src/data/pallasHiddenCache.js';
import { CERES_ACTIVITY_POCKETS } from '../src/data/sectorActivityPockets.js';
import { SECTORS } from '../src/data/sectors.js';
import { WRECK_CATHEDRAL_SETTLEMENT } from '../src/data/wreckCathedralSettlement.js';
import { worldSiteAssetBinding } from '../src/data/worldSiteAssetBindings.js';
import { save } from '../src/save/saveSystem.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { buildSystemModel } from '../src/ui/galaxyMap.js';
import { createUiInput } from '../src/ui/input.js';
import { evaluatePq018CoordinateReservation } from '../scripts/lib/pq018CoordinateReservation.mjs';

// Intent: prove the last Plan 25 Cathedral loop is one ordinary physical settlement: a real berth
// inside the admitted hulk, Economy-owned weird-goods trade, a paid clue into Pallas' existing
// manifest/cache chain, and player-triggerable combat answered by the existing Cathedral patrol.

const SITE_ID = WRECK_CATHEDRAL_SETTLEMENT.worldSiteId;

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.body = { tagName: 'BODY', isContentEditable: false };
    this.activeElement = this.body;
    this.documentElement = { classList: { add() {}, remove() {} } };
  }

  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  removeEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((candidate) => candidate !== fn));
  }

  getElementById() { return null; }
}

function playerSpec() {
  return {
    type: 'ship', team: 0, factionId: 'faction_free', collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 40, hull: 300, hullMax: 300,
    flags: { persistent: true },
    data: { kind: 'player', isPlayer: true },
  };
}

function boot(seed = 0x25ca) {
  const sim = createSimulation({
    seed,
    systems: [cargo, economy, lawSecurity, aiPorts, npcJobsRuntime, traffic, world, asteroidSites, save],
    updateOrder: [npcJobsRuntime, traffic, lawSecurity, economy, world, asteroidSites],
  });
  const worldOwner = sim.registry.get('world');
  worldOwner.newGame();
  sim.registry.get('lawSecurity').newGame();
  const player = sim.spawn(playerSpec());
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.ui.docked = false;
  sim.state.input.actions = {};
  sim.state.player.credits = 20_000;
  sim.state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100,
  };
  worldOwner.enterSector(WRECK_CATHEDRAL_SETTLEMENT.sectorId, { placePlayer: false });
  return {
    sim,
    state: sim.state,
    bus: sim.bus,
    player,
    world: worldOwner,
    law: sim.registry.get('lawSecurity'),
    save: sim.registry.get('save'),
  };
}

function liveBy(state, predicate) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false && predicate(entity));
}

function stationFor(state) {
  return liveBy(state, (entity) => entity.type === 'station'
    && entity.data?.stationId === WRECK_CATHEDRAL_SETTLEMENT.stationId)[0] || null;
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, (
      (point.x - start.x) * dx + (point.z - start.z) * dz
    ) / lengthSquared))
    : 0;
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.z - (start.z + dz * t),
  );
}

function actorRouteClearance(root, station, actor) {
  const slot = CERES_ACTIVITY_POCKETS
    .flatMap((pocket) => pocket.actorSlots)
    .find((candidate) => candidate.id === actor.data?.activityActorSlotId);
  const marks = slot?.route?.marks || [];
  assert.equal(marks.length, 2, `${slot?.id || 'actor'} retains its authored physical route`);
  const points = marks.map((mark) => ({
    x: root.pos.x + mark.offset.x,
    z: root.pos.z + mark.offset.z,
  }));
  return pointSegmentDistance(station.pos, points[0], points[1]) - station.radius - actor.radius;
}

function installDockCommand(route) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeEventTarget();
  globalThis.window = new FakeEventTarget();
  const screenManager = {
    isOpen: () => false,
    getActiveScreenDef: () => null,
    pushScreen() {},
    popScreen() {},
  };
  const input = createUiInput({ state: route.state, bus: route.bus }, screenManager);
  return {
    close() {
      input.dispose();
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
  };
}

test('Bell Cloister is a clear physical berth inside the Cathedral and trades its weird stock', () => {
  const route = boot();
  let dockCommand = null;
  try {
    const sector = SECTORS.find((entry) => entry.id === WRECK_CATHEDRAL_SETTLEMENT.sectorId);
    const catalog = sector?.stations.find((entry) => entry.id === WRECK_CATHEDRAL_SETTLEMENT.stationId);
    assert.ok(catalog && catalog.type === 'blackmarket' && catalog.services.includes('black_market'));
    assert.equal(buildSystemModel(route.state, sector.id).points
      .some((point) => point.stationId === WRECK_CATHEDRAL_SETTLEMENT.stationId), true,
    'the ordinary one-hop Ceres chart exposes the settlement berth');

    const station = stationFor(route.state);
    const root = liveBy(route.state, (entity) => entity.data?.worldSiteId === SITE_ID
      && entity.data?.role === 'world_site_root')[0];
    const walls = liveBy(route.state, (entity) => entity.data?.worldSiteId === SITE_ID
      && entity.data?.role === 'world_site_collision');
    assert.ok(station && root && walls.length === 7);
    assert.equal(station.collides, true);
    assert.equal(station.data.dockRadius, 60);
    assert.equal(station.data.archetypeGlb, WRECK_CATHEDRAL_SETTLEMENT.archetypeGlb);
    assert.equal(station.data.embeddedWorldSiteId, SITE_ID);
    assert.equal(station.data.ambientTraffic, false);
    assert.ok(Math.hypot(station.pos.x - root.pos.x, station.pos.z - root.pos.z) < 180,
      'the berth is embedded in the hulk rather than parked beside the landmark');
    assert.ok(walls.every((wall) => Math.hypot(
      station.pos.x - wall.pos.x,
      station.pos.z - wall.pos.z,
    ) > station.radius + wall.radius), 'the dock sphere occupies the authored stern breach, not a hull wall');

    const binding = worldSiteAssetBinding(root.data.placeId);
    const visualCenter = binding.visualCenterXZ;
    const flythrough = ['SOCKET_Flythrough_Entry', 'SOCKET_Flythrough_Exit'].map((socketId) => {
      const translation = binding.sockets[socketId].transform.translation;
      return {
        x: root.pos.x + translation[0] - visualCenter.x,
        z: root.pos.z + translation[2] - visualCenter.z,
      };
    });
    assert.ok(pointSegmentDistance(station.pos, flythrough[0], flythrough[1])
      > station.radius + route.player.radius,
    'a real starter hull still clears the modeled fly-through past the embedded station');

    const salvor = liveBy(route.state, (entity) => entity.data?.activityActorSlotId === 'ceres_cathedral_salvor')[0];
    const patrol = liveBy(route.state, (entity) => entity.data?.activityActorSlotId === 'ceres_cathedral_patrol')[0];
    assert.ok(actorRouteClearance(root, station, salvor) > 0);
    assert.ok(actorRouteClearance(root, station, patrol) > 0,
      'the settlement does not clip either existing Cathedral job route at real hull radii');
    assert.equal(route.sim.registry.get('traffic')._sectorStations().includes(station), false,
      'the embedded berth remains dockable but is not an ambient spawn or lane endpoint');
    const reservation = evaluatePq018CoordinateReservation();
    assert.equal(reservation.pass, true, reservation.failures.join('\n'));
    assert.equal(reservation.constraints.some((row) => row.id.includes(station.data.stationId)), false,
      'the named embedded berth does not masquerade as a competing reserved body or lane node');

    route.player.pos.x = station.pos.x + station.data.dockRadius - route.player.radius;
    route.player.pos.z = station.pos.z;
    const docked = [];
    route.bus.on('dock:docked', (payload) => docked.push(payload));
    dockCommand = installDockCommand(route);
    route.bus.emit('dock:range', { stationId: WRECK_CATHEDRAL_SETTLEMENT.stationId, inRange: true });
    route.bus.emit('touch:uiAction', { action: 'dock' });
    assert.deepEqual(docked, [{ stationId: WRECK_CATHEDRAL_SETTLEMENT.stationId }],
      'the shipped dock command admits the physical berth');

    const market = route.state.economy.markets[WRECK_CATHEDRAL_SETTLEMENT.stationId];
    assert.ok(market);
    for (const commodityId of WRECK_CATHEDRAL_SETTLEMENT.weirdGoods) {
      const listing = market[commodityId];
      assert.ok(listing, `${commodityId} is present in the real market`);
      assert.equal(
        listing.equilibrium / listing.baseEq,
        WRECK_CATHEDRAL_SETTLEMENT.marketEquilibriumFactors[commodityId],
        `${commodityId} uses the authored abundance target`,
      );
    }
    const trades = [];
    route.bus.on('economy:tradeCompleted', (receipt) => trades.push(receipt));
    const creditsBefore = route.state.player.credits;
    route.bus.emit('ui:buy', { commodityId: 'cmdty_stolen_goods', qty: 1 });
    assert.equal(route.state.player.cargo.items.cmdty_stolen_goods, 1,
      'the player receives the odd lot through Cargo ownership');
    assert.ok(route.state.player.credits < creditsBefore, 'Economy charges the real purchase');
    assert.equal(trades.at(-1)?.stationId, WRECK_CATHEDRAL_SETTLEMENT.stationId);
  } finally {
    dockCommand?.close();
    route.sim.dispose();
  }
});

test('the Bell Cloister ledger survives Continue and resolves through the physical Pallas manifest clue', () => {
  const route = boot(0x25cb);
  try {
    route.state.ui.docked = true;
    route.state.ui.dockedStationId = WRECK_CATHEDRAL_SETTLEMENT.stationId;
    const offer = frontierRumorOffer(route.state, WRECK_CATHEDRAL_SETTLEMENT.stationId);
    assert.equal(offer?.id, WRECK_CATHEDRAL_SETTLEMENT.rumor.id);
    assert.equal(offer?.targetId, PALLAS_HIDDEN_CACHE.cluePoiId);
    assert.equal(offer?.targetPlaceKind, 'poi');
    assert.ok(offer.radius < 600, 'the Cathedral sells a materially narrow search instead of a waypoint');
    route.bus.emit('ui:purchaseFrontierRumor', {
      rumorId: offer.id,
      stationId: WRECK_CATHEDRAL_SETTLEMENT.stationId,
    });
    assert.equal(route.state.world.frontierRumors.byId[offer.id]?.phase, 'rumored');

    const envelope = route.save.serialize('plan25-wreck-cathedral-settlement');
    assert.equal(route.save.loadEnvelope(structuredClone(envelope), 'plan25-wreck-cathedral-settlement'), true);
    assert.equal(route.state.world.frontierRumors.byId[offer.id]?.phase, 'rumored');
    const restoredBerths = liveBy(route.state, (entity) => entity.type === 'station'
      && entity.data?.stationId === WRECK_CATHEDRAL_SETTLEMENT.stationId);
    assert.equal(restoredBerths.length, 1,
      'Continue restores one berth rather than minting a second settlement');
    assert.equal(restoredBerths[0].data.ambientTraffic, false);
    assert.equal(route.sim.registry.get('traffic')._sectorStations().includes(restoredBerths[0]), false,
      'Continue cannot turn the embedded berth into an ambient traffic endpoint');

    route.world.enterSector(PALLAS_HIDDEN_CACHE.sectorId, { placePlayer: false });
    const wreck = liveBy(route.state, (entity) => entity.data?.poiId === PALLAS_HIDDEN_CACHE.cluePoiId)[0];
    assert.ok(wreck && wreck.data?.placeId === 'place_dead_hulk'
      && wreck.data?.requiresActiveScan === true && wreck.data?.manualInvestigation === true,
    'the card leads to the existing modeled pirate-wreck investigation, not a rumor-owned prop');
    const player = route.state.entities.get(route.state.playerId);
    player.pos.x = wreck.pos.x;
    player.pos.z = wreck.pos.z;
    route.bus.emit('signal:investigated', {
      signalId: PALLAS_HIDDEN_CACHE.clueSignalId,
      sourceId: PALLAS_HIDDEN_CACHE.cluePoiId,
      sourceKind: 'wreck',
      sectorId: PALLAS_HIDDEN_CACHE.sectorId,
      pos: { x: wreck.pos.x, z: wreck.pos.z },
      completedAt: route.state.simTime,
    });
    assert.equal(route.state.world.frontierRumors.byId[offer.id].phase, 'resolved');
    assert.equal(route.state.world.pallasHiddenCache.phase, 'searching',
      'the existing Pallas authority turns the manifest into its approximate cache search');
    assert.equal(route.state.world.pallasHiddenCache.evidence.carrier, 'physical_pirate_wreck_manifest');
  } finally {
    route.sim.dispose();
  }
});

test('shooting the live Cathedral salvor inside the berth dispatches the existing lawful patrol', () => {
  const route = boot(0x25cc);
  try {
    const station = stationFor(route.state);
    const salvor = liveBy(route.state, (entity) => entity.data?.activityActorSlotId === 'ceres_cathedral_salvor')[0];
    const patrol = liveBy(route.state, (entity) => entity.data?.activityActorSlotId === 'ceres_cathedral_patrol')[0];
    assert.ok(station && salvor && patrol, 'ordinary Ceres entry materializes the complete Cathedral cast');
    assert.ok(Math.hypot(salvor.pos.x - station.pos.x, salvor.pos.z - station.pos.z) < 180);
    assert.ok(Math.hypot(patrol.pos.x - station.pos.x, patrol.pos.z - station.pos.z) < 180,
      'both physical hulls begin inside the Cathedral settlement volume');

    route.player.pos.x = salvor.pos.x - 18;
    route.player.pos.z = salvor.pos.z;
    route.bus.emit('combat:damage', {
      attackerId: route.player.id,
      targetId: salvor.id,
      applied: 12,
      amount: 12,
      kind: 'kinetic',
    });
    const incident = Object.values(route.state.lawSecurity.incidents)[0];
    assert.ok(incident);
    assert.equal(incident.stationId, WRECK_CATHEDRAL_SETTLEMENT.stationId,
      'the interior berth supplies the lawful jurisdiction instead of a scripted encounter');
    route.state.simTime = incident.dispatchAt;
    route.state.tick = Math.max(1, route.state.tick | 0);
    route.law.update(SIM_DT, route.state);
    assert.equal(incident.responderIds.includes(patrol.id), true,
      'the existing Cathedral patrol leaves its durable job to answer the player');
    assert.equal(patrol.data.ai.securityTargetId, route.player.id);
    assert.equal(patrol.data.ai.engagementTrigger, 'security_response');
    assert.equal(patrol.data.ai.passive, false);
  } finally {
    route.sim.dispose();
  }
});

test('the DMC berth jurisdiction, not a hidden encounter flag, authorizes the Cathedral response', () => {
  const route = boot(0x25cd);
  try {
    const station = stationFor(route.state);
    const salvor = liveBy(route.state, (entity) => entity.data?.activityActorSlotId === 'ceres_cathedral_salvor')[0];
    assert.ok(station && salvor);
    station.factionId = 'faction_reach';
    station.data.factionId = 'faction_reach';
    route.player.pos.x = salvor.pos.x - 18;
    route.player.pos.z = salvor.pos.z;
    route.bus.emit('combat:damage', {
      attackerId: route.player.id,
      targetId: salvor.id,
      applied: 12,
      amount: 12,
      kind: 'kinetic',
    });
    assert.deepEqual(Object.values(route.state.lawSecurity.incidents), [],
      'without a lawful station, the same physical shot cannot mint a patrol incident');
  } finally {
    route.sim.dispose();
  }
});
