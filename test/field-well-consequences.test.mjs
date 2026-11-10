// Fixed-pose owner seams: shared force is sampled, never replaced. Native motion and planet
// heat/drag/reentry remain covered by fields-integration and planet-vertical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { fields, fieldBodyProfile, fieldVelocityTermApplies } from '../src/systems/fields.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { FIELD_MAX_ACCEL, WELL_GRIND } from '../src/data/fields.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';

const OFF = { grindPriming: false, exitHitstun: false }, DT = 1 / 60;
export function fieldConsequenceFixture(owner = fields) {
  const prior = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const sim = createSimulation({ seed: 4409, systems: [owner], updateOrder: [] });
  const state = sim.state; state.mode = 'flight'; state.input.actions = {};
  const f = sim.registry.get('fields'), events = [];
  for (const name of ['combat:hitstunImpulse', 'well:grind']) {
    sim.bus.on(name, p => events.push({ name, p: structuredClone(p) }));
  }
  function spawn(type = 'ship', pos = { x: 80, z: 0 }) {
    return sim.spawn({ type, alive: true, team: 2, pos, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
      radius: 8, mass: 20, hull: 200, hullMax: 200, flags: {}, collides: true,
      physicsBody: { schemaVersion: 1, dynamic: true, mass: 20, radius: 8, inertiaY: 640, revision: 0 },
      data: { combatProfileId: 'combat_profile_standard_ship' } });
  }
  const player = spawn('ship', { x: 500, z: 0 }); state.playerId = player.id;
  const register = (id, extra = {}) => f._kernel.register({ id, kind: 'well', center: { x: 0, z: 0 },
    radius: 500, strength: 240, falloff: 1.4, durationS: Infinity, ownerId: player.id, ...extra });
  function tick(bodies) {
    state.tick++; state.simTime = state.tick * DT; f._kernel.expire(state.simTime);
    const list = f._kernel.list();
    for (const e of bodies) {
      const profile = fieldBodyProfile(e, state), vel = fieldVelocityTermApplies(e, profile) ? e.vel : null;
      const accel = sampleFieldAcceleration(e.pos, vel, list, state.simTime, profile);
      // Same zero-net early return as the live force owner.
      if (accel.ax !== 0 || accel.az !== 0) f._accumulateWellDelta(e, list, profile, accel, DT, state);
    }
    f._detectWellGrind(state); f._flushEndedWells(state);
  }
  return { sim, state, f, events, spawn, player, register, tick,
    hits: () => events.filter(e => e.name === 'combat:hitstunImpulse'),
    grinds: () => events.filter(e => e.name === 'well:grind'),
    close() { sim.dispose(); restoreFeatureMaps(prior); } };
}
const fixture = fieldConsequenceFixture;
function near(a, b, message) { assert(Math.abs(a - b) < 1e-10, `${message}: ${a} != ${b}`); }

test('legacy metadata defaults on; explicit opt-outs are copied and independently normalized', () => {
  assert.equal(normalizeField({ id: 'legacy' }).wellConsequences, undefined);
  const input = { ...OFF }, field = normalizeField({ wellConsequences: input }); input.exitHitstun = true;
  assert.deepEqual(field.wellConsequences, OFF); assert(Object.isFrozen(field.wellConsequences));
  assert.deepEqual(normalizeField({ wellConsequences: { grindPriming: false } }).wellConsequences,
    { grindPriming: false, exitHitstun: true });
  assert.deepEqual(normalizeField({ wellConsequences: { exitHitstun: false } }).wellConsequences,
    { grindPriming: true, exitHitstun: false });
});

