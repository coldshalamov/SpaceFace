// M2-C3 — deterministic offscreen consequence embodiment.
// Pure scalar→record intent projection + sectorSim adapter idempotency / replay.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS, dangerIndex } from '../src/data/sectors.js';
import { FACTION_META } from '../src/data/factions.js';
import { createGameState } from '../src/core/gameState.js';
import {
  createSectorField,
  stepSectorField,
  buildSectorGraph,
  sectorFieldDigest,
} from '../src/systems/dangerModel.js';
import {
  sectorSim,
  effectiveDangerFor,
} from '../src/systems/sectorSim.js';
import {
  EMBODIMENT_SCHEMA_ID,
  EMBODIMENT_KIND,
  projectSectorEmbodiment,
  projectFieldEmbodiment,
  filterNewEmbodimentIntents,
  mergeAppliedIntentIds,
  stableIntentId,
  proposedRecordId,
  embodimentDigest,
  quantizeEpochDays,
  stableSerialize,
  isFullFieldSectorList,
  nextEmbodimentAuditDigests,
} from '../src/sim/sector/embodiment.js';
import { stableRecordId } from '../src/world/worldRecords.js';

const SECTOR_IDS = SECTORS.map((s) => s.id).sort((a, b) => a.localeCompare(b));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

function makeCtx(seed = 42) {
  const state = createGameState(seed);
  state.meta.seed = seed;
  state.world.currentSectorId = 'sector_helios_prime';
  for (const s of SECTORS) {
    state.world.sectors[s.id] = { ...s, owner: s.factionId };
  }
  const emitLog = [];
  const bus = {
    emit(event, payload) { emitLog.push({ event, payload }); },
    on() {}, off() {}, once() {}, queue() {}, flush() {}, clear() {},
  };
  const registry = {
    get(name) {
      if (name === 'factions') return { addOffscreenTension() {}, contestedSectorFor() { return null; } };
      if (name === 'automation') return { offscreenRiskPass() { return 0; } };
      return null;
    },
  };
  return { state, bus, emitLog, registry, helpers: {} };
}

function boot(ctx) {
  sectorSim.state = ctx.state;
  sectorSim.bus = ctx.bus;
  sectorSim.helpers = ctx.helpers;
  sectorSim.registry = ctx.registry;
  sectorSim._graph = null;
  sectorSim.newGame();
  return sectorSim;
}

function fieldAt(seed, dtDays) {
  const graph = buildSectorGraph(SECTORS);
  const ownerBySector = Object.create(null);
  for (const s of SECTORS) ownerBySector[s.id] = s.factionId;
  let field = createSectorField({ graph, factionMeta: FACTION_META, ownerBySector, seed });
  if (dtDays > 0) {
    field = stepSectorField({
      graph, field, factionMeta: FACTION_META, ownerBySector, seed, dtDays,
    });
  }
  return field;
}

// ── pure kernel ────────────────────────────────────────────────────────────────────────────

test('covers all 24 stable sectors in seeded order', () => {
  assert.equal(SECTORS.length, 24);
  const field = fieldAt(42, 2);
  const proj = projectFieldEmbodiment({
    field,
    sectorIds: SECTOR_IDS.slice().reverse(), // deliberately reverse input
    sectorsById: SECTOR_BY_ID,
    seed: 42,
    baseDangerFor: (id) => dangerIndex(SECTOR_BY_ID.get(id)),
  });
  const keys = Object.keys(proj.bySector);
  assert.equal(keys.length, 24);
  assert.deepEqual(keys, SECTOR_IDS);
  assert.ok(proj.intents.length >= 24 * 3, 'at least core intents per sector');
  // Global list sorted by intentId
  for (let i = 1; i < proj.intents.length; i++) {
    assert.ok(proj.intents[i - 1].intentId <= proj.intents[i].intentId);
  }
});

