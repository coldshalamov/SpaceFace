// Packet A02 — contract tests for asteroidFormations persistence (discovered-knowledge owner).
//
// NEW CODE, NOT A CHARACTERIZATION: no formation persistence existed before this packet; the A01
// kernel was (deliberately) unwired. This suite pins the A02 contract:
//   • formation IDs and geology persist and reconstruct (save/load round-trip, byte-equal);
//   • saves never bloat with the ambient model (only DISCOVERED records serialize);
//   • discoveries never re-roll (durable records restore verbatim; live re-derivation with the
//     same field + seed yields the same ids; a changed field goes stale WITHOUT mutating
//     knowledge);
//   • a v11 save with no 'formations' key deserializes to defaults (additive key, no migration).
//
// Fixtures are fully self-contained synthetic bodies — no live sector/commodity/flavor catalogs
// (a concurrent content lane owns those files). Determinism per test/AGENTS.md: no wall clock,
// no Math.random, no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  asteroidFormations,
  makeDefaultFormations,
  formationSeedFor,
  formationBodyKey,
  quantizeAnchorCoord,
  compactFormationRecord,
  DISCOVERED_RECORD_FIELDS,
  FORMATIONS_SCHEMA_VERSION,
} from '../src/systems/asteroidFormations.js';

// Independent literal for §13b: hash32(47, 'sector_test_alpha', 0, 'formations').
const SEED_LITERAL_47_ALPHA_0 = 232166868;

// ── stub harness (no full sim boot; the system only needs state + bus) ─────────────────────────

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

/** Synthetic asteroid entity in the exact shape world.js spawns (id/type/pos/radius/mass/data). */
function rock(id, x, z, { radius = 8, mass = 500, typeId = 'rock_test_basalt', yieldU = 12 } = {}) {
  return { id, type: 'asteroid', alive: true, pos: { x, z }, radius, mass, data: { typeId, yieldU } };
}

/** A deterministic field: one tight 4-body cluster plus two far isolates. */
function testField() {
  return [
    rock('ast_a', 0, 0), rock('ast_b', 14, 3), rock('ast_c', -3, 15), rock('ast_d', 12, 16),
    rock('ast_e', 900, 0, { typeId: 'rock_test_ice', yieldU: 30 }),
    rock('ast_f', -900, 400, { mass: 2200, radius: 16 }),
  ];
}

function boot({ entities = testField(), sectorId = 'sector_test_alpha', epoch = 0, seed = 47 } = {}) {
  const state = {
    meta: { seed },
    simTime: 120.5,
    world: { currentSectorId: sectorId, residentSectors: { [sectorId]: { epoch } } },
    entityList: entities,
  };
  const bus = makeBus();
  const sys = Object.create(asteroidFormations);
  sys.init({ state, bus });
  return { sys, state, bus };
}

// ── §1 owner seeding ───────────────────────────────────────────────────────────────────────────

test('A02 §1: init seeds state.formations defaults exactly once and normalize is idempotent', () => {
  const { state, sys } = boot();
  assert.deepEqual(state.formations, {
    schemaVersion: 1, discovered: {}, order: [],
  });
  assert.equal(FORMATIONS_SCHEMA_VERSION, 1, 'schema version literal pinned independently');
  const before = JSON.stringify(state.formations);
  sys._normalize(state.formations);
  sys._normalize(state.formations);
  assert.equal(JSON.stringify(state.formations), before, 'normalize twice changes nothing');
});

// ── §2 discovery ───────────────────────────────────────────────────────────────────────────────

test('A02 §2: discover copies a compact durable record; double-discovery is a no-op', () => {
  const { sys, state, bus } = boot();
  const model = sys.currentModel();
  assert.ok(model.formations.length >= 1, 'fixture field must derive at least one formation');
  const id = model.formations[0].id;

  const rec = sys.discover(id);
  assert.ok(rec, 'discovery returns the record');
  assert.equal(state.formations.order.length, 1);
  assert.equal(bus.emitted.filter((e) => e.name === 'formation:discovered').length, 1);

  const snapshot = JSON.stringify(state.formations);
  const again = sys.discover(id);
  assert.equal(again, rec, 'second discovery returns the same durable record');
  assert.equal(JSON.stringify(state.formations), snapshot, 'no duplicate entry, no mutation');
  assert.equal(bus.emitted.filter((e) => e.name === 'formation:discovered').length, 1,
    'no second discovery event');

  assert.equal(sys.discover('af_not_a_real_id'), null, 'unknown id is not discoverable');
  assert.equal(state.formations.order.length, 1);
});

// ── §3 no-bloat serialization ──────────────────────────────────────────────────────────────────

