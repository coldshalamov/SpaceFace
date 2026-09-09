/**
 * PQ-138.05 — Evidence ledger at Ceres.
 *
 * One player-caused freight kill at the Ceres Refinery Approach. The checklist reads
 * world state / existing receipts after a few sim seconds — not a synthetic ledger.
 *
 * SCOPE (2026-09-09 review). This proves WORLD STATE, not a trace the player can see.
 * Two of the five checked fields have no live consumer:
 *   • `routeDisrupted` is written at traffic.js:8589/:8592 and read nowhere in the repo.
 *   • `state.ui.pirateRumor` / `pirateRumor:card` / `news:headline` have no production reader
 *     or listener; the pirateRumor readout exports are imported only by tests.
 *   • `station.data.structurePatch` and its `patched` receipt are read by nothing in
 *     src/ui or src/render.
 * Only the wreck and the price move reach a player-visible surface (the rendered wreck body,
 * and the market plus `freight:loss` → src/ui/marketNews.js).
 *
 * The kill is injected: `combat:damage` + `entity:killed` are emitted directly. The payload
 * matches what the live gun path emits at src/systems/combat.js:585, including the
 * `killerId === playerId` gate every trace here depends on, so the inputs are faithful — but no
 * weapon, physics, AI, or law system runs. The witness hauler is planted co-targeting
 * `station_ceres` so `_markRouteDisrupted` has someone to mark. AFTER_S is decorative: all five
 * writes land synchronously inside the two emits, and `stepWorld` ticks only rumor heat decay.
 *
 * Do not read a green run here as "the leaf is done" — see PQ-138.05-REPORT.md (STATUS NOT DONE).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { aftermathForSector, aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { traffic } from '../src/systems/traffic.js';
import { pirateRumor } from '../src/systems/pirateRumor.js';
import { economy } from '../src/systems/economy.js';
import { zoneAt } from '../src/data/sectorZones.js';
import {
  globalToSectorLocalForSector,
  sectorLocalToGlobalForSector,
} from '../src/data/sectorCoordinates.js';

const SECTOR_ID = 'sector_ceres_belt';
const STATION_ID = 'station_ceres';
const ZONE_ID = 'zone_ceres_refinery';
const COMMODITY_ID = 'cmdty_ore_iron';
const AFTER_S = 8;
const DT = 1 / 60;

const MANIFEST = Object.freeze({
  manifestId: 'ceres_ledger_lot',
  lines: Object.freeze([{ commodityId: COMMODITY_ID, qty: 160 }]),
  totalQty: 160,
});

function eventBus() {
  const listeners = new Map();
  const log = [];
  return {
    log,
    on(event, handler) {
      const handlers = listeners.get(event) || [];
      handlers.push(handler);
      listeners.set(event, handlers);
    },
    off(event, handler) {
      listeners.set(event, (listeners.get(event) || []).filter((candidate) => candidate !== handler));
    },
    emit(event, payload) {
      log.push({ event, payload });
      for (const handler of listeners.get(event) || []) handler(payload);
    },
  };
}

function refineryOrigin() {
  return sectorLocalToGlobalForSector({ x: -1100, z: 620 }, SECTOR_ID);
}

function makeWorld() {
  const origin = refineryOrigin();
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    team: 0,
    pos: { x: origin.x + 90, z: origin.z + 50 },
    vel: { x: 40, z: 10 },
    rot: 0,
    data: {},
  };
  const station = {
    id: 10,
    type: 'station',
    alive: true,
    pos: { x: origin.x, z: origin.z },
    data: { stationId: STATION_ID, name: 'Ceres Refinery' },
  };
  const victim = {
    id: 20,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: origin.x + 80, z: origin.z + 40 },
    vel: { x: 30, z: 12 },
    angVel: 0.4,
    mass: 28,
    data: {
      trafficRole: 'hauler',
      role: 'hauler',
      cargoManifest: {
        manifestId: MANIFEST.manifestId,
        lines: MANIFEST.lines.map((line) => ({ ...line })),
        totalQty: MANIFEST.totalQty,
      },
    },
  };
  const witness = {
    id: 21,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: origin.x + 40, z: origin.z - 80 },
    vel: { x: 20, z: -8 },
    rot: 0,
    data: {
      trafficRole: 'hauler',
      role: 'hauler',
      cargoManifest: { lines: [], totalQty: 0 },
      intent: { moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: 0 },
    },
  };
  const victimRec = {
    id: victim.id,
    role: 'hauler',
    targetId: station.id,
    waitT: 0,
    nextTradeT: 8,
    dockSeq: 0,
    carrying: true,
    manifest: {
      manifestId: MANIFEST.manifestId,
      lines: MANIFEST.lines.map((line) => ({ ...line })),
      totalQty: MANIFEST.totalQty,
    },
  };
  const witnessRec = {
    id: witness.id,
    role: 'hauler',
    targetId: station.id,
    waitT: 0,
    nextTradeT: 8,
    dockSeq: 0,
    carrying: false,
    manifest: { lines: [], totalQty: 0 },
  };

  const local = globalToSectorLocalForSector(victim.pos, SECTOR_ID);
  const zone = zoneAt(SECTOR_ID, local.x, local.z);
  assert.equal(zone && zone.id, ZONE_ID, 'the kill sits inside the Ceres Refinery Approach');

  const state = {
    meta: { seed: 13805 },
    seed: 13805,
    tick: 240,
    simTime: 40,
    mode: 'flight',
    playerId: player.id,
    player: { credits: 0 },
    world: { currentSectorId: SECTOR_ID, sectors: {} },
    nextEntityId: 100,
    entities: new Map([
      [player.id, player],
      [station.id, station],
      [victim.id, victim],
      [witness.id, witness],
    ]),
    entityList: [player, station, victim, witness],
    traffic: {
      freighters: [victimRec, witnessRec],
      appliedArrivalIds: [],
      appliedLossIds: [],
      appliedMinerWorkIds: [],
    },
    economy: { markets: {}, cycles: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} },
    ui: {},
  };
  return { state, player, station, victim, witness, victimRec, witnessRec };
}

function boot(world) {
  const bus = eventBus();
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: world.state.nextEntityId++,
        alive: true,
        pos: { ...(spec.pos || {}) },
        vel: spec.vel ? { ...spec.vel } : { x: 0, z: 0 },
        data: spec.data ? { ...spec.data } : {},
      };
      world.state.entities.set(entity.id, entity);
      world.state.entityList.push(entity);
      return entity;
    },
  };
  const econ = Object.assign({}, economy);
  const aftermath = Object.assign({}, aftermathWrecks);
  const rumors = Object.assign({}, pirateRumor);
  const ships = Object.assign({}, traffic);
  econ.init({ state: world.state, bus, helpers, registry: null });
  aftermath.init({ state: world.state, bus, helpers, registry: null });
  rumors.init({ state: world.state, bus, helpers, registry: null });
  ships.init({ state: world.state, bus, helpers, registry: null });
  econ.ensureStationMarkets(STATION_ID);
  return { bus, helpers, econ, aftermath, rumors, ships };
}

function liveRouteHaulers(state) {
  const out = [];
  for (const rec of state.traffic.freighters || []) {
    if (!rec) continue;
    const ent = state.entities.get(rec.id);
    if (!ent || ent.alive === false) continue;
    const stationId = (ent.data && ent.data.stationId)
      || (rec.targetId != null && state.entities.get(rec.targetId)?.data?.stationId);
    if (stationId !== STATION_ID) continue;
    out.push({ rec, ent });
  }
  return out;
}

function stepWorld(harness, seconds) {
  const { state } = harness.world;
  const steps = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < steps; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (Number(state.simTime) || 0) + DT;
    harness.rumors.update(DT, state);
  }
}

function printChecklist(rows) {
  console.log('PQ-138.05 Ceres evidence ledger');
  console.log('| trace | ok | evidence id |');
  console.log('|---|---|---|');
  for (const row of rows) {
    console.log(`| ${row.trace} | ${row.ok ? 'true' : 'false'} | ${row.evidenceId || '(none)'} |`);
  }
}

test('one Ceres kill leaves wreck, thinned traffic, a moved price, a rumor, and a structure patch', () => {
  const world = makeWorld();
  const harness = { world, ...boot(world) };
  const { state, player, station, victim, witnessRec } = world;
  const market = state.economy.markets[STATION_ID][COMMODITY_ID];
  assert.ok(market, 'Ceres Refinery lists iron ore before the incident');
  const priceBefore = harness.econ.priceOf(STATION_ID, COMMODITY_ID, 'buy');
  const midBefore = market.lastMid;
  const haulersBefore = liveRouteHaulers(state).length;
  assert.equal(haulersBefore, 2, 'the Ceres approach starts with the loaded hull and its witness');

  harness.bus.emit('combat:damage', {
    targetId: victim.id,
    attackerId: player.id,
    amount: 18,
    rawTotal: 18,
    applied: 18,
    type: 'energy',
    pos: { x: victim.pos.x, z: victim.pos.z },
  });
  harness.bus.emit('entity:killed', {
    id: victim.id,
    killerId: player.id,
    type: 'ship',
    pos: { x: victim.pos.x, z: victim.pos.z },
    sectorId: SECTOR_ID,
  });
  victim.alive = false;

  stepWorld(harness, AFTER_S);

  const markers = aftermathForSector(state, SECTOR_ID);
  const marker = markers.find((row) => row && row.victimId === victim.id);
  const saved = harness.aftermath.serialize();
  const savedMarker = saved && saved.bySector && saved.bySector[SECTOR_ID]
    && saved.bySector[SECTOR_ID].find((row) => row && row.markerId === (marker && marker.markerId));
  const liveWreck = state.entityList.find((entity) => (
    entity
    && entity.type === 'wreck'
    && entity.alive !== false
    && entity.data
    && entity.data.markerId === (marker && marker.markerId)
  ));

  const haulersAfter = liveRouteHaulers(state);
  const disrupted = haulersAfter.find((row) => row.rec.routeDisrupted || (row.ent.data && row.ent.data.routeDisrupted));

  const priceAfter = harness.econ.priceOf(STATION_ID, COMMODITY_ID, 'buy');
  const midAfter = market.lastMid;
  const pressure = harness.bus.log.find((row) => row.event === 'economy:applyTradePressure');

  const rumorKey = `${SECTOR_ID}:${ZONE_ID}`;
  const rumorRec = state.pirateRumor && state.pirateRumor.zones && state.pirateRumor.zones[rumorKey];
  const rumorCard = state.ui && state.ui.pirateRumor && (state.ui.pirateRumor.lastCard || (state.ui.pirateRumor.cards || [])[0]);

  const patch = (station.data && station.data.structurePatch)
    || (Array.isArray(station.data && station.data.receipts)
      && station.data.receipts.find((row) => row && (row.kind === 'patched' || (row.data && row.data.receiptId))));

  const rows = [
    {
      trace: 'wreck persists',
      ok: !!(marker && savedMarker && liveWreck),
      evidenceId: marker && marker.markerId || null,
    },
    {
      trace: 'traffic thins',
      ok: haulersAfter.length < haulersBefore && !!(disrupted || witnessRec.routeDisrupted),
      evidenceId: disrupted
        ? `route:${STATION_ID}:${disrupted.ent.id}`
        : (witnessRec.routeDisrupted ? `route:${STATION_ID}:${witnessRec.id}` : null),
    },
    {
      trace: 'price moves',
      ok: !!(pressure && (priceAfter !== priceBefore || midAfter !== midBefore)),
      evidenceId: pressure
        ? `${STATION_ID}:${COMMODITY_ID}:${pressure.payload && pressure.payload.intentId || 'pressure'}`
        : null,
    },
    {
      trace: 'rumor appears',
      ok: !!(rumorRec && rumorRec.lastHeadline && rumorCard && rumorCard.body),
      evidenceId: rumorRec && rumorRec.lastHeadline ? rumorKey : null,
    },
    {
      trace: 'structure patch',
      ok: !!(patch && (patch.receiptId || (patch.data && patch.data.receiptId)) && patch.kind === 'patched'),
      evidenceId: patch && (patch.receiptId || (patch.data && patch.data.receiptId)) || null,
    },
  ];

  printChecklist(rows);

  try {
    for (const row of rows) {
      assert.equal(row.ok, true, `${row.trace} must be world state after the Ceres kill (evidence ${row.evidenceId || 'missing'})`);
    }
    assert.ok(liveWreck.data.provenance && liveWreck.data.provenance.markerId === marker.markerId,
      'the live wreck is the saved aftermath body, not a prop');
    assert.equal(haulersAfter.length, 1, 'the loaded hull is gone; the witness remains on the thinned route');
  } finally {
    harness.aftermath.destroy();
    harness.rumors.destroy();
  }
});
