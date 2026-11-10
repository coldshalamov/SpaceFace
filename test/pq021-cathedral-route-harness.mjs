// PQ-021 Phase 4 — natural-earning driver for the five Wreck Cathedral evidence pages.
//
// THE L3 RULE: evidence is earned, never injected. Nothing in this module writes to
// `evidenceReceiptsByPageId`, `completedOperations`, or any receipt store. Every page is minted by
// the World Site owner as a side effect of `asteroidSites.applyWorldSiteBeamOperation(...)` — the
// exact API `src/systems/mining.js:287` calls when the player's industrial beam is on a component.
//
// Why sim-level and not keyboard-level: earning through the live UI requires New Game, traversal to
// sector_ceres_belt, locating the site at local (300, 2700), holding the beam through thresholds
// 48/24/20/28/36/30 at ~18 dps, and physically towing a 140-mass payload into the receiver. Inside a
// bounded headless run that is only reachable by teleporting the player or inflating beam dps —
// which is exactly the state injection the rule forbids. So earning is proven at the ordinary
// operation API, and the live-UI route is scoped to *reading* the earned pages.
//
// The one physical act this driver performs by hand is towing the released payload entity to the
// receiver. That is player physics (position), not receipt state: the kernel's `validDelivery`
// independently re-derives admissibility from live entity positions and the stage-scaled proxy
// radius, so a tow to the wrong place fails closed.

import { asteroidSites } from '../src/systems/asteroidSites.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { initializePresentationAdmission } from '../src/core/presentationAdmission.js';

export const SITE_ID = 'world_site_wreck_cathedral';
export const SECTOR_ID = 'sector_ceres_belt';

/**
 * The complete authored route. SEVEN operations, of which FIVE carry an `evidencePageId`.
 *
 * `repair_marker_service_spine` carries no page but is load-bearing twice over: it is a `dependsOn`
 * of the settlement AND the only transition that moves the spine `offline -> ready`, which is the
 * settlement's `from` state. Omitting it fails the settlement with `dependency-incomplete`.
 */
export const CATHEDRAL_ROUTE = Object.freeze([
  Object.freeze({
    operationId: 'stabilize_cathedral_hull',
    componentId: 'cathedral_hull',
    verb: 'repair',
    threshold: 48,
    pageId: null,
  }),
  Object.freeze({
    operationId: 'extract_bridge_navigation_record',
    componentId: 'bridge_navigation_record',
    verb: 'extract',
    threshold: 24,
    pageId: 'wreck_cathedral.missing_convoy',
  }),
  Object.freeze({
    operationId: 'extract_registry_scan',
    componentId: 'registry_scan_array',
    verb: 'extract',
    threshold: 20,
    pageId: 'wreck_cathedral.capital_hull_located',
  }),
  Object.freeze({
    // Driven in three partial passes so the run exercises `component.progress` accumulation and the
    // `delete component.progress[operationId]` collapse on completion, not just a single-shot apply.
    operationId: 'repair_emergency_relay_clock',
    componentId: 'emergency_relay_clock',
    verb: 'repair',
    threshold: 28,
    partials: Object.freeze([10, 10, 8]),
    pageId: 'wreck_cathedral.clock_stopped_first',
  }),
  Object.freeze({
    operationId: 'cut_cargo_clamp_forensics',
    componentId: 'cargo_clamp_forensics',
    verb: 'cut',
    threshold: 36,
    releasesPayloadId: 'cathedral_black_box',
    pageId: 'wreck_cathedral.released_from_inside',
  }),
  Object.freeze({
    operationId: 'repair_marker_service_spine',
    componentId: 'marker_service_spine',
    verb: 'repair',
    threshold: 30,
    pageId: null,
  }),
  Object.freeze({
    operationId: 'settle_cathedral_black_box',
    componentId: 'marker_service_spine',
    verb: 'transfer',
    threshold: 1,
    towPayloadId: 'cathedral_black_box',
    pageId: 'wreck_cathedral.what_was_carried',
  }),
]);

export const EVIDENCE_PAGE_IDS_IN_EARN_ORDER = Object.freeze(
  CATHEDRAL_ROUTE.filter((step) => step.pageId).map((step) => step.pageId),
);

function makeBus() {
  const handlers = new Map();
  return {
    handlers,
    events: [],
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
    emit(name, payload) {
      this.events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload || {});
    },
  };
}

/**
 * A live `asteroidSites` system over a real state object, parked in Ceres so the Cathedral's
 * natural producer materializes it on `sector:enter`. Mirrors test/world-site-persistence.test.mjs.
 */
export function makeCathedralHarness({ seed = 47 } = {}) {
  const bus = makeBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed },
    entities,
    entityList,
    freeIds: [],
    playerId: 1,
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 } },
    world: { currentSectorId: SECTOR_ID },
    content: { commodities: [] },
    story: {},
  };
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, flags: {}, vel: { x: 0, z: 0 }, ...spec };
      entity.data = spec.data || {};
      initializePresentationAdmission(entity);
      entities.set(entity.id, entity);
      entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const registry = { get() { return null; } };
  const system = Object.create(asteroidSites);
  const ctx = { state, bus, helpers, registry };
  system.init(ctx);
  return { system, state, bus, helpers, ctx };
}

export function siteRecord(state) {
  return state.sites && state.sites.worldById && state.sites.worldById[SITE_ID];
}

