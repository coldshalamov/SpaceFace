import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { LEGACY47A_FEATURES, PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';
import { statSnippet } from '../src/ui/station/outfittingGuidance.js';

const DT = 1 / 60;
const STANDARD = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');
const TRACTOR = MODULES.find((def) => def.id === 'mod_tractor_beam_m');
const WHIP = MODULES.find((def) => def.id === 'mod_elastic_whip_m');
const COUPLER = MODULES.find((def) => def.id === 'mod_frame_coupler_m');

test('Frame Coupler is a reachable, exclusive, independently flagged separation-damping head', () => {
  const fittings = fittingsFromDefaultModules('ship_drifter', [COUPLER.id]);
  const derived = getDerivedStats('ship_drifter', fittings, null);
  const production = effectiveTetherPolicy(STANDARD, { data: { derived } }, PRODUCTION_FEATURES);
  const legacy = effectiveTetherPolicy(STANDARD, { data: { derived } }, LEGACY47A_FEATURES);
  const tech = TECH_NODES.find((node) => node.id === COUPLER.requiresTech);

  assert.ok(fittings.includes(COUPLER.id), 'the M utility head fits a normal production hull');
  assert.ok(tech.unlocks.modules.includes(COUPLER.id), 'research exposes the head to station stock');
  assert.equal(derived.masslineHeadId, 'frame_coupler');
  assert.equal(PRODUCTION_FEATURES.massline2.masslineHeadFrameCoupler, true);
  assert.equal(LEGACY47A_FEATURES.massline2.masslineHeadFrameCoupler, false);
  assert.equal(production.headId, 'frame_coupler');
  assert.deepEqual(
    [production.spring.mode, production.spring.velocityGain, production.spring.captureS, production.spring.maxForce],
    ['frame_coupler', 1.6, 0.35, 5_200],
  );
  assert.equal(legacy.headId, undefined);
  assert.equal(legacy.spring, undefined, 'flag-off preserves the ordinary standard line');
  assert.match(statSnippet(COUPLER), /separation-damping head/i);

  const malformed = fittingsFromDefaultModules('ship_atlas', [
    COUPLER.id,
    TRACTOR.id,
    WHIP.id,
  ]);
  const reversed = fittingsFromDefaultModules('ship_atlas', [
    WHIP.id,
    TRACTOR.id,
    COUPLER.id,
  ]);
  assert.equal(getDerivedStats('ship_atlas', malformed, null).masslineHeadId, 'frame_coupler');
  assert.equal(getDerivedStats('ship_atlas', reversed, null).masslineHeadId, 'frame_coupler',
    'defensive arbitration must remain independent of fitting-slot order');
});

test('Frame Coupler cannot steer by matching tangential velocity', async () => {
  const policy = couplerPolicy();
  const player = makeBody('coupler-tangent-player', 0, 24, { x: 40, z: 0 });
  const target = makeBody('coupler-tangent-target', 100, 96, { x: 40, z: 80 });
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });

  try {
    runtime.syncFromEntities([player, target]);
    const handle = runtime.createAttachment({
      attachmentId: 'coupler-tangential-authority',
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: target.id,
      sourceWorld: player.pos,
      targetWorld: target.pos,
      restLength: 100,
      spring: policy.spring,
      springState: { wasTaut: true, slackS: 0, captureActive: false },
      tick: 0,
    });

    runtime.step(DT);
    const telemetry = runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
    assert.deepEqual(player.vel, { x: 40, z: 0 },
      'a rope may not steer the player toward the target frame');
    assert.deepEqual(target.vel, { x: 40, z: 80 },
      'a rope may not brake tangential target motion');
    assert.equal(telemetry.tension, 0, 'pure tangential frame error has no rope-force component');
    assert.ok(telemetry.frameErrorSpeed < 2,
      `telemetry must report the post-step radial projection, not 80 wu/s of sideways error; got ${telemetry.frameErrorSpeed}`);
  } finally {
    runtime.dispose();
  }
});

test('Frame Coupler cannot brake endpoints that are already closing', async () => {
  const policy = couplerPolicy();
  const player = makeBody('coupler-closing-player', 0, 24, { x: 80, z: 0 });
  const target = makeBody('coupler-closing-target', 100, 96, { x: 0, z: 0 });
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });

  try {
    runtime.syncFromEntities([player, target]);
    const handle = runtime.createAttachment({
      attachmentId: 'coupler-closing-authority',
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: target.id,
      sourceWorld: player.pos,
      targetWorld: target.pos,
      restLength: 100,
      spring: policy.spring,
      springState: { wasTaut: true, slackS: 0, captureActive: false },
      tick: 0,
    });

    runtime.step(DT);
    const telemetry = runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
    assert.deepEqual(player.vel, { x: 80, z: 0 });
    assert.deepEqual(target.vel, { x: 0, z: 0 });
    assert.equal(telemetry.tension, 0, 'a rope cannot push apart or brake closing endpoints');
    assert.equal(telemetry.frameErrorSpeed, 0, 'closing speed is outside coupler authority');
  } finally {
    runtime.dispose();
  }
});