test('deterministic replay: same seed+field ⇒ identical intents + digest', () => {
  const field = fieldAt(7, 3.5);
  const a = projectFieldEmbodiment({
    field, sectorIds: SECTOR_IDS, sectorsById: SECTOR_BY_ID, seed: 7,
    baseDangerFor: (id) => dangerIndex(SECTOR_BY_ID.get(id)),
  });
  const b = projectFieldEmbodiment({
    field, sectorIds: SECTOR_IDS, sectorsById: SECTOR_BY_ID, seed: 7,
    baseDangerFor: (id) => dangerIndex(SECTOR_BY_ID.get(id)),
  });
  assert.equal(a.digest, b.digest);
  assert.equal(a.intents.length, b.intents.length);
  assert.deepEqual(
    a.intents.map((x) => x.intentId),
    b.intents.map((x) => x.intentId),
  );
  assert.deepEqual(JSON.stringify(a.intents), JSON.stringify(b.intents));
});

test('different seed yields different intent ids', () => {
  const field = fieldAt(1, 1);
  const a = projectFieldEmbodiment({ field, sectorIds: SECTOR_IDS, seed: 1, sectorsById: SECTOR_BY_ID });
  const b = projectFieldEmbodiment({ field, sectorIds: SECTOR_IDS, seed: 999, sectorsById: SECTOR_BY_ID });
  assert.notEqual(a.digest, b.digest);
  assert.notDeepEqual(
    a.intents.map((x) => x.intentId),
    b.intents.map((x) => x.intentId),
  );
});

test('proposedRecordId matches worldRecords.stableRecordId contract', () => {
  const seed = 42;
  const sectorId = 'sector_ceres_belt';
  const key = 'convoy:3:0';
  assert.equal(
    proposedRecordId(seed, sectorId, 'convoy', key),
    stableRecordId(seed, sectorId, 'convoy', key),
  );
  assert.equal(
    proposedRecordId(seed, sectorId, 'npc', 'raid:1:2'),
    stableRecordId(seed, sectorId, 'npc', 'raid:1:2'),
  );
});

test('intent payload schema is minimal and documented', () => {
  const field = fieldAt(42, 4);
  const node = field.nodes.sector_ashfall_reach;
  const intents = projectSectorEmbodiment({
    sectorId: 'sector_ashfall_reach',
    sector: SECTOR_BY_ID.get('sector_ashfall_reach'),
    node,
    seed: 42,
    epochDays: field.epochDays,
    baseDanger: dangerIndex(SECTOR_BY_ID.get('sector_ashfall_reach')),
  });
  assert.ok(intents.length >= 3);
  for (const it of intents) {
    assert.equal(it.schemaId, EMBODIMENT_SCHEMA_ID);
    assert.equal(it.source, 'sector_field');
    assert.ok(it.intentId.startsWith('ei_'));
    assert.equal(it.sectorId, 'sector_ashfall_reach');
    assert.ok(Object.values(EMBODIMENT_KIND).includes(it.kind));
    assert.equal(typeof it.epochKey, 'number');
    assert.ok(it.payload && typeof it.payload === 'object');
    // No live entity / writer fields
    assert.equal(it.entityId, undefined);
    assert.equal(it.credits, undefined);
    assert.equal(it.cargo, undefined);
    assert.equal(it.rep, undefined);
    assert.equal(it.hull, undefined);
    if (it.proposedRecordKind) {
      assert.ok(it.proposedRecordId);
      assert.match(it.proposedRecordId, /^wr_/);
    }
  }
  const kinds = new Set(intents.map((i) => i.kind));
  assert.ok(kinds.has(EMBODIMENT_KIND.TRAFFIC_DENSITY));
  assert.ok(kinds.has(EMBODIMENT_KIND.DANGER_PRESENCE));
  assert.ok(kinds.has(EMBODIMENT_KIND.MARKET_PRESSURE));
});

test('filterNewEmbodimentIntents is idempotent', () => {
  const field = fieldAt(42, 1);
  const proj = projectFieldEmbodiment({ field, sectorIds: SECTOR_IDS, seed: 42, sectorsById: SECTOR_BY_ID });
  const first = filterNewEmbodimentIntents(proj.intents, []);
  assert.equal(first.length, proj.intents.length);
  const applied = mergeAppliedIntentIds([], first);
  const second = filterNewEmbodimentIntents(proj.intents, applied);
  assert.equal(second.length, 0);
  // Partial apply
  const partial = applied.slice(0, 5);
  const rest = filterNewEmbodimentIntents(proj.intents, partial);
  assert.equal(rest.length, proj.intents.length - 5);
});

