import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  buildOriginContractOffer,
  CAREER_ORIGIN_CONTRACTS,
  ORIGIN_ROLE_KITS,
} from '../src/careers/origins/careerOriginContracts.js';
import {
  createCareerOriginsSystem,
  ensureCareerOriginsState,
  serializeCareerOrigins,
} from '../src/careers/origins/careerOrigins.js';
import { missions as missionsPrototype } from '../src/systems/missions.js';
import { ships as shipsPrototype } from '../src/systems/ships.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';

function makeState(seed = 1) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.playerId = 1;
  state.player.moduleInventory = [];
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 100,
  };
  state.world.currentSectorId = 'sector_helios_prime';
  return state;
}

function makeMockHarness(seed = 1) {
  const state = makeState(seed);
  const bus = createBus();
  const posted = [];
  const granted = [];
  const creditIntents = [];
  let nextMissionId = 1;
  const missionAuthority = {
    postAndAcceptAuthoredOffer(offer) {
      posted.push(structuredClone(offer));
      return { ok: true, offerId: offer.id, missionId: `m_${nextMissionId++}` };
    },
  };
  const shipAuthority = {
    grantModule(payload) { granted.push({ ...payload }); return true; },
  };
  const registry = {
    get(name) {
      if (name === 'missions') return missionAuthority;
      if (name === 'ships') return shipAuthority;
      return null;
    },
  };
  const origins = createCareerOriginsSystem();
  origins.init({ state, bus, registry });
  bus.on('economy:grantCredits', (payload) => creditIntents.push({ ...payload }));
  bus.emit('dock:docked', { stationId: 'station_helios' });
  return { state, bus, origins, posted, granted, creditIntents };
}

test('Hunter and Prospector author three physical mission-owned contracts with stable markers', () => {
  for (const careerId of ['hunter', 'prospector']) {
    assert.equal(CAREER_ORIGIN_CONTRACTS[careerId].length, 3);
    for (let i = 0; i < 3; i += 1) {
      const a = buildOriginContractOffer(makeState(71), careerId, i, 0);
      const b = buildOriginContractOffer(makeState(71), careerId, i, 0);
      assert.deepEqual(a, b, `${careerId} contract ${i} must be deterministic`);
      assert.equal(a.originCareer, careerId);
      assert.equal(a.originContractIndex, i);
      assert.equal(a.markerKind, 'mission-objective');
      assert.equal(a.markerId, `origin:${careerId}:${CAREER_ORIGIN_CONTRACTS[careerId][i].id}`);
      assert.ok(a.destSectorId, `${careerId} contract ${i} needs a physical destination`);
      if (careerId === 'hunter') assert.ok(a.storyTarget && a.storyTarget.name, 'hunter writ needs a named quarry');
    }
  }
  assert.equal(new Set(Object.values(ORIGIN_ROLE_KITS).map((kit) => kit.defId)).size, 3,
    'origin upgrades must create three different utility-slot build choices');
  const hitch = SHIPS.find((ship) => ship.id === 'ship_kestrel');
  assert.equal(hitch.slots.utility.length, 1, 'Hitch origin kits must compete for one real slot');
  for (const kit of Object.values(ORIGIN_ROLE_KITS)) {
    const def = MODULES.find((module) => module.id === kit.defId);
    assert.equal(def.slotType, 'utility');
    assert.equal(def.size, 'S');
  }
  for (const defs of Object.values(CAREER_ORIGIN_CONTRACTS)) {
    for (const def of defs) {
      assert.ok(def.rewardCr >= 0, 'origin contracts cannot create impossible negative rewards');
      assert.ok(!def.params?.qty || def.params.qty <= 40, 'origin cargo must fit the starter hold');
    }
  }
});

test('failed mission posting rolls drill and route state back atomically', () => {
  const state = makeState(77);
  const bus = createBus();
  const origins = createCareerOriginsSystem();
  origins.init({
    state, bus,
    registry: { get: (name) => name === 'missions' ? { postAndAcceptAuthoredOffer: () => ({ ok: false, reason: 'closed' }) } : null },
  });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  const before = serializeCareerOrigins(state);
  assert.deepEqual(origins.accept('hunter'), { ok: false, reason: 'closed' });
  assert.deepEqual(serializeCareerOrigins(state), before);
});

