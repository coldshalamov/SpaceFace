import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { economy } from '../src/systems/economy.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import blackboxEncounter from '../src/data/encounters/8102-pro-five-derelictExpedition.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import {
  generateExpeditionLayout, validateExpeditionLayout, EXPEDITION_VARIANTS,
  MAX_EXPEDITION_BODIES,
} from '../src/features/derelictExpedition/layout.js';
import {
  createExpeditionRecord, acceptExpedition, abandonExpedition, resumeExpedition,
  markBodyMaterialized, observeExpeditionBody, suspendExpedition, stepExpedition,
  commitExpeditionReward, serializeExpeditionRecord, normalizeExpeditionRecord,
  EXPEDITION_LIMITS,
} from '../src/features/derelictExpedition/model.js';
import {
  createDerelictExpeditionSystem, getExpeditionSiteLayout, BLACKBOX_RUNS_SITE,
  BLACKBOX_RUNS_RUNTIME, placeExpeditionHudMarker, expeditionEntitySpec,
} from '../src/features/derelictExpedition/index.js';

import {
  sampleExpeditionHazards, pointInExpeditionJet, expeditionImpulse, EXPEDITION_CHOREOGRAPHY,
} from '../src/features/derelictExpedition/choreography.js';
import {
  buildExpeditionPresentation, authoredExpeditionBodyData, expeditionMilestoneEvents,
} from '../src/features/derelictExpedition/presentation.js';
import { WRECK_AFTERMATH_PLACE_FILE_BY_ID } from '../src/data/wreckAftermathDressing.js';

// These tests execute the existing core entity/lifetime, economy credit, attachment,
// damage and physics-command owners. The native Rapier joint port is represented by
// its small contract below; no GPU or native motion/play acceptance is claimed.
// The scoped upload omits modelTruthCensus.generated.js and the generated en-US
// localization catalog (>1 MiB). Remote execution redirected those exact imports
// to byte-exact files fetched from the commissioned base, outside this source
// candidate. A full checkout needs no loader.
const SEEDS = [4242, 19837];
const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));
const length = point => Math.hypot(point.x, point.z);
const near = (a, b, epsilon = 1e-7) => Math.abs(a - b) <= epsilon;
const snapshot = body => ({
  pos: { ...body.position }, vel: { x: 0, z: 0 }, rot: body.rot || 0,
  angVel: 0, hull: body.hull, integrity: 1,
});

function physicalHost(seed = 4242, options = {}) {
  const state = createGameState(seed);
  const bus = createBus();
  const events = [], grants = [], spawned = [], cuts = [], physicsCommands = [];
  state.mode = 'flight';
  state.world.currentSectorId = BLACKBOX_RUNS_SITE.sectorId;
  const helpers = {};
  const owners = new Map();
  const ctx = { state, bus, helpers, registry: { get: name => owners.get(name) || null } };
  const coreOwner = Object.create(core);
  coreOwner.init(ctx);
  owners.set('core', coreOwner);
  const economyOwner = Object.create(economy);
  if (options.economy !== false) {
    economyOwner.init(ctx);
    owners.set('economy', economyOwner);
  }
  const nativeAttachments = new Map();
  helpers.combatPhysics = {
    createAttachment(input) {
      const handle = { id: input.attachmentId, attachmentId: input.attachmentId,
        ownerId: input.ownerId, targetId: input.targetId };
      nativeAttachments.set(input.attachmentId, handle);
      return handle;
    },
    cutAttachment(input) { cuts.push(clone(input)); nativeAttachments.delete(input.attachmentId); return true; },
    setAttachmentReel() { return true; },
    getAttachmentTelemetry(input) {
      return nativeAttachments.has(input.attachmentId) ? { tension: 0, impulse: 0, yank: 0 } : null;
    },
  };
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const attachments = createAttachmentService({ state, bus, helpers, catalog });
  const damage = createDamageRouter({ state, bus, helpers, catalog }, { schedule() {} });
  const kernel = { attachments, routeDamage: damage };
  if (options.attachments !== false) {
    owners.set('actions', { kernel });
    owners.set('combat', { kernel });
  }
  const layout = getExpeditionSiteLayout(seed);
  const player = helpers.spawnEntity({
    type: 'ship', isPlayer: true, pos: layout.entry.position || layout.entry,
    mass: 24, radius: 5, hull: 300, hullMax: 300,
    physicsBody: { schemaVersion: 1, mass: 24, radius: 5, shape: 'ball', dynamic: true },
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  bus.on('entity:spawned', payload => spawned.push(payload.id));
  bus.on('credits:changed', payload => grants.push({ ...clone(payload), amount: payload.delta }));
  bus.on('economy:grantCredits', payload => events.push(['economy:grantCredits', clone(payload)]));
  for (const name of ['toast', 'comms:log', 'vfx:spawn', 'audio:cue', 'presentation:cue']) {
    bus.on(name, payload => events.push([name, clone(payload)]));
  }
  const system = createDerelictExpeditionSystem();
  system.init(ctx);
  function tick(seconds = DT) {
    state.simTime += seconds;
    state.tick += Math.max(1, Math.round(seconds / DT));
    system.update(seconds, state);
    // Drain the genuine command membrane at the native owner boundary. The port
    // records admitted forces; it deliberately does not claim Rapier integration.
    for (const entity of state.entityList) {
      const command = consumePhysicsCommand(entity);
      if (command) physicsCommands.push({ tick: state.tick, id: entity.id,
        mass: entity.physicsBody?.mass ?? entity.mass,
        key: entity.data?.derelictExpedition?.key, command: clone(command) });
    }
    coreOwner.lifetimeSweep(seconds, state);
  }
  function advance(seconds, dt = DT) {
    const steps = Math.ceil(seconds / dt);
    for (let i = 0; i < steps; i++) tick(Math.min(dt, seconds - i * dt));
  }
  function status() { return system.getStatus(); }
  function body(key) {
    const id = status().entityIds[key];
    return state.entities.get(id) || null;
  }
  return { state, bus, helpers, system, ctx, player, layout, events, grants, spawned,
    tick, advance, status, body, owners, coreOwner, economyOwner, attachments,
    nativeAttachments, damage, cuts, physicsCommands };
}

function liveRecord(seed = 4242, variant = 0) {
  const layout = generateExpeditionLayout({ seed, variant });
  const record = createExpeditionRecord({ seed, siteId: layout.id || 'blackbox_vesta',
    sectorId: 'sector_vesta_forge', layout });
  assert.equal(acceptExpedition(record), true);
  for (const body of layout.bodies) assert.equal(markBodyMaterialized(record, body.key, snapshot(body)), true);
  return { layout, record };
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
  const t = d2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / d2)) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz));
}

