import assert from 'node:assert/strict';
import { test } from 'node:test';

// D227 breakup-cascade fixture. Live probes reported fragments === 0 across ~89 s of
// continuously held tether — this drives the REAL production path end to end under a
// genuinely held tether: the real Rapier authority (createSg02DynamicBodyOwner), real
// contact receipts drained off world.step and re-emitted as physics:impact exactly like
// the sim lane does, the real combat kernel routing collision damage, the real
// collisionConsequences admission chain, and the real lifetime owner retiring shards.
// Flags are seeded from PRODUCTION_FEATURES — the same profile the Electron build runs —
// so the whip-deferral and consequence gates behave exactly as they did in the recording.
// Nothing fabricates a fragment: every shard is authored by spawnCollisionTearOff inside
// the production consequence pipeline, from a contact Rapier actually measured.

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import {
  createSg02CombatPhysicsPort,
  createSg02DynamicBodyOwner,
} from '../src/core/sg02DynamicBodyOwner.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { resetPendingSlams } from '../src/systems/hullFracture.js';
import {
  applyFeatureConfigToMaps,
  PRODUCTION_FEATURES,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';

const DT = 1 / 60;
const SLAM_SPEED = 200;   // WU/s — saturates the 8→150 energy ramp (debrisCount 18 → 2 shards)
const TOUCH_SPEED = 4;    // WU/s — under the 8 WU/s touch floor; must not break anything

function craft(id, x, z, vx = 0, vz = 0, { mass = 60, hull = 300, radius = 8, team = 1 } = {}) {
  return {
    id,
    name: `Hull ${id}`,
    type: 'ship',
    team,
    alive: true,
    collides: true,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    angVel: 0,
    mass,
    radius,
    hull,
    hullMax: hull,
    shield: 0,
    armor: 0,
    physicsBody: {
      schemaVersion: 1, radius, mass, inertiaY: mass * radius * radius * 0.5,
      dynamic: true, ccd: true, revision: 0,
    },
    data: { defId: 'ship_kestrel', ai: { huntPlayer: true } },
  };
}

function rock(id, x, z, radius = 14) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    collides: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 1_000_000,
    radius,
    physicsBody: {
      schemaVersion: 1, radius, mass: 1_000_000, inertiaY: 1_000_000,
      dynamic: false, ccd: false, revision: 0,
    },
    data: {},
  };
}

function fragments(state) {
  return state.entityList.filter(
    (e) => e && e.alive !== false && e.data && (e.data.collisionTearOff || e.data.fracturePiece));
}

function nativePose(owner, entity) {
  const rec = owner.records.get(entity.id);
  if (!rec || !rec.body) return null;
  const t = rec.body.translation();
  return { x: t.x, z: t.z };
}