test('A02 §3: serialize ships ONLY discovered knowledge — never the ambient model', () => {
  const { sys } = boot();
  const model = sys.currentModel();
  // Ambient model derived and cached, exactly one formation discovered.
  sys.discover(model.formations[0].id);

  const payload = sys.serialize();
  // The payload key set is a hard-coded contract, not whatever the state happens to hold.
  assert.deepEqual(Object.keys(payload).sort(), ['discovered', 'order', 'schemaVersion']);
  assert.equal(payload.order.length, 1, 'only the one discovered formation ships');
  assert.equal(Object.keys(payload.discovered).length, 1);
  const rec = payload.discovered[payload.order[0]];
  // A discovered record carries the strategic subset + observation binding, nothing else.
  assert.deepEqual(Object.keys(rec).sort(), [...DISCOVERED_RECORD_FIELDS, 'observed'].sort());
  // The ambient model held more formations than were discovered — they must NOT serialize.
  assert.ok(model.formations.length > 1, 'fixture sanity: ambient model has undiscovered formations');
});

// ── §4 round-trip equality ─────────────────────────────────────────────────────────────────────

test('A02 §4: serialize -> deserialize into a fresh boot restores discovered knowledge byte-for-byte', () => {
  const a = boot();
  const model = a.sys.currentModel();
  for (const f of model.formations) a.sys.discover(f.id);
  const payload = a.sys.serialize();

  const b = boot({ entities: [] }); // fresh state, EMPTY field — knowledge must not need the rock
  b.sys.deserialize(JSON.parse(JSON.stringify(payload)));
  assert.equal(JSON.stringify(b.state.formations.discovered), JSON.stringify(a.state.formations.discovered));
  assert.deepEqual(b.state.formations.order, a.state.formations.order);

  // Replay equality: serializing the restored state is byte-identical to the first payload.
  assert.equal(JSON.stringify(b.sys.serialize()), JSON.stringify(payload));
});

// ── §5 no-reroll ───────────────────────────────────────────────────────────────────────────────

test('A02 §5: same field + same seed derives the same formation ids; discovered knowledge survives field change verbatim', () => {
  const a = boot();
  const b = boot();
  assert.equal(
    JSON.stringify(a.sys.currentModel().formations.map((f) => f.id)),
    JSON.stringify(b.sys.currentModel().formations.map((f) => f.id)),
    'identical (field, seed, sector, epoch) must derive identical ids');

  // Discover, then destroy the field (mined out / epoch re-roll analog) and re-derive.
  const id = a.sys.currentModel().formations[0].id;
  const durable = JSON.stringify(a.sys.discover(id));
  a.state.entityList = [];
  a.sys._invalidate();
  assert.equal(a.sys.liveFormationFor(id), null, 'live re-link honestly reports stale');
  assert.equal(JSON.stringify(a.sys.discoveredRecord(id)), durable,
    'stale field must never mutate discovered knowledge');
});

test('A02 §5b: the derivation seed is a pure function of (metaSeed, sectorId, epoch)', () => {
  assert.equal(formationSeedFor(47, 'sector_test_alpha', 0), formationSeedFor(47, 'sector_test_alpha', 0));
  assert.notEqual(formationSeedFor(47, 'sector_test_alpha', 0), formationSeedFor(47, 'sector_test_alpha', 1),
    'a new epoch is a new labelling stream');
  assert.notEqual(formationSeedFor(47, 'sector_test_alpha', 0), formationSeedFor(48, 'sector_test_alpha', 0));
  assert.notEqual(formationSeedFor(47, 'sector_test_alpha', 0), formationSeedFor(47, 'sector_test_beta', 0));
});

// ── §6 v11 compatibility (additive key, no migration) ──────────────────────────────────────────

test('A02 §6: deserialize of a pre-A02 save (missing/null/garbage key) yields defaults, never throws', () => {
  for (const legacy of [undefined, null, 42, 'sites', [], { discovered: 'nope', order: 7 },
    { discovered: { af_x: null }, order: ['af_x'] }]) {
    const { sys, state } = boot({ entities: [] });
    sys.deserialize(legacy);
    assert.deepEqual(state.formations, { schemaVersion: 1, discovered: {}, order: [] },
      `legacy payload ${JSON.stringify(legacy)} must default cleanly`);
  }
});

// ── §7 idempotence and order discipline ────────────────────────────────────────────────────────

