import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { MODULES } from '../src/data/modules.js';
import { LEGACY47A_FEATURES, PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';
import { statSnippet } from '../src/ui/screens/outfitting.js';

const DT = 1 / 60;
const STANDARD = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');
const TRACTOR = MODULES.find((def) => def.id === 'mod_tractor_beam_m');
const TIDELINE = MODULES.find((def) => def.id === 'unique_tideline_tractor');

test('the fitted Tractor module admits one independently flagged, player-readable head', () => {
  const fittings = fittingsFromDefaultModules('ship_drifter', [TRACTOR.id]);
  const derived = getDerivedStats('ship_drifter', fittings, null);
  const owner = { data: { derived } };
  const production = effectiveTetherPolicy(STANDARD, owner, PRODUCTION_FEATURES);
  const legacy = effectiveTetherPolicy(STANDARD, owner, LEGACY47A_FEATURES);

  assert.ok(fittings.includes(TRACTOR.id), 'the existing M utility module is reachable through outfitting');
  assert.equal(derived.masslineHeadId, 'tractor');
  assert.equal(PRODUCTION_FEATURES.massline2.masslineHeadTractor, true);
  assert.equal(LEGACY47A_FEATURES.massline2.masslineHeadTractor, false);
  assert.equal(production.headId, 'tractor');
  assert.deepEqual(
    [production.spring.K, production.spring.zeta, production.spring.captureS, production.spring.maxForce],
    [110, 1.35, 0.45, 4_200],
  );
  assert.equal(legacy.headId, undefined, 'the per-head flag removes only Tractor admission');
  assert.equal(legacy.spring, undefined, 'flag-off retains the ordinary standard spring');
  assert.equal(TIDELINE.mods.masslineHeadId, 'tractor', 'the unique base variant retains its head capability');
  // Tractor head + ore magnet are both live (ships.derived + mining.playerPickupMagnetRange).
  assert.match(statSnippet(TRACTOR), /tractor head/i);
  assert.match(statSnippet(TRACTOR), /magnet/i,
    'fitted magnetRange is wired into the scoop; outfitting must advertise the live radius');
});

test('the Tractor spring is one-sided, force-bounded, radial, and momentum-conserving', async () => {
  const owner = makeBody('tractor-owner', 0, { mass: 24, vel: { x: 0, z: 35 } });
  const payload = makeBody('tractor-payload', 120, { mass: 96, vel: { x: 25, z: 35 } });
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  const policy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: 'tractor' } },
  }, PRODUCTION_FEATURES);

  try {
    runtime.syncFromEntities([owner, payload]);
    const handle = runtime.createAttachment({
      attachmentId: 'tractor-tow',
      defId: 'tether_standard',
      ownerId: owner.id,
      targetId: payload.id,
      sourceWorld: owner.pos,
      targetWorld: payload.pos,
      restLength: 80,
      spring: policy.spring,
      tick: 0,
    });
    assert.ok(handle);

    const initialMomentumX = owner.mass * owner.vel.x + payload.mass * payload.vel.x;
    let maxTension = 0;
    for (let tick = 0; tick < 360; tick += 1) {
      runtime.step(DT);
      const telemetry = runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
      maxTension = Math.max(maxTension, telemetry.tension);
    }

    const telemetry = runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
    const finalMomentumX = owner.mass * owner.vel.x + payload.mass * payload.vel.x;
    assert.ok(telemetry.distance < 82,
      `overdamped tow should settle near the player's chosen length, got ${telemetry.distance}`);
    // A one-sided rope cannot push outward to erase the last inward drift after it goes slack.
    // Require the bounded head to remove at least 80% of the 25 WU/s opening rate instead of
    // smuggling a bidirectional position controller into the acceptance contract.
    assert.ok(Math.abs(telemetry.relativeSpeed) < 5,
      `radial tow should settle into the rope-safe low-speed band, got ${telemetry.relativeSpeed}`);
    assert.ok(maxTension <= policy.spring.maxForce + 1e-6,
      `complete Tractor force must stay inside ${policy.spring.maxForce}, got ${maxTension}`);
    assert.ok(Math.abs(finalMomentumX - initialMomentumX) < 0.05,
      `equal/opposite line impulses must conserve momentum: ${initialMomentumX} -> ${finalMomentumX}`);
    assert.ok(Math.abs(owner.vel.z - 35) < 0.01 && Math.abs(payload.vel.z - 35) < 0.01,
      'a radial Tractor head must not damp tangential velocity');
    assert.ok(Math.abs(owner.rot) < 1e-6 && Math.abs(payload.rot) < 1e-6,
      'center-applied line tension must not steer either body');
  } finally {
    runtime.dispose();
  }

  const slackOwner = makeBody('slack-owner', 0, { mass: 24, vel: { x: 0, z: 15 } });
  const slackPayload = makeBody('slack-payload', 60, { mass: 96, vel: { x: 0, z: 15 } });
  const slackRuntime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    slackRuntime.syncFromEntities([slackOwner, slackPayload]);
    const handle = slackRuntime.createAttachment({
      attachmentId: 'tractor-slack',
      defId: 'tether_standard',
      ownerId: slackOwner.id,
      targetId: slackPayload.id,
      sourceWorld: slackOwner.pos,
      targetWorld: slackPayload.pos,
      restLength: 80,
      spring: policy.spring,
      tick: 0,
    });
    for (let tick = 0; tick < 60; tick += 1) slackRuntime.step(DT);
    const telemetry = slackRuntime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
    assert.equal(telemetry.phase, 'slack');
    assert.equal(telemetry.tension, 0, 'a rope cannot push a payload away when it is too close');
    assert.ok(Math.abs(slackOwner.vel.x) < 1e-9 && Math.abs(slackPayload.vel.x) < 1e-9);
  } finally {
    slackRuntime.dispose();
  }
});