for (const seed of SEEDS) {
  test(`seed ${seed}: three authored variants have deterministic connected tow-clear geometry`, () => {
    for (let variant = 0; variant < 3; variant++) {
      const layout = generateExpeditionLayout({ seed, variant });
      assert.deepEqual(layout, generateExpeditionLayout({ seed, variant }));
      assert.deepEqual(layout, clone(layout), 'layout is finite plain JSON');
      const validation = validateExpeditionLayout(layout);
      assert.equal(validation.ok, true, JSON.stringify(validation));
      assert.equal(layout.compartments.length, 3);
      assert.ok(layout.bodies.length <= MAX_EXPEDITION_BODIES);
      assert.equal(new Set(layout.bodies.map(b => b.key)).size, layout.bodies.length);
      assert.ok(layout.safeExterior.length >= 4);
      for (let i = 1; i < layout.safeExterior.length; i++) {
        for (const body of layout.bodies) {
          const clearance = distanceToSegment(body.position, layout.safeExterior[i - 1], layout.safeExterior[i]);
          assert.ok(clearance + 1e-6 >= body.collisionRadius + 22,
            `${variant}/${body.key} obstructs return sweep at segment ${i}: ${clearance}`);
        }
      }
    }
    assert.equal(EXPEDITION_VARIANTS.length, 3);
  });
}

test('layout origin and orientation preserve route clearance without mutating the base', () => {
  const base = generateExpeditionLayout({ seed: 4242, variant: 1 });
  const rotated = generateExpeditionLayout({ seed: 4242, variant: 1,
    origin: { x: 14500, z: -7300 }, rotation: Math.PI * 0.71 });
  assert.equal(validateExpeditionLayout(rotated).ok, true);
  assert.equal(rotated.bodies.length, base.bodies.length);
  for (let i = 0; i < base.bodies.length; i++) {
    const a = base.bodies[i].position, b = rotated.bodies[i].position;
    const c = Math.cos(Math.PI * 0.71), s = Math.sin(Math.PI * 0.71);
    assert.ok(near(b.x, 14500 + a.x * c - a.z * s));
    assert.ok(near(b.z, -7300 + a.x * s + a.z * c));
  }
});

function dockObservation(record, kind = 'blackbox', extras = {}) {
  const key = record.cargo[kind].bodyKey;
  return {
    present: true,
    playerPos: { ...record.receiver.position },
    obstacles: { shutter: { opened: true, method: 'tow' }, vent: { opened: true, method: 'gun' },
      ...(kind === 'core' ? { relay: { opened: true, method: 'shove' } } : {}) },
    cargo: { [kind]: { ...record.bodies[key], pos: { ...record.receiver.position },
      vel: { x: 0, z: 0 }, hull: record.bodies[key].hullMax, integrity: 1 } },
    ...extras,
  };
}
function settleModel(record, observation) {
  let result;
  for (let i = 0; i < 11; i++) result = stepExpedition(record, observation, 0.25);
  return result;
}

for (const seed of SEEDS) {
  test(`seed ${seed}: physical return, optional depth and committed reward survive replay`, () => {
    const { layout, record } = liveRecord(seed);
    const primary = dockObservation(record);
    const result = settleModel(record, primary);
    assert.equal(record.primaryComplete, true);
    assert.equal(record.cargo.blackbox.status, 'delivered');
    assert.notEqual(record.cargo.core.status, 'delivered', 'primary success does not invent deeper extraction');
    assert.equal(result.rewardIntents.length, 1);
    const first = commitExpeditionReward(record, result.rewardIntents[0].id);
    assert.ok(first && first.amount > 0);
    assert.equal(commitExpeditionReward(record, first.id), null);
    assert.equal(stepExpedition(record, primary, 10).rewardIntents.length, 0);
    const saved = serializeExpeditionRecord(record);
    const restored = normalizeExpeditionRecord(clone(saved), { layout });
    assert.equal(restored.primaryComplete, true);
    assert.equal(restored.bodies[restored.cargo.blackbox.bodyKey].lifecycle, 'delivered');
    assert.equal(commitExpeditionReward(restored, first.id), null);
    assert.equal(markBodyMaterialized(restored, restored.cargo.blackbox.bodyKey,
      snapshot(layout.bodies.find(b => b.key === restored.cargo.blackbox.bodyKey))), false);
    const coreKey = restored.cargo.core.bodyKey;
    assert.equal(markBodyMaterialized(restored, coreKey, restored.bodies[coreKey]), true);
    const second = settleModel(restored, dockObservation(restored, 'core'));
    assert.equal(restored.phase, 'complete');
    assert.equal(second.rewardIntents.length, 1);
    assert.equal(second.rewardIntents[0].kind, 'core');
    assert.notEqual(second.rewardIntents[0].id, first.id);
    assert.ok(commitExpeditionReward(restored, second.rewardIntents[0].id));
    assert.equal(stepExpedition(restored, dockObservation(restored, 'core'), 30).rewardIntents.length, 0);
  });
}

test('receiver rejects locked access, high-speed fly-through, distant pilot and one huge elapsed sample', () => {
  const { record } = liveRecord();
  const dock = dockObservation(record);
  settleModel(record, { ...dock, obstacles: {} });
  assert.equal(record.cargo.blackbox.status, 'locked');
  assert.equal(Object.keys(record.rewards).length, 0);
  dock.cargo.blackbox.vel.x = 20;
  settleModel(record, dock);
  assert.equal(record.cargo.blackbox.status, 'recovered');
  assert.equal(record.cargo.blackbox.dwellS, 0);
  dock.cargo.blackbox.vel.x = 0;
  const distant = { ...dock, playerPos: { x: record.receiver.position.x + 10000, z: 0 } };
  settleModel(record, distant);
  assert.equal(record.cargo.blackbox.dwellS, 0);
  const oneFrame = stepExpedition(record, dock, 3600);
  assert.equal(oneFrame.rewardIntents.length, 0);
  assert.ok(record.cargo.blackbox.dwellS <= 0.25);
  assert.notEqual(record.cargo.blackbox.status, 'delivered');
  assert.equal(settleModel(record, dock).rewardIntents.length, 1);
});

test('idle time and false cargo reports cannot unlock or extract unmaterialized cargo', () => {
  const layout = generateExpeditionLayout({ seed: 4242 });
  const record = createExpeditionRecord({ seed: 4242, layout });
  const dock = dockObservation(record);
  stepExpedition(record, dock, 1e6);
  assert.equal(record.accepted, false);
  assert.equal(record.pressure, 0);
  acceptExpedition(record);
  for (let i = 0; i < 20; i++) stepExpedition(record, { present: true }, 1e6);
  assert.equal(record.pressure, 100);
  assert.equal(record.cargo.blackbox.status, 'locked');
  assert.equal(record.cargo.core.status, 'locked');
  settleModel(record, dock);
  assert.equal(record.cargo.blackbox.status, 'available');
  assert.equal(record.bodies[record.cargo.blackbox.bodyKey].lifecycle, 'unspawned');
  assert.equal(Object.keys(record.rewards).length, 0);
});