test('held tether + real contact authority: production shards spawn, translate, retire, re-admit', { timeout: 120000 }, async () => {
  resetPendingSlams();
  const flagSnapshot = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);

  const state = createGameState(90210);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.world.currentSectorId = 'sector-breakup';
  state.runtime = { ...(state.runtime || {}), features: PRODUCTION_FEATURES };
  state.combat = state.combat && typeof state.combat === 'object' ? state.combat : {};
  state.combat.attachments = state.combat.attachments || { byId: {} };

  state.playerId = 99;
  const player = craft(state.playerId, -600, 0, 0, 64, { mass: 16, hull: 260, team: 0 });
  player.isPlayer = true;
  const wall = rock(1, 0, 0);
  for (const e of [player, wall]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.nextEntityId = 100; // shards mint 100+; scenario ids stay low and disjoint

  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      entity.alive = true;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };

  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  let kernel = null;
  const consequences = Object.create(collisionConsequences);
  const lifecycle = Object.assign(Object.create(core), { bus });
  const contactLog = [];

  function simTicks(n) {
    for (let i = 0; i < n; i++) {
      state.tick++;
      state.simTime = state.tick * DT;
      owner.syncFromEntities(state.entityList);
      owner.step(DT, state.tick);
      for (const impact of owner.drainContactImpacts()) {
        contactLog.push(impact);
        bus.emit('physics:impact', { ...impact, tick: state.tick, consequenceKernelVersion: 1 });
      }
      consequences.update(DT, state);
      lifecycle.lifetimeSweep(DT, state);
      bus.flush();
    }
  }

  try {
    helpers.combatPhysics = createSg02CombatPhysicsPort(owner);
    kernel = createCombatKernel({ state, bus, helpers });
    consequences.init({
      state,
      bus,
      helpers,
      registry: {
        get: (id) => (id === 'combat' ? { kernel } : id === 'physics' ? { _sg02: owner } : null),
      },
    });

    owner.syncFromEntities(state.entityList);
    owner.step(DT, 0);
    owner.drainContactImpacts();

    // The held tether: a real native rope plus the two mirrors production code reads
    // (player.tether for the plating lifetime holder, the combat attachment ledger for
    // protectedPlatingIds).
    const tetherDistance = Math.hypot(wall.pos.x - player.pos.x, wall.pos.z - player.pos.z);
    assert.ok(owner.createAttachment({
      attachmentId: 'tow',
      defId: 'attachment_massline',
      ownerId: player.id,
      targetId: wall.id,
      sourceWorld: { ...player.pos },
      targetWorld: { ...wall.pos },
      restLength: tetherDistance,
      tick: 0,
    }), 'native tether attachment materializes');
    state.player.tether = {
      active: true, targetId: wall.id, sourceId: player.id, attachmentId: 'tow',
      restLength: tetherDistance, strain: 0, load: 0, phase: 'taut',
    };
    state.combat.attachments.byId.tow = {
      state: 'active', ownerId: player.id, targetId: wall.id, kind: 'attachment_massline',
    };
    assert.equal(owner.diagnostics().attachments, 1, 'the native rope is registered');
    const authorityTick0 = owner.diagnostics().tick;

    // Gentle-touch control: a hull drifting under the touch floor must produce a real
    // contact receipt while shedding nothing, taking no hull damage, and not dying.
    const drifter = craft(60, -26, 0, TOUCH_SPEED, 0, { mass: 30, hull: 300 });
    state.entities.set(drifter.id, drifter);
    state.entityList.push(drifter);
    const drifterHullBefore = drifter.hull;
    const fragmentsBeforeTouch = fragments(state).length;
    const contactsBeforeTouch = contactLog.length;
    simTicks(150);
    const touchReceipt = contactLog.slice(contactsBeforeTouch).some(
      (c) => (c.aId === drifter.id || c.bId === drifter.id) && (c.aId === wall.id || c.bId === wall.id));
    const solverStoppedIt = Math.abs(drifter.vel.x) < TOUCH_SPEED || drifter.pos.x <= -18;
    assert.ok(touchReceipt || solverStoppedIt,
      'the gentle approach must produce a real native contact (receipt or solver brake)');
    assert.equal(drifter.hull, drifterHullBefore, 'a 4 WU/s touch deals no hull damage');
    assert.equal(fragments(state).length, fragmentsBeforeTouch, 'a gentle touch sheds no fragments');
    assert.ok(drifter.alive !== false, 'the drifter survives its own scrape');

    // Burst: four heavy rammers converging on the tethered rock from distinct bearings
    // and staggered standoff, so each pair lands on its own tick. Every hit rides the
    // production wire: native contact receipt -> physics:impact -> consequence resolve
    // -> kernel damage -> tear-off spawn.
    const tickBeforeBurst = state.tick;
    const rammers = [];
    for (let i = 0; i < 4; i++) {
      const angle = -Math.PI / 2 + i * (Math.PI / 3);
      const dist = 220 + i * 140;
      const rammer = craft(
        10 + i,
        wall.pos.x - Math.cos(angle) * dist,
        wall.pos.z - Math.sin(angle) * dist,
        Math.cos(angle) * SLAM_SPEED,
        Math.sin(angle) * SLAM_SPEED,
      );
      rammers.push(rammer);
      state.entities.set(rammer.id, rammer);
      state.entityList.push(rammer);
    }

    let tickOfFirstShard = -1;
    for (let i = 0; i < 400 && tickOfFirstShard < 0; i++) {
      simTicks(1);
      if (fragments(state).length > 0) tickOfFirstShard = state.tick;
    }
    assert.ok(tickOfFirstShard > tickBeforeBurst,
      'a production contact through the held tether must shed real fragments');
    assert.ok(rammers.every((r) => r.alive !== false),
      'sub-lethal slams shed plating without killing the hull');
    // Production sync timing: the shard lands in entityList inside the physics:impact
    // emit — AFTER this tick's syncFromEntities — so its native record is minted on the
    // next tick's sync pass, exactly as in the live lane. Step one more tick before
    // asserting native ownership.
    simTicks(1);

    // Every shard is a real native body: it owns a Rapier record, both the native
    // translation and the facade pose are finite, and both advance over ticks.
    const firstShards = fragments(state);
    const shardPoses = new Map();
    for (const shard of firstShards) {
      assert.equal(shard.type, 'wreck');
      assert.equal(shard.data.collisionTearOff, true);
      assert.equal(shard.data.persistenceOwner, 'collisionConsequences');
      assert.equal(shard.data.homeSectorId, 'sector-breakup');
      const pose = nativePose(owner, shard);
      assert.ok(pose, `shard ${shard.id} must have a live native body`);
      assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.z));
      shardPoses.set(shard.id, { native: pose, facade: { x: shard.pos.x, z: shard.pos.z } });
    }
    const playerNativeBefore = nativePose(owner, player);
    const playerFacadeBefore = { ...player.pos };
    simTicks(30);
    const playerNativeAfter = nativePose(owner, player);
    assert.ok(Math.hypot(playerNativeAfter.x - playerNativeBefore.x, playerNativeAfter.z - playerNativeBefore.z) > 1,
      "the tethered player native body must keep moving while fragments are active");
    assert.ok(Math.hypot(player.pos.x - playerFacadeBefore.x, player.pos.z - playerFacadeBefore.z) > 1,
      "the tethered player facade must keep moving while fragments are active");
    let movedNative = 0;
    let movedFacade = 0;
    for (const shard of firstShards) {
      if (shard.alive === false) continue;
      const prev = shardPoses.get(shard.id);
      const nativeNow = nativePose(owner, shard);
      assert.ok(nativeNow, `shard ${shard.id} keeps a live native body across ticks`);
      if (Math.hypot(nativeNow.x - prev.native.x, nativeNow.z - prev.native.z) > 1e-3) movedNative++;
      if (Math.hypot(shard.pos.x - prev.facade.x, shard.pos.z - prev.facade.z) > 1e-3) movedFacade++;
    }
    assert.ok(movedNative > 0, 'shard native translations advance under the authority');
    assert.ok(movedFacade > 0, 'shard facade poses advance under the authority');
    assert.ok(fragments(state).length <= 32,
      `fragment population stays inside the shared budget (${fragments(state).length})`);
    assert.ok(consequences._tearOffLive.size <= 20, 'admission cap stays bounded');
    assert.ok(state.tick > tickBeforeBurst, 'simulation tick advanced across the burst');

    // Held-tether lifetime protection: retarget the held line onto a live shard —
    // mirrors AND the native joint, so the picture is self-consistent. The shard must
    // outlive every untethered sibling.
    const kept = fragments(state)[0];
    assert.equal(
      owner.cutAttachment({ attachmentId: 'tow', reason: 'retarget', tick: state.tick }),
      true, 'the native rope cuts clean for retarget');
    const keptDistance = Math.hypot(kept.pos.x - player.pos.x, kept.pos.z - player.pos.z);
    assert.ok(owner.createAttachment({
      attachmentId: 'tow',
      defId: 'attachment_massline',
      ownerId: player.id,
      targetId: kept.id,
      sourceWorld: { ...player.pos },
      targetWorld: { ...kept.pos },
      restLength: keptDistance,
      tick: state.tick,
    }), 'the held tether retargets onto the shard natively');
    state.player.tether = {
      active: true, targetId: kept.id, sourceId: player.id, attachmentId: 'tow',
      restLength: keptDistance, strain: 0, load: 0, phase: 'taut',
    };
    state.combat.attachments.byId.tow = {
      state: 'active', ownerId: player.id, targetId: kept.id, kind: 'attachment_massline',
    };
    const doomedSiblings = fragments(state).filter((s) => s !== kept);
    for (let i = 0; i < 66; i++) {
      consequences.update(1, state);
      lifecycle.lifetimeSweep(1, state);
    }
    assert.equal(kept.alive, true, 'the fragment on the held tether must not expire mid-tow');
    assert.ok(doomedSiblings.every((s) => s.alive === false),
      'untethered shards expire through the real lifetime owner');

    // Release: the same sweep retires the shard once the line lets go, and the next
    // sync drops its native record.
    state.player.tether = { active: false, targetId: null, attachmentId: null, restLength: 0, strain: 0, load: 0, phase: 'slack' };
    state.combat.attachments.byId.tow.state = 'broken';
    for (let i = 0; i < 66; i++) {
      consequences.update(1, state);
      lifecycle.lifetimeSweep(1, state);
    }
    assert.equal(kept.alive, false, 'a released fragment resumes normal expiry');
    simTicks(2);
    assert.equal(owner.records.has(kept.id), false, 'the retired shard loses its native body');
    assert.equal(owner.diagnostics().attachments, 0,
      'the dead tether endpoint auto-cuts on record retirement');
    assert.equal(fragments(state).length, 0, 'all burst shards are retired');

    // Re-admission: a fresh rammer during live play sheds again, proving retirement
    // reopened the caps — and the tether is held again through the second cascade.
    const retetherDistance = Math.hypot(wall.pos.x - player.pos.x, wall.pos.z - player.pos.z);
    assert.ok(owner.createAttachment({
      attachmentId: 'tow',
      defId: 'attachment_massline',
      ownerId: player.id,
      targetId: wall.id,
      sourceWorld: { ...player.pos },
      targetWorld: { ...wall.pos },
      restLength: retetherDistance,
      tick: state.tick,
    }), 'the tether re-attaches to the rock');
    state.player.tether = {
      active: true, targetId: wall.id, sourceId: player.id, attachmentId: 'tow',
      restLength: retetherDistance, strain: 0, load: 0, phase: 'taut',
    };
    state.combat.attachments.byId.tow = {
      state: 'active', ownerId: player.id, targetId: wall.id, kind: 'attachment_massline',
    };
    const late = craft(90, -420, -80, SLAM_SPEED, SLAM_SPEED * 0.19);
    state.entities.set(late.id, late);
    state.entityList.push(late);
    for (let i = 0; i < 240 && fragments(state).length === 0; i++) simTicks(1);
    assert.ok(fragments(state).length > 0, 'a post-retirement slam sheds fresh fragments');
    assert.ok(fragments(state).length <= 32, 're-admission stays bounded');
    assert.equal(state.player.tether.active, true, 'the tether is still held through the second cascade');
    assert.equal(owner.diagnostics().attachments, 1, 'the re-attached rope stays registered');
    assert.ok(owner.diagnostics().tick > authorityTick0,
      'the native authority advanced across every phase');
  } finally {
    resetPendingSlams();
    try { consequences.destroy(); } catch (_) {}
    try { kernel?.dispose?.(); } catch (_) {}
    try { bus.clear(); } catch (_) {}
    try { owner.dispose(); } catch (_) {}
    restoreFeatureMaps(flagSnapshot);
  }
});
