import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRIORITY_COURIER_SERVICE,
  isPriorityCourierItinerary,
} from '../src/data/laneContacts.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';

function busHarness() {
  const listeners = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      const rows = listeners.get(name) || [];
      rows.push(fn);
      listeners.set(name, rows);
    },
    emit(name, payload = {}) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
}

function station(id, name, x, z) {
  return { id, type: 'station', alive: true, pos: { x, z }, data: { stationId: id, name } };
}

function boot() {
  const tethys = station('station_tethys', 'Tethys Trade Hub', 1050, 380);
  const customs = station('station_customs', 'Customs Gate', -640, -1180);
  const player = {
    id: 'player', type: 'ship', alive: true, isPlayer: true, team: 1,
    pos: { x: tethys.pos.x + 200, z: tethys.pos.z }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
  const state = {
    mode: 'flight',
    meta: { seed: 4815 },
    tick: 200,
    simTime: 0,
    world: { currentSectorId: PRIORITY_COURIER_SERVICE.sectorId },
    entities: new Map([[player.id, player], [tethys.id, tethys], [customs.id, customs]]),
    entityList: [player, tethys, customs],
    playerId: player.id,
    player: { targetId: null, credits: 5000, cargo: { items: {} } },
    economy: {
      markets: {
        station_tethys: { cmdty_food: { stock: 80 }, cmdty_fuel_cells: { stock: 50 } },
        station_customs: { cmdty_ore_iron: { stock: 100 }, cmdty_food: { stock: 80 }, cmdty_fuel_cells: { stock: 50 } },
      },
    },
    traffic: { freighters: [], appliedArrivalIds: [], appliedLossIds: [] },
  };
  const bus = busHarness();
  const jobs = new Map();
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextId++,
        alive: true,
        pos: { ...spec.pos },
        vel: { x: 0, z: 0 },
        data: structuredClone(spec.data || {}),
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    npcJobs: {
      assign(entity, spec) {
        const jobId = `job:${entity.data.worldRecordId}`;
        if (!jobs.has(jobId)) {
          jobs.set(jobId, {
            job: {
              ...structuredClone(spec),
              phase: NPC_JOB_PHASE.TRANSIT,
              routeIndex: 0,
              progress: 0.25,
              heading: 0,
              corrupt: false,
            },
            control: null,
          });
        }
        entity.data.jobId = jobId;
        return jobId;
      },
      get(jobId) { return jobs.get(jobId) || null; },
    },
  };
  const system = Object.create(traffic);
  system.init({ state, bus, helpers, registry: null });
  const sector = {
    id: PRIORITY_COURIER_SERVICE.sectorId,
    security: 0.65,
    trafficPerMin: 14,
    factionId: 'faction_mts',
  };
  return { state, bus, helpers, jobs, system, sector, player, tethys, customs };
}

function courier(harness) {
  const rec = harness.state.traffic.freighters.find((row) => row && row.priorityCourierService);
  const entity = rec && harness.state.entities.get(rec.id);
  assert.ok(rec && entity, 'the authored service reserves one live courier record');
  return { rec, entity };
}

function addLegacyTethysRecord(harness, index, { role = 'hauler', data = {}, record = {}, flags = null } = {}) {
  const id = 800 + index;
  const manifest = data.cargoManifest || {
    manifestId: `legacy-selector-manifest:${index}`,
    freighterKey: `legacy-selector:${index}`,
    role,
    lines: [{ commodityId: 'cmdty_food', qty: 3 }],
    totalQty: 3,
  };
  const entity = {
    id, type: 'ship', alive: true, team: 2, factionId: 'faction_mts',
    pos: { x: harness.tethys.pos.x + 160 + index * 10, z: harness.tethys.pos.z },
    vel: { x: 0, z: 0 }, rot: 0,
    data: {
      defId: 'ship_mule',
      worldRecordId: `legacy-selector:${String(index).padStart(2, '0')}`,
      trafficRole: role, role,
      ai: { archetype: 'fleeing_trader', passive: true, spawnContext: 'convoy_civilian' },
      cargoManifest: manifest,
      ...data,
    },
    ...(flags ? { flags } : {}),
  };
  const rec = {
    id, role, targetId: harness.tethys.id, waitT: 0, nextTradeT: 2 + index,
    orbitPhase: 0, dockSeq: index, manifest,
    ...record,
  };
  harness.state.entities.set(id, entity);
  harness.state.entityList.push(entity);
  harness.state.traffic.freighters.push(rec);
  return { entity, rec };
}