test('abandonment preserves obstacle work, motion and pressure; missing cargo remains lost', () => {
  const { layout, record } = liveRecord(19837);
  const key = record.cargo.blackbox.bodyKey;
  const body = record.bodies[key];
  observeExpeditionBody(record, key, { ...body, pos: { x: body.pos.x + 37, z: body.pos.z - 19 }, vel: { x: 4, z: -2 } });
  stepExpedition(record, { obstacles: { shutter: { opened: true, method: 'pin' } } }, 15);
  const oldPosition = { ...record.bodies[key].pos };
  assert.equal(abandonExpedition(record), true);
  const pressure = record.pressure;
  stepExpedition(record, { present: false }, 20);
  assert.ok(record.pressure > pressure);
  const snapshots = Object.fromEntries(Object.entries(record.bodies).map(([k, b]) => [k, { ...b }]));
  delete snapshots[key];
  suspendExpedition(record, snapshots);
  assert.equal(record.bodies[key].lifecycle, 'lost');
  assert.equal(record.cargo.blackbox.status, 'lost');
  assert.deepEqual(record.bodies[key].pos, oldPosition);
  const restored = normalizeExpeditionRecord(serializeExpeditionRecord(record), { layout });
  assert.equal(resumeExpedition(restored), true);
  assert.equal(restored.obstacles.shutter.opened, true);
  assert.equal(markBodyMaterialized(restored, key, snapshot(layout.bodies.find(b => b.key === key))), false);
  assert.equal(settleModel(restored, dockObservation(restored)).rewardIntents.length, 0);
  assert.equal(restored.cargo.blackbox.status, 'lost');
});

test('recovery snapshot has no runtime pointers and losing a body cannot be undone by load', () => {
  const { layout, record } = liveRecord();
  const key = record.cargo.core.bodyKey;
  const observed = { ...record.bodies[key], pos: { x: 901, z: 407 }, vel: { x: -7, z: 2.5 }, rot: 1.2, angVel: -0.3 };
  observeExpeditionBody(record, key, observed);
  const before = serializeExpeditionRecord(record);
  const restored = normalizeExpeditionRecord(clone(before), { layout });
  assert.equal(restored.bodies[key].lifecycle, 'suspended');
  assert.deepEqual(restored.bodies[key].pos, observed.pos);
  assert.deepEqual(restored.bodies[key].vel, observed.vel);
  assert.equal(markBodyMaterialized(restored, key, restored.bodies[key]), true);
  observeExpeditionBody(restored, key, null);
  const terminal = normalizeExpeditionRecord(serializeExpeditionRecord(restored), { layout });
  assert.equal(terminal.bodies[key].lifecycle, 'lost');
  assert.equal(terminal.cargo.core.status, 'lost');
  assert.equal(markBodyMaterialized(terminal, key, observed), false);
  assert.deepEqual(before, clone(before));
  const corrupt = clone(before);
  delete corrupt.bodies[key];
  corrupt.bodies.foreign = { lifecycle: 'live', pos: { x: 0, z: 0 }, hull: 999999 };
  const normalized = normalizeExpeditionRecord(corrupt, { layout });
  assert.equal(normalized.bodies[key].lifecycle, 'lost');
  assert.equal('foreign' in normalized.bodies, false);
});

test('a reload invalidates partially observed receiver dwell and cannot duplicate pending reward', () => {
  const { layout, record } = liveRecord();
  const dock = dockObservation(record);
  for (let i = 0; i < 8; i++) stepExpedition(record, dock, 0.25);
  assert.equal(record.cargo.blackbox.dwellS, 2);
  const restored = normalizeExpeditionRecord(serializeExpeditionRecord(record), { layout });
  const key = restored.cargo.blackbox.bodyKey;
  assert.equal(restored.cargo.blackbox.dwellS, 0);
  markBodyMaterialized(restored, key, restored.bodies[key]);
  assert.equal(stepExpedition(restored, dockObservation(restored), 0.25).rewardIntents.length, 0);
  const pending = settleModel(restored, dockObservation(restored)).rewardIntents;
  assert.equal(pending.length, 1);
  const loadedPending = normalizeExpeditionRecord(serializeExpeditionRecord(restored), { layout });
  assert.deepEqual(stepExpedition(loadedPending, { present: false }, 0).rewardIntents, pending);
  assert.ok(commitExpeditionReward(loadedPending, pending[0].id));
  const loadedCommitted = normalizeExpeditionRecord(serializeExpeditionRecord(loadedPending), { layout });
  assert.equal(stepExpedition(loadedCommitted, {}, 0).rewardIntents.length, 0);
  // Removing the journal from a damaged save is fail-closed, never another payout.
  const withoutJournal = serializeExpeditionRecord(loadedCommitted);
  withoutJournal.rewards = {};
  assert.equal(stepExpedition(normalizeExpeditionRecord(withoutJournal, { layout }), {}, 0).rewardIntents.length, 0);
});

test('invalid physical measurements fail closed rather than being interpreted as docked cargo', () => {
  const { layout, record } = liveRecord();
  const malformed = dockObservation(record);
  malformed.cargo.blackbox.vel = { x: NaN, z: 0 };
  assert.equal(settleModel(record, malformed).rewardIntents.length, 0);
  const raw = serializeExpeditionRecord(liveRecord().record);
  const key = raw.cargo.core.bodyKey;
  delete raw.bodies[key].hull;
  const restored = normalizeExpeditionRecord(raw, { layout });
  assert.equal(restored.bodies[key].lifecycle, 'lost');
  assert.equal(restored.cargo.core.status, 'lost');
});

test('restoring the chosen variant reconstructs exactly the original seeded layout', () => {
  for (const seed of SEEDS) {
    const original = generateExpeditionLayout({ seed });
    const restored = generateExpeditionLayout({ seed, variant: original.variant,
      origin: original.origin, rotation: original.rotation });
    assert.deepEqual(restored, original);
  }
});

test('route validation rejects a real blocked return lane, disconnected receiver and overlapping cargo', () => {
  const source = generateExpeditionLayout({ seed: 4242 });
  const blocked = clone(source);
  const wall = blocked.bodies.find(body => body.anchored && body.role === 'hull');
  const lane = blocked.safeExterior;
  wall.position = { x: (lane[2].x + lane[3].x) / 2, z: (lane[2].z + lane[3].z) / 2 };
  assert.equal(validateExpeditionLayout(blocked).ok, false);
  const disconnected = clone(source);
  disconnected.receiver.position.x -= 100;
  assert.equal(validateExpeditionLayout(disconnected).ok, false);
  const overlapping = clone(source);
  const box = overlapping.bodies.find(body => body.key === 'blackbox');
  const core = overlapping.bodies.find(body => body.key === 'core');
  box.position = { ...core.position };
  assert.equal(validateExpeditionLayout(overlapping).ok, false);
});