export function byWorldRecord(state, worldRecordId) {
  return [...state.entities.values()].filter((entity) => entity.alive !== false
    && entity.data && entity.data.worldRecordId === worldRecordId);
}

function fail(message) {
  throw new Error(`[pq021-earning] ${message}`);
}

/**
 * Apply ONE beam pass and validate the result honestly.
 *
 * THE TRAP THIS CLOSES: `duplicate(record, reason)` in worldSiteKernel.js returns `{ ok: true,
 * duplicate: true, receipt: null }`. A driver that asserts only `result.ok === true` earns nothing
 * and still reports success. Every pass must therefore prove `duplicate === false` and `moved > 0`.
 */
function beamPass(h, step, amount, tick) {
  h.state.tick = tick;
  h.state.simTime = tick / 60;
  const result = h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId: step.componentId,
    verb: step.verb,
    amount,
    requestStreamId: 'player-industrial-beam',
    requestSequence: tick,
    tick,
  });
  if (result.ok !== true) fail(`${step.operationId}: beam refused (${result.reason})`);
  if (result.duplicate === true) fail(`${step.operationId}: beam was a replay (${result.reason}) — nothing was earned`);
  if (!(result.moved > 0)) fail(`${step.operationId}: beam applied zero progress`);
  if (result.operationId !== step.operationId) {
    fail(`${step.operationId}: beam resolved to ${result.operationId} instead`);
  }
  return result;
}

/**
 * One raw beam pass with NO result validation, for tests that need to observe a refusal.
 * `earnCathedralEvidence` uses the validating path above; this is the adversarial door.
 */
export function rawBeamPass(h, { componentId, verb, amount, tick }) {
  h.state.tick = tick;
  h.state.simTime = tick / 60;
  return h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId,
    verb,
    amount,
    requestStreamId: 'player-industrial-beam',
    requestSequence: tick,
    tick,
  });
}

/**
 * Drive the full authored route. Returns a per-step log plus the bus receipt count.
 * `tickStep` spaces the passes so each page lands at a distinct `earnedAtS`, which makes the
 * projector's newest-first ordering observable rather than tie-broken by row id.
 */
export function earnCathedralEvidence(h, { startTick = 120, tickStep = 120 } = {}) {
  const manifest = worldSiteManifestById(SITE_ID);
  if (!manifest) fail('the Wreck Cathedral manifest is not registered');
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  const record0 = siteRecord(h.state);
  if (!record0) fail('sector:enter did not materialize the Cathedral site record');
  if (record0.sectorId !== SECTOR_ID) {
    fail(`site sectorId ${record0.sectorId} must match the live sector for materialization sync`);
  }
  if (Object.keys(record0.evidenceReceiptsByPageId || {}).length !== 0) {
    fail('a fresh site must start with zero evidence receipts');
  }

  const log = [];
  let tick = startTick;
  for (const step of CATHEDRAL_ROUTE) {
    // Physical delivery: tow the released payload into the receiver before the transfer verb.
    if (step.towPayloadId) {
      const payload = byWorldRecord(h.state, `${SITE_ID}/payload/${step.towPayloadId}`)[0];
      const receiver = byWorldRecord(h.state, `${SITE_ID}/component/${step.componentId}`)[0];
      if (!payload) fail(`payload ${step.towPayloadId} never materialized after release`);
      if (!receiver) fail(`receiver component ${step.componentId} has no live proxy`);
      payload.pos = { ...receiver.pos };
      payload.vel = { x: 0, z: 0 };
    }

    const passes = step.partials ? [...step.partials] : [step.threshold];
    let completed = null;
    const passLog = [];
    for (const amount of passes) {
      const result = beamPass(h, step, amount, tick);
      passLog.push({ tick, amount, moved: result.moved, complete: !!(result.receipt && result.receipt.complete) });
      if (result.receipt && result.receipt.complete) completed = result;
      tick += tickStep;
    }
    if (!completed) fail(`${step.operationId}: route finished the step without a completion receipt`);

    const record = siteRecord(h.state);
    if (!record.completedOperations || !record.completedOperations[step.operationId]) {
      fail(`${step.operationId}: no durable completion was written by the site owner`);
    }
    if (step.pageId && !(record.evidenceReceiptsByPageId || {})[step.pageId]) {
      fail(`${step.operationId}: completing the operation did not mint ${step.pageId}`);
    }
    if (!step.pageId) {
      // A page-less operation must not mint anything into the evidence map.
      const minted = Object.keys(record.evidenceReceiptsByPageId || {});
      const expected = CATHEDRAL_ROUTE
        .filter((candidate) => candidate.pageId && record.completedOperations[candidate.operationId])
        .map((candidate) => candidate.pageId);
      if (minted.length !== expected.length) {
        fail(`${step.operationId}: a page-less operation changed the evidence map size`);
      }
    }
    if (step.releasesPayloadId) {
      const payload = record.payloads && record.payloads[step.releasesPayloadId];
      if (!payload || payload.status !== 'released') {
        fail(`${step.operationId}: the payload was not released for physical recovery`);
      }
    }
    log.push({
      operationId: step.operationId,
      componentId: step.componentId,
      verb: step.verb,
      pageId: step.pageId,
      passes: passLog,
      stageId: record.stageId,
    });
  }

  return {
    log,
    finalTick: tick - tickStep,
    operationReceiptEvents: h.bus.events.filter((event) => event.name === 'worldSite:operationReceipt').length,
    record: siteRecord(h.state),
  };
}

export default earnCathedralEvidence;
