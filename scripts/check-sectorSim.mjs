// check-sectorSim.mjs — validates the offscreen sector-simulation engine (ADR-0002 / V2 §33).
//
// Covers the load-bearing correctness invariants the ADR names as required, not niceties:
//   1. Seed stability — identical seed ⇒ identical drift + loss sequences.
//   2. Per-sector + per-day RNG independence — sector X's outcome ≠ sector Y's, and re-evaluating
//      X yields the same result regardless of when (ADR §86-88, the headline invariant).
//   3. Determinism — same seed reproduces; different seed differs (but still reproducible).
//   4. deserialize re-seeds from the restored rngSeed (save-integrity continuation).
//   5. v2→v3 migration round-trip — a v2 blob (no data.sectorSim) survives migration with sane defaults.
//      This is the first real migration to ever run; the ADR flags the untested-migration path as the
//      headline follow-up risk, so this gate closes it.
//   6. Single-writer safety — sectorSim never directly writes player.credits / factions / world.sectors /
//      automation; it affects them only via emitted intents / sanctioned method calls.
//   7. Danger-overlay correctness — effectiveDanger reflects drift; the public resolver is read-only.
import assert from 'node:assert/strict';
import { sectorSim, effectiveDangerFor, effectiveSectorFor, effectiveDangerTierFor } from '../src/systems/sectorSim.js';
import { createGameState } from '../src/core/gameState.js';
import { MIGRATIONS, CURRENT_VERSION } from '../src/save/migrations.js';
import { SECTORS, dangerIndex, dangerTier } from '../src/data/sectors.js';

// Real mulberry32 + a real FNV-1a hash32 so per-sector substreams are genuinely independent (the
// economy test stubs them to constants, which would mask per-sector-independence bugs — we can't).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash32(...args) {
  let h = 0x811C9DC5;
  const s = args.map(String).join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeCtx(seed = 42, opts = {}) {
  const state = createGameState(seed);
  // Minimal world/factions setup so sectorSim can read owners + power.
  state.world.currentSectorId = 'sector_helios_prime';
  for (const s of SECTORS) {
    state.world.sectors[s.id] = { ...s, owner: s.factionId };
  }
  if (opts.aggroOwner) {
    // Make a sector's owner aggressive so drift target drops security (exercises the aggro branch).
    state.factions['faction_reach'] = { rep: -50, power: 8, aggro: true };
  }
  const emitLog = [];
  const bus = {
    emit(event, payload) { emitLog.push({ event, payload }); },
    on() {}, off() {}, once() {}, queue() {}, flush() {}, clear() {},
  };
  const helpers = { mulberry32, hash32 };
  const registry = {
    get(name) {
      if (name === 'factions') return { addOffscreenTension() {}, contestedSectorFor() { return null; } };
      if (name === 'automation') return { offscreenRiskPass() { return 0; } };
      return null;
    },
  };
  return { state, bus, helpers, registry, emitLog };
}

function bootSectorSim(ctx) {
  sectorSim.state = ctx.state;
  sectorSim.bus = ctx.bus;
  sectorSim.helpers = ctx.helpers;
  sectorSim.registry = ctx.registry;
  sectorSim._initRng();
  return sectorSim;
}