test('stableIntentId is epoch-quantum stable', () => {
  const a = stableIntentId(42, 'sector_helios_prime', 'traffic_density', quantizeEpochDays(1.0), 'core');
  const b = stableIntentId(42, 'sector_helios_prime', 'traffic_density', quantizeEpochDays(1.1), 'core');
  const c = stableIntentId(42, 'sector_helios_prime', 'traffic_density', quantizeEpochDays(1.3), 'core');
  assert.equal(a, b); // same 0.25 quantum bucket (1.0 and 1.1 → key 4)
  assert.notEqual(a, c); // 1.3 → key 5
});

test('field kernel has no wall-clock dependency (dangerModel step)', () => {
  // Two pure steps with identical inputs must match regardless of wall time between them.
  const graph = buildSectorGraph(SECTORS);
  const ownerBySector = Object.create(null);
  for (const s of SECTORS) ownerBySector[s.id] = s.factionId;
  const seed = 55;
  const f0 = createSectorField({ graph, factionMeta: FACTION_META, ownerBySector, seed });
  const a = stepSectorField({ graph, field: f0, factionMeta: FACTION_META, ownerBySector, seed, dtDays: 2 });
  // Simulate wall delay (if kernel used Date.now, digests would diverge under load — we assert purity).
  const b = stepSectorField({ graph, field: f0, factionMeta: FACTION_META, ownerBySector, seed, dtDays: 2 });
  assert.equal(sectorFieldDigest(a), sectorFieldDigest(b));
  assert.equal(a.epochDays, b.epochDays);
});

// ── sectorSim adapter ──────────────────────────────────────────────────────────────────────

test('sectorSim emits embodiment for all 24 sectors on field advance', () => {
  const ctx = makeCtx(42);
  boot(ctx);
  ctx.emitLog.length = 0;
  ctx.state.simTime = 600 * 2;
  sectorSim.state = ctx.state;
  sectorSim._onDayTick({ days: 2 });

  const embEvents = ctx.emitLog.filter((e) => e.event === 'sectorsim:embodiment');
  assert.ok(embEvents.length >= 1, 'must emit sectorsim:embodiment');
  const payload = embEvents[0].payload;
  assert.equal(payload.schemaId, EMBODIMENT_SCHEMA_ID);
  assert.equal(payload.createsEntities, false);
  assert.equal(payload.writesCredits, false);
  assert.equal(payload.writesCargo, false);
  assert.equal(payload.writesRep, false);
  assert.equal(payload.writesHull, false);
  assert.equal(payload.sectorIds.length, 24);
  assert.deepEqual(payload.sectorIds, SECTOR_IDS);
  assert.ok(payload.intents.length > 0);
  // Single-writer: no direct credits/faction/cargo mutations
  assert.equal(ctx.state.player.credits, createGameState(42).player.credits);
});

test('embodiment emit is idempotent at same epoch (no double application)', () => {
  const ctx = makeCtx(42);
  boot(ctx);
  ctx.state.simTime = 600;
  sectorSim.state = ctx.state;
  sectorSim._advanceModel(1, 'test');
  const first = ctx.emitLog.filter((e) => e.event === 'sectorsim:embodiment');
  assert.equal(first.length, 1);
  const n1 = first[0].payload.intents.length;
  assert.ok(n1 > 0);

  ctx.emitLog.length = 0;
  // Re-project same epoch without advancing field.
  const again = sectorSim._projectAndEmitEmbodiment({ source: 'reproject' });
  assert.equal(again.emitted, 0);
  const second = ctx.emitLog.filter((e) => e.event === 'sectorsim:embodiment');
  assert.equal(second.length, 0, 'idempotent: no second emit at same epoch');
});