test('Frame Coupler damps separation from a moving freighter and detaches safely', async () => {
  const player = makeBody('coupler-player', 0, 24, { x: 0, z: 0 }, 'drive_reaction_m');
  const freighter = makeBody('coupler-freighter', 100, 240, { x: 247, z: 45 }, 'drive_reaction_l');
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  const policy = couplerPolicy();
  const playerProfile = resolvePropulsionProfile(player);
  const freighterProfile = resolvePropulsionProfile(freighter);

  try {
    runtime.syncFromEntities([player, freighter]);
    const handle = runtime.createAttachment({
      attachmentId: 'coupler-express',
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: freighter.id,
      sourceWorld: player.pos,
      targetWorld: freighter.pos,
      restLength: 100,
      spring: policy.spring,
      tick: 0,
    });
    assert.ok(handle);
    assert.equal(playerProfile.solverSpeedLimit, Infinity,
      'the default Hitch reaction drive must not install a hard Rapier speed clamp');
    assert.equal(freighterProfile.solverSpeedLimit, Infinity,
      'the Express Liner reaction drive must remain physically hitchable above its governor target');

    const initialMomentum = momentum(player, freighter);
    let maxTension = 0;
    for (let tick = 0; tick < 300; tick += 1) {
      writeIdleFlightCommand(player, playerProfile);
      writeIdleFlightCommand(freighter, freighterProfile);
      runtime.step(DT);
      const telemetry = runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
      maxTension = Math.max(maxTension, telemetry.tension);
    }

    const telemetry = runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
    const finalMomentum = momentum(player, freighter);
    const lineDx = telemetry.targetWorld.x - telemetry.sourceWorld.x;
    const lineDz = telemetry.targetWorld.z - telemetry.sourceWorld.z;
    const invDistance = 1 / Math.hypot(lineDx, lineDz);
    const lineX = lineDx * invDistance;
    const lineZ = lineDz * invDistance;
    const relativeX = freighter.vel.x - player.vel.x;
    const relativeZ = freighter.vel.z - player.vel.z;
    const openingSpeed = Math.max(0, relativeX * lineX + relativeZ * lineZ);
    const tangentialSpeed = Math.abs(relativeX * -lineZ + relativeZ * lineX);
    assert.ok(openingSpeed < 1, `rope-axis separation should converge gradually, got ${openingSpeed}`);
    assert.ok(tangentialSpeed > 1,
      `the coupler must leave sideways relative motion under pilot/target control, got ${tangentialSpeed}`);
    assert.ok(Math.hypot(player.vel.x, player.vel.z) > playerProfile.combatSpeed,
      'the live reaction-drive command membrane must preserve velocity physically earned from the faster frame');
    assert.ok(telemetry.frameErrorSpeed < 1,
      'physics telemetry should expose only the remaining rope-axis separation');
    assert.ok(maxTension <= policy.spring.maxForce + 1e-6,
      `complete coupling force must stay inside ${policy.spring.maxForce}, got ${maxTension}`);
    assert.ok(Math.abs(finalMomentum.x - initialMomentum.x) < 0.05);
    assert.ok(Math.abs(finalMomentum.z - initialMomentum.z) < 0.05,
      'dynamic endpoints must receive equal-and-opposite impulses on both axes');
    assert.ok(Math.abs(player.rot) < 1e-6 && Math.abs(freighter.rot) < 1e-6,
      'center-applied coupling must not steer either body');

    const playerBeforeCut = { ...player.vel };
    const freighterBeforeCut = { ...freighter.vel };
    assert.equal(runtime.cutAttachment({ attachmentId: handle.attachmentId }), true);
    writeIdleFlightCommand(player, playerProfile);
    writeIdleFlightCommand(freighter, freighterProfile);
    runtime.step(DT);
    assert.ok(vectorDelta(player.vel, playerBeforeCut) < 1e-6);
    assert.ok(vectorDelta(freighter.vel, freighterBeforeCut) < 1e-6,
      'detach must inherit actual motion without a release kick or braking step');
  } finally {
    runtime.dispose();
  }
});