test('receipts preserve exact sampler output for clamped/opposed sums, velocity, coupling and hitch', () => {
  const profiles = [{ mass: 20, type: 'ship', id: 2 }, { mass: 200, type: 'ship', id: 2, fieldResponseMult: 3, boosting: true },
    { mass: 2, type: 'wreck', id: 2 }, { mass: 20, type: 'ship', id: 2, hitchedTo: 91 },
    { mass: 20, type: 'ship', id: 2, dynamic: false }];
  const specs = [{ id: 'a', kind: 'well', strength: 3000, damping: 8, sourceId: 91, lockStrength: 900, wellConsequences: OFF },
    { id: 'z', kind: 'repulsor', strength: 3000, damping: 2 },
    { id: 'm', kind: 'well', tag: 'environmental', strength: 800, damping: 17, frame: { x: 5, z: 8 } }];
  for (const profile of profiles) for (const count of [1, 2, 3]) for (const reverse of [false, true]) {
    for (const vel of [null, { x: 120, z: -30 }]) {
      const list = specs.slice(0, count).map(x => normalizeField({ center: { x: 0, z: 0 }, radius: 500, falloff: 1, ...x }));
      if (reverse) list.reverse();
      const receipts = { entries: [], count: 0 }, pos = { x: 80, z: 0 };
      const result = sampleFieldAcceleration(pos, vel, list, 0, profile, undefined, receipts);
      assert.deepEqual(result, sampleFieldAcceleration(pos, vel, list, 0, profile));
      near(receipts.entries.reduce((n, row) => n + row.ax, 0), result.ax, 'receipt x sum');
      near(receipts.entries.reduce((n, row) => n + row.az, 0), result.az, 'receipt z sum');
      assert(Math.hypot(result.ax, result.az) <= FIELD_MAX_ACCEL + 1e-10);
    }
  }
});

test('authored planet metadata is forwarded on registration and rebuilt after Continue', () => {
  const t = fixture(); try {
    assert.deepEqual(PLANET_SITE.field.wellConsequences, OFF);
    const adapter = Object.create(planetRuntime); adapter.state = t.state;
    const rt = { fieldId: 'planet', center: { x: 0, z: 0 }, entityId: 999 };
    adapter._registerField(t.f, rt, PLANET_SITE); assert.deepEqual(t.f._kernel.get('planet').wellConsequences, OFF);
    const saved = t.f.serialize(); assert(!saved.fields.some(f => f.id === 'planet'));
    t.f.deserialize(saved); adapter._registerField(t.f, rt, PLANET_SITE);
    assert.deepEqual(t.f._kernel.get('planet').wellConsequences, OFF);
  } finally { t.close(); }
});

test('passive annulus cannot grind-prime or release exit stun for player, NPC, drone, or prop', () => {
  const t = fixture(); try {
    const field = t.register('planet', { ...PLANET_SITE.field, wellConsequences: OFF, ownerId: null });
    const bodies = [t.player, t.spawn(), t.spawn('drone'), t.spawn('wreck')];
    bodies.forEach((e, i) => { e.pos = { x: 1080, z: i * 15 }; });
    for (let i = 0; i < 600; i++) t.tick(bodies);
    bodies.forEach(e => { e.pos = { x: 899.5, z: 0 }; }); t.tick(bodies);
    assert.equal(t.grinds().length, 0); assert.equal(t.hits().length, 0); assert.equal(t.f._wellBodies.size, 0);
    for (const body of bodies) {
      const profile = fieldBodyProfile(body, t.state), ordinary = { ...field }; delete ordinary.wellConsequences;
      for (const x of [899.5, 1080, 1800]) {
        const actual = sampleFieldAcceleration({ x, z: 0 }, body.vel, [field], 0, profile);
        assert.deepEqual(actual, sampleFieldAcceleration({ x, z: 0 }, body.vel, [ordinary], 0, profile));
        if (x === 899.5) assert.deepEqual(actual, { ax: 0, az: 0 });
      }
    }
  } finally { t.close(); }
});

for (const author of ['player-deploy', 'enemy-snare', 'machinery', 'external-default']) {
  test(`${author} retains positive grind and aggregate exit`, () => {
    const t = fixture(); try {
      let field;
      if (author === 'player-deploy') {
        t.state.input.aimWorld = { x: 0, z: 0 }; t.f._deployRadial(t.state, t.state.fields, 'well');
        field = t.f._kernel.list().find(f => f.kind === 'well');
      } else if (author === 'enemy-snare') {
        const enemy = t.spawn('ship', { x: 0, z: 0 }); enemy.data.fieldAnchor = { defKey: 'anchorSnare', spinupTicks: 0 };
        field = t.f._kernel.get(t.f._registerAnchoredField(enemy));
      } else {
        field = t.f[author === 'machinery' ? 'registerEnvironmental' : 'registerExternal']({ id: author,
          kind: 'well', center: { x: 0, z: 0 }, radius: 500, strength: 240, damping: 3 });
      }
      assert(field); assert.notEqual(field.wellConsequences?.exitHitstun, false);
      const a = t.spawn('ship', { x: field.center.x + 80, z: 0 }), b = t.spawn('drone', { x: field.center.x + 80, z: 15 });
      for (let i = 0; i < WELL_GRIND.ticks; i++) t.tick([a, b]); assert.equal(t.grinds().length, 1);
      a.pos.x = b.pos.x = 10000; t.tick([a, b]); assert.equal(t.hits().length, 2);
      assert(t.hits().every(e => e.p.deltaV > 0));
    } finally { t.close(); }
  });
}

