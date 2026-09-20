// Impacts lane — the contact layer.
//
// What these tests are actually defending:
//   1. a bullet strike, a heavy slam, a rock fracture and a capital breakup are STRUCTURALLY
//      different events, not one explosion at four sizes;
//   2. an unsigned collision axis never becomes a fabricated signed force (standard rule E2);
//   3. the beats of one event arrive in sequence rather than all on the contact frame;
//   4. a massacre of small deaths cannot truncate a capital breakup;
//   5. the gas and debris layers are composed by this lane and never trigger themselves;
//   6. all of that stays inside fixed pools with a measured occupancy.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  ArcadeStructuralFx,
  ARCADE_STRUCTURAL_FX_CAPACITY,
} from '../src/render/combat/arcadeStructuralFx.js';
import {
  IMPACT_EVENT_CLASSES,
  createImpactRecord,
  createImpactRecordPool,
  classifyImpactEvent,
  impactApproachSpeed,
  impactOutwardNormal,
  impactTangentFraction,
  makeImpactRecord,
  writeImpactRecord,
} from '../src/render/combat/impactEventRecord.js';
import {
  IMPACT_EVENT_GRAMMAR,
  IMPACT_MATERIAL_GRAMMAR,
  impactClassDistinctions,
  normalizeImpactMaterial,
  resolveImpactPresentation,
} from '../src/presentation/causalVfxGrammar.js';
import { PhasedExplosionLifecycle } from '../src/render/combat/phasedExplosions.js';
import { CONTACT_MARK_KINDS, HullScorchPool, markKindForMaterial } from '../src/render/weapons/contactMarks.js';
import { createStructuredBurstGeometry } from '../src/render/combat/structuredBurstGeometry.js';

void THREE;

const VIEW = Object.freeze({ x: 0, y: 0.4, z: 0, priority: 0.8 });

function record(overrides) {
  return makeImpactRecord(createImpactRecord(), {
    x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1, axisSigned: true,
    severity: 0.3, materialId: 'hull', radiusWU: 6, simTime: 12, serial: 4,
    ...overrides,
  });
}

function emit(fx, rec, view = VIEW) {
  const before = fx.stats();
  const spawned = fx.emitImpact(rec, view);
  const after = fx.stats();
  return {
    spawned,
    blades: after.blades.spawned - before.blades.spawned,
    arcs: after.arcs.spawned - before.arcs.spawned,
    shards: after.shards.spawned - before.shards.spawned,
    plates: after.plates.spawned - before.plates.spawned,
  };
}

function liveMatrices(fx) {
  const out = [];
  for (const mesh of fx.getMeshes()) out.push(Array.from(mesh.instanceMatrix.array));
  return out;
}

// --------------------------------------------------------------------------------------------
// 1. Structurally different events, not scaled copies
// --------------------------------------------------------------------------------------------