test('Kess runs one saved Tethys-to-Customs priority leg with a real sprint, recovery, and freight arrival', () => {
  const h = boot();
  h.bus.emit('sector:enter', { sector: h.sector });
  const { rec, entity } = courier(h);
  const itinerary = entity.data.itinerary;

  assert.equal(h.state.traffic.freighters.length <= 8, true, 'the service uses an ambient slot');
  assert.equal(entity.data.namedLaneContactId, 'lane_kess_span');
  assert.equal(entity.data.defId, 'ship_kestrel');
  assert.equal(isPriorityCourierItinerary(itinerary), true);
  assert.equal(itinerary.originStationId, 'station_tethys');
  assert.equal(itinerary.destinationStationId, 'station_customs');

  h.system.update(1, h.state);
  assert.equal(entity.data.priorityCourierState, 'BERTH');
  assert.match(entity.data.scanLabel, /BERTHED/i);

  h.state.simTime = itinerary.departureAt;
  h.system.update(0.1, h.state);
  const job = h.jobs.get(entity.data.jobId).job;
  assert.equal(job.kind, 'hauler');
  assert.deepEqual(job.payload.priorityCourierService, {
    schema: 'spaceface.priority-courier-job.v1',
    serviceId: 'priority-kess-span',
    legSeq: 0,
  });
  assert.deepEqual(job.payload.manifest, entity.data.cargoManifest,
    'the scheduled job carries the visible courier manifest');

  const runtime = Object.create(npcJobsRuntime);
  runtime.state = h.state;
  runtime._drive({ job }, entity);
  assert.equal(entity.data.intent.boost, true, 'the active priority leg uses the physical V3 boost intent');
  assert.match(entity.data.scanLabel, /OVERTAKE BURN/i);

  job.progress = 0.99;
  runtime._drive({ job }, entity);
  assert.equal(entity.data.intent.brake, true, 'the sprint still brakes for its terminal approach');
  assert.equal(entity.data.intent.boost, false, 'the courier does not boost through its berth');
  job.progress = 0.25;

  h.state.simTime = itinerary.dueAt + 1;
  h.system.update(0, h.state);
  assert.equal(entity.data.priorityCourierState, 'LATE');
  h.bus.emit('contactHail:response', { targetId: entity.id, choice: 'escort', requestId: 'late-kess' });
  assert.equal(itinerary.escort.active, true, 'only the traffic owner arms the one recovery window');
  h.player.pos = { x: entity.pos.x + 200, z: entity.pos.z };
  h.system.update(PRIORITY_COURIER_SERVICE.escort.holdS, h.state);
  assert.equal(itinerary.escort.usedLegSeq, itinerary.legSeq);
  assert.equal(itinerary.escort.creditS, PRIORITY_COURIER_SERVICE.escort.recoveryCreditS);
  assert.equal(entity.data.priorityCourierState, 'ON_TIME', 'the one escort credit can recover the late leg');

  const unload = {
    jobId: entity.data.jobId,
    kind: 'hauler',
    seq: 9,
    completed: true,
    destination: 'dest:station_customs',
    payload: structuredClone(job.payload),
  };
  h.bus.emit('npcjobs:unload', unload);
  const arrivals = h.bus.events.filter((event) => event.name === 'freight:arrival');
  const tradeRequests = h.bus.events.filter((event) => event.name === 'aiTrader:requestTrade');
  assert.equal(arrivals.length, 1, 'Customs receives the actual manifest once');
  assert.ok(tradeRequests.length > 0, 'arrival reaches the existing economy request seam');
  assert.equal(entity.data.itinerary.legSeq, 1);
  assert.equal(entity.data.itinerary.originStationId, 'station_customs');
  assert.equal(entity.data.itinerary.destinationStationId, 'station_tethys');

  h.bus.emit('npcjobs:unload', unload);
  assert.equal(h.bus.events.filter((event) => event.name === 'freight:arrival').length, 1,
    'the prior job sequence cannot replay a settled destination consequence');
  assert.equal(rec.dockSeq, 10);
});

