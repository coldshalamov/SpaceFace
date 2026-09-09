// Lane B: leftover cosmetic fx leave entityList. Pins, heads, capsules, rocks, and
// colliding lane hardware stay live entities. Courier drones stay entities — no presenter pool.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { Masks } from '../src/core/entity.js';
import { OUTPOSTS } from '../src/data/automation.js';
import {
  PQ019_CAPSULE,
  PQ019_FACILITIES,
  PQ019_HEIST_SECTOR_ID,
} from '../src/data/heistFacilities.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { automation } from '../src/systems/automation.js';
import { asteroidSites, makeSiteRecord } from '../src/systems/asteroidSites.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import { travelLanes, CERES_SLING_RING } from '../src/systems/travelLanes.js';
import { LANE_HELIOS_TETHYS, buildLaneGeometry } from '../src/data/travelLaneRoutes.js';
import {
  dropDressingRow,
  forEachDressingRow,
  getDressingRow,
  insertDressingRow,
} from '../src/world/dressingTable.js';

const LANE_GEOMETRY = buildLaneGeometry(LANE_HELIOS_TETHYS);

function dressingRoles(state, role) {
  const rows = [];
  forEachDressingRow(state, (row) => {
    if (row.data?.heistFacilityRole === role) rows.push(row);
  });
  return rows;
}

function liveRoles(state, role) {
  return (state.entityList || []).filter((entity) => (
    entity?.alive !== false && entity.data?.heistFacilityRole === role
  ));
}

function bootHeist() {
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    nextEntityId: 10,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: PQ019_HEIST_SECTOR_ID },
  };
  const spawned = [];
  const helpers = {
    spawnEntity(spec = {}) {
      const entity = {
        ...spec,
        id: state.nextEntityId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
    getEntity: (id) => state.entities.get(id) || null,
  };
  const inst = Object.create(heistFacilities);
  inst.init({ state, bus: createBus(), helpers });
  return { state, spawned, inst };
}

function bootAutomation() {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 940, z: -375 }, vel: { x: 0, z: 0 }, data: {},
  };
  const state = {
    mode: 'flight',
    simTime: 100,
    meta: { seed: 73 },
    playerId: 1,
    player: {
      credits: 1_000_000,
      droneTierCap: 4,
      researchedNodes: ['tech_outpost_charter'],
      stats: {},
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 200 },
      ownedShips: [],
    },
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: {
        id: 'sector_helios_prime',
        fields: [{ id: 'field_helios_test', type: 'ast_common_rock', center: { x: 820, z: -290 } }],
      },
    },
    entities: new Map([[1, player]]),
    entityList: [player],
    entityIndex: { asteroids: [] },
    automation: null,
  };
  const helpers = {
    player: () => state.entities.get(1) || null,
    getEntity: (id) => state.entities.get(id) || null,
    spawnEntity(spec = {}) {
      const entity = {
        ...spec,
        id: (state.nextEntityId = (state.nextEntityId || 100) + 1),
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const inst = Object.create(automation);
  inst.init({ state, bus: createBus(), helpers, registry: null });
  inst.newGame();
  inst._orePrice = () => 28;
  inst._stationPrice = () => 28;
  return { state, inst };
}

function bootSites() {
  const entities = new Map();
  const entityList = [];
  const state = {
    simTime: 0, tick: 0, meta: { seed: 47 },
    entities, entityList, playerId: 1,
    player: {
      cargo: {
        items: {
          cmdty_regocrete: 40, cmdty_control_unit: 8, cmdty_refined_metals: 12,
          cmdty_electronics: 8, cmdty_purified_silica: 6,
        },
        usedVolume: 0, usedMass: 0, capVolume: 900, capMass: 1400,
      },
    },
    world: { currentSectorId: 'sec_core_alpha' },
    content: { commodities: COMMODITIES },
  };
  const spawned = [];
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, alive: true, ...spec };
      ent.data = spec.data || {};
      entities.set(ent.id, ent);
      entityList.push(ent);
      spawned.push(ent);
      return ent;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus: createBus(), helpers, registry: { get: () => null } });
  return { sys, state, entities, spawned };
}