test('twenty seeds complete both mission routes and grant exactly one role upgrade', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    for (const careerId of ['hunter', 'prospector']) {
      const { state, bus, origins, posted, granted, creditIntents } = makeMockHarness(seed);
      assert.equal(origins.accept(careerId).ok, true);
      while (state.careers.origins.__meta.routes[careerId].status === 'active') {
        const route = state.careers.origins.__meta.routes[careerId];
        assert.ok(route.activeMissionId, `${careerId} seed ${seed} must bind a mission id`);
        bus.emit('mission:completed', { missionId: route.activeMissionId, type: posted.at(-1).type });
      }
      const route = state.careers.origins.__meta.routes[careerId];
      assert.equal(route.status, 'completed');
      assert.deepEqual(route.completedContractIds, CAREER_ORIGIN_CONTRACTS[careerId].map((def) => def.id));
      assert.equal(granted.length, 1);
      assert.equal(granted[0].defId, ORIGIN_ROLE_KITS[careerId].defId);
      assert.equal(state.careers.origins.__meta.upgradeReceipts[careerId].defId, granted[0].defId);
      const leaf = state.careers.origins[careerId];
      assert.equal(leaf.status || leaf.offer.status, 'completed', 'career ladder prerequisite must unlock');
      assert.equal(creditIntents.filter((intent) => intent.reason === `origin:${careerId}:complete`).length, 1,
        'origin completion reward must use one economy-owned intent');
    }
  }
});

test('failed contract recovers at dock without changing objective identity', () => {
  const { state, bus, origins, posted } = makeMockHarness(88);
  assert.equal(origins.accept('hunter').ok, true);
  let route = state.careers.origins.__meta.routes.hunter;
  const firstMissionId = route.activeMissionId;
  const firstMarkerId = posted.at(-1).markerId;
  const firstOfferId = posted.at(-1).id;

  bus.emit('mission:failed', { missionId: firstMissionId, reason: 'player_destroyed' });
  route = state.careers.origins.__meta.routes.hunter;
  assert.equal(route.status, 'recovering');
  assert.equal(route.lastFailure.recovery, 'dock_to_reissue');
  bus.emit('dock:docked', { stationId: 'station_helios' });
  route = state.careers.origins.__meta.routes.hunter;

  assert.equal(route.status, 'active');
  assert.notEqual(route.activeMissionId, firstMissionId);
  assert.notEqual(posted.at(-1).id, firstOfferId);
  assert.equal(posted.at(-1).markerId, firstMarkerId);
  assert.equal(route.contractIndex, 0);
});

test('Prospector public route advances scan to extraction to sale through real missions authority', () => {
  const state = makeState(1907);
  const bus = createBus();
  const missionSystem = { ...missionsPrototype };
  const shipSystem = { ...shipsPrototype };
  const origins = createCareerOriginsSystem();
  const registry = {
    get(name) {
      if (name === 'missions') return missionSystem;
      if (name === 'ships') return shipSystem;
      return null;
    },
  };
  origins.init({ state, bus, registry });
  missionSystem.init({ state, bus, helpers: {} });
  shipSystem.init({ state, bus, helpers: {} });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(origins.accept('prospector').ok, true);

  let route = state.careers.origins.__meta.routes.prospector;
  let mission = state.missions.active.find((m) => m.id === route.activeMissionId);
  assert.equal(mission.type, 'recon_scan');
  assert.equal(state.nav.waypoint.markerId, 'origin:prospector:ceres_survey');
  assert.equal(state.nav.waypoint.markerKind, 'mission-objective');

  state.world.currentSectorId = 'sector_ceres_belt';
  const rock = {
    id: 91, type: 'asteroid', alive: true, pos: { x: 80, z: 0 },
    data: { typeId: 'ast_metallic', scanOreGlyph: 'Fe' },
  };
  state.entities.set(rock.id, rock);
  state.entityList.push(rock);
  bus.emit('scan:completed', { sectorId: 'sector_ceres_belt', found: { asteroids: 1 } });
  route = state.careers.origins.__meta.routes.prospector;
  mission = state.missions.active.find((m) => m.id === route.activeMissionId);
  assert.equal(mission.type, 'mining_quota');
  assert.equal(state.nav.waypoint.markerId, 'origin:prospector:iron_sample');

  bus.emit('mining:yield', { minerId: state.playerId, commodityId: 'cmdty_ore_iron', qty: 6 });
  route = state.careers.origins.__meta.routes.prospector;
  mission = state.missions.active.find((m) => m.id === route.activeMissionId);
  assert.equal(mission.type, 'bulk_trade');
  assert.equal(state.nav.waypoint.markerId, 'origin:prospector:refinery_assay');

  bus.emit('economy:tradeCompleted', {
    side: 'sell', stationId: 'station_ceres', commodityId: 'cmdty_ore_iron', qty: 6, total: 192,
  });
  route = state.careers.origins.__meta.routes.prospector;
  assert.equal(route.status, 'completed');
  assert.equal(state.careers.origins.prospector.status, 'completed');
  assert.equal(state.player.moduleInventory.filter((item) => item.defId === 'mod_winch_hd').length, 1);
});