test('a bullet, a slam, a rock fracture and a capital breakup are different events, not one event at four sizes', () => {
  const fx = new ArcadeStructuralFx(null);
  const mixes = {
    bullet: emit(fx, record({ severity: 0.07, materialId: 'hull', radiusWU: 0.8, vx: 0, vz: -150, serial: 3 })),
    slam: emit(fx, record({ severity: 0.34, materialId: 'hull', radiusWU: 9, axisSigned: false, vx: -14, vz: -18, serial: 5 })),
    fracture: emit(fx, record({ severity: 0.42, materialId: 'asteroid', radiusWU: 7, serial: 7 })),
    breakup: emit(fx, record({ severity: 0.95, materialId: 'hull', radiusWU: 36, vx: 12, vz: 3, serial: 11 })),
  };

  for (const [name, mix] of Object.entries(mixes)) {
    assert.ok(mix.spawned > 0, `${name} must draw something`);
  }

  // A scaled copy would keep the same primitive proportions. Require every pair to differ in
  // SHAPE, not just in total: no pair may be a positive scalar multiple of another.
  const names = Object.keys(mixes);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = mixes[names[i]];
      const b = mixes[names[j]];
      const ratios = ['blades', 'arcs', 'shards', 'plates']
        .filter((k) => a[k] > 0 || b[k] > 0)
        .map((k) => (b[k] === 0 ? (a[k] === 0 ? null : Infinity) : a[k] / b[k]))
        .filter((r) => r !== null);
      const distinct = new Set(ratios.map((r) => (Number.isFinite(r) ? r.toFixed(4) : 'inf')));
      assert.ok(distinct.size > 1,
        `${names[i]} and ${names[j]} are the same shape at different scale: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }
  }

  // Only the bullet leaves no structural plate behind; only the breakup leaves many.
  assert.equal(mixes.bullet.plates, 0, 'a pinprick does not tear panels off a hull');
  assert.ok(mixes.breakup.plates >= 6, `a capital breakup separates structure, got ${mixes.breakup.plates} plates`);
  assert.ok(mixes.breakup.plates > mixes.slam.plates && mixes.slam.plates > 0);
  fx.dispose();
});

test('every pair of impact classes differs by order, layout or primitive mix before any colour', () => {
  assert.equal(IMPACT_EVENT_CLASSES.length, 8);
  let pairs = 0;
  for (let i = 0; i < IMPACT_EVENT_CLASSES.length; i++) {
    for (let j = i + 1; j < IMPACT_EVENT_CLASSES.length; j++) {
      const a = IMPACT_EVENT_CLASSES[i];
      const b = IMPACT_EVENT_CLASSES[j];
      const diffs = impactClassDistinctions(a, b);
      assert.ok(diffs.length > 0, `${a} vs ${b} must differ by more than hue`);
      pairs++;
    }
  }
  assert.equal(pairs, 28);
  // Only the two events that open a pressurized body expose a hot interior.
  const exposing = IMPACT_EVENT_CLASSES.filter((id) => IMPACT_EVENT_GRAMMAR[id].exposesInterior);
  assert.deepEqual(exposing.sort(), ['breach', 'breakup', 'detonation']);
});

test('large destruction opens its structure before anything else, and structure outlives the light', () => {
  const sheet = IMPACT_EVENT_GRAMMAR.breakup;
  assert.equal(sheet.beats[0].role, 'separation', 'a breakup parts its plates FIRST, not after a bloom');
  assert.equal(sheet.beats[0].at, 0);
  assert.equal(sheet.beats[0].primitive, 'plate');
  assert.ok(sheet.beats.some((b) => b.role === 'internal' && b.at > 0),
    'the hot interior shows between the parted plates, not instead of them');

  const fx = new ArcadeStructuralFx(null);
  fx.emitImpact(record({ severity: 0.95, materialId: 'hull', radiusWU: 30, serial: 2 }), VIEW);
  const timeline = [];
  for (let frame = 0; frame < 80; frame++) {
    fx.update(1 / 30, null, 900);
    timeline.push({ t: (frame + 1) / 30, ...fx.inspect().live });
  }
  const lastBlade = timeline.filter((row) => row.blades > 0).pop();
  const lastPlate = timeline.filter((row) => row.plates > 0).pop();
  assert.ok(lastPlate.t > lastBlade.t,
    `structure must outlive the flash: plates to ${lastPlate.t.toFixed(2)}s vs blades ${lastBlade.t.toFixed(2)}s`);
  fx.dispose();
});

// --------------------------------------------------------------------------------------------
// 2. E2 — an unsigned collision axis is never a signed force
// --------------------------------------------------------------------------------------------

test('an unsigned collision axis cannot yield a signed outward direction', () => {
  const unsigned = record({ axisSigned: false, nx: 0.6, nz: 0.8 });
  assert.equal(unsigned.axisSigned, false);
  assert.equal(impactOutwardNormal(unsigned, { x: 0, y: 0, z: 0 }), null,
    'the only legal signed read must refuse an unsigned axis');

  const signed = record({ axisSigned: true, nx: 0.6, nz: 0.8 });
  const out = impactOutwardNormal(signed, { x: 0, y: 0, z: 0 });
  assert.ok(out && Math.abs(out.x - 0.6) < 1e-9 && Math.abs(out.z - 0.8) < 1e-9);

  // No normal at all is a third state, not "outward is +X".
  const none = record({ nx: 0, ny: 0, nz: 0, axisSigned: true });
  assert.equal(none.hasNormal, false);
  assert.equal(impactOutwardNormal(none, {}), null);
});

test('flipping an unsigned axis draws the identical event; flipping a signed normal does not', () => {
  const build = (nx, nz, axisSigned) => {
    const fx = new ArcadeStructuralFx(null);
    fx.emitImpact(record({ nx, ny: 0, nz, axisSigned, severity: 0.34, radiusWU: 9, vx: 0, vz: 0, serial: 21 }), VIEW);
    for (let frame = 0; frame < 12; frame++) fx.update(1 / 60, null, 900);
    const matrices = liveMatrices(fx);
    fx.dispose();
    return matrices;
  };

  // THE E2 ASSERTION. Swapping which collider the solver listed first flips the reported normal.
  // The drawn event must be bit-identical, because the sign carried no information.
  assert.deepEqual(build(0.6, 0.8, false), build(-0.6, -0.8, false),
    'an unsigned axis must draw the same event under a normal flip');

  // And the opposite must hold, or "signed" would be a lie: a real outward normal is honoured.
  assert.notDeepEqual(build(0.6, 0.8, true), build(-0.6, -0.8, true),
    'a genuinely signed normal must actually aim the event');
});

test('a one-sided beat is dropped rather than re-aimed when the axis is unsigned', () => {
  const signed = resolveImpactPresentation({ eventClass: 'breach', materialId: 'hull', axisSigned: true, severity: 0.4 });
  const unsigned = resolveImpactPresentation({ eventClass: 'breach', materialId: 'hull', axisSigned: false, severity: 0.4 });
  assert.ok(signed.beats.some((b) => b.layout === 'reflected-cone'));
  assert.ok(signed.beats.some((b) => b.layout === 'internal-vent'));
  for (const beat of unsigned.beats) {
    assert.notEqual(beat.layout, 'reflected-cone', 'a reflected cone needs a real outward side');
    assert.notEqual(beat.layout, 'internal-vent', 'a vent needs a real outward side');
    assert.equal(beat.signedOnly, false);
  }
  // Dropping beats must not silently delete the contact. What survives is symmetric, and the
  // separation the hull still suffers is kept — it just parts both ways instead of one way.
  assert.ok(unsigned.beats.some((b) => b.role === 'separation' && b.layout === 'mirrored-lip'));

  // When E2 does remove every structural beat, an axis-symmetric lip is substituted so the contact
  // still reads. That substitution is legal precisely because it is invariant under a flip.
  const stripped = resolveImpactPresentation({ eventClass: 'pinprick', materialId: 'hull', axisSigned: false, severity: 0.08 });
  assert.ok(stripped.beats.some((b) => b.role === 'compression' && b.layout === 'mirrored-lip'));

  // The rule belongs to the LAYOUT, not to a per-beat flag that a later edit can forget. A sheet
  // that uses a one-sided layout without the flag must still be made symmetric.
  const detonation = resolveImpactPresentation({ eventClass: 'detonation', materialId: 'hull', axisSigned: false, severity: 0.65 });
  assert.ok(detonation.beats.length > 0);
  for (const beat of detonation.beats) {
    assert.ok(!['reflected-cone', 'internal-vent'].includes(beat.layout),
      `detonation beat ${beat.role} kept a one-sided layout on an unsigned axis`);
  }
});

test('the classifier reads the physics of a contact, not its size alone', () => {
  const pool = createImpactRecordPool(4);
  const fast = makeImpactRecord(pool.acquire(), {
    nx: 1, nz: 0, axisSigned: true, severity: 0.08, materialId: 'hull', vx: -130,
  });
  assert.equal(fast.eventClass, 'pinprick');
  const glancing = makeImpactRecord(pool.acquire(), {
    nx: 1, nz: 0, axisSigned: true, severity: 0.08, materialId: 'hull', vx: -6, vz: 120,
  });
  assert.equal(glancing.eventClass, 'graze', 'the same severity glancing off is a different event');
  // An unsigned axis is two bodies meeting: that is a compression event at any size.
  assert.equal(classifyImpactEvent(record({ axisSigned: false, severity: 0.3 })), 'slam');
  // Brittle material never "explodes": it cuts or fractures.
  assert.equal(classifyImpactEvent(record({ materialId: 'rock', severity: 0.1 })), 'cut');
  assert.equal(classifyImpactEvent(record({ materialId: 'ice', severity: 0.5 })), 'fracture');
  assert.equal(classifyImpactEvent(record({ materialId: 'rock', severity: 0.6, vx: 200 })), 'fracture');
  // Unknown relative motion is unknown, never "at rest" and never a glance.
  const still = record({ vx: 0, vy: 0, vz: 0 });
  assert.equal(still.hasVelocity, false);
  assert.equal(impactApproachSpeed(still), 0);
  assert.equal(impactTangentFraction(still), 0);
});

// --------------------------------------------------------------------------------------------
// 3. Staged energy release
// --------------------------------------------------------------------------------------------

test('the beats of one event arrive in sequence instead of on the contact frame', () => {
  const fx = new ArcadeStructuralFx(null);
  fx.emitImpact(record({ materialId: 'rock', severity: 0.45, radiusWU: 8, serial: 31 }), VIEW);
  // Every element of the fracture is reserved at spawn, but only the first cleavage plane is
  // DRAWN on the contact frame; the rest are held at zero scale until their own beat.
  const drawn = [];
  for (let frame = 0; frame < 30; frame++) {
    fx.update(1 / 60, null, 900);
    let visible = 0;
    for (const mesh of fx.getMeshes()) {
      const m = mesh.instanceMatrix.array;
      for (let i = 0; i < m.length; i += 16) if (m[i + 13] > -1000) visible++;
    }
    drawn.push(visible);
  }
  assert.ok(drawn[0] > 0, 'the contact beat is immediate');
  assert.ok(drawn[drawn.length - 1] > drawn[0],
    `later beats must arrive after the contact: ${drawn[0]} -> ${drawn[drawn.length - 1]}`);
  fx.dispose();
});

test('a reserved later beat is not cannibalised to draw the next event', () => {
  const fx = new ArcadeStructuralFx(null);
  // Fill the plate pool with a long-delayed high-priority reservation, then hammer it with equal
  // priority arrivals. Progress is measured from each slot's own start, so pending beats are last.
  for (let i = 0; i < ARCADE_STRUCTURAL_FX_CAPACITY.plates; i++) {
    assert.equal(fx.spawnPlate({ x: i, z: 0, priority: 0.6, delay: 4, life: 2 }), true);
  }
  fx.update(0.5, null, 900);
  const pending = fx.inspect().pools.plates;
  assert.equal(pending.live, ARCADE_STRUCTURAL_FX_CAPACITY.plates);
  // Something strictly more important still gets in — the pool is never a lock-out.
  assert.equal(fx.spawnPlate({ x: 0, z: 0, priority: 0.95, life: 1 }), true);
  // Something less important is refused rather than stealing a beat that has not fired.
  assert.equal(fx.spawnPlate({ x: 0, z: 0, priority: 0.2, life: 1 }), false);
  fx.dispose();
});

// --------------------------------------------------------------------------------------------
// 4. Mining: a worked face, not a reward firework
// --------------------------------------------------------------------------------------------

test('a worked face cuts and fractures without igniting or celebrating', () => {
  const cut = resolveImpactPresentation({ eventClass: 'cut', materialId: 'rock', axisSigned: true, severity: 0.12 });
  assert.equal(cut.exposesInterior, false);
  assert.ok(cut.beats.every((b) => b.role !== 'internal'), 'cutting a rock does not open a furnace');
  assert.ok(cut.beats.some((b) => b.layout === 'worked-face'));
  assert.ok(cut.beats.some((b) => b.layout === 'cleavage-fan'));
  // Fracture progression: a second, slower, duller ejecta beat follows the first.
  const ejecta = cut.beats.filter((b) => b.role === 'ejecta');
  assert.equal(ejecta.length, 2);
  assert.ok(ejecta[1].at > ejecta[0].at);
  assert.ok(ejecta[1].speed < ejecta[0].speed, 'the face is being worked, not blasted');

  // Directed ejecta: chips leave the face on the tool side, never through the rock.
  const fx = new ArcadeStructuralFx(null);
  const rec = record({ materialId: 'rock', severity: 0.12, radiusWU: 4, nx: -1, nz: 0, serial: 9 });
  assert.equal(rec.eventClass, 'cut');
  fx.emitImpact(rec, VIEW);
  for (let frame = 0; frame < 8; frame++) fx.update(1 / 60, null, 900);
  const moving = fx.shards.slots.filter((s) => s.alive && s.age >= s.delay);
  assert.ok(moving.length > 0);
  assert.ok(moving.every((s) => s.vx <= 0),
    'mineral chips leave the work face toward the tool, not into the rock');
  fx.dispose();
});

test('an interior that is not hot is not drawn hot, and a shield throws no matter', () => {
  const hull = resolveImpactPresentation({ eventClass: 'breach', materialId: 'hull', axisSigned: true, severity: 0.4 });
  const rock = resolveImpactPresentation({ eventClass: 'breakup', materialId: 'rock', axisSigned: true, severity: 0.9 });
  const hullInternal = hull.beats.find((b) => b.role === 'internal');
  const rockInternal = rock.beats.find((b) => b.role === 'internal');
  assert.notEqual(hullInternal.colour, rockInternal.colour,
    'opening a rock must not reveal the same furnace as opening a pressurized hull');
  assert.equal(rockInternal.colour, IMPACT_MATERIAL_GRAMMAR.rock.warm);

  const shield = resolveImpactPresentation({ eventClass: 'breakup', materialId: 'shield', axisSigned: true, severity: 0.9 });
  assert.ok(shield.beats.length > 0, 'a shield contact still reads');
  assert.ok(shield.beats.every((b) => b.primitive !== 'shard' && b.primitive !== 'plate'),
    'a field has no matter to throw');
  // Ice cannot shed hull panels either.
  const ice = resolveImpactPresentation({ eventClass: 'breakup', materialId: 'ice', axisSigned: true, severity: 0.9 });
  assert.ok(ice.beats.every((b) => b.primitive !== 'plate'));
});

test('a contact mark takes the failure of the surface it hit, and the default is unchanged', () => {
  assert.equal(markKindForMaterial('hull'), CONTACT_MARK_KINDS.scorch);
  assert.equal(markKindForMaterial('armor'), CONTACT_MARK_KINDS.scorch);
  assert.equal(markKindForMaterial('rock'), CONTACT_MARK_KINDS.gouge);
  assert.equal(markKindForMaterial('ice'), CONTACT_MARK_KINDS.frost);
  assert.equal(markKindForMaterial('ceramic'), CONTACT_MARK_KINDS.craze);

  const pool = new HullScorchPool(null, { capacity: 2 });
  const plain = pool.spawn({ localX: 1, nx: 0, ny: 1, nz: 0, heat: 0.9 });
  assert.equal(pool.slots[plain].markKind, 0, 'existing callers keep the molten scorch exactly');
  assert.equal(pool.slots[plain].fracture, 0);
  const worked = pool.spawn({ localX: 2, nx: 0, ny: 1, nz: 0, markKind: CONTACT_MARK_KINDS.gouge, fracture: 0.8 });
  assert.equal(pool.slots[worked].markKind, 1);
  assert.equal(pool.slots[worked].fracture, 0.8);
  pool.update(0.016, null);
  assert.equal(pool.mark.getX(0), 0);
  assert.ok(pool.mark.getX(1) === 1 && Math.abs(pool.mark.getY(1) - 0.8) < 1e-6);
  assert.match(pool.material.fragmentShader, /scorchBlackbody/, 'the molten path survives');
  assert.match(pool.material.fragmentShader, /radialCracks/, 'brittle surfaces crack instead');
  pool.dispose();
});

// --------------------------------------------------------------------------------------------
// 5. Composition — this lane is the sole trigger
// --------------------------------------------------------------------------------------------

test('one contact composes one recipe: structure first, then gas, then debris, exactly once each', () => {
  const order = [];
  const fx = new ArcadeStructuralFx(null);
  fx.attachSupportingLayers({
    gas: { emitFromImpact: (rec) => order.push(`gas:${rec.eventClass}`) },
    debris: { emitFromImpact: (rec) => order.push(`debris:${rec.eventClass}`) },
  });
  const rec = record({ severity: 0.65, radiusWU: 10, serial: 44 });
  const spawned = fx.emitImpact(rec, VIEW);
  assert.ok(spawned > 0, 'the primary structure lands before anything supporting it');
  assert.deepEqual(order, [`gas:${rec.eventClass}`, `debris:${rec.eventClass}`]);
  fx.dispose();
});

test('supporting layers bind as resolvers, so build order cannot silently pin them to null', () => {
  // The renderer constructs these subsystems in an order no single lane controls. Binding the
  // VALUE at mount time would pin whatever existed then -- usually nothing -- and quietly drop
  // every gas pass for the rest of the session, with no error anywhere.
  const host = { gas: null };
  const seen = [];
  const fx = new ArcadeStructuralFx(null);
  fx.attachSupportingLayers({ gas: () => host.gas, debris: null });
  fx.emitImpact(record({ severity: 0.5, radiusWU: 8 }), VIEW);
  assert.equal(seen.length, 0, 'nothing to call yet');
  // The gas layer arrives after the mount, as it does in the real renderer.
  host.gas = { emitFromImpact: (rec) => seen.push(rec.eventClass) };
  fx.emitImpact(record({ severity: 0.5, radiusWU: 8 }), VIEW);
  assert.equal(seen.length, 1, 'a layer bound by resolver is picked up whenever it appears');
  fx.dispose();
});

test('the recipe still lands when the gas and debris layers never arrive', () => {
  const bare = new ArcadeStructuralFx(null);
  assert.ok(bare.emitImpact(record({ severity: 0.5, radiusWU: 8 }), VIEW) > 0);
  bare.dispose();

  // A half-built layer (present, but without the entry point) must not throw either.
  const partial = new ArcadeStructuralFx(null);
  partial.attachSupportingLayers({ gas: {}, debris: null });
  assert.ok(partial.emitImpact(record({ severity: 0.5, radiusWU: 8 }), VIEW) > 0);
  partial.dispose();
});

test('the record is handed to the supporting layers in world space and unmodified', () => {
  const seen = [];
  const fx = new ArcadeStructuralFx(null);
  fx.attachSupportingLayers({ gas: { emitFromImpact: (rec) => seen.push({ ...rec }) } });
  const rec = record({ x: 1200, y: 3, z: -800, severity: 0.5, radiusWU: 8 });
  const snapshot = { ...rec };
  // The renderer's local frame is far from world after a floating-origin shift.
  fx.emitImpact(rec, { x: 12, y: 3, z: -8, priority: 0.7 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].x, 1200);
  assert.equal(seen[0].z, -800);
  assert.deepEqual({ ...rec }, snapshot, 'composing an impact must not mutate the shared record');
  fx.dispose();
});

// --------------------------------------------------------------------------------------------
// 6. Bounds, determinism and measured cost
// --------------------------------------------------------------------------------------------

test('a massacre of small deaths cannot truncate the capital breakup behind it', () => {
  const lifecycle = new PhasedExplosionLifecycle({ capacity: 6 });
  lifecycle.start({ classId: 'capital', radius: 40, priority: 0.5 });
  for (let i = 0; i < 5; i++) lifecycle.start({ classId: 'small', radius: 3, priority: 0.5 });
  lifecycle.update(0.2, () => {});
  for (let i = 0; i < 60; i++) lifecycle.start({ classId: 'small', radius: 3, priority: 0.5 });
  const stats = lifecycle.stats();
  assert.equal(stats.activeCapitals, 1, 'the biggest event in the scene survives the crowd');
  assert.equal(stats.active, 6);
  assert.equal(lifecycle.entries.length, 6, 'the pool never grows to cope');
  // A small arrival is refused rather than interrupting something more important.
  assert.ok(stats.truncated > 0 || stats.evicted > 0);
});

test('repeated hits on one surface and dense mixed combat stay inside the fixed pools', () => {
  const fx = new ArcadeStructuralFx(null);
  const pool = createImpactRecordPool(8);
  const materials = ['hull', 'armor', 'rock', 'ice', 'ceramic', 'composite'];
  let spawned = 0;
  // 40 repeated strikes on the same spot, then 120 mixed-material events all over the field.
  for (let i = 0; i < 40; i++) {
    spawned += fx.emitImpact(writeImpactRecord(
      pool.acquire(), 0, 0, 0, 0, 0, 1, true, 0.1, 'hull', 1.2, i * 0.05, 0, 0, -120, i, null, undefined,
    ), VIEW);
    fx.update(1 / 60, null, 900);
  }
  for (let i = 0; i < 120; i++) {
    spawned += fx.emitImpact(record({
      x: i * 7, z: -i * 3, severity: (i % 10) / 10, materialId: materials[i % materials.length],
      radiusWU: 2 + (i % 9) * 4, axisSigned: (i % 3) !== 0, serial: 1000 + i,
    }), { x: i * 7, y: 0.4, z: -i * 3, priority: 0.4 + (i % 5) * 0.1 });
    fx.update(1 / 60, null, 900);
  }
  const info = fx.inspect();
  for (const kind of ['blades', 'arcs', 'shards', 'plates']) {
    assert.ok(info.pools[kind].highWater <= ARCADE_STRUCTURAL_FX_CAPACITY[kind],
      `${kind} high-water ${info.pools[kind].highWater} exceeded capacity`);
    assert.equal(info.pools[kind].capacity, ARCADE_STRUCTURAL_FX_CAPACITY[kind]);
  }
  for (const mesh of fx.getMeshes()) {
    assert.equal(mesh.instanceMatrix.array.length, mesh.count * 16);
    assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));
  }
  assert.ok(spawned > 200, `dense combat must actually draw, got ${spawned}`);

  // Measured occupancy, reported so the cost note is a number and not a claim.
  const occupancy = ['blades', 'arcs', 'shards', 'plates']
    .map((k) => `${k} ${info.pools[k].highWater}/${info.pools[k].capacity}`).join('  ');
  console.log(`[impact cost] 160 events, ${spawned} primitives | peak occupancy: ${occupancy}`);
  fx.dispose();
});

test('the same contact draws the same event every replay, without consuming simulation randomness', () => {
  const build = () => {
    const fx = new ArcadeStructuralFx(null);
    for (const severity of [0.07, 0.34, 0.5, 0.95]) {
      fx.emitImpact(record({ severity, radiusWU: 4 + severity * 30, serial: Math.round(severity * 100) }), VIEW);
    }
    for (let frame = 0; frame < 20; frame++) fx.update(1 / 60, null, 900);
    const out = liveMatrices(fx);
    fx.dispose();
    return out;
  };
  assert.deepEqual(build(), build());
});

test('malformed receipts cannot poison the record or the pools', () => {
  const rec = makeImpactRecord(createImpactRecord(), {
    x: Infinity, y: NaN, z: 'nope',
    nx: NaN, ny: Infinity, nz: undefined,
    severity: 12, materialId: 42, radiusWU: -5, simTime: NaN,
    vx: NaN, vz: Infinity, serial: 1.7,
  });
  assert.ok(Number.isFinite(rec.x) && Number.isFinite(rec.y) && Number.isFinite(rec.z));
  assert.ok(Number.isFinite(rec.nx) && Number.isFinite(rec.ny) && Number.isFinite(rec.nz));
  assert.equal(rec.severity, 1);
  assert.equal(rec.materialId, 'unknown');
  assert.ok(rec.radiusWU > 0);
  assert.equal(rec.hasVelocity, false);
  assert.equal(normalizeImpactMaterial(null), 'unknown');

  const fx = new ArcadeStructuralFx(null);
  assert.doesNotThrow(() => fx.emitImpact(rec, VIEW));
  assert.doesNotThrow(() => fx.emitImpact(null, VIEW));
  fx.update(1 / 60, null, 900);
  for (const mesh of fx.getMeshes()) {
    assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));
  }
  fx.dispose();
});

test('the structural plate is a closed lit sheet, not a card', () => {
  const geometry = createStructuredBurstGeometry('plate');
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(size.x > 0 && size.y > 0 && size.z > 0, 'a plate has real thickness, so its edge is visible');
  assert.ok(geometry.getAttribute('normal'), 'it is lit, not emissive');
  assert.ok(geometry.getAttribute('position').array.every(Number.isFinite));
  assert.ok(geometry.index.count >= 120, 'closed solid: two skins plus a rim');
  assert.equal(geometry.userData.spacefaceStructuredTransient, 'plate');
  // The tear eats into one end only, so the panel reads as ripped out rather than cut to size.
  const pos = geometry.getAttribute('position');
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minX = Math.min(minX, pos.getX(i));
    maxX = Math.max(maxX, pos.getX(i));
  }
  assert.ok(Math.abs(minX + 0.5) < 1e-6, 'the intact end is flush');
  assert.ok(maxX < 0.5 - 1e-3, 'the torn end is eaten into');
  geometry.dispose();
});