test('Frame Coupler has no center-seeking or slack-line authority', async () => {
  const policy = couplerPolicy();
  const matchedA = makeBody('matched-a', 0, 24, { x: 90, z: -30 });
  const matchedB = makeBody('matched-b', 160, 96, { x: 90, z: -30 });
  const matchedRuntime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    matchedRuntime.syncFromEntities([matchedA, matchedB]);
    const handle = matchedRuntime.createAttachment({
      attachmentId: 'coupler-no-position-seek',
      defId: 'tether_standard',
      ownerId: matchedA.id,
      targetId: matchedB.id,
      sourceWorld: matchedA.pos,
      targetWorld: matchedB.pos,
      restLength: 80,
      spring: policy.spring,
      tick: 0,
    });
    for (let tick = 0; tick < 120; tick += 1) matchedRuntime.step(DT);
    const telemetry = matchedRuntime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
    assert.ok(Math.abs(telemetry.distance - 160) < 0.02,
      `matching frames must retain their player-chosen offset, got ${telemetry.distance}`);
    assert.equal(telemetry.tension, 0, 'extension alone must not create a center-seeking pull');
    assert.deepEqual(matchedA.vel, { x: 90, z: -30 });
    assert.deepEqual(matchedB.vel, { x: 90, z: -30 });
  } finally {
    matchedRuntime.dispose();
  }

  const slackA = makeBody('slack-a', 0, 24, { x: 0, z: 12 });
  const slackB = makeBody('slack-b', 100, 96, { x: 40, z: 12 });
  const slackRuntime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    slackRuntime.syncFromEntities([slackA, slackB]);
    const handle = slackRuntime.createAttachment({
      attachmentId: 'coupler-slack',
      defId: 'tether_standard',
      ownerId: slackA.id,
      targetId: slackB.id,
      sourceWorld: slackA.pos,
      targetWorld: slackB.pos,
      restLength: 180,
      spring: policy.spring,
      tick: 0,
    });
    for (let tick = 0; tick < 30; tick += 1) slackRuntime.step(DT);
    const telemetry = slackRuntime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
    assert.equal(telemetry.phase, 'slack');
    assert.equal(telemetry.tension, 0);
    assert.ok(Math.abs(slackA.vel.x) < 1e-9 && Math.abs(slackB.vel.x - 40) < 1e-9,
      'a slack coupler must not alter either speed');
  } finally {
    slackRuntime.dispose();
  }
});

test('an active Frame Coupler snapshots through combat save and Continue', () => {
  const policy = couplerPolicy();
  const player = { id: 1, alive: true, flags: {} };
  const target = { id: 2, alive: true, flags: { persistent: true } };
  const state = {
    playerId: player.id,
    entityList: [player, target],
    entities: new Map([[player.id, player], [target.id, target]]),
    combat: {
      attachments: {
        nextId: 2,
        byId: {
          att_000001: {
            id: 'att_000001',
            defId: 'tether_standard',
            ownerId: player.id,
            targetId: target.id,
            state: 'active',
            restLength: 100,
            tetherPolicy: policy,
            physicsSpringState: { lastFrameErrorSpeed: 17.5, phase: 'loaded' },
          },
        },
      },
      entities: {},
      actions: { nextRequestSeq: 1, nextInstanceSeq: 1, requests: [], activeByActor: {}, cooldownReadyTickByActor: {} },
      statusNextPendingSeq: 1,
    },
  };

  const payload = serializeCombatState(state);
  assert.equal(payload.attachments.byId.att_000001.tetherPolicy.headId, 'frame_coupler');
  assert.equal(payload.attachments.byId.att_000001.tetherPolicy.spring.mode, 'frame_coupler');

  const restored = {};
  const summary = restoreCombatState(restored, payload, (ref) => {
    if (ref && ref.kind === 'player') return player.id;
    if (ref && ref.kind === 'persistent' && ref.saveId === String(target.id)) return target.id;
    return null;
  });
  assert.equal(summary.restoredAttachments, 1);
  assert.deepEqual(restored.combat.attachments.byId.att_000001.tetherPolicy, policy);
  assert.equal(restored.combat.attachments.byId.att_000001.physicsSpringState.lastFrameErrorSpeed, 17.5);
});

function couplerPolicy() {
  return effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: 'frame_coupler' } },
  }, PRODUCTION_FEATURES);
}

function makeBody(id, x, mass, vel, driveId = 'drive_reaction_m') {
  return {
    id,
    type: 'ship',
    alive: true,
    radius: 4,
    mass,
    maxSpeed: 260,
    driveId,
    physicsBody: {
      schemaVersion: 1,
      radius: 4,
      mass,
      inertiaY: 64,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    pos: { x, z: 0 },
    vel: { x: vel.x, z: vel.z },
    rot: 0,
    angVel: 0,
    data: {},
  };
}

function writeIdleFlightCommand(entity, profile) {
  writePhysicsControl(entity, {
    source: 'frame-coupler-production-route-proof',
    mode: 'newtonian',
    force: { x: 0, y: 0, z: 0 },
    torque: { x: 0, y: 0, z: 0 },
    maxSpeed: profile.solverSpeedLimit,
  });
}

function momentum(a, b) {
  return {
    x: a.mass * a.vel.x + b.mass * b.vel.x,
    z: a.mass * a.vel.z + b.mass * b.vel.z,
  };
}

function vectorDelta(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