test('continuous sector enter does not double-apply embodiment or market pressure', () => {
  const ctx = makeCtx(42);
  boot(ctx);
  ctx.state.simTime = 600 * 2;
  sectorSim.state = ctx.state;
  sectorSim._advanceModel(2, 'test');

  const economyBefore = ctx.emitLog.filter((e) => e.event === 'economy:applyTradePressure').length;
  const embBefore = ctx.emitLog.filter((e) => e.event === 'sectorsim:embodiment').length;
  assert.ok(embBefore >= 1);
  assert.ok(economyBefore >= 0);

  ctx.emitLog.length = 0;
  sectorSim._onSectorEnter({
    sectorId: 'sector_ceres_belt',
    continuous: true,
    noTeleport: true,
  });

  const economyAfter = ctx.emitLog.filter((e) => e.event === 'economy:applyTradePressure');
  const embAfter = ctx.emitLog.filter((e) => e.event === 'sectorsim:embodiment');
  const recon = ctx.emitLog.filter((e) => e.event === 'sectorsim:reconcile');
  assert.equal(economyAfter.length, 0, 'continuous enter must not re-emit trade pressure');
  assert.equal(embAfter.length, 0, 'continuous enter must not re-emit same-epoch embodiment');
  assert.equal(recon.length, 0, 'continuous enter must not hard-reconcile');
});

test('hard sector enter may emit reconcile but still idempotent embodiment', () => {
  const ctx = makeCtx(42);
  boot(ctx);
  ctx.state.simTime = 0;
  sectorSim.state = ctx.state;
  sectorSim._sectorRec('sector_tethys_junction').lastEnterSimT = 0;
  sectorSim._advanceModel(1, 'test');
  ctx.emitLog.length = 0;
  ctx.state.simTime = 600 * 5;
  sectorSim._onSectorEnter({ sectorId: 'sector_tethys_junction', continuous: false });
  const recon = ctx.emitLog.filter((e) => e.event === 'sectorsim:reconcile');
  assert.ok(recon.length >= 1);
  // embodiment already applied for epoch → no re-emit
  const emb = ctx.emitLog.filter((e) => e.event === 'sectorsim:embodiment');
  assert.equal(emb.length, 0);
});

test('offline catch-up days are capped', () => {
  const ctx = makeCtx(42);
  boot(ctx);
  const ss = ctx.state.sectorSim;
  // Pretend last wall was very long ago.
  ss.meta.lastWallT = Date.now() - 30 * 24 * 3600 * 1000;
  const epochBefore = (ss.field && ss.field.epochDays) || 0;
  sectorSim.runOfflineCatchup();
  const epochAfter = (ss.field && ss.field.epochDays) || 0;
  const advanced = epochAfter - epochBefore;
  // OFFLINE_CAP_SEC=14400, EFF=0.6 → max days floor(8640/600)=14
  assert.ok(advanced <= 14 + 1e-9, `offline days capped, got ${advanced}`);
  assert.ok(advanced >= 1, 'should advance at least one day when long away');
});

test('serialize/deserialize preserves embodiment applied set (no re-emit)', () => {
  const ctx = makeCtx(42);
  boot(ctx);
  sectorSim._advanceModel(1.5, 'test');
  ctx.state.sectorSim.meta.lossLog = [{ id: 'fixture_loss', detail: { count: 1 } }];
  const blob = sectorSim.serialize();
  assert.equal(sectorSim.saveSnapshotOwned, true);
  assert.ok(blob.embodiment);
  assert.ok(Array.isArray(blob.embodiment.appliedIds));
  assert.ok(blob.embodiment.appliedIds.length > 0);
  blob.meta.lossLog[0].detail.count = 99;
  assert.equal(ctx.state.sectorSim.meta.lossLog[0].detail.count, 1,
    'owned sector-sim snapshots must deep-copy nested loss receipts');

  const ctx2 = makeCtx(42);
  boot(ctx2);
  sectorSim.deserialize(blob);
  ctx2.emitLog.length = 0;
  const r = sectorSim._projectAndEmitEmbodiment({ source: 'after_load' });
  assert.equal(r.emitted, 0, 'restored applied ids block re-emit');
  assert.equal(ctx2.emitLog.filter((e) => e.event === 'sectorsim:embodiment').length, 0);
});