test('A02 §7: double deserialize is idempotent; duplicate ids in order never double-restore', () => {
  const { sys } = boot();
  const id = sys.currentModel().formations[0].id;
  sys.discover(id);
  const payload = sys.serialize();

  const b = boot({ entities: [] });
  b.sys.deserialize(payload);
  const once = JSON.stringify(b.state.formations);
  b.sys.deserialize(payload);
  assert.equal(JSON.stringify(b.state.formations), once, 'second deserialize identical');

  const evil = JSON.parse(JSON.stringify(payload));
  evil.order = [id, id, id];
  const c = boot({ entities: [] });
  c.sys.deserialize(evil);
  assert.deepEqual(c.state.formations.order, [id], 'duplicated order entries collapse to one');
});

test('A02 §7b: newGame resets knowledge', () => {
  const { sys, state } = boot();
  sys.discover(sys.currentModel().formations[0].id);
  sys.newGame();
  assert.deepEqual(state.formations, makeDefaultFormations());
});

// ── §8 purity/determinism statics ──────────────────────────────────────────────────────────────

test('A02 §8: the system source is clock-free, RNG-free, DOM-free and NUL-free', () => {
  const src = readFileSync(new URL('../src/systems/asteroidFormations.js', import.meta.url), 'utf8');
  for (const banned of ['Math.random', 'Date.now', 'performance.now', 'new Date(', 'setTimeout',
    "from 'three'", 'document.', 'window.']) {
    assert.ok(!src.includes(banned), `source must not contain ${banned}`);
  }
  assert.equal(src.split(String.fromCharCode(0)).length - 1, 0, 'no raw NUL bytes');
});

// ── §9 the asteroid-entry claim surface (FORMATION-layer contract only) ────────────────────────
//
// HONESTY BOUNDARY: the deep-state ladder's asteroid-entry claims speak about the asteroid
// INTERIOR — site identity, drill-cell survey visibility, unmined cell resources. That interior
// half is owned by the ALREADY-SHIPPED asteroidSites persistence (boreSeed + cleared + anchor
// recipe; see src/systems/asteroidSites.js serialize/deserialize) and is NOT re-proved here.
// What A02 adds to the claim surface is the FORMATION layer — the field-level identity and
// geology reads — and that is all this test claims. The ladder fixture CAPTURE itself (a real
// public-route save artifact) is G-lane work and stays 'planned' until then.

test('A02 §9: the formation-layer half of the asteroid-entry claims holds at contract level', () => {
  // Claim 1 — "site identity and geology seed restore": id + observed seed round-trip.
  const a = boot({ seed: 91, epoch: 2 });
  const id = a.sys.currentModel().formations[0].id;
  const rec = a.sys.discover(id);
  assert.equal(rec.observed.seed, formationSeedFor(91, 'sector_test_alpha', 2));

  const b = boot({ entities: [], seed: 91 });
  b.sys.deserialize(a.sys.serialize());
  const restored = b.sys.discoveredRecord(id);
  assert.equal(restored.id, id, 'identity restores');
  assert.equal(restored.observed.seed, rec.observed.seed, 'geology labelling seed restores');

  // Claim 2 — "survey visibility restores": the discovered set is exactly what was known.
  assert.deepEqual(b.state.formations.order, a.state.formations.order);

  // Claim 3 — "unmined resources remain deterministic": the geology/yield reads restore exactly.
  for (const key of ['yieldTotal', 'richness', 'gasRisk', 'thermalRisk', 'sensorSignature', 'dominantTypeId']) {
    assert.deepEqual(restored[key], rec[key], `${key} restores byte-equal`);
  }
});

// ── §10 compactFormationRecord discipline ──────────────────────────────────────────────────────

test('A02 §10: compactFormationRecord keeps exactly the strategic field list and is fail-closed', () => {
  const { sys } = boot();
  const f = sys.currentModel().formations[0];
  const compact = compactFormationRecord(f);
  assert.deepEqual(Object.keys(compact), [...DISCOVERED_RECORD_FIELDS]);
  assert.equal(compactFormationRecord(null), null);
  assert.equal(compactFormationRecord('x'), null);
  // The compact copy is detached: mutating it never reaches the (frozen) kernel record.
  compact.yieldTotal = -1;
  assert.notEqual(f.yieldTotal, -1);
});

// ── §11-§12 wiring pins (applied by the lead in the A02 wiring slice) ──────────────────────────

test('A02 §11: the save owner carries the formations key end-to-end', () => {
  const src = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.ok(src.includes("['formations', () => this._callSerialize('asteroidFormations')"),
    'capture plan entry present');
  assert.ok(src.includes("data.formations = this._callSerialize('asteroidFormations')"),
    'serializeData entry present');
  assert.ok(src.includes("this._callDeserialize('asteroidFormations', data.formations)"),
    'restore entry present');
});