test('pressure choreography warns before each jet, keeps a quiet window, and excludes the outer tow tube', () => {
  const { layout, record } = liveRecord(4242);
  for (const pressure of [0, 50, 100]) {
    record.pressure = pressure;
    let previous = 'quiet';
    let warningSamples = 0, activations = 0;
    for (let elapsedS = 0; elapsedS < 3 * 26; elapsedS += 0.25) {
      record.elapsedS = elapsedS;
      const hazards = sampleExpeditionHazards(record, layout);
      assert.ok(hazards.vent.minimumQuietS >= 8);
      if (hazards.vent.phase === 'warning') warningSamples++;
      if (hazards.vent.phase === 'active' && previous !== 'active') {
        assert.equal(previous, 'warning');
        assert.ok(warningSamples * 0.25 >= EXPEDITION_CHOREOGRAPHY.ventWarningS);
        activations++;
      }
      if (hazards.vent.phase === 'quiet') warningSamples = 0;
      previous = hazards.vent.phase;
      for (const point of layout.safeExterior) assert.equal(pointInExpeditionJet(point, hazards.vent, 7), false);
    }
    assert.equal(activations, 3);
  }
  record.obstacles.vent.opened = true;
  record.elapsedS = 25;
  assert.equal(sampleExpeditionHazards(record, layout).vent.phase, 'quiet');
  const quick = liveRecord(4242);
  stepExpedition(quick.record, dockObservation(quick.record), 0.25);
  assert.equal(quick.record.cargo.blackbox.status, 'recovered');
  let racks = sampleExpeditionHazards(quick.record, quick.layout).collapse;
  assert.equal(racks[0].warningAtS, quick.record.cargo.blackbox.recoveredAt,
    'physical recovery changes the return immediately, including for a fast pilot');
  assert.equal(racks[0].releaseAtS - racks[0].warningAtS, EXPEDITION_CHOREOGRAPHY.collapseWarningS);
  assert.equal(racks[0].warning, true);
  assert.equal(racks[1].warning, false, 'optional return remains a separate escalation');
  stepExpedition(quick.record, dockObservation(quick.record, 'core'), 0.25);
  racks = sampleExpeditionHazards(quick.record, quick.layout).collapse;
  assert.equal(racks[1].warningAtS, quick.record.cargo.core.recoveredAt);
  assert.equal(racks[1].warning, true);
});

test('machinery impulse budgets cap acceleration without clipping pilot-authored momentum', () => {
  const body = { alive: true, mass: 180, vel: { x: 3, z: 2 }, pos: { x: 20, z: 30 },
    physicsBody: { mass: 180, dynamic: true } };
  const before = clone(body);
  const impulse = expeditionImpulse(body, { x: 1e8, z: 1e8 }, 100);
  assert.ok(impulse);
  assert.ok(Math.hypot(impulse.x, impulse.z) / body.mass <=
    EXPEDITION_CHOREOGRAPHY.maxLinearAcceleration * EXPEDITION_CHOREOGRAPHY.maxStepS + 1e-8);
  assert.equal(impulse.y, 0);
  assert.deepEqual(body, before, 'planner may not mutate physical state');
  body.vel = { x: 150, z: 0 };
  assert.equal(expeditionImpulse(body, { x: 8, z: 0 }, DT), null);
  assert.equal(body.vel.x, 150, 'earned momentum remains physics-owned');
  assert.equal(expeditionImpulse({ ...body, physicsBody: { dynamic: false } }, { x: 1, z: 1 }, DT), null);
});

test('presentation uses real authored packages, readable shape tells and quiet accessibility settings', () => {
  const { record, layout } = liveRecord(19837);
  record.pressure = 90; record.pressureStage = 3;
  const before = serializeExpeditionRecord(record);
  const files = new Set(Object.values(WRECK_AFTERMATH_PLACE_FILE_BY_ID));
  for (const body of layout.bodies) {
    const data = authoredExpeditionBodyData(body, layout.id);
    if (body.anchored) assert.ok(WRECK_AFTERMATH_PLACE_FILE_BY_ID[data.placeId]);
    else if (data.authoredPayloadAssetId) assert.equal(data.authoredPayloadAssetId, 'pod_cargo_container');
    else assert.ok(files.has(data.packagedPropFile), data.packagedPropFile);
    assert.equal(Boolean(data.authoredPayloadAssetId && data.packagedPropFile), false,
      'payload asset priority cannot hide the requested authored hull');
  }
  const ui = buildExpeditionPresentation(record, layout, {
    settings: { video: { motionReduce: true }, accessibility: { flashReduce: true, highContrast: true } },
    playerPosition: layout.compartments[0].center,
  });
  assert.equal(ui.pressure.pulseHz, 0);
  assert.equal(ui.pressure.flash, false);
  assert.equal(ui.pressure.cameraShake, 0);
  assert.ok(ui.markers.every(marker => marker.label && marker.shape));
  assert.ok(new Set(ui.markers.map(marker => marker.shape)).size >= 3);
  assert.match(ui.hint, /Tow|Pull|Guns/);
  assert.deepEqual(serializeExpeditionRecord(record), before);
  assert.deepEqual(expeditionMilestoneEvents('unrecognized', record, layout), []);
});

function moveBody(body, position, velocity = { x: 0, z: 0 }) {
  assert.ok(body, 'measured test body must exist');
  body.pos.set(position.x, 0, position.z);
  body.vel.set(velocity.x, 0, velocity.z);
}
function shoot(host, key) {
  const body = host.body(key);
  assert.ok(body, `physical target ${key}`);
  const hit = host.damage({ attackerId: host.player.id, targetId: body.id,
    packet: { channels: { kinetic: body.hullMax * 5 }, penetration: 1 },
    origin: { kind: 'weapon', id: 'wpn_pulse_laser_s' } });
  assert.equal(hit.ok, true, `${key}: ${hit.reason}`);
  assert.ok(body.hull <= 0, `${key} takes ordinary gun damage through the existing damage owner`);
  host.tick();
  return body;
}
function openPrimaryByGuns(host) {
  host.advance(0.2);
  shoot(host, 'shutter');
  shoot(host, 'vent_baffle');
  host.advance(0.3, 0.1);
  assert.equal(host.status().record.obstacles.shutter.opened, true);
  assert.equal(host.status().record.obstacles.vent.opened, true);
}
function towToReceiver(host, kind = 'blackbox', seconds = 3) {
  const status = host.status();
  const body = host.body(status.record.cargo[kind].bodyKey);
  moveBody(body, host.layout.receiver.position);
  moveBody(host.player, host.layout.receiver.position);
  host.advance(seconds, 0.1);
  return body;
}