test('independent switches gate only their named consequence', () => {
  for (const flag of ['grindPriming', 'exitHitstun']) {
    const t = fixture(); try {
      t.register('split', { wellConsequences: { [flag]: false } }); const a = t.spawn(), b = t.spawn('ship', { x: 80, z: 15 });
      for (let i = 0; i < WELL_GRIND.ticks; i++) t.tick([a, b]); a.pos.x = b.pos.x = 10000; t.tick([a, b]);
      assert.equal(t.grinds().length, flag === 'grindPriming' ? 0 : 1);
      assert.equal(t.hits().length, flag === 'exitHitstun' ? 0 : 2);
    } finally { t.close(); }
  }
});

export function ordinaryOverlap(owner = fields) {
  const t = fixture(owner); try {
    const a = t.spawn(), b = t.spawn('ship', { x: 80, z: 15 });
    t.register('a', { durationS: 0.2 }); t.register('b', { ownerId: b.id, strength: 65 });
    t.register('c', { kind: 'repulsor', strength: 19 });
    const values = [];
    for (let i = 0; i < 35; i++) {
      t.tick([a, b]); const r = t.f._wellAccum.get(a);
      values.push({ tick: t.state.tick, dx: r?.dx, dz: r?.dz, attackerId: r?.attackerId, hits: t.hits().length });
    }
    a.pos.x = b.pos.x = 10000; t.tick([a, b]); return { values, events: t.events };
  } finally { t.close(); }
}
test('multiple default-on Wells retain one aggregate through expiry and last-effective attribution', () => {
  const result = ordinaryOverlap(); assert(result.values.every(row => row.hits === 0));
  const grinds = result.events.filter(e => e.name === 'well:grind'), hits = result.events.filter(e => e.name === 'combat:hitstunImpulse');
  assert.equal(grinds.length, 1); assert.equal(grinds[0].p.tick, 24); assert.equal(hits.length, 2);
  assert(hits.every(e => e.p.tick === 36 && e.p.attackerId === grinds[0].p.bId));
});

test('mixed passive/active debt excludes only passive jointly-clamped contribution, independent of registration order', () => {
  function run(reverse) {
    const t = fixture(); try {
      const a = t.spawn(), specs = [['a_passive', { strength: 3000, wellConsequences: OFF }], ['z_active', { strength: 240 }]];
      if (reverse) specs.reverse(); for (const [id, spec] of specs) t.register(id, spec);
      const receipts = { entries: [], count: 0 }, profile = fieldBodyProfile(a, t.state);
      const full = sampleFieldAcceleration(a.pos, a.vel, t.f._kernel.list(), 0, profile, undefined, receipts);
      const expected = (full.ax - receipts.entries.find(row => row.field.id === 'a_passive').ax) * DT;
      t.tick([a]); near(t.f._wellAccum.get(a).dx, expected, 'passive exclusion');
      t.f._kernel.update('z_active', { center: { x: 10000, z: 0 } }); t.tick([a]);
      assert.equal(t.hits().length, 1); near(t.hits()[0].p.deltaV, Math.abs(expected), 'passive cannot hold active debt');
      return t.hits();
    } finally { t.close(); }
  }
  assert.deepEqual(run(false), run(true));
});

test('equal-and-opposite zero net force invents neither debt nor a release event', () => {
  const t = fixture(); try {
    const a = t.spawn(); t.register('a', { strength: 240, wellConsequences: OFF }); t.register('b', { kind: 'repulsor', strength: 240 });
    for (let i = 0; i < 40; i++) t.tick([a]); assert.equal(t.f._wellBodies.size, 0); assert.equal(t.hits().length, 0);
  } finally { t.close(); }
});