test('A02 §12: the registry runs asteroidFormations immediately after asteroidSites', () => {
  const src = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.ok(/asteroidSites, asteroidFormations, wingmen, intervention/.test(src),
    'SYSTEMS places the knowledge owner beside the site owner');
  assert.ok(/asteroidSites, asteroidFormations, wingmen, crafting/.test(src),
    'UPDATE_ORDER places it beside the site owner');
});

// ── §13 stable physical identity (the 4891099a..edca7c7e review's central finding) ─────────────

test('A02 §13: entity-id re-rolls do NOT re-label formations — identity is physical, and restored discoveries re-link', () => {
  // The same physical field under two completely different sets of entity ids (a reload
  // rematerializes durable records under fresh ids; a repaired anchor rock gets a new id).
  const a = boot();
  const rerolled = testField().map((e, i) => ({ ...e, id: `zz_${i}_${e.id}` }));
  const b = boot({ entities: rerolled });
  const idsA = a.sys.currentModel().formations.map((f) => f.id);
  const idsB = b.sys.currentModel().formations.map((f) => f.id);
  assert.deepEqual(idsB, idsA, 'formation ids must survive an entity-id re-roll');

  // A discovery made before the re-roll re-links to the live field after it.
  const target = idsA[0];
  a.sys.discover(target);
  const c = boot({ entities: rerolled });
  c.sys.deserialize(a.sys.serialize());
  assert.ok(c.sys.liveFormationFor(target),
    'restored discovery must re-link to the same physical rock under new entity ids');
});

test('A02 §13b: the derivation seed value is pinned as an independent literal', () => {
  // Hard-coded from hash32(47, 'sector_test_alpha', 0, 'formations'). Changing the salt, the
  // argument order, or the hash recipe re-labels every formation in every save — that must be a
  // conscious versioned decision, so this literal has to red first.
  assert.equal(formationSeedFor(47, 'sector_test_alpha', 0), SEED_LITERAL_47_ALPHA_0);
});

test('A02 §13c: mining out members changes the live model honestly without touching knowledge', () => {
  const a = boot();
  const model = a.sys.currentModel();
  // Find a multi-member formation; remove one NON-anchor member from the live field.
  const multi = model.formations.find((f) => f.count > 1);
  assert.ok(multi, 'fixture sanity: a multi-member formation exists');
  const victimKey = multi.memberIds.find((k) => k !== multi.anchorAsteroidId);
  const durable = JSON.stringify(a.sys.discover(multi.id));

  // Rebuild the field without the body whose formationBodyKey matches the victim member.
  const remaining = testField().filter((e) => formationBodyKey(e) !== victimKey);
  assert.equal(remaining.length, testField().length - 1, 'exactly one body removed');
  const b = boot({ entities: remaining });
  const after = b.sys.currentModel();
  const same = after.formations.find((f) => f.id === multi.id);
  if (same) {
    assert.ok(same.count < multi.count, 'surviving formation must report the smaller live count');
  }
  // Either way the durable discovered record is untouched by the loss.
  assert.equal(JSON.stringify(a.sys.discoveredRecord(multi.id)), durable,
    'mined-out members never mutate discovered knowledge');
});

// ── §14 anchor-cycle quantization (round-3: the tenth-grid straddle) ───────────────────────────

test('A02 §14: body keys are stable under the anchor recipe map and pinned at the boundaries', () => {
  const key = formationBodyKey;
  const q = quantizeAnchorCoord;
  const anchorMap = (v) => Math.round(v * 10) / 10; // asteroidSites._anchorSite's exact recipe
  // Idempotence under the anchor cycle at hard-coded boundaries, both signs.
  for (const x of [0.44, 0.449, 0.45, 0.49, 0.5, 0.51, 1.44, 1.45, -0.44, -0.45, -0.49, -0.5, -0.55, -1.45]) {
    assert.equal(q(x), q(anchorMap(x)), `quantize(${x}) must equal quantize(anchorMap(${x}))`);
  }
  // Exact integer keys pinned as literals (kills a round->floor mutant: floor(0.5-tenths)=0).
  assert.equal(q(0.49), 1, '0.49 anchors to 0.5 which keys to 1');
  assert.equal(q(0.5), 1);
  assert.equal(q(0.44), 0, '0.44 anchors to 0.4 which keys to 0');
  assert.equal(q(1.4), 1);
  assert.equal(q(-0.44), 0);
  assert.equal(q(-0.5), 0, 'negative half rounds toward zero under Math.round and normalises -0');
  const body = (x) => ({ id: 'e', type: 'asteroid', pos: { x, z: 0 }, radius: 8, data: { typeId: 't' } });
  assert.equal(key(body(0.49)), key(body(0.5)), 'the pre-anchor and post-anchor rock share one key');
});
