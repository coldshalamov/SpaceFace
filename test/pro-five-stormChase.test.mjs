import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand, writePhysicsBodyResponse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { hasExplicitAuthoredPayloadPresentation } from '../src/core/presentationAdmission.js';
import { deliverPhysicalImpulseDetailed } from '../src/combat/physicalEffects.js';
import { STATUS_DEFS, PINNED_STATUS_ID } from '../src/data/combatDefs.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { fields, fieldBodyProfile } from '../src/systems/fields.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { save } from '../src/save/saveSystem.js';
import { sectorLocalToGlobalForSector, sectorGlobalOrigin, sectorMembershipAtGlobal } from '../src/data/sectorCoordinates.js';
import { buildEncounterCatalog } from '../src/data/encounters/catalog.js';
import * as encounter from '../src/data/encounters/8104-pro-five-storm-chase.js';
import {
  STORM_PATTERNS, STORM_LIMITS, createStormPlan, normalizeStormPlan, sampleStorm,
  forecastStorm, sampleStormAtPoint, stormEnvironmentalProfiles,
  sampleStormBodyIntent, stormBodyEligibility, sampleStormShelter,
  createSampleLedger, bindSampleBody, chargeSample, observeSampleBodies,
  extractionQuote, extractSample, finishSampleLedger, loseSample, sampleBody,
  snapshotSampleLedger, restoreSampleLedger, sampleLedgerSummary,
  createStormChaseRuntime, createStormChaseSystem, STORM_CHASE_SITE, stormChaseEntry, STORM_CHASE_ENCOUNTER_RUNTIME, readStormChaseView,
  buildStormCueFrame, createStormCueBuffer, STORM_CUE_LIMITS,
} from '../src/features/stormChase/index.js';