test('a full legacy Tethys roster rebuilds one deterministic idle hauler as Kess without a ninth actor', () => {
  const h = boot();
  for (let index = 0; index < 8; index += 1) {
    const id = 700 + index;
    const manifest = {
      manifestId: `legacy-hauler-manifest:${index}`,
      freighterKey: `legacy-hauler:${index}`,
      role: 'hauler',
      lines: [{ commodityId: 'cmdty_food', qty: 3 }],
      totalQty: 3,
    };
    const entity = {
      id, type: 'ship', alive: true, team: 2, factionId: 'faction_mts',
      pos: { x: h.tethys.pos.x + 120 + index * 10, z: h.tethys.pos.z },
      vel: { x: 0, z: 0 }, rot: 0,
      data: {
        defId: 'ship_mule',
        worldRecordId: `legacy-tethys-hauler:${String(index).padStart(2, '0')}`,
        trafficRole: 'hauler', role: 'hauler',
        ai: { archetype: 'fleeing_trader', passive: true, spawnContext: 'convoy_civilian' },
        cargoManifest: manifest,
      },
    };
    h.state.entities.set(id, entity);
    h.state.entityList.push(entity);
    h.state.traffic.freighters.push({
      id, role: 'hauler', targetId: h.tethys.id, waitT: 0, nextTradeT: 2 + index,
      orbitPhase: 0, dockSeq: index, manifest,
    });
  }
  const actorCountBefore = h.state.entityList.filter((entity) => entity.type === 'ship' && !entity.isPlayer).length;
  const entityCountBefore = h.state.entities.size;

  h.bus.emit('sector:enter', { sector: h.sector, continuous: true });

  const services = h.state.traffic.freighters.filter((row) => row && row.priorityCourierService);
  assert.equal(h.state.traffic.freighters.length, 8, 'the full roster never grows beyond its ambient cap');
  assert.equal(services.length, 1, 'exactly one existing ambient record becomes the priority service');
  assert.equal(h.state.entities.size, entityCountBefore, 'rebuild does not spawn a ninth actor');
  assert.equal(
    h.state.entityList.filter((entity) => entity.type === 'ship' && !entity.isPlayer).length,
    actorCountBefore,
  );
  const rec = services[0];
  const entity = h.state.entities.get(rec.id);
  assert.equal(rec.role, 'courier');
  assert.equal(entity.data.worldRecordId, 'legacy-tethys-hauler:00', 'stable first civilian record wins');
  assert.equal(entity.data.defId, 'ship_kestrel');
  assert.equal(entity.data.cargoManifest.manifestId, 'legacy-hauler-manifest:0', 'ordinary freight is retained');
  assert.equal(isPriorityCourierItinerary(entity.data.itinerary), true);
  assert.equal(entity.data.itinerary.originStationId, 'station_tethys');
  assert.equal(entity.data.itinerary.destinationStationId, 'station_customs');
});

