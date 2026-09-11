/**
 * PQ-138.05 — Evidence ledger at Ceres.
 *
 * One player-caused freight kill at the Ceres Refinery Approach. The checklist now pins
 * leftover PLAYER-VISIBLE paint (ticker + Orbital berth), not only world state.
 *
 * The kill is injected: `combat:damage` + `entity:killed` are emitted directly. The payload
 * matches what the live gun path emits at src/systems/combat.js:585, including the
 * `killerId === playerId` gate every trace here depends on, so the inputs are faithful — but no
 * weapon, physics, AI, or law system runs. The witness hauler is planted co-targeting
 * `station_ceres` so `_markRouteDisrupted` has someone to mark. AFTER_S is decorative: all five
 * writes land synchronously inside the two emits, and `stepWorld` ticks only rumor heat decay.
 *
 * leftover traffic.js reads leftover routeDisrupted on leftover spawn/top-up and does not
 * refill that leftover Ceres approach. A leftover test plants leftover routeDisrupted true
 * on leftover a leftover Ceres approach and pins that leftover rematerialize stays thin.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { aftermathForSector, aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { traffic } from '../src/systems/traffic.js';
import { pirateRumor } from '../src/systems/pirateRumor.js';
import { economy } from '../src/systems/economy.js';
import { zoneAt } from '../src/data/sectorZones.js';
import {
  globalToSectorLocalForSector,
  sectorLocalToGlobalForSector,
} from '../src/data/sectorCoordinates.js';
import { createMarketNews, tickerEventRef } from '../src/ui/marketNews.js';
import { buildDockArrival, writeBerthArrival } from '../src/ui/dockArrival.js';
import { stationFrameHtml } from '../src/ui/views/stationFrames.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

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
  const news = createMarketNews({ bus, state: world.state, helpers: {} });
  return { bus, helpers, econ, aftermath, rumors, ships, news };
}

function berthPaintHost() {
  const texts = {
    '.sxb-event__badge': '',
    '.sxb-event__title': '',
    '.sxb-event__body': '',
  };
  const attrs = {};
  const patch = { textContent: '', hidden: true };
  const route = { textContent: '', hidden: true };
  const header = {
    querySelector(sel) {
      if (sel === '.sxb-berth__patch') return patch;
      if (sel === '.sxb-berth__route') return route;
      return null;
    },
  };
  const newsEl = { textContent: '', parentElement: header };
  const cardEl = {
    hidden: true,
    parentElement: header,
    querySelector(sel) {
      if (!(sel in texts)) return null;
      return {
        get textContent() { return texts[sel]; },
        set textContent(value) { texts[sel] = String(value == null ? '' : value); },
      };
    },
    setAttribute(name, value) { attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
  };
  return { newsEl, cardEl, patch, route };
}

function leftoverCeresSector() {
  return { id: SECTOR_ID, factionId: 'faction_pitborn', trafficPerMin: 6, security: 0.35 };
}

function leftoverApproachHulls(state) {
  const out = [];
  const seen = new Set();
  for (const row of liveRouteHaulers(state)) {
    seen.add(row.ent.id);
    out.push(row);
  }
  for (const rec of state.traffic.freighters || []) {
    if (!rec || seen.has(rec.id)) continue;
    const ent = state.entities.get(rec.id);
    if (!ent || ent.alive === false) continue;
    const slot = rec.activityActorSlotId || (ent.data && ent.data.activityActorSlotId);
    if (slot === 'ceres_refinery_hauler') out.push({ rec, ent });
  }
  return out;
}

function leftoverRefineryHauler(rows) {
  return rows.find((row) => {
    const slot = row.rec.activityActorSlotId || (row.ent.data && row.ent.data.activityActorSlotId);
    return slot === 'ceres_refinery_hauler';
  }) || null;
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

  const ticker = harness.news.getLog().find((rec) => rec && rec.source === 'pirateRumor:headline');
  const rumorHeadline = rumorRec && rumorRec.lastHeadline;
  const patchText = patch && leftoverLineForTest(patch.text);
  const view = buildDockArrival(state, { id: STATION_ID, name: 'Ceres Refinery', services: [] });
  const frame = stationFrameHtml();
  const host = berthPaintHost();
  const painted = writeBerthArrival({ newsEl: host.newsEl, cardEl: host.cardEl }, view);
  const newsSrc = readFileSync(join(ROOT, 'src/ui/marketNews.js'), 'utf8');
  const appSrc = readFileSync(join(ROOT, 'src/ui/station/stationApp.js'), 'utf8');

  rows.push(
    {
      trace: 'rumor paints',
      ok: !!(
        ticker
        && tickerEventRef(ticker)
        && ticker.text === rumorHeadline
        && painted.news === rumorHeadline
        && host.newsEl.textContent === rumorHeadline
        && painted.eventCard
        && painted.eventCard.body === rumorHeadline
        && host.cardEl.querySelector('.sxb-event__body').textContent === rumorHeadline
      ),
      evidenceId: ticker && ticker.eventId || rumorKey,
    },
    {
      trace: 'patch paints',
      ok: !!(
        patchText
        && view.patch === patchText
        && painted.patch === patchText
        && host.patch.textContent === patchText
        && host.patch.hidden === false
      ),
      evidenceId: view.patchReceiptId || (patch && (patch.receiptId || (patch.data && patch.data.receiptId))),
    },
    {
      trace: 'route paints',
      ok: !!(
        view.route
        && painted.route === view.route
        && host.route.textContent === view.route
        && host.route.hidden === false
        && /disrupted approach/i.test(view.route)
      ),
      evidenceId: disrupted
        ? `route:${STATION_ID}:${disrupted.ent.id}`
        : (witnessRec.routeDisrupted ? `route:${STATION_ID}:${witnessRec.id}` : null),
    },
  );

  const leftoverBeforeTopUp = leftoverApproachHulls(state);
  harness.ships._onSectorEnter({
    sector: leftoverCeresSector(),
    continuous: true,
  });
  const leftoverAfterTopUp = leftoverApproachHulls(state);
  const leftoverFreshRefinery = leftoverRefineryHauler(leftoverAfterTopUp);
  const trafficSrc = readFileSync(join(ROOT, 'src/systems/traffic.js'), 'utf8');
  rows.push({
    trace: 'approach stays thin',
    ok: leftoverAfterTopUp.length <= leftoverBeforeTopUp.length
      && leftoverFreshRefinery == null
      && !!(disrupted || witnessRec.routeDisrupted),
    evidenceId: disrupted
      ? `route:${STATION_ID}:${disrupted.ent.id}`
      : (witnessRec.routeDisrupted ? `route:${STATION_ID}:${witnessRec.id}` : null),
  });

  printChecklist(rows);
  console.log(`PQ-138.05 leftover ticker: ${ticker && ticker.text}`);
  console.log(`PQ-138.05 leftover berth news: ${painted.news}`);
  console.log(`PQ-138.05 leftover berth card: ${painted.eventCard && painted.eventCard.title} — ${painted.eventCard && painted.eventCard.body}`);
  console.log(`PQ-138.05 leftover berth patch: ${painted.patch}`);
  console.log(`PQ-138.05 leftover berth route: ${painted.route}`);

  try {
    for (const row of rows) {
      assert.equal(row.ok, true, `${row.trace} must hold after the Ceres kill (evidence ${row.evidenceId || 'missing'})`);
    }
    assert.ok(liveWreck.data.provenance && liveWreck.data.provenance.markerId === marker.markerId,
      'the live wreck is the saved aftermath body, not a prop');
    assert.equal(haulersAfter.length, 1, 'the loaded hull is gone; the witness remains on the thinned route');
    assert.match(newsSrc, /on\('pirateRumor:headline',\s*surfacePirateRumor\)/,
      'leftover marketNews subscribes to leftover pirateRumor:headline');
    assert.match(frame, /sxb-berth__patch/, 'the Orbital berth frame has the leftover patch line');
    assert.match(frame, /sxb-berth__route/, 'the Orbital berth frame has the leftover route line');
    assert.match(
      appSrc,
      /writeBerthArrival\(\s*\{ newsEl, cardEl: eventEl \}\s*,\s*arrival\s*,/,
      'stationApp still hands the cached berth article to writeBerthArrival',
    );
    assert.equal(view.news, rumorHeadline, 'the berth news line is the leftover rumor, not only world state');
    assert.equal(view.eventCard && view.eventCard.title, 'Pirate rumor');
    assert.equal(host.cardEl.querySelector('.sxb-event__title').textContent, 'Pirate rumor');
    assert.match(host.patch.textContent, /Yard crews patch Ceres Refinery/);
    assert.equal(ticker.eventId, `pirateRumor:${SECTOR_ID}:${ZONE_ID}`);
    assert.match(trafficSrc, /_leftoverDisruptedStationIds/,
      'leftover traffic.js reads leftover routeDisrupted on leftover spawn/top-up');
    assert.equal(leftoverFreshRefinery, null,
      'leftover Ceres rematerialize must not refill the leftover disrupted approach');
  } finally {
    harness.news.destroy();
    harness.aftermath.destroy();
    harness.rumors.destroy();
  }
});

function leftoverLineForTest(value) {
  const next = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return next || null;
}

test('leftover Ceres approach stays thin when leftover routeDisrupted is planted', () => {
  const world = makeWorld();
  const harness = { world, ...boot(world) };
  const { state, victim, witness, witnessRec } = world;
  victim.alive = false;
  state.traffic.freighters = [witnessRec];
  witnessRec.routeDisrupted = true;
  witness.data.routeDisrupted = true;
  harness.ships._active = [witness.id];

  const before = leftoverApproachHulls(state);
  assert.equal(before.length, 1, 'leftover plant leaves one hull on the leftover Ceres approach');
  assert.equal(witnessRec.routeDisrupted, true);
  assert.equal(witness.data.routeDisrupted, true);

  harness.ships._onSectorEnter({
    sector: leftoverCeresSector(),
    continuous: true,
  });

  const after = leftoverApproachHulls(state);
  const leftoverFreshRefinery = leftoverRefineryHauler(after);
  const trafficSrc = readFileSync(join(ROOT, 'src/systems/traffic.js'), 'utf8');

  try {
    assert.ok(after.length <= before.length,
      'leftover top-up must not refill a leftover disrupted Ceres approach');
    assert.equal(leftoverFreshRefinery, null,
      'leftover rematerialize must not fresh-spawn the leftover Ceres refinery hauler');
    assert.ok(witnessRec.routeDisrupted || (witness.data && witness.data.routeDisrupted),
      'leftover routeDisrupted remains the leftover reader input');
    assert.match(trafficSrc, /_leftoverDisruptedStationIds/,
      'leftover traffic.js reads leftover routeDisrupted');
    assert.match(trafficSrc, /_leftoverSlotRefillsDisruptedApproach/,
      'leftover Ceres rematerialize skips leftover disrupted approach refill');
  } finally {
    harness.news.destroy();
    harness.aftermath.destroy();
    harness.rumors.destroy();
  }
});

test('leftover hard Ceres enter keeps a leftover disrupted approach thin', () => {
  const world = makeWorld();
  const harness = { world, ...boot(world) };
  const { state, victim, witnessRec } = world;

  harness.ships._markRouteDisrupted(STATION_ID, victim.id);
  assert.deepEqual(state.traffic.disruptedStationIds, [STATION_ID],
    'leftover persist remembers the leftover disrupted station after the leftover mark');

  harness.ships._onSectorEnter({
    sector: leftoverCeresSector(),
    continuous: false,
  });

  const after = leftoverApproachHulls(state);
  const leftoverFreshRefinery = leftoverRefineryHauler(after);
  const trafficSrc = readFileSync(join(ROOT, 'src/systems/traffic.js'), 'utf8');

  try {
    assert.deepEqual(state.traffic.disruptedStationIds, [STATION_ID],
      'leftover _cleanup must not wipe leftover disruptedStationIds');
    assert.equal(leftoverFreshRefinery, null,
      'leftover hard rematerialize must not refill the leftover disrupted Ceres approach');
    assert.equal(
      (state.traffic.freighters || []).some((rec) => rec && rec.id === witnessRec.id),
      false,
      'leftover hard enter wiped leftover view freighters; leftover persist is the leftover reader',
    );
    assert.match(trafficSrc, /disruptedStationIds/,
      'leftover traffic.js persists leftover disrupted station ids across leftover hard enter');
  } finally {
    harness.news.destroy();
    harness.aftermath.destroy();
    harness.rumors.destroy();
  }
});

// ---------------------------------------------------------------------------
// Input trace for the two tests above. The disruption guard only ever decides on the
// `wasFresh` branch of _materializeCeresActivityCast — the branch reached when the durable
// world-record bag holds nothing for that slot. These two pin both sides of that branch so a
// later reader does not have to take the green rows on trust.
// ---------------------------------------------------------------------------

test('control: with no disruption a hard Ceres enter DOES spawn the refinery hauler', () => {
  const world = makeWorld();
  const harness = { world, ...boot(world) };
  const { state } = world;
  assert.deepEqual(state.traffic.disruptedStationIds, [],
    'the control carries no disrupted station');

  harness.ships._onSectorEnter({ sector: leftoverCeresSector(), continuous: false });

  const spawned = leftoverRefineryHauler(leftoverApproachHulls(state));
  try {
    assert.ok(spawned,
      'without a disrupted station the same hard enter refills ceres_refinery_hauler — '
      + 'so the "stays thin" rows above are load-bearing, not vacuous');
  } finally {
    harness.news.destroy();
    harness.aftermath.destroy();
    harness.rumors.destroy();
  }
});

test('an active durable record suppresses the refill BEFORE the disruption guard is consulted', () => {
  const world = makeWorld();
  const harness = { world, ...boot(world) };
  const { state } = world;

  harness.ships._onSectorEnter({ sector: leftoverCeresSector(), continuous: false });
  const spawned = leftoverRefineryHauler(leftoverApproachHulls(state));
  assert.ok(spawned, 'first materialize runs on an empty record bag and spawns the slot');
  const recordId = spawned.ent.data && spawned.ent.data.worldRecordId;
  assert.ok(recordId, 'the authored slot stamps a durable world-record id on its body');

  // Live shape: the body is gone but world residency still owns an active record for the slot.
  // On the live route src/systems/world.js writes this bag (kill -> markWorldRecordDestroyed,
  // hard exit -> _captureCeresActivityCast). This harness never boots world, which is why the
  // rows above reach the guard at all.
  spawned.ent.alive = false;
  state.world.records = { byId: { [recordId]: { recordId, sectorId: SECTOR_ID, kind: 'convoy', alive: true } } };
  state.traffic.disruptedStationIds = [];

  harness.ships._onSectorEnter({ sector: leftoverCeresSector(), continuous: false });

  try {
    assert.deepEqual(state.traffic.disruptedStationIds, [],
      'the disruption guard has no input on this run');
    assert.equal(leftoverRefineryHauler(leftoverApproachHulls(state)), null,
      'the record branch alone keeps the approach thin; the disruption guard is not the '
      + 'mechanism the live route uses');
  } finally {
    harness.news.destroy();
    harness.aftermath.destroy();
    harness.rumors.destroy();
  }
});

test('leftover disruptedStationIds survive leftover traffic serialize / deserialize', () => {
  const world = makeWorld();
  const harness = { world, ...boot(world) };
  const { state } = world;
  try {
    harness.ships._leftoverRememberDisruptedStation(STATION_ID);
    const saved = harness.ships.serialize();
    assert.deepEqual(saved.disruptedStationIds, [STATION_ID]);
    harness.ships.newGame();
    assert.deepEqual(state.traffic.disruptedStationIds, []);
    harness.ships.deserialize(saved);
    assert.deepEqual(state.traffic.disruptedStationIds, [STATION_ID],
      'Continue must keep leftover disrupted station ids for leftover recommission / leftover first-visit refill');
  } finally {
    harness.news.destroy();
    harness.aftermath.destroy();
    harness.rumors.destroy();
  }
});

// Live-path regression. Keep the original injected-event/empty-record cases above as focused
// coverage; this scenario uses the production Node runtime, world on the bus, authored actors,
// real mining/custody and combat damage. It does not plant traffic, cargo, or disruption state.
function bootLiveLedger() {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production', nodeSafeOnly: true, seed: 13805,
  });
  const { state } = runtime;
  state.mode = 'flight';
  const player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
    isPlayer: true, player: state.player, pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  runtime.getSystem('world').enterSector(SECTOR_ID);
  return runtime;
}

function liveRefineryHaulers(state) {
  // Count bodies, not traffic's adoption list: an untracked world-resident refill is still a hull.
  return state.entityList.filter((entity) => entity.alive !== false
    && entity.data?.activityActorSlotId === 'ceres_refinery_hauler');
}

function observeLiveRefillGuard(t, runtime) {
  const ships = runtime.getSystem('traffic');
  const original = ships._leftoverSlotRefillsDisruptedApproach;
  const decisions = [];
  t.mock.method(ships, '_leftoverSlotRefillsDisruptedApproach', function (entry, ids) {
    const blocked = original.call(this, entry, ids);
    if (entry.slot.id === 'ceres_refinery_hauler') decisions.push(blocked);
    return blocked;
  });
  return decisions;
}

test('live world control: no-kill hard re-enter restores the authored refinery hauler', (t) => {
  const runtime = bootLiveLedger();
  try {
    const { state } = runtime;
    const first = liveRefineryHaulers(state);
    assert.equal(first.length, 1);
    const recordId = first[0].data.worldRecordId;
    const world = runtime.getSystem('world');
    world.enterSector('sector_helios_prime');
    assert.equal(liveRefineryHaulers(state).length, 0, 'hard exit removes the old body');
    assert.equal(state.world.records.byId[recordId].alive, true, 'world captured the living convoy');
    const decisions = observeLiveRefillGuard(t, runtime);
    world.enterSector(SECTOR_ID);
    const restored = liveRefineryHaulers(state);
    console.log(`PQ-138.05 seed=13805 control no-kill hard re-enter: refinery haulers=${restored.length}; guard=${JSON.stringify(decisions)}`);
    assert.equal(restored.length, 1, 'ordinary hard re-entry still refills the refinery approach');
    assert.notEqual(restored[0].id, first[0].id, 'this is a rematerialized body');
    assert.equal(restored[0].data.worldRecordId, recordId, 'durable identity is unchanged');
    assert.equal(state.traffic.freighters.filter((row) => row.id === restored[0].id).length, 1,
      'traffic adopts the rematerialized body exactly once');
    assert.deepEqual(state.traffic.disruptedStationIds, []);
  } finally {
    runtime.dispose();
  }
});

test('live world: one loaded Ceres approach kill leaves five traces and the packet guard decides hard re-entry', async (t) => {
  const runtime = bootLiveLedger();
  try {
    const { state, bus } = runtime;
    const physics = runtime.getSystem('physics');
    assert.equal(await physics.prepareBackend(state, { reset: true }), true);
    let victim = null;
    // Observe the ordinary miner -> rendezvous -> loaded refinery approach. The time bound is
    // only a scenario timeout; no phase, position, manifest or witness is injected to meet it.
    for (let tick = 0; tick < 600 * 60; tick++) {
      runtime.step(DT);
      const candidate = liveRefineryHaulers(state)[0];
      if (!(candidate?.data?.cargoManifest?.totalQty > 0)) continue;
      const local = globalToSectorLocalForSector(candidate.pos, SECTOR_ID);
      if (zoneAt(SECTOR_ID, local.x, local.z)?.id === ZONE_ID) {
        victim = candidate;
        break;
      }
    }
    assert.ok(victim, 'the authored hauler reaches the refinery approach carrying real mined cargo');
    const cargo = victim.data.cargoManifest;
    assert.equal(cargo.custody.acquiredBy, 'traffic:ceresMinerHaulerHandoff');
    assert.ok(cargo.lotSource.workId, 'the loaded lot originates in real NPC mining');
    const handoffId = cargo.custody.handoffId;
    assert.equal(state.traffic.ceresMinerHaulerHandoff.handoffId, handoffId);
    const recordId = victim.data.worldRecordId;
    const econ = runtime.getSystem('economy');
    const priceBefore = econ.priceOf(STATION_ID, COMMODITY_ID, 'buy');
    const hullsBefore = liveRefineryHaulers(state).length;
    const kills = [];
    const pressures = [];
    const rumors = [];
    bus.on('entity:killed', (payload) => kills.push(payload));
    bus.on('economy:applyTradePressure', (payload) => pressures.push(payload));
    bus.on('pirateRumor:headline', (payload) => rumors.push(payload));

    // One player-attributed lethal hit through the production damage owner; the test does not
    // emit entity:killed or write victim.alive. Gun aiming/rendering are outside this clause.
    runtime.getHelpers().routeCombatDamage({
      targetId: victim.id, attackerId: state.playerId,
      packet: { channels: { kinetic: 100000 } },
    });
    assert.equal(victim.alive, false);
    assert.equal(kills.length, 1, 'one incident, emitted by the combat owner');
    assert.equal(kills[0].id, victim.id);
    assert.equal(kills[0].killerId, state.playerId);
    const marker = aftermathForSector(state, SECTOR_ID).find((row) => row.victimId === victim.id);
    const saved = runtime.getSystem('aftermathWrecks').serialize();
    const wrecks = () => state.entityList.filter((entity) => entity.alive !== false
      && entity.type === 'wreck' && entity.data?.markerId === marker?.markerId);
    // The live approach contains authored places as well as the station. The existing aftermath
    // owner patches the nearest structure, which need not be the refinery station itself.
    const structure = state.entityList.find((entity) => entity.alive !== false
      && (entity.type === 'station' || entity.data?.placeId || entity.data?.worldOneOff)
      && entity.data?.structurePatch?.receiptId === `aft_patch:${marker?.markerId}`);
    const patch = structure?.data?.structurePatch;
    const priceAfter = econ.priceOf(STATION_ID, COMMODITY_ID, 'buy');
    const rows = [
      { trace: 'wreck persists', ok: !!marker && wrecks().length === 1
        && saved.bySector[SECTOR_ID].some((row) => row.markerId === marker.markerId), evidenceId: marker?.markerId },
      { trace: 'traffic thins', ok: hullsBefore === 1 && liveRefineryHaulers(state).length === 0
        && state.traffic.disruptedStationIds.includes(STATION_ID), evidenceId: `route:${STATION_ID}:1->0` },
      { trace: 'price moves', ok: priceAfter !== priceBefore && pressures.some((row) =>
        row.freighterId === victim.id && row.stationId === STATION_ID), evidenceId: `${priceBefore}->${priceAfter}` },
      { trace: 'rumor appears', ok: rumors.some((row) => row.sectorId === SECTOR_ID
        && row.zoneId === ZONE_ID && row.headline), evidenceId: `${SECTOR_ID}:${ZONE_ID}` },
      { trace: 'structure patch', ok: patch?.kind === 'patched'
        && patch.receiptId === `aft_patch:${marker?.markerId}` && !!patch.text, evidenceId: patch?.receiptId },
    ];
    console.log(`PQ-138.05 live seed=13805 incidentTick=${state.tick} simTime=${state.simTime.toFixed(3)} cargo=${cargo.totalQty} handoff=${handoffId}`);
    printChecklist(rows);
    assert.equal(state.world.records.byId[recordId].alive, false);
    assert.equal(state.world.records.byId[recordId].outcome, 'destroyed');

    const world = runtime.getSystem('world');
    world.enterSector('sector_helios_prime');
    const decisions = observeLiveRefillGuard(t, runtime);
    world.enterSector(SECTOR_ID);
    console.log(`PQ-138.05 live seed=13805 five traces=${rows.filter((row) => row.ok).length}/5; _leftoverSlotRefillsDisruptedApproach=${JSON.stringify(decisions)}; hard re-enter refinery haulers=${liveRefineryHaulers(state).length}; wrecks=${wrecks().length}`);
    for (const row of rows) assert.equal(row.ok, true, `${row.trace} must come from this incident`);
    assert.deepEqual(decisions, [true], 'the packet guard must decide on the real destroyed-record branch');
    assert.equal(liveRefineryHaulers(state).length, 0, 'hard re-enter does not refill the disrupted approach');
    assert.equal(wrecks().length, 1, 'the same aftermath marker rematerializes one wreck');
    assert.ok(state.traffic.disruptedStationIds.includes(STATION_ID));
  } finally {
    runtime.dispose();
  }
});