const SEEDS = [4242, 137];
const magnitude = v => Math.hypot(v.x, v.z);
const pointAt = (frame, radius, angle) => ({ x: frame.eye.x + Math.cos(angle) * radius, z: frame.eye.z + Math.sin(angle) * radius });
const near = (actual, expected, tolerance = 1e-8, message = '') => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${message}: ${actual} ≈ ${expected}`);
const copy = value => JSON.parse(JSON.stringify(value));

function tickAt(f, time, dt = 1 / 60) {
  f.state.simTime = time; f.state.tick++;
  return f.runtime.update(dt);
}

function fixture(seed = 4242) {
  const state = createGameState(seed), bus = createBus(), helpers = {};
  state.mode = 'flight'; state.world.currentSectorId = STORM_CHASE_SITE.sectorId;
  const owners = new Map(), registry = { get: name => owners.get(name) };
  const ctx = { state, bus, helpers, registry };
  const coreOwner = Object.create(core); coreOwner.init(ctx); owners.set('core', coreOwner);
  const cargoOwner = Object.create(cargo); cargoOwner.init(ctx); owners.set('cargo', cargoOwner);
  const economyOwner = Object.create(economy); economyOwner.state = state; economyOwner.bus = bus;
  owners.set('economy', economyOwner);
  const fieldsOwner = Object.create(fields); fieldsOwner.init(ctx); owners.set('fields', fieldsOwner);
  const approach = sectorLocalToGlobalForSector({ x: 860, z: -1240 }, STORM_CHASE_SITE.sectorId);
  const player = helpers.spawnEntity({ type: 'ship', pos: approach, radius: 12, mass: 16,
    hull: 100, hullMax: 100, physicsBody: { shape: 'capsule', mass: 16 }, data: { defId: 'ship_kestrel' } });
  state.playerId = player.id;
  const runtime = createStormChaseRuntime(ctx);
  const advance = (seconds, dt = 1 / 60) => {
    const steps = Math.ceil(seconds / dt);
    for (let i = 0; i < steps; i++) {
      state.tick++; state.simTime += dt;
      runtime.update(dt);
    }
  };
  return { state, bus, helpers, owners, registry, ctx, player, runtime, advance, coreOwner, cargoOwner, economyOwner, fieldsOwner };
}

function oneSample(seed = 4242, quantity = 2) {
  const f = fixture(seed);
  const receiver = { x: f.player.pos.x, z: f.player.pos.z, radius: 76 };
  const ledger = createSampleLedger({ expeditionId: `receipt_${seed}`, sectorId: STORM_CHASE_SITE.sectorId,
    samples: [{ id: 'a', commodityId: 'cmdty_crystal_lumin', quantity, bonusCr: 120, chargeSeconds: 1 }] });
  const pod = f.helpers.spawnEntity({ type: 'payload', pos: receiver, vel: { x: 0, z: 0 },
    radius: 6, mass: 40, hull: 100, physicsBody: { shape: 'capsule', mass: 40 }, data: {} });
  assert.equal(bindSampleBody(ledger, 'a', pod), true);
  const options = { state: f.state, player: f.player, receiver, simTime: 10,
    addCargo: f.cargoOwner.addCargo.bind(f.cargoOwner), grantCredits: f.economyOwner.grantCredits.bind(f.economyOwner),
    retireBody: body => f.helpers.removeEntity(body.id) };
  for (let i = 1; i <= 4; i++) chargeSample(ledger, 'a', { dt: 0.25, exposure: 1, simTime: i * 0.25 });
  return { ...f, ledger, pod, receiver, options };
}

test('separate registry system factories retain independent runtimes and teardown', () => {
  const a = fixture(4242), b = fixture(137);
  const first = createStormChaseSystem(), second = createStormChaseSystem();
  first.init(a.ctx); second.init(b.ctx);
  assert.notEqual(first.runtime, second.runtime);
  assert.equal(first.runtime.begin().ok, true);
  assert.equal(second.runtime.begin().ok, true);
  first.destroy();
  assert.equal(second.runtime.active.phase, 'expedition');
  tickAt({ ...b, runtime: second.runtime }, 1);
  assert.equal(readStormChaseView(b.state).active, true);
  second.destroy();
});

for (const seed of SEEDS) {
  test(`seed ${seed}: authored courses move the safe eye, replay exactly and forecast without state mutation`, () => {
    for (const pattern of STORM_PATTERNS) {
      const plan = createStormPlan({ seed, patternId: pattern.id, origin: { x: 1700, z: 14734 }, startedAt: 50 });
      const saved = JSON.stringify(plan);
      const start = sampleStorm(plan, 50), middle = sampleStorm(plan, 50 + pattern.durationS / 2);
      assert.ok(Math.hypot(middle.eye.x - start.eye.x, middle.eye.z - start.eye.z) > 200);
      assert.deepEqual(forecastStorm(plan, 70, 9), sampleStorm(plan, 79));
      assert.equal(JSON.stringify(plan), saved);
      assert.deepEqual(sampleStorm(normalizeStormPlan(JSON.parse(saved)), 90), sampleStorm(plan, 90));
      for (let t = 50; t <= 50 + pattern.durationS; t += 0.5) {
        const frame = sampleStorm(plan, t);
        assert.equal(sampleStormAtPoint(frame, frame.eye).exposure, 0);
        assert.ok(frame.eye.x >= plan.bounds.minX && frame.eye.x <= plan.bounds.maxX);
        assert.ok(frame.eye.z >= plan.bounds.minZ && frame.eye.z <= plan.bounds.maxZ);
        assert.ok(Number.isFinite(frame.eye.vx + frame.eye.vz));
      }
      assert.equal(sampleStorm(plan, 50 + pattern.durationS + 100).intensity, 0);
    }
    const auto = createStormPlan({ seed, startedAt: 7 });
    assert.deepEqual(normalizeStormPlan(auto), auto, 'automatic pattern choice consumes the same RNG schedule after restore');
  });

  test(`seed ${seed}: real ingress windows cross both fronts and final escape remains open`, () => {
    for (const pattern of STORM_PATTERNS) {
      const plan = createStormPlan({ seed, patternId: pattern.id });
      let openings = 0, warnings = 0;
      for (let t = pattern.forecastS + 4; t < pattern.durationS; t += 0.5) {
        const frame = sampleStorm(plan, t);
        if (frame.gap.windup > 0) warnings++;
        if (!frame.gap.aligned) continue;
        openings++;
        for (let r = frame.eye.radius; r <= frame.outerRadius + 1; r += 4) {
          assert.ok(sampleStormAtPoint(frame, pointAt(frame, r, frame.gap.angle)).exposure < 1e-9,
            `${pattern.id} opening must be physically clear at t=${t}, r=${r}`);
        }
      }
      assert.ok(openings >= 20 && warnings >= 4);
      for (let t = pattern.durationS - pattern.fadeS; t <= pattern.durationS; t++) {
        assert.equal(sampleStorm(plan, t).escape.open, true);
      }
    }
  });

  test(`seed ${seed}: force is continuous across eye, annulus, outer edge and angular seam`, () => {
    const plan = createStormPlan({ seed, patternId: 'cross_shear' });
    const frame = sampleStorm(plan, 41), eps = 1e-5;
    const body = makeEntity({ id: 99, type: 'payload', mass: 40, radius: 6, physicsBody: { mass: 40 }, data: {} });
    const forceAt = (radius, angle) => {
      body.pos.copy(pointAt(frame, radius, angle));
      return sampleStormBodyIntent(frame, body, { dt: 1 / 60 }).force;
    };
    for (const radius of [frame.eye.radius, frame.fronts[0].radius - frame.fronts[0].halfWidth,
      frame.fronts[0].radius, frame.fronts[1].radius + frame.fronts[1].halfWidth, frame.outerRadius]) {
      const left = forceAt(radius - eps, 0.2), right = forceAt(radius + eps, 0.2);
      assert.ok(Math.hypot(left.x - right.x, left.z - right.z) < 0.02);
    }
    const left = forceAt(frame.fronts[0].radius, Math.PI - eps), right = forceAt(frame.fronts[0].radius, -Math.PI + eps);
    assert.ok(Math.hypot(left.x - right.x, left.z - right.z) < 0.1);
  });

  test(`seed ${seed}: force budgets, heavy mass, Pin, shelter and relative motion remain physical`, () => {
    const frame = sampleStorm(createStormPlan({ seed, patternId: 'lee_arc' }), 35);
    const pos = pointAt(frame, frame.fronts[0].radius, frame.fronts[0].gapAngle + Math.PI);
    const body = makeEntity({ id: 20, type: 'payload', pos, mass: 24, radius: 8, physicsBody: { mass: 24 }, data: {} });
    const before = JSON.stringify(body);
    const free = sampleStormBodyIntent(frame, body);
    assert.ok(magnitude(free.impulse) > 0);
    assert.equal(JSON.stringify(body), before, 'pure sampler cannot change position, velocity, hull or body spec');
    const heavy = sampleStormBodyIntent(frame, { ...body, mass: 900, physicsBody: { mass: 900 } });
    assert.ok(magnitude(heavy.acceleration) < magnitude(free.acceleration));
    const pin = sampleStormBodyIntent(frame, body, { bodyProfile: { physicsMassScale: 8 } });
    assert.equal(pin.pinned, true); assert.ok(magnitude(pin.acceleration) < magnitude(free.acceleration));
    const medium = sampleStormAtPoint(frame, pos).mediumVelocity;
    const riding = sampleStormBodyIntent(frame, { ...body, vel: { ...medium } });
    const radial = { x: (pos.x - frame.eye.x) / frame.fronts[0].radius, z: (pos.z - frame.eye.z) / frame.fronts[0].radius };
    assert.ok(riding.force.x * radial.x + riding.force.z * radial.z < 0,
      'co-moving rim debris needs inward support to follow a curved current');
    near(riding.force.x * -radial.z + riding.force.z * radial.x, 0, 1e-7,
      'co-moving body has no artificial tangential drag');
    const speed = Math.hypot(medium.x, medium.z);
    const cover = { id: 10, type: 'wreck', alive: true, mass: 1500, radius: 22,
      pos: { x: pos.x - medium.x / speed * 38, z: pos.z - medium.z / speed * 38 } };
    const protectedBody = sampleStormBodyIntent(frame, body, { covers: [cover] });
    assert.ok(protectedBody.shelter > 0.6 && magnitude(protectedBody.impulse) < magnitude(free.impulse));
    assert.equal(sampleStormShelter(pos, medium, [{ ...cover, pos: { x: pos.x + medium.x / speed * 38, z: pos.z + medium.z / speed * 38 } }]).shelter, 0,
      'upwind bodies do not receive a fictional lee');
    for (const mass of [0.01, 24, 1e6]) for (const dt of [1 / 60, 0.1, 1000]) {
      const intent = sampleStormBodyIntent(frame, { ...body, mass, physicsBody: { mass }, vel: { x: 1e8, z: -1e8 } }, { dt });
      assert.ok(magnitude(intent.acceleration) <= STORM_LIMITS.maxAcceleration + 1e-8);
      assert.ok(magnitude(intent.force) <= STORM_LIMITS.maxForce + 1e-8);
      assert.ok(magnitude(intent.impulse) <= STORM_LIMITS.maxImpulse + 1e-8);
      assert.ok(intent.dt <= STORM_LIMITS.maxDt);
    }
  });
}

test('canonical field profile preserves actual Pin solver resistance, hitch load and boosted Saucer immunity', () => {
  const f = fixture(), frame = sampleStorm(createStormPlan({ seed: 4242, patternId: 'lee_arc' }), 40);
  const pos = pointAt(frame, frame.fronts[0].radius, frame.gap.angle + Math.PI / 2);
  const body = f.helpers.spawnEntity({ type: 'payload', pos, mass: 70, radius: 6, physicsBody: { mass: 70 }, data: {} });
  const pin = STATUS_DEFS.find(row => row.id === PINNED_STATUS_ID).effects.physicsResponse;
  const commandAt = response => {
    f.state.combat.entities[String(body.id)] = { physicsResponse: response, multipliers: { fieldCoupling: 1 } };
    writePhysicsBodyResponse(body, response);
    const intent = sampleStormBodyIntent(frame, body, { state: f.state, bodyProfile: fieldBodyProfile(body, f.state) });
    const receipt = deliverPhysicalImpulseDetailed(f.state, body, intent.impulse, { tag: 'glasswake_current' },
      { continuous: true, dt: 1 / 60, scaleEnvironment: false });
    const command = consumePhysicsCommand(body);
    assert.equal(command.impulses.length, 1); assert.equal(receipt.accepted, true);
    const solverMass = resolvePhysicsBodySpec(body).mass * command.bodyResponse.massScale;
    return { intent, command, dv: magnitude(command.impulses[0]) / solverMass };
  };
  const free = commandAt({ massScale: 1, inertiaScale: 1 }), pinned = commandAt(pin);
  near(magnitude(pinned.intent.impulse), magnitude(free.intent.impulse), 1e-8, 'same BASE-mass current impulse');
  near(pinned.dv * pin.massScale, free.dv, 1e-8, 'real queued solver response resists by the actual Pin mass scale');
  const ship = makeEntity({ id: 900, type: 'ship', pos, mass: 16, radius: 12, physicsBody: { mass: 16 }, data: {} });
  const bare = sampleStormBodyIntent(frame, ship, { state: f.state, bodyProfile: fieldBodyProfile(ship, f.state) });
  ship.data.hitchMass = 80;
  const hitched = sampleStormBodyIntent(frame, ship, { state: f.state, bodyProfile: fieldBodyProfile(ship, f.state) });
  assert.equal(hitched.couplingMass, 96); assert.equal(hitched.mass, 16);
  assert.ok(magnitude(hitched.force) < magnitude(bare.force));
  ship.isPlayer = true; ship.data.defId = 'ship_saucer'; ship.flags.boosting = true;
  const immune = sampleStormBodyIntent(frame, ship, { state: f.state, bodyProfile: fieldBodyProfile(ship, f.state) });
  assert.equal(magnitude(immune.impulse), 0); assert.equal(immune.reason, 'field_immune');
  f.runtime.dispose();
});

test('core staged admission makes sample custody and authored art visible before synchronous spawn observers', () => {
  const f = fixture(), observed = [];
  const saver = Object.create(save); Object.assign(saver, f.ctx);
  f.bus.on('entity:spawned', ({ entity }) => {
    if (entity.data?.stormChase?.role !== 'sample') return;
    const feature = f.runtime.snapshot(), entities = saver._serializeEntities();
    const row = feature.active.ledger.samples.find(row => row.id === entity.data.stormChase.sampleId);
    observed.push({ bodyId: entity.id, generation: entity.occupantGeneration, row,
      roster: feature.active.bodies.some(ref => ref.id === entity.id && ref.generation === entity.occupantGeneration),
      persistent: entities.persistent.some(body => body.id === entity.id), authored: hasExplicitAuthoredPayloadPresentation(entity) });
  });
  assert.equal(f.runtime.begin().ok, true); tickAt(f, 11);
  assert.equal(observed.length, 2);
  for (const item of observed) {
    assert.equal(item.row.status, 'drifting'); assert.equal(item.row.bodyId, item.bodyId);
    assert.equal(item.row.bodyGeneration, item.generation);
    assert.equal(item.roster, true); assert.equal(item.persistent, true); assert.equal(item.authored, true);
  }
  assert.equal(readStormChaseView(f.state), f.runtime.view);
  const detachedMirror = { stormChaseView: copy(f.runtime.view) };
  assert.deepEqual(readStormChaseView(detachedMirror), f.runtime.view);
  assert.equal(Object.hasOwn(f.runtime.serialize(), 'stormChaseView'), false);
  f.runtime.dispose(); assert.equal(f.state.stormChaseView, null);
});

test('New Game inside a sample spawn callback cannot publish further pods or leave an orphan body', () => {
  const f = fixture(), foreign = f.helpers.spawnEntity({ type: 'wreck', pos: { x: 0, z: 0 }, data: {} });
  let sampleSpawns = 0;
  f.bus.on('entity:spawned', ({ entity }) => {
    if (entity.data?.stormChase?.role === 'sample' && ++sampleSpawns === 1) f.bus.emit('game:new', {});
  });
  f.runtime.begin(); const run = f.runtime.active;
  tickAt(f, 11);
  assert.equal(sampleSpawns, 1); assert.equal(f.runtime.active, null);
  assert.equal(f.fieldsOwner._kernel.size, 0); assert.equal(f.state.stormChaseView, null);
  assert.equal([...f.state.entities.values()].filter(body => body.alive && body.data?.stormChase?.expeditionId === run.id).length, 0);
  assert.equal(foreign.alive, true); assert.equal(f.state.player.credits, 0); f.runtime.dispose();
});

test('storm entry and later pod admission protect occupied pilot space without consuming a pending sample', () => {
  const blocked = fixture();
  blocked.player.pos.copy(sectorLocalToGlobalForSector(STORM_CHASE_SITE.origin, STORM_CHASE_SITE.sectorId));
  assert.equal(blocked.runtime.begin().reason, 'move_outside_front');
  assert.equal(blocked.state.entities.size, 1); assert.equal(blocked.fieldsOwner._kernel.size, 0); blocked.runtime.dispose();
  const f = fixture(); f.runtime.begin();
  const run = f.runtime.active, frame = sampleStorm(run.plan, 11);
  f.player.pos.copy(frame.pockets[0]); tickAt(f, 11);
  assert.ok(run.ledger.samples.slice(0, 2).every(row => row.status === 'pending' && row.bodyId === null));
  assert.equal(run.attemptedSamples.length, 0);
  f.player.pos.copy(frame.extraction); tickAt(f, 11.1);
  assert.ok(run.ledger.samples.slice(0, 2).every(row => row.status === 'drifting'));
  f.runtime.dispose();
});

test('a crowded sector preserves pilot admission and caps actual queued current recipients', () => {
  const f = fixture(); f.runtime.begin();
  const run = f.runtime.active, frame = sampleStorm(run.plan, 40);
  const p = pointAt(frame, frame.fronts[0].radius, frame.gap.angle + Math.PI / 2);
  f.player.pos.copy(p);
  for (let i = 0; i < 140; i++) f.helpers.spawnEntity({ type: 'payload',
    pos: { x: p.x + (i % 10) * 0.1, z: p.z + Math.floor(i / 10) * 0.1 },
    mass: 40, radius: 5, physicsBody: { mass: 40 }, data: {} });
  tickAt(f, 40);
  const recipients = [];
  for (const body of f.state.entities.values()) {
    const command = consumePhysicsCommand(body);
    if (command?.impulses?.length) recipients.push(body.id);
  }
  assert.ok(recipients.includes(f.player.id)); assert.ok(recipients.length > 20);
  assert.ok(recipients.length <= STORM_LIMITS.maxBodies);
  assert.ok(run.lastAffectedCount <= STORM_LIMITS.maxBodies); f.runtime.dispose();
});

test('a live physical mooring exists at first publication and its loss stops further handovers', () => {
  const f = fixture(); let firstRole = null;
  f.bus.on('entity:spawned', ({ entity }) => { firstRole ??= entity.data?.stormChase?.role ?? null; });
  f.runtime.begin(); assert.equal(firstRole, 'receiver'); tickAt(f, 11);
  const run = f.runtime.active, rows = run.ledger.samples.slice(0, 2);
  for (const row of rows) for (let i = 1; i <= 16; i++)
    chargeSample(run.ledger, row.id, { dt: 0.25, exposure: 1, simTime: 11 + i * 0.25 });
  const receiver = sampleStorm(run.plan, 20).extraction;
  f.player.pos.copy(receiver);
  for (const row of rows) {
    const body = sampleBody(run.ledger, row.id, f.state); body.pos.copy(receiver); body.vel.set(0, 0, 0);
  }
  const mooring = f.state.entities.get(run.bodies.find(ref => ref.role === 'receiver').id);
  f.bus.on('cargo:changed', () => { mooring.hull = 0; });
  tickAt(f, 20);
  assert.equal(rows[0].status, 'extracted'); assert.equal(rows[1].status, 'lost');
  assert.equal(f.state.player.credits, 60); assert.equal(f.state.player.cargo.items.cmdty_crystal_lumin, 1);
  assert.equal(run.phase, 'finished'); assert.equal(f.fieldsOwner._kernel.size, 0); f.runtime.dispose();
});

test('invalid or terminal restore envelopes cannot leave mapped expedition bodies or open custody', () => {
  for (const fault of ['future', 'unknown_pattern', 'finished']) {
    const f = fixture(); f.runtime.begin(); tickAt(f, 11);
    const raw = copy(f.runtime.snapshot()), run = f.runtime.active;
    const remap = new Map(run.bodies.map(ref => [String(ref.id), ref.id]));
    const foreign = f.helpers.spawnEntity({ type: 'wreck', pos: { x: 0, z: 0 }, data: {} });
    if (fault === 'future') raw.active.plan.startedAt = 1000;
    if (fault === 'unknown_pattern') raw.active.plan.patternId = 'absent';
    if (fault === 'finished') raw.active.phase = 'finished';
    const result = f.runtime.restore(raw, { entityIdRemap: remap });
    assert.equal(result, fault === 'finished'); assert.equal(foreign.alive, true);
    assert.equal([...f.state.entities.values()].filter(body => body.alive && body.data?.stormChase?.expeditionId === run.id).length, 0);
    assert.equal(f.fieldsOwner._kernel.size, 0);
    if (fault === 'finished') {
      assert.equal(f.runtime.active.ledger.closed, true);
      assert.ok(f.runtime.active.ledger.samples.every(row => row.status === 'lost'));
    }
    f.runtime.dispose();
  }
});

for (const seed of SEEDS) {
  test(`seed ${seed}: every course charges actual pods in moving pockets and banks six physical deliveries`, () => {
    for (const pattern of STORM_PATTERNS) {
      const f = fixture(seed);
      assert.equal(f.runtime.begin({ patternId: pattern.id }).ok, true);
      const run = f.runtime.active;
      for (let stage = 0; stage < 3; stage++) {
        tickAt(f, pattern.pockets[stage].opensAtS + 0.1, 0.1);
        const rows = run.ledger.samples.slice(stage * 2, stage * 2 + 2);
        assert.ok(rows.every(row => row.status === 'drifting' && sampleBody(run.ledger, row.id, f.state)));
        // The host physics owns steering. This fixture places the real admitted bodies along
        // the moving pocket to isolate exposure integration and actual-owner settlement.
        for (let step = 0; step < (rows[0].chargeSeconds + 0.2) * 60; step++) {
          const nextTime = f.state.simTime + 1 / 60;
          const pocket = sampleStorm(run.plan, nextTime).pockets[stage];
          for (const row of rows) sampleBody(run.ledger, row.id, f.state).pos.copy(pocket);
          tickAt(f, nextTime);
        }
        assert.ok(rows.every(row => row.status === 'charged' && row.charge === 1));
        assert.equal(f.state.player.cargo.usedVolume, stage === 0 ? 0 : stage === 1 ? 2 : 6,
          'charging alone grants neither cargo nor credits');
        const receiver = sampleStorm(run.plan, f.state.simTime).extraction;
        f.player.pos.copy(receiver);
        for (const row of rows) {
          const pod = sampleBody(run.ledger, row.id, f.state);
          pod.pos.copy(receiver); pod.vel.set(0, 0, 0);
        }
        tickAt(f, f.state.simTime + 1 / 60);
        assert.ok(rows.every(row => row.status === 'extracted'));
        f.coreOwner.lifetimeSweep(1 / 60, f.state);
        assert.ok(rows.every(row => !f.state.entities.has(row.bodyId)), 'core sweeps delivered pods and recycles their IDs');
      }
      assert.equal(run.phase, 'finished'); assert.equal(run.outcome, 'extracted');
      assert.equal(f.state.player.cargo.items.cmdty_crystal_lumin, 12);
      assert.equal(f.state.player.credits, 710);
      assert.equal(f.state.player.cargo.richLots.length, 6);
      assert.equal(f.fieldsOwner._kernel.size, 0);
      const credits = f.state.player.credits, count = f.state.entities.size;
      assert.equal(f.runtime.restore(copy(f.runtime.snapshot())), true);
      tickAt(f, f.state.simTime + 1);
      assert.equal(f.state.player.credits, credits); assert.equal(f.state.entities.size, count);
      assert.ok(run.bodies.every(ref => !f.state.entities.get(ref.id)?.alive));
      f.runtime.dispose();
    }
  });
}

test('real director offers a free optional course, dispatches choices once, and receives the terminal outcome', () => {
  const f = fixture(), director = Object.create(encounterDirector);
  director.init(f.ctx); f.owners.set('encounterDirector', director);
  const shape = buildEncounterCatalog([encounter])[encounter.trigger.id];
  const makeLive = id => {
    const live = { id, shapeId: shape.id, script: shape.script, shape, plan: {},
      tier: shape.tier, deck: shape.deck, sectorId: STORM_CHASE_SITE.sectorId,
      zoneId: STORM_CHASE_SITE.zoneId, phase: 'telegraph', startedAt: 0, deadlineAt: 0,
      ids: [], roles: {}, vars: {}, data: {}, outcome: null, primarySaid: false, lastBarkAt: -1e9 };
    f.state.encounterDirector.live[id] = live;
    return live;
  };
  const offered = [], resolved = [];
  f.bus.on('encounter:choiceOffered', event => offered.push(event));
  f.bus.on('encounter:resolved', event => resolved.push(event));
  const declined = makeLive('optional_declined');
  STORM_CHASE_ENCOUNTER_RUNTIME.fire(director, declined, f.state);
  assert.equal(declined.phase, 'offer'); assert.equal(f.state.entities.size, 1);
  assert.deepEqual(offered[0].options.map(row => row.id), ['lee_arc', 'cross_shear', 'return_hook', 'decline']);
  STORM_CHASE_ENCOUNTER_RUNTIME.tick(director, declined, f.state, declined.deadlineAt);
  assert.equal(declined.outcome, 'declined'); assert.equal(f.state.player.credits, 0);
  const accepted = makeLive('optional_accepted');
  STORM_CHASE_ENCOUNTER_RUNTIME.fire(director, accepted, f.state);
  STORM_CHASE_ENCOUNTER_RUNTIME.choose(director, accepted, f.state, 'cross_shear');
  assert.equal(accepted.phase, 'expedition'); assert.equal(f.runtime.active.plan.patternId, 'cross_shear');
  const serial = f.state.stormChase.nextSerial;
  STORM_CHASE_ENCOUNTER_RUNTIME.choose(director, accepted, f.state, 'return_hook');
  assert.equal(f.state.stormChase.nextSerial, serial);
  const duplicate = makeLive('duplicate_active_offer');
  STORM_CHASE_ENCOUNTER_RUNTIME.fire(director, duplicate, f.state);
  assert.equal(duplicate.outcome, 'aborted:expedition_active'); assert.equal(offered.length, 2);
  tickAt(f, STORM_PATTERNS.find(pattern => pattern.id === 'cross_shear').pockets[0].opensAtS + 0.1);
  const oldPod = sampleBody(f.runtime.active.ledger, f.runtime.active.ledger.samples[0].id, f.state);
  f.helpers.removeEntity(oldPod.id, { immediate: true });
  const foreign = f.helpers.spawnEntity({ type: 'wreck', pos: { x: 0, z: 0 }, data: {} });
  assert.equal(foreign.id, oldPod.id); assert.notEqual(foreign.occupantGeneration, oldPod.occupantGeneration);
  assert.deepEqual(accepted.ids, [], 'director does not acquire a second numeric-only lifetime roster');
  f.runtime.finish('withdrawn');
  assert.equal(accepted.phase, 'done'); assert.equal(accepted.outcome, 'withdrawn');
  assert.deepEqual(resolved.map(event => event.outcome), ['declined', 'aborted:expedition_active', 'withdrawn']);
  assert.equal(f.state.encounterDirector.live.optional_accepted, undefined);
  assert.equal(foreign.alive, true); assert.equal(foreign.data.despawnAt, undefined,
    'director resolution cannot schedule a recycled foreign occupant for despawn');
  f.runtime.dispose();
});

test('return grace retains charged pods and cues after weather clears, then closes without late payment', () => {
  const f = fixture(); f.runtime.begin();
  tickAt(f, 11, 0.1);
  const run = f.runtime.active, row = run.ledger.samples[0];
  for (let i = 1; i <= 16; i++) chargeSample(run.ledger, row.id, { dt: 0.25, exposure: 1, simTime: 11 + i * 0.25 });
  const view = tickAt(f, run.plan.durationS + 1);
  assert.equal(run.phase, 'expedition'); assert.equal(view.frame.phase, 'finished');
  assert.equal(view.active, true); assert.equal(row.status, 'charged');
  assert.equal(f.fieldsOwner._kernel.size, 0);
  const cues = buildStormCueFrame(view.frame, { expeditionActive: view.active, forecast: view.forecast, samples: view.samples,
    extraction: view.extraction, objective: view.objective });
  assert.equal(cues.active, true); assert.equal(cues.extraction.active, true);
  assert.equal(cues.frontCount, 0); assert.equal(cues.weatherActive, false);
  tickAt(f, run.returnDeadline + 0.1);
  assert.equal(run.phase, 'finished'); assert.equal(row.status, 'lost');
  assert.equal(f.runtime.view.active, false); assert.equal(f.state.player.credits, 0);
  f.runtime.dispose();
});

test('a charged pod arriving at or after the return deadline cannot settle', () => {
  for (const delay of [0, 0.1]) {
    const f = fixture(); f.runtime.begin(); tickAt(f, 11);
    const run = f.runtime.active, row = run.ledger.samples[0];
    for (let i = 1; i <= 16; i++) chargeSample(run.ledger, row.id, { dt: 0.25, exposure: 1, simTime: 11 + i * 0.25 });
    const receiver = sampleStorm(run.plan, run.returnDeadline + delay).extraction;
    const pod = sampleBody(run.ledger, row.id, f.state);
    f.player.pos.copy(receiver); pod.pos.copy(receiver); pod.vel.set(0, 0, 0);
    assert.equal(row.status, 'charged');
    tickAt(f, run.returnDeadline + delay);
    assert.equal(run.phase, 'finished'); assert.equal(row.status, 'lost');
    assert.equal(f.state.player.credits, 0); assert.equal(f.state.player.cargo.usedVolume, 0);
    assert.equal(pod.alive, false); assert.equal(f.fieldsOwner._kernel.size, 0);
    f.runtime.dispose();
  }
});

test('pause, reversed clock, sector exit, death and new game cannot leave active current or stale payouts', () => {
  for (const boundary of ['sector:exit', 'player:death', 'game:new']) {
    const f = fixture(); f.runtime.begin(); tickAt(f, 11);
    const run = f.runtime.active, saved = copy(f.runtime.snapshot());
    f.state.mode = 'pause'; tickAt(f, 30);
    assert.deepEqual(f.runtime.snapshot(), saved, 'pause cannot advance admission or charge');
    f.state.mode = 'flight'; f.bus.emit(boundary, {});
    assert.equal(f.fieldsOwner._kernel.size, 0);
    assert.ok(run.bodies.every(ref => !f.state.entities.get(ref.id)?.alive));
    assert.equal(f.state.player.credits, 0);
    assert.equal(f.runtime.active?.phase ?? 'finished', 'finished');
    f.runtime.dispose();
  }
  const f = fixture(); f.runtime.begin(); tickAt(f, 20); tickAt(f, 19);
  assert.equal(f.runtime.active.outcome, 'clock_reversed');
  assert.equal(f.fieldsOwner._kernel.size, 0); f.runtime.dispose();
});

test('New Game supersedes an interrupted restore and permits a fresh expedition', () => {
  const f = fixture(); f.runtime.begin(); tickAt(f, 11);
  f.bus.emit('save:restoring', {});
  assert.equal(f.runtime.ready(), false);
  f.bus.emit('game:new', {});
  assert.equal(f.runtime.ready(), true);
  assert.equal(f.runtime.begin().ok, true);
  tickAt(f, 30);
  assert.equal(f.runtime.active.phase, 'expedition'); assert.equal(f.fieldsOwner._kernel.size, 2);
  f.runtime.dispose();
});

test('synchronous cargo listeners may close a run or replace the pilot without paying a new owner', () => {
  const first = fixture(); first.runtime.begin(); tickAt(first, 11);
  const run = first.runtime.active, row = run.ledger.samples[0];
  for (let i = 1; i <= 16; i++) chargeSample(run.ledger, row.id, { dt: 0.25, exposure: 1, simTime: 11 + i * 0.25 });
  const receiver = sampleStorm(run.plan, 20).extraction;
  first.player.pos.copy(receiver);
  const pod = sampleBody(run.ledger, row.id, first.state); pod.pos.copy(receiver); pod.vel.set(0, 0, 0);
  first.bus.on('cargo:changed', () => first.runtime.finish('withdrawn'));
  tickAt(first, 20);
  assert.equal(row.status, 'extracted'); assert.equal(first.state.player.credits, 60);
  assert.equal(run.phase, 'finished'); assert.equal(first.state.stormChase.history.length, 1);
  assert.equal(first.fieldsOwner._kernel.size, 0); first.runtime.dispose();

  const second = oneSample(), oldPlayer = second.state.player;
  second.bus.on('cargo:changed', () => {
    const replacement = createGameState(137);
    second.state.player = replacement.player;
    second.bus.emit('game:new', {});
  });
  const result = extractSample(second.ledger, 'a', second.options);
  assert.equal(result.reason, 'owner_context_changed');
  assert.equal(second.state.player.credits, 0); assert.equal(second.state.player.cargo.usedVolume, 0);
  assert.equal(oldPlayer.cargo.items.cmdty_crystal_lumin, 2);
  assert.equal(second.ledger.samples[0].status, 'lost'); assert.equal(second.pod.alive, false);
  second.runtime.dispose();
});

test('a deferred finish or owner exception from an outgoing settlement cannot close the restored run', () => {
  for (const throwAfterRestore of [false, true]) {
    const f = fixture(); f.runtime.begin(); tickAt(f, 11);
    const outgoing = f.runtime.active, row = outgoing.ledger.samples[0];
    for (let i = 1; i <= 16; i++) chargeSample(outgoing.ledger, row.id, { dt: 0.25, exposure: 1, simTime: 11 + i * 0.25 });
    const receiver = sampleStorm(outgoing.plan, 20).extraction;
    const pod = sampleBody(outgoing.ledger, row.id, f.state);
    f.player.pos.copy(receiver); pod.pos.copy(receiver); pod.vel.set(0, 0, 0);
    let restored;
    f.bus.on('cargo:changed', () => {
      f.runtime.finish('withdrawn');
      assert.equal(f.runtime.restore(copy(f.runtime.snapshot())), true);
      restored = f.runtime.active;
    });
    if (throwAfterRestore) {
      const original = f.cargoOwner.addCargo.bind(f.cargoOwner);
      f.cargoOwner.addCargo = (...args) => { original(...args); throw new Error('owner interrupted after restore'); };
    }
    tickAt(f, 20);
    assert.ok(restored); assert.notEqual(restored, outgoing); assert.equal(f.runtime.active, restored);
    assert.equal(restored.phase, 'expedition'); assert.equal(restored.ledger.closed, false);
    assert.equal(restored.ledger.samples[0].status, 'lost', 'an interrupted receipt stays terminal');
    assert.equal(f.state.player.credits, 0); assert.equal(f.state.player.cargo.items.cmdty_crystal_lumin, 1);
    assert.equal(f.state.stormChase.history.length, 0, 'old settlement cannot finish the replacement run');
    const other = sampleBody(restored.ledger, restored.ledger.samples[1].id, f.state);
    assert.ok(other?.alive, 'unconsumed restored sample remains physical');
    tickAt(f, 20.1);
    assert.equal(f.runtime.active, restored); assert.equal(restored.phase, 'expedition');
    assert.equal(f.fieldsOwner._kernel.size, 2); assert.equal(other.alive, true);
    f.runtime.dispose();
  }
});

test('recycled pod IDs preserve new-generation custody and cleanup across ordinary restore and Continue', () => {
  for (const mode of ['direct', 'continue']) {
    const f = fixture(); f.runtime.begin(); tickAt(f, 11);
    const oldRun = f.runtime.active;
    for (const row of oldRun.ledger.samples.slice(0, 2)) {
      for (let i = 1; i <= 16; i++) chargeSample(oldRun.ledger, row.id, { dt: 0.25, exposure: 1, simTime: 11 + i * 0.25 });
      const pod = sampleBody(oldRun.ledger, row.id, f.state), receiver = sampleStorm(oldRun.plan, 20).extraction;
      pod.pos.copy(receiver); pod.vel.set(0, 0, 0); f.player.pos.copy(receiver);
    }
    tickAt(f, 20); f.coreOwner.lifetimeSweep(1 / 60, f.state);
    const pocket = STORM_PATTERNS.find(pattern => pattern.id === oldRun.plan.patternId).pockets[1];
    tickAt(f, pocket.opensAtS + 0.1);
    const newRows = oldRun.ledger.samples.slice(2, 4);
    for (const row of newRows) {
      assert.equal(row.status, 'drifting');
      const prior = oldRun.ledger.samples.slice(0, 2).find(old => old.bodyId === row.bodyId);
      assert.ok(prior, 'actual core allocator reuses a delivered pod ID');
      assert.notEqual(prior.bodyGeneration, row.bodyGeneration);
    }
    const raw = copy(f.runtime.snapshot());
    if (mode === 'direct') assert.equal(f.runtime.restore(raw), true);
    else {
      const saver = Object.create(save); Object.assign(saver, f.ctx);
      const actors = copy(saver._serializeEntities());
      f.bus.emit('save:restoring', {}); f.runtime.deserialize(raw);
      for (const body of [...f.state.entityList]) f.helpers.removeEntity(body.id, { immediate: true });
      const remap = new Map(); saver._spawnPlayer(actors.player, remap);
      let next = 0;
      do { next = saver._spawnPersistentEntities(actors.persistent, remap, { startIndex: next, clearStale: false }); }
      while (next < actors.persistent.length);
      f.state.sessionEntityIdRemap = remap; f.bus.emit('save:loaded', {});
    }
    const restored = f.runtime.active;
    const pods = restored.ledger.samples.slice(2, 4).map(row => sampleBody(restored.ledger, row.id, f.state));
    assert.ok(pods.every(body => body?.alive));
    for (const body of pods) assert.ok(restored.bodies.some(ref => ref.id === body.id && ref.generation === body.occupantGeneration));
    assert.ok(restored.ledger.samples.slice(0, 2).every(row => row.status === 'extracted'));
    f.runtime.finish('withdrawn');
    assert.ok(pods.every(body => !body.alive), 'restored generation pairs remain cleanup-owned');
    assert.equal(f.state.player.credits, 120); assert.equal(f.state.player.cargo.items.cmdty_crystal_lumin, 2);
    f.runtime.dispose();
  }
});

for (const seed of SEEDS) {
  test(`seed ${seed}: actual save actor rebuild remaps custody without respawning or reviving a missing pod`, () => {
    const f = fixture(seed); f.runtime.begin(); tickAt(f, 11, 0.1);
    const run = f.runtime.active, row = run.ledger.samples[0], missing = run.ledger.samples[1];
    chargeSample(run.ledger, row.id, { dt: 0.25, exposure: 1, simTime: 12 });
    const featureSnapshot = copy(f.runtime.serialize());
    const saver = Object.create(save); Object.assign(saver, f.ctx);
    const entitySnapshot = copy(saver._serializeEntities());
    const oldId = row.bodyId, oldGeneration = row.bodyGeneration, missingId = missing.bodyId;
    assert.ok(entitySnapshot.persistent.some(body => body.id === oldId));
    assert.equal(entitySnapshot.persistent.find(body => body.id === oldId).occupantGeneration, undefined,
      'actual save projection deliberately excludes runtime occupant generations');
    assert.equal(f.fieldsOwner.serialize().fields.length, 0, 'diagnostic field envelopes must not leak into durable field saves');
    f.bus.emit('save:restoring', {});
    f.runtime.deserialize(featureSnapshot);
    for (const entity of [...f.state.entityList]) f.helpers.removeEntity(entity.id, { immediate: true });
    const remap = new Map();
    saver._spawnPlayer(entitySnapshot.player, remap);
    // Force the actual save owner to remap one pod. The numeric old ID now belongs to
    // unrelated world matter and cannot be claimed or retired by this expedition.
    const foreign = f.helpers.spawnEntity({ id: oldId, type: 'wreck', pos: { x: 0, z: 0 }, data: {} });
    const persistent = entitySnapshot.persistent.filter(body => body.id !== missingId);
    let next = 0;
    do { next = saver._spawnPersistentEntities(persistent, remap, { startIndex: next, clearStale: false }); }
    while (next < persistent.length);
    const countBeforeRestore = f.state.entities.size;
    f.state.sessionEntityIdRemap = remap;
    f.bus.emit('save:loaded', {});
    const restored = f.runtime.active, rebound = restored.ledger.samples[0];
    assert.equal(rebound.status, 'drifting'); assert.equal(rebound.charge, row.charge);
    assert.equal(rebound.bodyId, remap.get(String(oldId))); assert.notEqual(rebound.bodyId, oldId);
    assert.notEqual(rebound.bodyGeneration, oldGeneration);
    assert.equal(restored.ledger.samples[1].status, 'lost');
    assert.equal(f.state.entities.size, countBeforeRestore, 'feature restore never calls spawn');
    assert.equal(foreign.alive, true); assert.ok(sampleBody(restored.ledger, rebound.id, f.state));
    assert.deepEqual(sampleStorm(restored.plan, 20), sampleStorm(run.plan, 20));
    tickAt(f, 12.1);
    assert.equal(f.fieldsOwner._kernel.size, 2);
    f.runtime.finish('withdrawn');
    assert.equal(foreign.alive, true); assert.equal(f.fieldsOwner._kernel.size, 0);
    assert.equal([...f.state.entities.values()].filter(body => body.alive && body.data?.stormChase?.expeditionId === restored.id).length, 0,
      'all current restored occupants retire, while stale numeric refs never authorize removing foreign matter');
    assert.equal(f.state.player.credits, 0); f.runtime.dispose();
  });
}

test('body admission rejects nonphysical, fixed, docked, dead, protected and malformed recipients', () => {
  const body = makeEntity({ id: 9, type: 'payload', mass: 40, radius: 6, pos: { x: 0, z: 0 }, data: {} });
  for (const replacement of [{ type: 'station' }, { type: 'projectile' }, { alive: false },
    { flags: { docked: true } }, { physicsBody: false }, { physicsBody: { dynamic: false } },
    { data: { stormProtected: true } }, { mass: NaN }, { pos: { x: Infinity, z: 0 } }]) {
    assert.equal(stormBodyEligibility({ ...body, ...replacement }).eligible, false, JSON.stringify(replacement));
  }
});

test('real cargo and economy owners settle a physical charged pod exactly once, including reentrant listeners', () => {
  const f = oneSample();
  assert.equal(extractionQuote(f.ledger, 'a', f.options).ok, true);
  let nested, events = 0;
  f.bus.on('cargo:changed', () => { events++; nested = extractSample(f.ledger, 'a', f.options); });
  const result = extractSample(f.ledger, 'a', f.options);
  assert.equal(result.ok, true); assert.equal(nested.ok, false); assert.equal(events, 1);
  assert.equal(f.state.player.cargo.items.cmdty_crystal_lumin, 2);
  assert.equal(f.state.player.cargo.usedVolume, 2); assert.equal(f.state.player.credits, 120);
  assert.equal(f.pod.alive, false); assert.equal(f.ledger.samples[0].status, 'extracted');
  assert.equal(extractSample(f.ledger, 'a', f.options).ok, false);
  const recovered = restoreSampleLedger(JSON.parse(JSON.stringify(snapshotSampleLedger(f.ledger))), { state: f.state });
  assert.equal(extractSample(recovered, 'a', f.options).ok, false);
  assert.equal(f.state.player.credits, 120); f.runtime.dispose();
});

test('a full hold, excessive relative speed and absent pilot leave the physical sample recoverable', () => {
  const f = oneSample(137, 3);
  f.state.player.cargo.capVolume = 2;
  assert.equal(extractSample(f.ledger, 'a', f.options).reason, 'hold_full');
  assert.equal(f.pod.alive, true); assert.equal(f.ledger.samples[0].status, 'charged');
  f.state.player.cargo.capVolume = 40; f.pod.vel.x = 12.1;
  assert.equal(extractionQuote(f.ledger, 'a', f.options).reason, 'relative_speed_too_high');
  f.pod.vel.x = 0; f.state.ui.docked = true;
  assert.equal(extractionQuote(f.ledger, 'a', f.options).reason, 'pilot_unavailable');
  f.state.ui.docked = false;
  f.pod.vel.x = 0; f.player.pos.x += 200;
  assert.equal(extractionQuote(f.ledger, 'a', f.options).reason, 'pilot_outside_receiver');
  assert.equal(f.state.player.credits, 0); assert.equal(f.state.player.cargo.usedVolume, 0);
  f.runtime.dispose();
});

test('lost bodies, recycled IDs, interrupted settlement and repeated charge ticks cannot mint samples', () => {
  const f = oneSample();
  const saved = snapshotSampleLedger(f.ledger);
  f.pod.occupantGeneration++;
  assert.deepEqual(observeSampleBodies(f.ledger, f.state), ['a']);
  assert.equal(sampleBody(f.ledger, 'a', f.state), null);
  assert.equal(restoreSampleLedger(saved, { state: f.state }).samples[0].status, 'lost');
  saved.samples[0].status = 'settling';
  assert.equal(restoreSampleLedger(saved).samples[0].status, 'lost');
  const ledger = createSampleLedger({ expeditionId: 'charge', samples: [{ id: 'b', chargeSeconds: 2 }] });
  const pod = f.helpers.spawnEntity({ type: 'payload', pos: { x: 0, z: 0 }, data: {} });
  bindSampleBody(ledger, 'b', pod);
  chargeSample(ledger, 'b', { dt: 0.25, exposure: 1, simTime: 1 });
  const charge = ledger.samples[0].charge;
  for (let i = 0; i < 20; i++) chargeSample(ledger, 'b', { dt: 1000, exposure: 1, simTime: 1 });
  assert.equal(ledger.samples[0].charge, charge);
  finishSampleLedger(ledger, 'left', 3); assert.equal(finishSampleLedger(ledger, 'again', 4), false);
  assert.equal(bindSampleBody(ledger, 'b', pod), false);
  assert.equal(loseSample(ledger, 'b', 'again', 5), false); f.runtime.dispose();
});

test('forecast cues retain exact geometry and non-color signs under both accessibility settings', () => {
  const plan = createStormPlan({ seed: 4242 }), frame = sampleStorm(plan, 40), future = forecastStorm(plan, 40, 8);
  const original = JSON.stringify(frame), out = createStormCueBuffer();
  const cues = buildStormCueFrame(frame, { forecast: future, settings: { video: { motionReduce: true, flashReduce: true } } }, out);
  assert.equal(cues, out); assert.equal(cues.active, true); assert.equal(cues.reducedMotion, true); assert.equal(cues.reducedFlash, true);
  assert.equal(cues.flashRateHz, 0); assert.equal(cues.cameraShake, 0); assert.equal(cues.particleCount, 0);
  assert.equal(cues.fronts[0].toothCount, 1); assert.equal(cues.fronts[1].toothCount, 2);
  near(cues.eye.radius, frame.eye.radius); near(cues.fronts[0].radius, frame.fronts[0].radius);
  assert.equal(cues.forecastSeconds, 8); assert.ok(cues.arrowCount <= STORM_CUE_LIMITS.arrows);
  assert.equal(JSON.stringify(frame), original); assert.equal(buildStormCueFrame(null, {}, out).active, false);
});

test('encounter module builds with the real catalog and only offers a deliberate non-starter entry', () => {
  const catalog = buildEncounterCatalog([encounter]);
  assert.equal(catalog[encounter.trigger.id].script, 'selfRegistered');
  const f = fixture();
  assert.equal(stormChaseEntry(f.state).ok, true);
  f.state.world.currentSectorId = 'sector_helios_prime';
  assert.equal(f.runtime.begin().reason, 'wrong_sector');
  assert.equal(f.state.entities.size, 1); assert.equal(f.fieldsOwner._kernel.size, 0); f.runtime.dispose();
});

for (const seed of SEEDS) {
  test(`seed ${seed}: production adapter uses field, physics and lifetime owners with bounded source bodies`, () => {
    const f = fixture(seed);
    const begin = f.runtime.begin({ patternId: 'lee_arc' });
    assert.equal(begin.ok, true);
    const origin = sectorGlobalOrigin(STORM_CHASE_SITE.sectorId);
    assert.ok(begin.plan.origin.z > origin.z - 2500 && begin.plan.origin.z < origin.z + 2500);
    assert.equal(sectorMembershipAtGlobal(begin.plan.origin), STORM_CHASE_SITE.sectorId);
    assert.equal(f.fieldsOwner._kernel.size, 2);
    for (const field of f.fieldsOwner._kernel.list()) { assert.equal(field.strength, 0); assert.equal(field.damping, 0); }
    const run = f.runtime.active, frame = sampleStorm(run.plan, 30);
    const body = f.state.entities.get(run.bodies.find(ref => ref.role === 'debris').id);
    body.pos.copy(pointAt(frame, frame.fronts[0].radius, frame.fronts[0].gapAngle + Math.PI));
    const beforePos = body.pos.clone(), beforeVel = body.vel.clone();
    f.state.simTime = 30; f.state.tick = 1800; f.runtime.update(1 / 60);
    assert.deepEqual(body.pos, beforePos); assert.deepEqual(body.vel, beforeVel);
    const command = consumePhysicsCommand(body);
    assert.ok(command?.impulses?.length > 0, 'the actual physicsAuthority receives current, with no direct velocity write');
    assert.ok(command.impulses.every(impulse => magnitude(impulse) <= STORM_LIMITS.maxImpulse + 1e-8));
    f.runtime.update(1 / 60); assert.equal(consumePhysicsCommand(body), null, 'same tick cannot queue weather twice');
    assert.ok(run.bodies.length <= STORM_CHASE_SITE.maxOwnedBodies);
    assert.ok(run.ledger.samples.some(row => row.bodyId));
    const foreign = f.helpers.spawnEntity({ type: 'wreck', pos: body.pos, data: {} });
    f.runtime.finish('withdrawn');
    assert.equal(f.fieldsOwner._kernel.size, 0); assert.equal(foreign.alive, true);
    assert.ok(run.bodies.every(ref => !f.state.entities.get(ref.id)?.alive));
    assert.equal(f.runtime.finish('twice'), false);
    assert.equal(f.state.player.credits, 0); f.runtime.dispose();
  });
}