for (const seed of SEEDS) {
  test(`seed ${seed}: runtime builds real bodies/clamps, guns open access, physical extraction pays the economy once`, () => {
    const host = physicalHost(seed);
    const before = host.state.player.credits;
    assert.equal(host.system.start().ok, true);
    host.advance(0.2);
    assert.equal(host.spawned.length, host.layout.bodies.length);
    assert.equal(host.nativeAttachments.size, 2, 'both physical cargo mounts must have a native attachment');
    const count = host.state.entityList.length;
    host.system.start();
    assert.equal(host.state.entityList.length, count, 'repeated start does not mint cargo');
    openPrimaryByGuns(host);
    assert.equal(host.grants.length, 0);
    const box = host.body('blackbox');
    moveBody(box, host.layout.receiver.position, { x: 30, z: 0 });
    moveBody(host.player, host.layout.receiver.position);
    host.advance(3, 0.1);
    assert.equal(host.grants.length, 0, 'flying through the receiver is not custody');
    moveBody(box, host.layout.receiver.position);
    host.advance(3, 0.1);
    assert.equal(host.grants.length, 1);
    assert.ok(host.grants[0].amount > 0);
    assert.equal(host.state.player.credits, before + host.grants[0].amount);
    assert.equal(host.status().record.primaryComplete, true);
    assert.equal(host.state.entities.has(box.id), false, 'delivered physical cargo is consumed by core once');
    const paid = host.state.player.credits;
    host.advance(5, 0.1);
    assert.equal(host.grants.length, 1);
    const saved = clone(host.system.serialize());
    host.system.deserialize(saved);
    host.tick();
    assert.equal(host.state.player.credits, paid);
    assert.equal(host.grants.length, 1);
    assert.equal(host.status().record.cargo.blackbox.status, 'delivered');
    assert.equal(host.body('blackbox'), null);
    host.system.dispose();
  });
}

test('runtime offers no surprise starter encounter and refuses a remote opt-in', () => {
  const host = physicalHost();
  host.state.world.currentSectorId = 'sector_helios_prime';
  assert.equal(host.system.start().ok, false);
  assert.equal(host.spawned.length, 0);
  host.state.world.currentSectorId = BLACKBOX_RUNS_SITE.sectorId;
  moveBody(host.player, { x: host.layout.entry.x + 100000, z: host.layout.entry.z });
  assert.equal(host.system.start().ok, false);
  assert.equal(host.spawned.length, 0);
  host.system.dispose();
});

test('runtime suspension and reentry preserve measured cargo position, damage and access', () => {
  const host = physicalHost(19837);
  assert.equal(host.system.start().ok, true);
  openPrimaryByGuns(host);
  const box = host.body('blackbox');
  const measured = { x: box.pos.x - 85, z: box.pos.z + 120 };
  moveBody(box, measured, { x: 3, z: -2 });
  box.hull = 61;
  host.tick();
  const before = host.status().record;
  host.system.abandon();
  host.advance(20, 0.1);
  assert.ok(host.status().record.pressure >= before.pressure);
  assert.equal(host.system.resume().ok, true);
  host.tick();
  assert.deepEqual({ x: host.body('blackbox').pos.x, z: host.body('blackbox').pos.z }, measured);
  assert.equal(host.body('blackbox').hull, 61);
  assert.equal(host.status().record.obstacles.shutter.opened, true);
  assert.equal(host.status().record.obstacles.vent.opened, true);
  const bindings = Object.values(host.status().entityIds);
  assert.equal(new Set(bindings).size, bindings.length);
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});

test('runtime tombstones a missing cargo before save; a recycled entity ID is never mistaken for it', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  host.advance(0.2);
  const box = host.body('blackbox');
  host.helpers.removeEntity(box.id, { immediate: true });
  const foreign = host.helpers.spawnEntity({ type: 'payload', pos: host.layout.receiver.position,
    hull: 90, hullMax: 90, mass: 80, radius: 5, data: { authoredPayloadAssetId: 'pod_cargo_container' } });
  assert.equal(foreign.id, box.id, 'fixture exercises actual core ID recycling');
  host.tick();
  assert.equal(host.status().record.cargo.blackbox.status, 'lost');
  assert.equal(host.grants.length, 0);
  const save = host.system.serialize();
  host.system.deserialize(clone(save));
  host.tick();
  assert.equal(host.status().record.cargo.blackbox.status, 'lost');
  assert.equal(host.body('blackbox'), null);
  assert.equal(host.state.entities.get(foreign.id), foreign, 'foreign payload survives feature restoration');
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});

test('optional core adds a second actual return and payout; primary success never depends on it', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  openPrimaryByGuns(host);
  towToReceiver(host);
  assert.equal(host.grants.length, 1);
  assert.equal(host.status().record.primaryComplete, true);
  shoot(host, 'relay');
  host.advance(0.3, 0.1);
  assert.equal(host.status().record.obstacles.relay.opened, true);
  assert.notEqual(host.status().record.cargo.core.status, 'delivered');
  towToReceiver(host, 'core');
  assert.equal(host.grants.length, 2);
  assert.equal(host.status().record.phase, 'complete');
  assert.notEqual(host.grants[0].reason, host.grants[1].reason);
  host.system.dispose();
});

test('observed displacement and a real breakaway attachment are alternate physical solutions', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  host.advance(0.2);
  const shutter = host.body('shutter'), vent = host.body('vent_baffle');
  moveBody(shutter, { x: shutter.pos.x + 80, z: shutter.pos.z });
  moveBody(vent, { x: vent.pos.x + 65, z: vent.pos.z });
  host.tick();
  assert.equal(host.status().record.obstacles.shutter.method, 'displaced');
  assert.equal(host.status().record.obstacles.vent.method, 'displaced');
  assert.ok(shutter.hull > 0 && vent.hull > 0, 'access can open without ordinary-gun destruction');
  assert.equal(host.nativeAttachments.size, 1, 'opening access physically releases the recorder mount');
  const core = host.body('core');
  const mount = host.attachments.listForEntity(core.id).find(item => item.state === 'active');
  assert.ok(mount);
  assert.equal(host.attachments.breakAttachment(mount.id, 'salvage_pull_threshold').ok, true);
  moveBody(core, { x: core.pos.x + 40, z: core.pos.z });
  host.tick();
  assert.equal(host.status().record.cargo.core.status, 'recovered');
  assert.equal(host.status().record.obstacles.relay.method, 'bypass');
  assert.equal(host.nativeAttachments.size, 0);
  assert.equal(host.grants.length, 0, 'a breakaway is recovery, never a payment or teleport');
  host.system.dispose();
});

test('repeated initialization adopts the existing native cargo mounts before releasing access', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  host.advance(0.2);
  const ids = host.status().entityIds;
  assert.equal(host.nativeAttachments.size, 2);
  host.system.init(host.ctx);
  host.tick();
  assert.deepEqual(host.status().entityIds, ids);
  assert.equal(host.nativeAttachments.size, 2);
  openPrimaryByGuns(host);
  assert.equal(host.nativeAttachments.size, 1, 'recorder does not keep an orphan native mount after access opens');
  assert.ok(host.cuts.some(cut => cut.attachmentId));
  host.system.dispose();
});