for (const lifecycle of ['administrative-unregister', 'replacement', 'opt-out', 'clear', 'restore']) {
  test(`${lifecycle} cancels only retired ownership without a synthetic release`, () => {
    const t = fixture(); try {
      const a = t.spawn(); t.register('a', { strength: 80 }); t.register('b', { strength: 40 }); t.tick([a]);
      const rec = t.f._wellAccum.get(a), remaining = rec.dx - rec.sources.get(t.f._kernel.get('a')).dx;
      if (lifecycle === 'administrative-unregister') t.f._kernel.unregister('a', 'retired');
      if (lifecycle === 'replacement') t.register('a', { strength: 80, wellConsequences: OFF });
      if (lifecycle === 'opt-out') t.f._kernel.update('a', { wellConsequences: OFF });
      if (lifecycle === 'clear') t.f._clearAll('cleared', 'test');
      if (lifecycle === 'restore') t.f.deserialize(t.f.serialize());
      a.pos.x = 10000; t.tick([a]);
      if (lifecycle === 'clear' || lifecycle === 'restore') assert.equal(t.hits().length, 0);
      else { assert.equal(t.hits().length, 1); near(t.hits()[0].p.deltaV, Math.abs(remaining), 'other source survives'); }
    } finally { t.close(); }
  });
}

test('replacement resets contact history; expired sources compact while aggregate debt survives', () => {
  const t = fixture(); try {
    const a = t.spawn(), b = t.spawn('ship', { x: 80, z: 15 }); t.register('hold');
    for (let i = 0; i < WELL_GRIND.ticks - 1; i++) t.tick([a, b]); t.register('hold'); t.tick([a, b]);
    assert.equal(t.grinds().length, 0);
    for (let i = 0; i < 60; i++) {
      t.register(`short_${i}`, { durationS: DT * 1.5, createdAt: t.state.simTime }); t.tick([a]);
      assert(t.f._wellAccum.get(a).sources.size <= 3);
    }
    assert.equal(t.hits().filter(e => e.p.victimId === a.id).length, 0);
    a.pos.x = 10000; t.tick([a]); assert.equal(t.hits().filter(e => e.p.victimId === a.id).length, 1);
  } finally { t.close(); }
});

test('authored metadata round-trips save/Continue while legacy fields stay default-on', () => {
  const t = fixture(); try {
    t.f.registerEnvironmental({ id: 'passive', kind: 'well', center: { x: 0, z: 0 }, radius: 500, strength: 240, wellConsequences: OFF });
    t.register('legacy'); t.f.deserialize(JSON.parse(JSON.stringify(t.f.serialize())));
    assert.deepEqual(t.f._kernel.get('passive').wellConsequences, OFF);
    assert.equal(t.f._kernel.get('legacy').wellConsequences, undefined);
  } finally { t.close(); }
});

test('participation update preserves live force and lifecycle parameters', () => {
  const t = fixture(); try {
    const a = t.spawn(), field = t.register('phase', { durationS: 9 });
    field.baseStrength = 240; field.strength = 17; field.lifecyclePhase = 'dissipating';
    const before = sampleFieldAcceleration(a.pos, a.vel, [field], 0, fieldBodyProfile(a, t.state));
    const changed = t.f._kernel.update('phase', { wellConsequences: OFF });
    assert.equal(changed.baseStrength, 240); assert.equal(changed.strength, 17); assert.equal(changed.lifecyclePhase, 'dissipating');
    assert.deepEqual(sampleFieldAcceleration(a.pos, a.vel, [changed], 0, fieldBodyProfile(a, t.state)), before);
  } finally { t.close(); }
});

export function deployedTermination(owner, reason) {
  const t = fixture(owner); try {
    t.state.input.aimWorld = { x: 0, z: 0 }; t.f._deployRadial(t.state, t.state.fields, 'well');
    const field = t.f._kernel.list().find(f => f.kind === 'well'), a = t.spawn('ship', { x: field.center.x + 80, z: 0 });
    t.tick([a]); const debt = t.f._wellAccum.get(a).dx, rec = t.state.fields.deployed[field.id];
    if (reason === 'ordinary-unregister') t.f._kernel.unregister(field.id);
    else if (reason === 'expired') { t.state.simTime = field.expireAt; t.f._syncEmitters(t.state, t.state.fields, false, DT); }
    else if (reason === 'destroyed') { t.state.entities.get(rec.emitterId).alive = false; t.f._syncEmitters(t.state, t.state.fields, false, DT); }
    else t.f._retireDeployed(t.state, t.state.fields, rec, reason);
    t.f._flushEndedWells(t.state); return { debt, hits: t.hits() };
  } finally { t.close(); }
}
for (const reason of ['ordinary-unregister', 'expired', 'destroyed', 'replaced', 'disrupted']) {
  test(`${reason} preserves earned aggregate gameplay release`, () => {
    const result = deployedTermination(fields, reason); assert.equal(result.hits.length, 1);
    near(result.hits[0].p.deltaV, Math.abs(result.debt), 'earned termination');
  });
}