test('an active Tractor head snapshots through combat save and Continue', () => {
  const policy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: 'tractor' } },
  }, PRODUCTION_FEATURES);
  const player = { id: 1, alive: true, flags: {} };
  const payload = { id: 2, alive: true, flags: { persistent: true } };
  const state = {
    playerId: player.id,
    entityList: [player, payload],
    entities: new Map([[player.id, player], [payload.id, payload]]),
    combat: {
      attachments: {
        nextId: 2,
        byId: {
          att_000001: {
            id: 'att_000001',
            defId: 'tether_standard',
            ownerId: player.id,
            targetId: payload.id,
            state: 'active',
            restLength: 80,
            tetherPolicy: policy,
          },
        },
      },
      entities: {},
      actions: { nextRequestSeq: 1, nextInstanceSeq: 1, requests: [], activeByActor: {}, cooldownReadyTickByActor: {} },
      statusNextPendingSeq: 1,
    },
  };

  const payloadSave = serializeCombatState(state);
  assert.equal(payloadSave.attachments.byId.att_000001.tetherPolicy.headId, 'tractor');
  assert.equal(payloadSave.attachments.byId.att_000001.tetherPolicy.spring.maxForce, 4_200);

  const restored = {};
  const summary = restoreCombatState(restored, payloadSave, (ref) => {
    if (ref && ref.kind === 'player') return player.id;
    if (ref && ref.kind === 'persistent' && ref.saveId === String(payload.id)) return payload.id;
    return null;
  });
  assert.equal(summary.restoredAttachments, 1);
  assert.deepEqual(
    restored.combat.attachments.byId.att_000001.tetherPolicy,
    policy,
    'Continue must rebuild the same snapshotted Tractor law even after a refit',
  );
});

function makeBody(id, x, options = {}) {
  const mass = options.mass ?? 24;
  return {
    id,
    type: 'ship',
    alive: true,
    radius: 4,
    mass,
    maxSpeed: 170,
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
    vel: { x: options.vel?.x ?? 0, z: options.vel?.z ?? 0 },
    rot: 0,
    angVel: 0,
    data: {},
  };
}