test('missing attachment owner leaves cargo suspended and retries without granting a free physical release', () => {
  const host = physicalHost(4242, { attachments: false });
  assert.equal(host.system.start().ok, true);
  host.advance(1.5, 0.1);
  assert.equal(host.body('blackbox'), null);
  assert.equal(host.body('core'), null);
  assert.equal(host.grants.length, 0);
  assert.equal(host.status().mechanics.clamps.blackbox.released, false);
  assert.ok(host.state.entityList.length <= MAX_EXPEDITION_BODIES + 1);
  host.owners.set('actions', { kernel: { attachments: host.attachments } });
  host.advance(1, 0.1);
  assert.ok(host.body('blackbox'));
  assert.ok(host.body('core'));
  assert.equal(host.nativeAttachments.size, 2);
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});

test('a grant observer is not an economy owner; pending settlement waits and executes once when the writer returns', () => {
  const host = physicalHost(4242, { economy: false });
  assert.equal(host.system.start().ok, true);
  openPrimaryByGuns(host);
  const before = host.state.player.credits;
  towToReceiver(host);
  assert.equal(host.status().record.cargo.blackbox.status, 'delivered');
  assert.equal(host.grants.length, 0);
  assert.equal(host.state.player.credits, before);
  host.economyOwner.init(host.ctx);
  host.owners.set('economy', host.economyOwner);
  host.tick();
  assert.equal(host.grants.length, 1);
  assert.equal(host.state.player.credits, before + host.grants[0].amount);
  host.advance(1, 0.1);
  assert.equal(host.grants.length, 1);
  host.system.dispose();
});

test('an existing malformed expedition save cannot be presented as a fresh reward source', () => {
  for (const corrupt of [
    saved => { saved.sites[BLACKBOX_RUNS_SITE.id].record.siteId = 'foreign_site'; },
    saved => { saved.sites[BLACKBOX_RUNS_SITE.id].record.variant = 'not_an_authored_variant'; },
    saved => { delete saved.sites[BLACKBOX_RUNS_SITE.id].record; },
  ]) {
    const host = physicalHost();
    assert.equal(host.system.start().ok, true);
    host.advance(0.2);
    const saved = clone(host.system.serialize());
    corrupt(saved);
    host.system.deserialize(saved);
    host.tick();
    assert.equal(host.system.start().ok, false);
    assert.equal(host.grants.length, 0);
    host.system.dispose();
  }
});

test('paused and duplicate fixed ticks cannot accumulate force, dwell or pressure', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  host.advance(0.2);
  const before = host.status().record.elapsedS;
  const commandCount = host.physicsCommands.length;
  host.system.update(2, host.state); // Same authoritative fixed tick as the previous update.
  assert.equal(host.status().record.elapsedS, before);
  host.state.paused = true;
  host.advance(30, 0.1);
  assert.equal(host.status().record.elapsedS, before);
  assert.equal(host.physicsCommands.length, commandCount);
  assert.equal(host.grants.length, 0);
  host.state.paused = false;
  host.tick();
  assert.ok(host.status().record.elapsedS > before);
  host.system.dispose();
});

test('live pressure uses bounded physics commands and warning cues without writing entity motion', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  host.advance(0.2);
  const jet = host.layout.obstacles.vent;
  moveBody(host.player, { x: jet.origin.x + jet.direction.x * 70,
    z: jet.origin.z + jet.direction.z * 70 });
  const position = clone(host.player.pos), velocity = clone(host.player.vel);
  host.advance(25, 0.1);
  const impulses = host.physicsCommands.filter(row => row.id === host.player.id)
    .flatMap(row => row.command.impulses.map(impulse => ({ ...impulse, mass: row.mass })));
  const jets = impulses.filter(impulse => impulse.kind === 'derelictExpedition:pressure_jet');
  assert.ok(jets.length > 0, 'the pressure hold actually sends force to the native physics membrane');
  for (const impulse of jets) {
    assert.equal(impulse.externalEffect, true);
    assert.equal(impulse.externalProtected, true);
    assert.ok(Math.hypot(impulse.x, impulse.z) / impulse.mass <=
      EXPEDITION_CHOREOGRAPHY.maxLinearAcceleration * 0.1 + 1e-6);
  }
  assert.deepEqual(clone(host.player.pos), position);
  assert.deepEqual(clone(host.player.vel), velocity);
  assert.ok(host.events.some(([name, payload]) => name === 'comms:log' && /jet in 3 seconds/.test(payload.text)));
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});

function directorOffer(host, id = 'blackbox-contract-offer') {
  const director = Object.create(encounterDirector);
  director.init(host.ctx);
  const live = { id, shapeId: blackboxEncounter.id, shape: blackboxEncounter,
    script: 'selfRegistered', phase: 'pending', ids: [], data: {}, vars: {},
    deck: blackboxEncounter.deck, tier: blackboxEncounter.tier,
    sectorId: BLACKBOX_RUNS_SITE.sectorId, zoneId: BLACKBOX_RUNS_SITE.zoneId,
    lastBarkAt: -Infinity };
  host.state.encounterDirector.live[id] = live;
  return { director, live };
}

test('the real director offer/resolve lifecycle leaves accepted expedition bodies under their own owner', () => {
  const host = physicalHost();
  const { director, live } = directorOffer(host);
  const offers = [], receipts = [];
  host.bus.on('encounter:choiceOffered', payload => offers.push(payload));
  host.bus.on('encounter:resolved', payload => receipts.push(payload));
  BLACKBOX_RUNS_RUNTIME.fire(director, live, host.state);
  assert.equal(live.phase, 'offer');
  assert.deepEqual(offers[0].options.map(option => option.id), ['enter', 'decline']);
  assert.equal(offers[0].timeoutChoice, 'decline');
  assert.equal(host.spawned.length, 0, 'an invitation does not instantiate a derelict or attack the starter');
  BLACKBOX_RUNS_RUNTIME.choose(director, live, host.state, 'unrecognized');
  assert.equal(live.phase, 'offer');
  BLACKBOX_RUNS_RUNTIME.choose(director, live, host.state, 'enter');
  assert.equal(live.phase, 'done');
  assert.equal(receipts[0].outcome, 'accepted');
  assert.equal(host.state.encounterDirector.live[live.id], undefined);
  assert.deepEqual(live.ids, [], 'director cleanup does not claim the feature-owned entity roster');
  host.advance(0.2);
  assert.ok(host.body('blackbox'));
  for (const entity of host.state.entityList.filter(entity => entity.id !== host.player.id)) {
    assert.equal(entity.data.persistenceOwner, 'derelictExpedition');
    assert.equal(entity.data.despawnAt, undefined);
  }
  const count = host.spawned.length;
  BLACKBOX_RUNS_RUNTIME.choose(director, live, host.state, 'enter');
  assert.equal(host.spawned.length, count);
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});