test('the courier selector leaves protected full-roster actors byte-for-byte intact and picks the lone ordinary hauler', () => {
  const h = boot();
  const protectedActors = [
    addLegacyTethysRecord(h, 0, { role: 'express', data: { hitchable: true, itinerary: { hitchable: true } } }),
    addLegacyTethysRecord(h, 1, { data: { missionId: 'mission:protected', missionTag: 'mission:protected' }, flags: { persistent: true } }),
    addLegacyTethysRecord(h, 2, { data: { namedLaneContactId: 'lane_mira_bluepack' } }),
    addLegacyTethysRecord(h, 3, { data: { jobId: 'job:protected' }, record: { control: { holder: 'other-owner' } } }),
    addLegacyTethysRecord(h, 4, { data: { worldSiteTrafficHookId: 'protected-hook' }, record: { worldSiteRoute: { hookId: 'protected-hook' } } }),
    addLegacyTethysRecord(h, 5, { data: { cargoManifest: { manifestId: 'lot', freighterKey: 'lot', role: 'hauler', lotId: 'lot:protected', lines: [], totalQty: 0 } } }),
    addLegacyTethysRecord(h, 6, { role: 'salvor', data: { generalSalvor: true, ceresActivityCast: true, activityActorSlotId: 'ceres_protected', ai: { pirate: true } }, record: { generalSalvor: true, ceresActivityCast: true } }),
  ];
  const ordinary = addLegacyTethysRecord(h, 7);
  const before = protectedActors.map(({ entity, rec }) => ({ entity: structuredClone(entity), rec: structuredClone(rec) }));
  const actorCountBefore = h.state.entityList.length;

  h.bus.emit('sector:enter', { sector: h.sector, continuous: true });

  const services = h.state.traffic.freighters.filter((row) => row && row.priorityCourierService);
  assert.equal(services.length, 1);
  assert.equal(services[0].id, ordinary.entity.id, 'only the unowned ambient hauler is eligible');
  assert.equal(h.state.entityList.length, actorCountBefore, 'selection never appends a new actor');
  for (let index = 0; index < protectedActors.length; index += 1) {
    assert.deepEqual(protectedActors[index].entity, before[index].entity, `protected entity ${index} is untouched`);
    assert.deepEqual(protectedActors[index].rec, before[index].rec, `protected record ${index} is untouched`);
  }
});

test('an all-protected full roster fails closed without changing or appending any actor', () => {
  const h = boot();
  const rows = Array.from({ length: 8 }, (_, index) => addLegacyTethysRecord(h, index, {
    data: { missionId: `mission:protected:${index}`, missionTag: `mission:protected:${index}` },
    flags: { missionPinned: true, persistent: true },
  }));
  const before = rows.map(({ entity, rec }) => ({ entity: structuredClone(entity), rec: structuredClone(rec) }));
  const entityCountBefore = h.state.entities.size;

  h.bus.emit('sector:enter', { sector: h.sector, continuous: true });

  assert.equal(h.state.traffic.freighters.filter((row) => row && row.priorityCourierService).length, 0);
  assert.equal(h.state.entities.size, entityCountBefore, 'fail-closed path never appends a ninth actor');
  for (let index = 0; index < rows.length; index += 1) {
    assert.deepEqual(rows[index].entity, before[index].entity, `protected entity ${index} is unchanged`);
    assert.deepEqual(rows[index].rec, before[index].rec, `protected record ${index} is unchanged`);
  }
});

test('a rematerialized Kess itinerary adopts its saved destination and loss remains exactly-once', () => {
  const h = boot();
  h.bus.emit('sector:enter', { sector: h.sector });
  const { entity } = courier(h);
  entity.data.freightDockSeq = 4;
  const rehydrated = structuredClone(entity);
  rehydrated.id = 909;
  rehydrated.data.namedLaneContactId = undefined;
  rehydrated.data.callsign = undefined;
  rehydrated.data.name = undefined;
  h.state.entities = new Map([
    [h.player.id, h.player],
    [h.tethys.id, h.tethys],
    [h.customs.id, h.customs],
    [rehydrated.id, rehydrated],
  ]);
  h.state.entityList = [...h.state.entities.values()];
  h.state.traffic.freighters = [];
  h.system._active = [];
  h.system._adoptRematerializedTraffic(PRIORITY_COURIER_SERVICE.sectorId, [h.tethys, h.customs]);

  const rec = h.state.traffic.freighters[0];
  assert.equal(rec.id, rehydrated.id);
  assert.equal(rec.targetId, h.customs.id, 'Continue restores the itinerary destination, not a random berth');
  assert.equal(rec.dockSeq, 4);
  assert.equal(rehydrated.data.namedLaneContactId, 'lane_kess_span');

  h.bus.emit('entity:killed', { id: rehydrated.id, killerId: 'pirate' });
  h.bus.emit('entity:killed', { id: rehydrated.id, killerId: 'pirate' });
  assert.equal(h.bus.events.filter((event) => event.name === 'freight:loss').length, 1,
    'the existing loss sink owns a destroyed courier manifest exactly once');
});