test('dropDressingRow removes one row and leaves the rest', () => {
  const state = { world: {}, entities: new Map() };
  const a = insertDressingRow(state, { pos: { x: 1, z: 2 }, data: { tag: 'a' } });
  const b = insertDressingRow(state, { pos: { x: 3, z: 4 }, data: { tag: 'b' } });
  assert.equal(dropDressingRow(state, a.id), true);
  assert.equal(getDressingRow(state, a.id), null);
  assert.equal(getDressingRow(state, b.id)?.data.tag, 'b');
});

test('heist facility visuals leave the live list; heads and the capsule stay colliding entities', () => {
  const { state, spawned, inst } = bootHeist();
  inst.materializeForSector(PQ019_HEIST_SECTOR_ID);

  for (const facility of Object.values(PQ019_FACILITIES)) {
    const visuals = dressingRoles(state, `${facility.role}_visual`);
    const heads = liveRoles(state, `${facility.role}_head`);
    assert.equal(visuals.length, 1, `${facility.id} visual is one dressing row`);
    assert.equal(liveRoles(state, `${facility.role}_visual`).length, 0);
    assert.equal(visuals[0].collides, false);
    assert.equal(visuals[0].dressingResident, true);
    assert.equal(heads.length, 1, `${facility.id} socket head stays a live entity`);
    assert.equal(heads[0].collides, true);
    assert.equal(heads[0].collisionMask, Masks.PAYLOAD);
    assert.equal(heads[0].flags?.missionPinned, true, `${facility.id} head stays in Rapier when the player is far`);
    assert.equal(state.entities.has(heads[0].id), true);
  }

  inst.requestLaunchSchedule({ scheduleId: 'lane-b-capsule', launchAtSimT: 0 });
  inst.update(1 / 60, state);
  const capsules = liveRoles(state, 'cargo_capsule');
  assert.equal(capsules.length, 1);
  assert.equal(capsules[0].type, 'payload');
  assert.equal(capsules[0].collides, true);
  assert.equal(capsules[0].flags?.missionPinned, true);
  assert.equal(capsules[0].data?.missionPinned, true);
  assert.equal(capsules[0].radius, PQ019_CAPSULE.radius);
  assert.ok(spawned.some((entity) => entity.data?.heistFacilityRole === 'cargo_capsule'));
  assert.equal(spawned.filter((entity) => String(entity.data?.heistFacilityRole || '').endsWith('_visual')).length, 0);
});