test('single-writer: embodiment path does not write credits/cargo/rep/hull', () => {
  const ctx = makeCtx(42);
  boot(ctx);
  const credits = ctx.state.player.credits;
  const cargo = JSON.stringify(ctx.state.player.cargo || ctx.state.cargo || {});
  const factions = JSON.stringify(ctx.state.factions);
  const player = ctx.state.entities && ctx.state.entities.get
    ? ctx.state.entities.get(ctx.state.playerId)
    : null;
  const hull = player && player.hull;

  sectorSim._advanceModel(3, 'test');
  sectorSim._onSectorEnter({ sectorId: 'sector_ceres_belt', continuous: true });
  sectorSim._projectAndEmitEmbodiment({ source: 'manual' });

  assert.equal(ctx.state.player.credits, credits);
  assert.equal(JSON.stringify(ctx.state.player.cargo || ctx.state.cargo || {}), cargo);
  assert.equal(JSON.stringify(ctx.state.factions), factions);
  if (player && hull != null) assert.equal(player.hull, hull);
});

test('effectiveDanger still reflects field after embodiment wiring', () => {
  const ctx = makeCtx(42);
  boot(ctx);
  const id = 'sector_ceres_belt';
  const before = effectiveDangerFor(ctx.state, id);
  sectorSim.injectImpulse({ kind: 'interdiction', sectorId: id, danger: 0.2 });
  sectorSim._advanceModel(0.25, 'impulse');
  const after = effectiveDangerFor(ctx.state, id);
  assert.ok(after > before - 1e-9);
});

test('embodimentDigest stable for equal lists', () => {
  const field = fieldAt(3, 1);
  const proj = projectFieldEmbodiment({ field, sectorIds: SECTOR_IDS, seed: 3, sectorsById: SECTOR_BY_ID });
  assert.equal(embodimentDigest(proj.intents), embodimentDigest(proj.intents.slice().reverse()));
});

// ── digest payload-binding (M2-C3 repair) ───────────────────────────────────────

function fixtureIntent(overrides = {}) {
  return {
    schemaId: EMBODIMENT_SCHEMA_ID,
    schemaVersion: 1,
    intentId: 'ei_test_fixture_1',
    sectorId: 'sector_helios_prime',
    kind: EMBODIMENT_KIND.TRAFFIC_DENSITY,
    epochKey: 4,
    epochDays: 1,
    source: 'sector_field',
    proposedRecordId: null,
    proposedRecordKind: null,
    identityKey: 'traffic_density:core',
    payload: {
      densityMultiplier: 1.25,
      trafficCountHint: 4,
      roleMixBias: { hauler: 1.2, pirate: 0.8 },
      dominantFactionId: 'faction_scn',
    },
    ...overrides,
  };
}

test('embodimentDigest: equal semantic payload with reordered keys => same digest', () => {
  const a = fixtureIntent({
    payload: {
      densityMultiplier: 1.25,
      trafficCountHint: 4,
      roleMixBias: { hauler: 1.2, pirate: 0.8, escort: 1.1 },
      dominantFactionId: 'faction_scn',
      nested: { z: 9, a: { b: 2, c: 1 } },
    },
  });
  // Same values, different insertion / key order at every nesting level.
  const b = fixtureIntent({
    payload: {
      nested: { a: { c: 1, b: 2 }, z: 9 },
      dominantFactionId: 'faction_scn',
      roleMixBias: { escort: 1.1, pirate: 0.8, hauler: 1.2 },
      trafficCountHint: 4,
      densityMultiplier: 1.25,
    },
  });
  assert.equal(
    stableSerialize(a.payload),
    stableSerialize(b.payload),
    'stableSerialize must ignore object key order',
  );
  assert.equal(
    embodimentDigest([a]),
    embodimentDigest([b]),
    'semantically equal payload with reordered keys must share digest',
  );
  // Intent-level field reordering (object insertion order) must also not matter:
  // digest material is rebuilt with a fixed field set + stableSerialize.
  const c = {
    payload: b.payload,
    source: a.source,
    kind: a.kind,
    intentId: a.intentId,
    proposedRecordKind: a.proposedRecordKind,
    identityKey: a.identityKey,
    epochDays: a.epochDays,
    schemaVersion: a.schemaVersion,
    schemaId: a.schemaId,
    sectorId: a.sectorId,
    epochKey: a.epochKey,
    proposedRecordId: a.proposedRecordId,
  };
  assert.equal(embodimentDigest([a]), embodimentDigest([c]));
});