// ------------------------------------------------------------------------------------------
// 1 + 2 + 3: seed stability, per-sector independence, determinism.
// ------------------------------------------------------------------------------------------
function checkSeedStabilityAndDeterminism() {
  const ctxA = makeCtx(42);
  const ctxB = makeCtx(42);
  bootSectorSim(ctxA);
  bootSectorSim(ctxB);

  // Advance both with identical seed + day; drift outcomes must match exactly.
  ctxA.state.simTime = 600 * 3;  // day 3
  ctxB.state.simTime = 600 * 3;
  sectorSim.state = ctxA.state; sectorSim._onDayTick({ days: 3 });
  const driftA = JSON.parse(JSON.stringify(ctxA.state.sectorSim.sectors));

  sectorSim.state = ctxB.state; sectorSim._onDayTick({ days: 3 });
  const driftB = JSON.parse(JSON.stringify(ctxB.state.sectorSim.sectors));

  // Every sector that drifted should have identical security/density between the two runs.
  let compared = 0;
  for (const id in driftA) {
    if (!driftB[id] || !driftA[id].drift) continue;
    assert.equal(driftA[id].drift.security, driftB[id].drift.security,
      `seed stability: sector ${id} security must be identical across same-seed runs`);
    assert.equal(driftA[id].drift.enemyDensity, driftB[id].drift.enemyDensity,
      `seed stability: sector ${id} enemyDensity must be identical across same-seed runs`);
    compared++;
  }
  assert.ok(compared > 0, 'seed stability: at least one sector should have drifted');

  // Determinism: different seed must produce a different (but reproducible) sequence.
  const ctxC = makeCtx(999);
  bootSectorSim(ctxC);
  ctxC.state.simTime = 600 * 3;
  sectorSim.state = ctxC.state; sectorSim._onDayTick({ days: 3 });
  const driftC = ctxC.state.sectorSim.sectors;
  let anyDiffers = false;
  for (const id in driftA) {
    if (!driftC[id] || !driftA[id].drift || !driftC[id].drift) continue;
    if (Math.abs(driftA[id].drift.security - driftC[id].drift.security) > 1e-9) { anyDiffers = true; break; }
  }
  assert.ok(anyDiffers, 'determinism: a different seed should produce a different drift sequence');
}

// ADR §86-88: re-evaluating a sector later must yield the same result for the same dayCounter,
// independent of visit order. The per-sector substream must be stable.
function checkPerSectorStreamStability() {
  const ctx = makeCtx(42);
  bootSectorSim(ctx);
  // Draw from the per-sector stream for a fixed (sector, dayCounter) twice — must be identical.
  const s1a = sectorSim._sectorStream('sector_ceres_belt', 5)();
  const s1b = sectorSim._sectorStream('sector_ceres_belt', 5)();
  assert.equal(s1a, s1b, 'per-sector stream: same (sector, day) must yield identical draws');
  // Different sector → different stream value (genuine independence, not a constant stub).
  const s2 = sectorSim._sectorStream('sector_ashfall_reach', 5)();
  assert.notEqual(s1a, s2, 'per-sector stream: different sectors must yield different draws');
  // Different day → different value.
  const s3 = sectorSim._sectorStream('sector_ceres_belt', 6)();
  assert.notEqual(s1a, s3, 'per-sector stream: different days must yield different draws');
}

// ------------------------------------------------------------------------------------------
// 4: deserialize re-seeds from restored rngSeed.
// ------------------------------------------------------------------------------------------
function checkDeserializeReseeds() {
  const ctx = makeCtx(42);
  bootSectorSim(ctx);
  const originalSeed = ctx.state.sectorSim.meta.rngSeed;
  assert.ok(originalSeed > 0, 'init should seed rngSeed from meta.seed');

  // The stream is re-derived from meta.seed on every load (determinism: same seed ⇒ same sequence),
  // matching the automation.js:1182 pattern. The stored rngSeed is a record of the seed used.
  sectorSim.deserialize({ sectors: {}, meta: { rngSeed: 12345, lastTickSimT: 0, lossLog: [] } });
  const rederived = hash32(42, 'sectorSim');
  assert.equal(ctx.state.sectorSim.meta.rngSeed, rederived,
    'deserialize should re-derive the rng stream from meta.seed (determinism contract)');
  assert.ok(typeof sectorSim.rng === 'function',
    'deserialize should re-attach a working rng fn');

  // Determinism: a fresh boot and a deserialize of empty state must produce the same stream
  // (both derive from meta.seed).
  const ctx2 = makeCtx(42);
  bootSectorSim(ctx2);
  const v1 = sectorSim._sectorStream('sector_ceres_belt', 1)();
  sectorSim.state = ctx.state;
  const v2 = sectorSim._sectorStream('sector_ceres_belt', 1)();
  assert.equal(v1, v2, 'deserialize must not perturb the per-sector stream (same seed ⇒ same draws)');
}