test('Hunter acceptance materializes a real marked contact outside the station UI', () => {
  const state = makeState(1911);
  const bus = createBus();
  const player = { id: state.playerId, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  let entityId = 200;
  const missionSystem = { ...missionsPrototype };
  const origins = createCareerOriginsSystem();
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: entityId++,
        type: spec.type || 'ship',
        alive: true,
        pos: { ...spec.pos },
        data: structuredClone(spec.data || {}),
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const registry = { get: (name) => name === 'missions' ? missionSystem : null };
  origins.init({ state, bus, registry });
  missionSystem.init({ state, bus, helpers });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(origins.accept('hunter').ok, true);

  const route = state.careers.origins.__meta.routes.hunter;
  const mission = state.missions.active.find((candidate) => candidate.id === route.activeMissionId);
  assert.equal(mission.type, 'bounty_hunt');
  assert.equal(mission.targetEntityIds.length, 1);
  const contact = state.entities.get(mission.targetEntityIds[0]);
  assert.ok(contact && contact.alive && Number.isFinite(contact.pos.x) && Number.isFinite(contact.pos.z));
  assert.equal(contact.data.missionTag, mission.id);
  assert.equal(state.nav.waypoint.targetEntityId, contact.id);
  assert.equal(state.nav.waypoint.markerId, 'origin:hunter:yard_writ');
});

test('mid-chain save/load preserves mission id, origin marker, destination, and route cursor', () => {
  const state = makeState(441);
  const bus = createBus();
  const missionsA = { ...missionsPrototype };
  const shipsA = { ...shipsPrototype };
  const originsA = createCareerOriginsSystem();
  const registryA = { get: (name) => name === 'missions' ? missionsA : name === 'ships' ? shipsA : null };
  originsA.init({ state, bus, registry: registryA });
  missionsA.init({ state, bus, helpers: {} });
  shipsA.init({ state, bus, helpers: {} });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(originsA.accept('prospector').ok, true);
  const before = {
    route: structuredClone(state.careers.origins.__meta.routes.prospector),
    waypoint: structuredClone(state.nav.waypoint),
    missions: missionsA.serialize(),
    origins: serializeCareerOrigins(state),
  };

  const restored = makeState(441);
  const busB = createBus();
  const missionsB = { ...missionsPrototype };
  const originsB = createCareerOriginsSystem();
  const registryB = { get: (name) => name === 'missions' ? missionsB : null };
  originsB.init({ state: restored, bus: busB, registry: registryB });
  missionsB.init({ state: restored, bus: busB, helpers: {} });
  missionsB.deserialize(structuredClone(before.missions));
  originsB.deserialize(structuredClone(before.origins));

  const afterRoute = ensureCareerOriginsState(restored).__meta.routes.prospector;
  assert.deepEqual(afterRoute, before.route);
  assert.equal(restored.nav.waypoint.missionId, before.waypoint.missionId);
  assert.equal(restored.nav.waypoint.markerId, before.waypoint.markerId);
  assert.equal(restored.nav.waypoint.markerKind, 'mission-objective');
  assert.equal(restored.nav.waypoint.sectorId, before.waypoint.sectorId);
});