test('embodimentDigest: changed nested payload with same intent ids => different digest', () => {
  const ids = {
    intentId: 'ei_same_id',
    sectorId: 'sector_ceres_belt',
    kind: EMBODIMENT_KIND.DANGER_PRESENCE,
    epochKey: 8,
    proposedRecordId: 'wr_npc_deadbeef',
    proposedRecordKind: 'npc',
    identityKey: 'danger:8',
  };
  const a = fixtureIntent({
    ...ids,
    payload: {
      danger: 0.4,
      encounterLoad: 1.2,
      nested: { band: 2, flags: { hostile: true, quiet: false } },
    },
  });
  const b = fixtureIntent({
    ...ids,
    payload: {
      danger: 0.4,
      encounterLoad: 1.2,
      nested: { band: 2, flags: { hostile: false, quiet: false } }, // nested field change only
    },
  });
  assert.equal(a.intentId, b.intentId);
  assert.equal(a.sectorId, b.sectorId);
  assert.equal(a.kind, b.kind);
  assert.equal(a.epochKey, b.epochKey);
  assert.equal(a.proposedRecordId, b.proposedRecordId);
  assert.notEqual(
    embodimentDigest([a]),
    embodimentDigest([b]),
    'nested payload consequence change must not collide under same ids',
  );
  // Top-level payload scalar change also diverges.
  const c = fixtureIntent({
    ...ids,
    payload: { ...a.payload, danger: 0.41 },
  });
  assert.notEqual(embodimentDigest([a]), embodimentDigest([c]));
});

test('embodimentDigest: projected field digest is payload-bound (not id-only)', () => {
  const field = fieldAt(11, 2);
  const proj = projectFieldEmbodiment({
    field, sectorIds: SECTOR_IDS, seed: 11, sectorsById: SECTOR_BY_ID,
    baseDangerFor: (id) => dangerIndex(SECTOR_BY_ID.get(id)),
  });
  assert.ok(proj.intents.length > 0);
  const d0 = embodimentDigest(proj.intents);
  assert.equal(d0, proj.digest);
  // Mutate one nested payload field while keeping every identity field intact.
  const clone = proj.intents.map((it, i) => {
    if (i !== 0) return it;
    return {
      ...it,
      payload: { ...it.payload, __adversarial: 1 },
    };
  });
  assert.equal(clone[0].intentId, proj.intents[0].intentId);
  assert.notEqual(embodimentDigest(clone), d0);
  // Replay: original projection again yields same digest.
  const again = projectFieldEmbodiment({
    field, sectorIds: SECTOR_IDS, seed: 11, sectorsById: SECTOR_BY_ID,
    baseDangerFor: (id) => dangerIndex(SECTOR_BY_ID.get(id)),
  });
  assert.equal(again.digest, d0);
});

// ── full-field audit digest continuity (M2-C3 final repair) ───────────────────

test('isFullFieldSectorList: full set vs subset / order-independent', () => {
  assert.equal(isFullFieldSectorList(SECTOR_IDS, SECTOR_IDS), true);
  assert.equal(isFullFieldSectorList(SECTOR_IDS.slice().reverse(), SECTOR_IDS), true);
  assert.equal(isFullFieldSectorList(['sector_ceres_belt'], SECTOR_IDS), false);
  assert.equal(isFullFieldSectorList([], SECTOR_IDS), false);
  assert.equal(isFullFieldSectorList(null, SECTOR_IDS), false);
  assert.equal(isFullFieldSectorList(SECTOR_IDS.slice(0, 23), SECTOR_IDS), false);
});

test('nextEmbodimentAuditDigests: subset never replaces lastDigest', () => {
  const full = nextEmbodimentAuditDigests(
    { lastDigest: 0, lastSubsetDigest: 0 },
    0xabc123,
    { fullField: true },
  );
  assert.equal(full.lastDigest, 0xabc123);
  assert.equal(full.lastSubsetDigest, 0);
  assert.equal(full.fullField, true);

  const subset = nextEmbodimentAuditDigests(full, 0xdef456, { fullField: false });
  assert.equal(subset.lastDigest, 0xabc123, 'subset must preserve full-field audit digest');
  assert.equal(subset.lastSubsetDigest, 0xdef456);
  assert.equal(subset.fullField, false);

  const noopSubset = nextEmbodimentAuditDigests(subset, 0x111, { fullField: false });
  assert.equal(noopSubset.lastDigest, 0xabc123);
  assert.equal(noopSubset.lastSubsetDigest, 0x111);

  const fullAgain = nextEmbodimentAuditDigests(noopSubset, 0xabc123, { fullField: true });
  assert.equal(fullAgain.lastDigest, 0xabc123);
  assert.equal(fullAgain.lastSubsetDigest, 0x111, 'full update leaves prior subset digest');
});