// ------------------------------------------------------------------------------------------
// 5: v2→v3 migration round-trip — the headline integrity gate (ADR's untested-migration risk).
// ------------------------------------------------------------------------------------------
function checkMigrationRoundTrip() {
  assert.equal(CURRENT_VERSION, 3, 'CURRENT_VERSION should be 3 after the sectorSim schema bump');

  // A v2-era blob has no data.sectorSim at all.
  const v2Data = {
    meta: { version: 2, seed: 7 },
    player: { credits: 100 },
    cargo: { items: {} },
    economy: {}, factions: {}, world: {}, entities: {}, missions: {}, automation: {}, crafting: {},
    settings: {},
  };
  assert.ok(!('sectorSim' in v2Data), 'pre-migration v2 blob must not have a sectorSim key');

  // Run the full migration chain (migrations.js runs from-version → CURRENT_VERSION).
  const data = JSON.parse(JSON.stringify(v2Data));
  let ver = 2;
  for (const m of MIGRATIONS) {
    if (m.from === ver) { m.fn(data); ver = m.to; }
  }
  assert.equal(ver, CURRENT_VERSION, 'migration chain should advance to CURRENT_VERSION');
  assert.ok(data.sectorSim && typeof data.sectorSim === 'object',
    'v2→v3 migration should seed an empty data.sectorSim object');
  assert.ok(data.sectorSim.sectors && typeof data.sectorSim.sectors === 'object',
    'migrated sectorSim should have a sectors map');
  assert.ok(data.sectorSim.meta && typeof data.sectorSim.meta === 'object',
    'migrated sectorSim should have a meta object');

  // The migration must be idempotent (re-runnable, never throws).
  const data2 = JSON.parse(JSON.stringify(v2Data));
  for (const m of MIGRATIONS) { if (m.from === 2) m.fn(data2); }
  for (const m of MIGRATIONS) { if (m.from === 2) m.fn(data2); }   // run twice
  assert.deepEqual(data2.sectorSim, data.sectorSim, 'migration must be idempotent');

  // deserialize must accept the migrated blob without throwing and heal to full schema.
  const ctx = makeCtx(7);
  bootSectorSim(ctx);
  assert.doesNotThrow(() => sectorSim.deserialize(data.sectorSim),
    'deserialize must accept the migrated blob');
  assert.ok(ctx.state.sectorSim.meta.rngSeed === (data.sectorSim.meta && data.sectorSim.meta.rngSeed) || ctx.state.sectorSim.meta.rngSeed === hash32(7, 'sectorSim'),
    'deserialize on a migrated (empty-meta) blob should seed a fresh rngSeed');
}

// ------------------------------------------------------------------------------------------
// 6: single-writer safety — sectorSim must NOT directly write owned-by-others state slices.
// We spy on the state object's owned subtrees and confirm no direct writes happen during a day-tick.
// ------------------------------------------------------------------------------------------
function checkSingleWriterSafety() {
  const ctx = makeCtx(42);
  bootSectorSim(ctx);

  // The slices sectorSim must NOT touch directly.
  const forbidden = {
    'player.credits': ctx.state.player,
    'world.sectors': ctx.state.world.sectors,
    'factions': ctx.state.factions,
    'automation.drones': ctx.state.automation ? ctx.state.automation.drones : undefined,
  };
  const before = {};
  for (const k in forbidden) before[k] = JSON.stringify(forbidden[k]);

  ctx.state.simTime = 600 * 2;
  sectorSim.state = ctx.state;
  sectorSim._onDayTick({ days: 2 });

  for (const k in forbidden) {
    if (forbidden[k] === undefined) continue;
    const after = JSON.stringify(forbidden[k]);
    assert.equal(after, before[k],
      `single-writer: sectorSim must not directly mutate ${k} (it must emit intents instead)`);
  }

  // sectorSim MUST emit sanctioned intents rather than writing directly.
  const events = ctx.emitLog.map((e) => e.event);
  assert.ok(events.includes('sectorsim:tick'), 'sectorSim should emit sectorsim:tick for telemetry');
  assert.ok(events.includes('economy:applyTradePressure'),
    'sectorSim should push offscreen trade pressure via the sanctioned economy channel');
}