test('director decline and offer timeout resolve without accepting or materializing the expedition', () => {
  for (const choice of ['decline', 'timeout']) {
    const host = physicalHost();
    const { director, live } = directorOffer(host);
    BLACKBOX_RUNS_RUNTIME.fire(director, live, host.state);
    if (choice === 'timeout') BLACKBOX_RUNS_RUNTIME.tick(director, live, host.state, live.deadlineAt);
    else BLACKBOX_RUNS_RUNTIME.choose(director, live, host.state, choice);
    assert.equal(live.phase, 'done');
    assert.equal(live.outcome, 'declined');
    assert.equal(host.system.getStatus(), null);
    assert.equal(host.spawned.length, 0);
    host.system.dispose();
  }
});

test('sector unloading preserves measured state and reconstructs clamps once on reentry', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  host.advance(0.2);
  const box = host.body('blackbox');
  const measured = { x: box.pos.x + 4, z: box.pos.z - 5 };
  moveBody(box, measured, { x: 2, z: -1 });
  box.hull = 62;
  host.tick();
  const elapsed = host.status().record.elapsedS;
  host.bus.emit('sector:exit', { sectorId: BLACKBOX_RUNS_SITE.sectorId });
  host.state.world.currentSectorId = 'sector_helios_prime';
  host.tick();
  assert.equal(host.status().record.bodies.blackbox.lifecycle, 'suspended');
  assert.equal(host.nativeAttachments.size, 0);
  assert.equal(host.state.entityList.length, 1, 'core retires the former sector bodies');
  host.advance(10, 0.1);
  assert.ok(host.status().record.elapsedS > elapsed);
  host.state.world.currentSectorId = BLACKBOX_RUNS_SITE.sectorId;
  host.bus.emit('sector:enter', { sectorId: BLACKBOX_RUNS_SITE.sectorId });
  host.advance(0.2);
  assert.equal(host.nativeAttachments.size, 2);
  const restored = host.body('blackbox');
  assert.deepEqual({ x: restored.pos.x, z: restored.pos.z }, measured);
  assert.deepEqual({ x: restored.vel.x, z: restored.vel.z }, { x: 2, z: -1 });
  assert.equal(restored.hull, 62);
  assert.notEqual(restored.occupantGeneration, box.occupantGeneration);
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});

test('HUD marker placement respects host offsets, offscreen bearing and invalid projections', () => {
  const rect = { left: 120, top: 80, width: 960, height: 600 };
  const onScreen = placeExpeditionHudMarker({ x: 650, y: 330, onScreen: true }, rect);
  assert.equal(onScreen.x, 530); assert.equal(onScreen.y, 250); assert.equal(onScreen.onScreen, true);
  const offscreen = placeExpeditionHudMarker({ x: 1600, y: 1000, onScreen: false }, rect, 1);
  assert.equal(offscreen.onScreen, false);
  assert.ok(offscreen.x >= 22 && offscreen.x <= rect.width - 22);
  assert.ok(offscreen.y >= 22 && offscreen.y <= rect.height - 22);
  assert.ok(offscreen.angle > 0 && offscreen.angle < 90);
  assert.equal(placeExpeditionHudMarker({ x: 600, y: 300, behind: true }, rect), null);
  assert.equal(placeExpeditionHudMarker({ x: NaN, y: 300 }, rect), null);
  assert.equal(placeExpeditionHudMarker({ x: 600, y: 300 }, { width: 0, height: 0 }), null);
});

test('an aborted save restore releases its barrier and preserves the pre-restore physical cargo', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  host.advance(0.2);
  const box = host.body('blackbox');
  const measured = { x: box.pos.x + 3, z: box.pos.z + 5 };
  moveBody(box, measured, { x: 2, z: -1 });
  box.hull = 63;
  host.tick();
  const elapsed = host.status().record.elapsedS;
  host.bus.emit('save:restoring', { slot: 1 });
  host.tick();
  assert.equal(host.status().record.elapsedS, elapsed);
  assert.equal(host.nativeAttachments.size, 0);
  host.bus.emit('save:error', { stage: 'restore', error: 'fixture_restore_rejected' });
  host.advance(0.3);
  const restored = host.body('blackbox');
  assert.ok(restored);
  assert.deepEqual({ x: restored.pos.x, z: restored.pos.z }, measured);
  assert.equal(restored.hull, 63);
  assert.equal(host.nativeAttachments.size, 2);
  assert.ok(host.status().record.elapsedS > elapsed);
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});

test('a physically torn cargo mount permits a bypass without disabling the untouched pressure jet', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  host.advance(0.2);
  const box = host.body('blackbox');
  const mount = host.attachments.listForEntity(box.id).find(item => item.state === 'active');
  assert.equal(host.attachments.breakAttachment(mount.id, 'salvage_pull_threshold').ok, true);
  moveBody(box, { x: box.pos.x + 45, z: box.pos.z });
  host.tick();
  assert.equal(host.status().record.obstacles.vent.method, 'bypass');
  assert.equal(host.status().record.cargo.blackbox.status, 'recovered');
  assert.ok(host.body('vent_baffle').hull > 0);
  const jet = host.layout.obstacles.vent;
  moveBody(host.player, { x: jet.origin.x + jet.direction.x * 70,
    z: jet.origin.z + jet.direction.z * 70 });
  host.advance(25, 0.1);
  const pulses = host.physicsCommands.filter(row => row.id === host.player.id)
    .flatMap(row => row.command.impulses)
    .filter(impulse => impulse.kind === 'derelictExpedition:pressure_jet');
  assert.ok(pulses.length > 0, 'bypassing the service side does not operate the pressure baffle');
  const pressureBefore = host.status().record.pressure;
  const openingLines = () => host.events.filter(([name, payload]) => name === 'comms:log'
    && /PRESSURE HOLD OPEN/.test(payload.text)).length;
  const openingsBefore = openingLines();
  shoot(host, 'vent_baffle');
  assert.equal(host.status().record.obstacles.vent.method, 'destroyed');
  assert.equal(sampleExpeditionHazards(host.status().record, host.layout).vent.phase, 'quiet',
    'subsequently destroying the baffle really disables the bypassed jet');
  assert.ok(near(host.status().record.pressure - pressureBefore, EXPEDITION_LIMITS.pressurePerSecond * DT));
  assert.equal(openingLines(), openingsBefore, 'physical proof upgrade does not repeat the opening event');
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});