test('continuous enter after full advance preserves lastDigest (audit continuity)', () => {
  const ctx = makeCtx(42);
  boot(ctx);
  ctx.state.simTime = 600 * 2;
  sectorSim.state = ctx.state;
  sectorSim._advanceModel(2, 'test');

  const emb = ctx.state.sectorSim.embodiment;
  const fullDigest = emb.lastDigest;
  assert.ok(fullDigest > 0, 'full-field advance must stamp lastDigest');
  assert.equal(emb.appliedIds.length > 0, true);

  // Independent full projection for the same field must match lastDigest.
  const field = ctx.state.sectorSim.field;
  const fullProj = projectFieldEmbodiment({
    field,
    sectorIds: SECTOR_IDS,
    sectorsById: SECTOR_BY_ID,
    seed: 42,
    baseDangerFor: (id) => dangerIndex(SECTOR_BY_ID.get(id)),
  });
  assert.equal(fullDigest, fullProj.digest, 'lastDigest must equal full-field embodiment digest');

  // Continuous enter: subset / no-op reproject — must not corrupt full audit digest.
  const subsetBefore = emb.lastSubsetDigest || 0;
  sectorSim._onSectorEnter({
    sectorId: 'sector_ceres_belt',
    continuous: true,
    noTeleport: true,
  });

  assert.equal(
    ctx.state.sectorSim.embodiment.lastDigest,
    fullDigest,
    'continuous-enter subset/no-op must not overwrite lastDigest with subset digest',
  );
  // Subset projection may stamp a separate clearly-named digest.
  const subsetAfter = ctx.state.sectorSim.embodiment.lastSubsetDigest;
  assert.ok(
    subsetAfter !== fullDigest || subsetAfter === subsetBefore,
    'subset path should not masquerade as full-field digest continuity',
  );
  // Explicit reproject of the same single sector also preserves lastDigest.
  const r = sectorSim._projectAndEmitEmbodiment({
    source: 'reproject_subset',
    sectorIds: ['sector_ceres_belt'],
  });
  assert.equal(r.emitted, 0);
  assert.equal(r.fullField, false);
  assert.equal(ctx.state.sectorSim.embodiment.lastDigest, fullDigest);
  assert.equal(r.lastFullFieldDigest, fullDigest);
  // Full-field no-op reproject still keeps the same lastDigest.
  const fullNop = sectorSim._projectAndEmitEmbodiment({ source: 'reproject_full', sectorIds: null });
  assert.equal(fullNop.emitted, 0);
  assert.equal(fullNop.fullField, true);
  assert.equal(ctx.state.sectorSim.embodiment.lastDigest, fullDigest);
  assert.equal(fullNop.digest, fullDigest);
});

test('serialize/deserialize preserves full lastDigest across subset enter', () => {
  const ctx = makeCtx(7);
  boot(ctx);
  sectorSim._advanceModel(1.25, 'test');
  const fullDigest = ctx.state.sectorSim.embodiment.lastDigest;
  assert.ok(fullDigest > 0);
  sectorSim._onSectorEnter({ sectorId: 'sector_ashfall_reach', continuous: true });
  assert.equal(ctx.state.sectorSim.embodiment.lastDigest, fullDigest);

  const blob = sectorSim.serialize();
  assert.equal(blob.embodiment.lastDigest, fullDigest);

  const ctx2 = makeCtx(7);
  boot(ctx2);
  sectorSim.deserialize(blob);
  assert.equal(ctx2.state.sectorSim.embodiment.lastDigest, fullDigest);
  // After load, subset reproject still must not replace audit digest.
  sectorSim._onSectorEnter({ sectorId: 'sector_ceres_belt', continuous: true, noTeleport: true });
  assert.equal(ctx2.state.sectorSim.embodiment.lastDigest, fullDigest);
});