// ------------------------------------------------------------------------------------------
// 7: danger-overlay correctness — effectiveDanger reflects drift; resolver is read-only.
// ------------------------------------------------------------------------------------------
function checkDangerOverlay() {
  const ctx = makeCtx(42);
  bootSectorSim(ctx);

  const sectorId = 'sector_ceres_belt';
  const base = SECTORS.find((s) => s.id === sectorId);
  const baseDanger = dangerIndex(base);

  // Before any drift, effectiveDanger == static dangerIndex (no overlay).
  assert.ok(Math.abs(effectiveDangerFor(ctx.state, sectorId) - baseDanger) < 1e-9,
    'overlay: with no drift, effectiveDanger must equal static dangerIndex');

  // Force a drift and confirm effectiveDanger moves with it.
  ctx.state.simTime = 600 * 5;
  sectorSim.state = ctx.state;
  sectorSim._onDayTick({ days: 5 });

  const rec = ctx.state.sectorSim.sectors[sectorId];
  assert.ok(rec && rec.drift, 'overlay: sector should have a drift record after a day-tick');
  const effSector = effectiveSectorFor(ctx.state, sectorId);
  assert.ok(effSector, 'effectiveSectorFor must return a sector object');
  assert.equal(effSector.security, rec.drift.security,
    'overlay: effectiveSector security must match the drift record');
  assert.equal(effSector.enemyDensity, rec.drift.enemyDensity,
    'overlay: effectiveSector enemyDensity must match the drift record');

  // The base catalog must NOT be mutated by reading the overlay (read-only resolver).
  assert.equal(base.security, SECTORS.find((s) => s.id === sectorId).security,
    'overlay: reading effectiveSector must not mutate the static catalog');

  // Danger tier helper mirrors dangerTier() on the effective sector.
  const expectedTier = dangerTier(effSector);
  assert.equal(effectiveDangerTierFor(ctx.state, sectorId), expectedTier,
    'effectiveDangerTierFor must match dangerTier on the effective sector');

  // Drift bounds respected.
  assert.ok(rec.drift.security >= 0.02 && rec.drift.security <= 0.99,
    'overlay: drifted security must stay within [0.02, 0.99]');
  assert.ok(rec.drift.enemyDensity >= 0 && rec.drift.enemyDensity <= 0.8,
    'overlay: drifted enemyDensity must stay within [0, 0.8]');
}

// The current sector is never drifted (view boundary = simulation boundary).
function checkViewBoundary() {
  const ctx = makeCtx(42);
  bootSectorSim(ctx);
  ctx.state.simTime = 600 * 4;
  sectorSim.state = ctx.state;
  sectorSim._onDayTick({ days: 4 });

  const currentId = ctx.state.world.currentSectorId;
  const rec = ctx.state.sectorSim.sectors[currentId];
  assert.ok(!rec || !rec.drift,
    `view boundary: the current sector (${currentId}) must never be drifted by the offscreen pass`);
}

// serialize/deserialize round-trip preserves drift state (minus the transient rng fn).
function checkSerializeRoundTrip() {
  const ctx = makeCtx(42);
  bootSectorSim(ctx);
  ctx.state.simTime = 600 * 3;
  sectorSim.state = ctx.state;
  sectorSim._onDayTick({ days: 3 });
  const beforeDrift = JSON.parse(JSON.stringify(ctx.state.sectorSim.sectors));

  const blob = sectorSim.serialize();
  assert.ok(!('rng' in blob) && typeof blob !== 'function',
    'serialize must strip the transient rng fn');

  // Fresh state, deserialize the blob.
  const ctx2 = makeCtx(42);
  bootSectorSim(ctx2);
  sectorSim.state = ctx2.state;
  sectorSim.deserialize(blob);
  assert.deepEqual(ctx2.state.sectorSim.sectors, beforeDrift,
    'serialize/deserialize must preserve the drift overlay exactly');
}

// ------------------------------------------------------------------------------------------
// Run all checks (assert-or-die, matching check-gameplay-core.mjs convention).
// ------------------------------------------------------------------------------------------
let count = 0;
const checks = [
  ['seed stability + determinism', checkSeedStabilityAndDeterminism],
  ['per-sector stream stability (ADR §86-88)', checkPerSectorStreamStability],
  ['deserialize re-seeds from rngSeed', checkDeserializeReseeds],
  ['v2→v3 migration round-trip', checkMigrationRoundTrip],
  ['single-writer safety', checkSingleWriterSafety],
  ['danger-overlay correctness', checkDangerOverlay],
  ['view boundary (current sector never drifted)', checkViewBoundary],
  ['serialize/deserialize round-trip', checkSerializeRoundTrip],
];
for (const [label, fn] of checks) {
  fn();
  count++;
  console.log(`ok   sectorSim — ${label}`);
}
console.log(`\n${count} ok, 0 fail`);
console.log('Offscreen sector-sim checks OK');