test('an automation outpost visual is a dressing row and rematerializes without scanning only entityList', () => {
  const { state, inst } = bootAutomation();
  assert.equal(inst.buildOutpost('outpost_refinery'), true);
  const outpost = state.automation.outposts[0];
  const def = OUTPOSTS.find((entry) => entry.id === 'outpost_refinery');
  assert.ok(def);
  const rows = [];
  forEachDressingRow(state, (row) => {
    if (row.data?.automationOutpostId === outpost.id) rows.push(row);
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dressingResident, true);
  assert.equal(rows[0].collides, false);
  assert.equal((state.entityList || []).some((entity) => entity.data?.automationOutpostId === outpost.id), false);
  assert.equal(outpost.entityId, rows[0].id);

  const staleId = outpost.entityId;
  delete outpost.entityId;
  inst._syncOutpostPresence(state.automation);
  assert.equal(outpost.entityId, staleId, 'reconcile finds the dressing row after the ledger id is lost');
  let after = 0;
  forEachDressingRow(state, (row) => {
    if (row.data?.automationOutpostId === outpost.id) after += 1;
  });
  assert.equal(after, 1);
});

test('a producing site relay is dressing; the anchored rock and courier drone stay entities', () => {
  const h = bootSites();
  const rock = {
    id: 42, type: 'asteroid', alive: true, pos: { x: 120, z: -40 }, radius: 9, collides: true,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1', siteId: 'site_lane_b' },
  };
  h.entities.set(42, rock);
  h.state.entityList.push(rock);
  const site = makeSiteRecord({
    id: 'site_lane_b', asteroidId: 42, sectorId: 'sec_core_alpha', fieldId: 'field_1', createdT: 0,
  });
  site.anchored = true;
  site.anchor = { x: 120, z: -40, radius: 9, typeId: 'ast_common_rock', yieldU: 18 };
  site.survey = { lifecycle: 'producing', receipt: { receiptId: 'lane-b-relay' } };
  h.state.sites.byId[site.id] = site;
  h.state.sites.order.push(site.id);

  h.sys._ensureBeacon(site);
  const relays = [];
  forEachDressingRow(h.state, (row) => {
    if (row.data?.siteBeacon === site.id) relays.push(row);
  });
  assert.equal(relays.length, 1);
  assert.equal(relays[0].dressingResident, true);
  assert.equal(relays[0].collides, false);
  assert.equal(h.spawned.filter((entity) => entity.data?.siteBeacon === site.id).length, 0);
  assert.equal((h.state.entityList || []).some((entity) => entity.data?.siteBeacon === site.id), false);
  assert.equal(h.state.entities.get(42).type, 'asteroid');
  assert.equal(h.state.entities.get(42).collides, true);

  h.sys._spawnCourierVisual(site, h.state, 'world:site-courier');
  const courier = h.spawned.find((entity) => entity.data?.kind === 'site_courier');
  assert.ok(courier, 'site courier stays a live drone entity; no presenter pool exists');
  assert.equal(courier.type, 'drone');
  assert.equal(h.state.entities.has(courier.id), true);
});

test('travel-lane beacons, sling hauler, and manufactured claim-travel stay live entities', () => {
  const player = {
    id: 1,
    pos: { ...LANE_GEOMETRY.beacons[0].pos },
    vel: { x: 0, z: 0 },
    rot: 0,
  };
  const state = {
    playerId: 1,
    simTime: 100,
    entities: new Map([[1, player]]),
    entityList: [player],
    player: {},
    input: { travelDrive: { state: 'engaged', cap: 0 } },
  };
  const spawned = [];
  let nextId = 200;
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, alive: true, ...spec, pos: { ...spec.pos } };
      spawned.push(ent);
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      return ent;
    },
  };
  const sys = Object.create(travelLanes);
  sys.init({
    state,
    bus: createBus(),
    helpers,
    registry: { get: () => null },
  });

  sys._updateBeacons(state, player);
  const beacon = spawned.find((entity) => entity.type === 'beacon');
  assert.ok(beacon, 'lane beacons stay type beacon for dropout foreshadow');
  assert.equal(state.entities.has(beacon.id), true);
  assert.notEqual(beacon.type, 'fx');

  player.pos = { ...CERES_SLING_RING.globalPos };
  sys._updateSlingHauler(1 / 60, state, player);
  const hauler = spawned.find((entity) => entity.type === 'ship');
  assert.ok(hauler, 'the Ceres sling hauler stays a ship');
  assert.equal(hauler.collides, true);
  assert.equal(hauler.data.parentType, 'sling_ring_traffic');

  const ringPos = { x: player.pos.x + 10, z: player.pos.z };
  const route = {
    infrastructure: {
      id: 'claim_lane_b',
      name: 'Lane B ring',
      stage: 'online',
      operational: true,
      from: ringPos,
      support: ringPos,
    },
    body: { id: 'claim_lane_b', sectorId: 'sector_ceres_belt' },
    geometry: { axis: { x: 1, z: 0 } },
    presentationStage: null,
    presentationOperational: null,
    ringKey: 'claim_lane_b:ring',
    relayKey: 'claim_lane_b:relay',
    ringLabel: 'ring',
    relayLabel: 'relay',
  };
  sys._ensureManufacturedStructure(
    state, player, helpers.spawnEntity, state.entities, route, route.body,
    route.ringKey, 'ring', ringPos, 'place_gate_jump_ring', 0.72, 20, 'ONLINE ring', false,
  );
  const ring = spawned.find((entity) => entity.data?.claimTravelPart === 'ring');
  assert.ok(ring, 'manufactured claim-travel collides and stays an entity');
  assert.equal(ring.type, 'fx');
  assert.equal(ring.collides, true);
  assert.equal(state.entities.has(ring.id), true);
  assert.equal(getDressingRow(state, ring.id), null);
});