test('return rack release waits for a fresh five-second warning after sector reentry and never repeats', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  host.advance(0.2);
  const releases = () => host.physicsCommands.flatMap(row => row.command.impulses
    .filter(impulse => impulse.kind === 'derelictExpedition:rack_release')
    .map(impulse => ({ key: row.key, mass: row.mass, impulse })));
  host.tick(240); // A catch-up sample may arm the warning but cannot deliver its burst.
  assert.equal(releases().length, 0);
  assert.ok(host.status().mechanics.collapseArmedAt.rack_one > 0);
  host.bus.emit('sector:exit', { sectorId: BLACKBOX_RUNS_SITE.sectorId });
  host.state.world.currentSectorId = 'sector_helios_prime';
  host.tick(100);
  assert.equal(host.status().mechanics.collapseArmedAt.rack_one, null);
  host.state.world.currentSectorId = BLACKBOX_RUNS_SITE.sectorId;
  host.bus.emit('sector:enter', { sectorId: BLACKBOX_RUNS_SITE.sectorId });
  host.advance(0.2);
  const reentryArm = host.status().mechanics.collapseArmedAt.rack_one;
  assert.ok(reentryArm > 340);
  assert.equal(releases().length, 0);
  host.advance(4.5, 0.1);
  assert.equal(releases().length, 0, 'the elapsed away time cannot consume the audible reentry warning');
  host.advance(0.8, 0.1);
  assert.equal(releases().length, 3);
  assert.equal(new Set(releases().map(row => row.key)).size, 3);
  for (const row of releases()) assert.ok(near(Math.hypot(row.impulse.x, row.impulse.z) / row.mass, 5),
    `${row.key} release must be one bounded 5-wu/s delta: ${JSON.stringify(row)}`);
  assert.equal(host.status().mechanics.collapseReleased.rack_one, true);
  const saved = clone(host.system.serialize());
  host.system.deserialize(saved);
  host.advance(7, 0.1);
  assert.equal(releases().length, 3, 'reload preserves the finite rack release ledger');
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});

test('released cargo restores its measured pose after its former cradle is lost and the attachment owner is absent', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  openPrimaryByGuns(host);
  const box = host.body('blackbox');
  const measured = { x: box.pos.x + 75, z: box.pos.z - 40 };
  moveBody(box, measured, { x: 2, z: -1 });
  box.hull = 61;
  host.tick();
  assert.equal(host.status().record.cargo.blackbox.status, 'recovered');
  assert.equal(host.status().mechanics.clamps.blackbox.released, true);
  const anchor = host.body('blackbox_anchor');
  host.helpers.removeEntity(anchor.id, { immediate: true });
  host.tick();
  assert.equal(host.status().record.bodies.blackbox_anchor.lifecycle, 'lost');
  host.bus.emit('sector:exit', { sectorId: BLACKBOX_RUNS_SITE.sectorId });
  host.state.world.currentSectorId = 'sector_helios_prime';
  host.tick();
  assert.equal(host.nativeAttachments.size, 0);
  const saved = clone(host.system.serialize());
  host.owners.delete('actions'); host.owners.delete('combat');
  host.system.deserialize(saved);
  host.state.world.currentSectorId = BLACKBOX_RUNS_SITE.sectorId;
  host.bus.emit('sector:enter', { sectorId: BLACKBOX_RUNS_SITE.sectorId });
  host.advance(1, 0.1);
  const restored = host.body('blackbox');
  assert.ok(restored, 'a released load no longer requires its former attachment endpoints');
  assert.deepEqual({ x: restored.pos.x, z: restored.pos.z }, measured);
  assert.deepEqual({ x: restored.vel.x, z: restored.vel.z }, { x: 2, z: -1 });
  assert.equal(restored.hull, 61);
  assert.equal(host.status().record.cargo.blackbox.status, 'recovered');
  assert.equal(host.body('blackbox_anchor'), null);
  assert.equal(host.body('core'), null, 'the still-mounted optional load must wait for its attachment owner');
  assert.equal(host.nativeAttachments.size, 0);
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});

test('status reads during chunked generic save reconstruction cannot duplicate later bodies or replace restored clamp references', () => {
  const host = physicalHost();
  assert.equal(host.system.start().ok, true);
  host.advance(0.2);
  const saved = clone(host.system.serialize());
  host.bus.emit('save:restoring', { slot: 1 });
  host.coreOwner.lifetimeSweep(DT, host.state);
  host.system.deserialize(saved);
  const restoredByKey = new Map();
  function restoreGenericBody(body) {
    const row = saved.sites[BLACKBOX_RUNS_SITE.id].record.bodies[body.key];
    const entity = host.helpers.spawnEntity({ ...expeditionEntitySpec(body, row), id: row.entityId });
    restoredByKey.set(body.key, entity);
  }
  for (const body of host.layout.bodies.slice(0, 12)) restoreGenericBody(body);
  const partial = host.system.getStatus();
  assert.deepEqual(partial.entityIds, {}, 'render reads during the barrier must not bind a partial world');
  assert.ok(Object.values(partial.record.bodies).every(body => body.lifecycle === 'suspended'));
  assert.ok(host.system.presentation());
  for (const body of host.layout.bodies.slice(12)) restoreGenericBody(body);
  const restoredMountIds = [];
  for (const kind of ['blackbox', 'core']) {
    const loot = host.layout.loot.find(row => row.id === kind);
    const anchor = restoredByKey.get(loot.anchorKey), cargo = restoredByKey.get(loot.bodyKey);
    // This is the real combat attachment owner's reconstruction, after generic
    // entities have arrived and before the save owner publishes save:loaded.
    const result = host.attachments.create({ defId: 'attachment_salvage_clamp',
      ownerId: anchor.id, targetId: cargo.id,
      sourceWorld: { x: anchor.pos.x, y: 0, z: anchor.pos.z },
      targetWorld: { x: cargo.pos.x, y: 0, z: cargo.pos.z },
      actionInstanceId: `derelictExpedition:${BLACKBOX_RUNS_SITE.id}:${kind}` });
    assert.equal(result.ok, true);
    restoredMountIds.push(result.attachment?.id || result.id);
  }
  const target = restoredByKey.get('blackbox');
  host.state.player.targetId = target.id;
  const spawnedBeforeLoaded = host.spawned.length;
  host.bus.emit('save:loaded', { slot: 1 });
  host.advance(0.2);
  assert.equal(host.spawned.length, spawnedBeforeLoaded, 'generic restored bodies are adopted, never duplicated');
  for (const body of host.layout.bodies) {
    const instances = host.state.entityList.filter(entity => entity.alive
      && entity.data?.derelictExpedition?.key === body.key);
    assert.equal(instances.length, 1, body.key);
    assert.equal(instances[0], restoredByKey.get(body.key));
    assert.equal(host.body(body.key), restoredByKey.get(body.key));
  }
  assert.equal(host.state.entities.get(host.state.player.targetId), target);
  assert.equal(host.nativeAttachments.size, 2);
  for (const id of restoredMountIds) assert.equal(host.attachments.get(id).state, 'active');
  assert.equal(host.grants.length, 0);
  host.system.dispose();
});
