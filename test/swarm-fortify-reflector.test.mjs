import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunState } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmFortify } from '../src/systems/swarmFortify.js';
import { physics } from '../src/core/physics.js';
import { makeEntity } from '../src/core/entity.js';
import {
  SWARM_FORTIFY_COMMAND,
  SWARM_FORTIFY_RECEIPT,
  SWARM_FORTIFY_REPAIR_COMMAND,
  SWARM_FORTIFY_STATE,
  SWARM_FORTIFY_STATE_REQUESTED,
  SWARM_FORTIFY_FACINGS,
  swarmFortifyReflectorGeometry,
} from '../src/data/swarmFortify.js';
import { foundryPlateShape } from '../src/data/foundryPlate.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage } from '../src/combat/attackLineage.js';
import { resolveRicochet } from '../src/combat/surfaceReflection.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import * as THREE from 'three';

const near = (actual, expected, epsilon = 1e-4) => assert.ok(
  Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

function makeBus() {
  const listeners = new Map();
  return {
    on(event, fn) {
      const rows = listeners.get(event) || [];
      rows.push(fn);
      listeners.set(event, rows);
      return () => listeners.set(event, (listeners.get(event) || []).filter((row) => row !== fn));
    },
    emit(event, payload) {
      for (const fn of [...(listeners.get(event) || [])]) fn(payload);
    },
  };
}

function makeRun({ credits = 400, phase = 'draft', wave = 1 } = {}) {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 27 });
  run.phase = phase;
  run.wave = wave;
  run.credits = credits;
  return run;
}

// The minimal live fixture: a pilot at the arena anchor, manual entity spawns mirroring the
// fortify suite, and the command bus. Returns handles for receipts/read models.
function fixture({ credits = 400 } = {}) {
  const state = { run: makeRun({ credits }), playerId: 1, tick: 0, entities: new Map(), entityList: [] };
  const player = { id: 1, type: 'ship', alive: true, collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, team: 0, factionId: 'pilot' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const bus = makeBus();
  runSession.init({ state, bus });
  const removed = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: state.nextEntityId = (state.nextEntityId || 100) + 1, alive: true };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { id: entity.id, entity });
      return entity;
    },
    removeEntity(id, options) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      entity.alive = false;
      state.entities.delete(id);
      state.entityList.splice(state.entityList.indexOf(entity), 1);
      removed.push({ id, options });
      bus.emit('entity:destroyed', { id, entity });
      return true;
    },
    // Same prepare/commit/finalize contract as the combat hull owner.
    prepareRepairCombatHulls(repairs) {
      const prepared = [];
      for (const row of repairs || []) {
        const entity = state.entities.get(row && row.entityId);
        const hull = Number(entity && entity.hull);
        const hullMax = Number(entity && entity.hullMax);
        if (!entity || entity.alive === false || !(hull > 0) || !(hullMax > 0) || !(row.amount > 0)) {
          return { ok: false, reason: 'entity_unavailable', repairs: [] };
        }
        const after = Math.min(hullMax, hull + row.amount);
        prepared.push({ entity, before: hull, after, applied: Math.max(0, after - hull) });
      }
      const results = prepared.map(({ entity, before, after, applied }) => ({
        entityId: entity.id, before, after, applied }));
      if (!results.some((row) => row.applied > 0)) {
        return { ok: false, reason: 'hull_full', repairs: results };
      }
      let committed = false;
      return {
        ok: true,
        repairs: results,
        commit() {
          for (const row of prepared) row.entity.hull = row.after;
          committed = true;
          return { ok: true, repairs: results };
        },
        rollback() {
          for (const row of prepared) row.entity.hull = row.before;
          return true;
        },
        finalize() { return committed; },
      };
    },
  };
  swarmFortify.init({ state, bus, helpers });
  bus.emit('run:wavePlanned', { wave: 1 });
  const receipts = [];
  const readModels = [];
  bus.on(SWARM_FORTIFY_RECEIPT, (receipt) => receipts.push(receipt));
  bus.on(SWARM_FORTIFY_STATE, (model) => readModels.push(model));
  bus.emit(SWARM_FORTIFY_STATE_REQUESTED, { requestId: 'open' });
  const runToken = readModels.at(-1).runToken;
  return {
    state, bus, helpers, player, receipts, readModels, runToken, removed,
    build(requestId, socketId, facing, extra = {}) {
      bus.emit(SWARM_FORTIFY_COMMAND, {
        requestId, runToken, deviceId: 'reflector_fin', socketId, ...(facing ? { facing } : {}), ...extra,
      });
      return receipts.at(-1);
    },
    fin() {
      return state.entityList.find((entity) => entity.data?.swarmFortify?.deviceId === 'reflector_fin') || null;
    },
    destroy() { swarmFortify.destroy(); runSession.destroy(); },
  };
}

test('the Reflector Fin builds as an oriented bank-plate collider, not a radius ball', () => {
  const h = fixture();
  try {
    const receipt = h.build(1, 'front-near', 'cant_cw');
    assert.equal(receipt.accepted, true);
    assert.equal(h.state.run.credits, 400 - 90);
    const fin = h.fin();
    assert.ok(fin, 'the structure is a real entity');
    assert.equal(fin.type, 'beacon');
    assert.equal(fin.collides, true);
    assert.equal(fin.data.surfaceMaterial, 'plate');
    assert.equal(fin.data.swarmFortify.facing, 'cant_cw');
    assert.equal(fin.data.foundryPlate.halfWidth, 48);
    assert.equal(fin.data.foundryPlate.halfDepth, 16.900000000000002, 'referenceRadius 26 * 0.65');
    const shape = foundryPlateShape(fin);
    near(-Math.sin(shape.rot), fin.data.swarmFortify.faceNormal.x);
    near(Math.cos(shape.rot), fin.data.swarmFortify.faceNormal.z);
    assert.equal(shape.rot, fin.rot, 'entity yaw is the authored plate yaw');
    assert.equal(shape.radius, fin.radius);
    const manifest = resolveCollisionProxyManifest(fin);
    assert.equal(manifest.id, 'foundry:bank-plate');
    near(manifest.primitives[0].hx * fin.radius, shape.halfWidth);
    near(manifest.primitives[0].hz * fin.radius, shape.halfDepth);
    // Durable geometry survives a save/restore round trip: foundryPlateShape re-derives
    // the same shape from the serialized datum.
    const restored = JSON.parse(JSON.stringify(fin));
    assert.deepEqual(foundryPlateShape(restored), shape);
  } finally { h.destroy(); }
});

test('each facing produces a different physical face on the same socket', () => {
  const h = fixture({ credits: 400 });
  try {
    // One fin per corridor: near+far sockets on the same corridor are only 90 WU apart,
    // so two 96-WU slabs honestly cannot coexist there — the preview shows it blocked.
    const sockets = ['front-near', 'port-near', 'starboard-near'];
    const facings = ['square', 'cant_cw', 'cant_ccw'];
    const fins = [];
    for (let i = 0; i < facings.length; i++) {
      const receipt = h.build(10 + i, sockets[i], facings[i]);
      assert.equal(receipt.accepted, true, `${facings[i]} builds`);
      fins.push(h.state.entityList.at(-1));
    }
    assert.equal(h.state.run.credits, 400 - 3 * 90);
    const normals = new Set(fins.map((fin) =>
      `${fin.data.swarmFortify.faceNormal.x.toFixed(3)},${fin.data.swarmFortify.faceNormal.z.toFixed(3)}`));
    assert.equal(normals.size, 3, 'three built fins, three distinct face normals');
    // All four authored facings answer different normals on one socket — including edge,
    // which is verified geometrically since a second fin cannot share the corridor.
    const socketPos = fins[0].pos;
    const previewNormals = new Set(SWARM_FORTIFY_FACINGS.map((facing) => {
      const geometry = swarmFortifyReflectorGeometry(socketPos, { x: 0, z: 0 }, facing,
        { halfWidth: 48, referenceRadius: 26 });
      return `${geometry.face.x.toFixed(3)},${geometry.face.z.toFixed(3)}`;
    }));
    assert.equal(previewNormals.size, 4, 'four facings, four distinct face normals on one socket');
    // The authored face normal equals the preview's face for that socket/facing — same definition.
    for (let i = 0; i < fins.length; i++) {
      const geometry = swarmFortifyReflectorGeometry(
        fins[i].pos, { x: 0, z: 0 },
        SWARM_FORTIFY_FACINGS.find((facing) => facing.id === fins[i].data.swarmFortify.facing),
        { halfWidth: 48, referenceRadius: 26 });
      near(fins[i].data.swarmFortify.faceNormal.x, geometry.face.x);
      near(fins[i].data.swarmFortify.faceNormal.z, geometry.face.z);
      near(fins[i].rot, geometry.shape.rot);
    }
  } finally { h.destroy(); }
});

test('a production projectile sweep banks off the live fin face with the same speed', () => {
  const h = fixture();
  try {
    h.build(1, 'front-near', 'cant_ccw');
    const fin = h.fin();
    const n = fin.data.swarmFortify.faceNormal;
    const shape = foundryPlateShape(fin);
    const tangent = { x: n.z, z: -n.x };
    const speed = 300;
    const projectile = h.helpers.spawnEntity({
      type: 'projectile', radius: 0.7, collides: true, ownerId: h.player.id,
      pos: { x: fin.pos.x + tangent.x * 20 + n.x * 4, z: fin.pos.z + tangent.z * 20 + n.z * 4 },
      vel: { x: -n.x * speed, z: -n.z * speed },
      data: { damageType: 'kinetic', damage: 1 },
    });
    // prevPos is the runtime integration record — one long segment proves no tunneling.
    projectile.prevPos = {
      x: fin.pos.x + tangent.x * 20 + n.x * (shape.halfDepth + projectile.radius + 60),
      z: fin.pos.z + tangent.z * 20 + n.z * (shape.halfDepth + projectile.radius + 60),
    };
    let payload;
    h.bus.on('projectile:hit', (value) => { payload = value; });
    const host = Object.create(physics);
    host.init({ state: h.state, bus: h.bus, helpers: h.helpers });
    host.sweepProjectiles(1 / 3, h.state);
    assert.ok(payload, 'the live sweep issued a surface receipt');
    assert.equal(payload.targetId, fin.id);
    near(payload.normal.x, n.x, 1e-3);
    near(payload.normal.z, n.z, 1e-3);
    assert.deepEqual(payload.normal, payload.receipt.normal);
    const compiled = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [['mod_bank_shot', 1]] });
    assert.equal(compiled.ok, true);
    const result = resolveRicochet(createLineage({ spec: compiled.spec }), compiled.spec, payload.receipt, projectile);
    assert.equal(result.ok, true);
    // Energy conservation: a passive slab cannot amplify. |v_out| == |v_in|.
    near(Math.hypot(result.velocity.x, result.velocity.z), speed, 0.5);
    // And it actually turned: the reflected velocity is not the incoming velocity. (The
    // continuation mirrors entity.vel immediately, so compare against the fired shot.)
    assert.ok(Math.hypot(result.velocity.x + n.x * speed, result.velocity.z + n.z * speed) > speed,
      'a canted face turns the shot');
    // A shot without the bank trait does not ricochet — the fin is still honest cover.
    const plain = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [] });
    const refused = resolveRicochet(createLineage({ spec: plain.spec }), plain.spec, payload.receipt, projectile);
    assert.equal(refused.ok, false);
  } finally { h.destroy(); }
});

test('square and canted facings return different reflected velocity for identical radial fire', () => {
  const outcomes = {};
  for (const facing of ['square', 'cant_cw', 'edge']) {
    const h = fixture();
    try {
      h.build(1, 'front-near', facing);
      const fin = h.fin();
      const speed = 300;
      // Radial shot: from the anchor straight outward through the socket.
      const dir = { x: fin.pos.x / Math.hypot(fin.pos.x, fin.pos.z), z: fin.pos.z / Math.hypot(fin.pos.x, fin.pos.z) };
      const projectile = h.helpers.spawnEntity({
        type: 'projectile', radius: 0.7, collides: true, ownerId: h.player.id,
        pos: { x: fin.pos.x + dir.x * 4, z: fin.pos.z + dir.z * 4 },
        vel: { x: dir.x * speed, z: dir.z * speed },
        data: { damageType: 'kinetic', damage: 1 },
      });
      projectile.prevPos = { x: fin.pos.x - dir.x * 100, z: fin.pos.z - dir.z * 100 };
      let payload;
      h.bus.on('projectile:hit', (value) => { payload = value; });
      const host = Object.create(physics);
      host.init({ state: h.state, bus: h.bus, helpers: h.helpers });
      host.sweepProjectiles(1 / 3, h.state);
      assert.ok(payload, `${facing}: sweep hit the slab`);
      const compiled = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [['mod_bank_shot', 1]] });
      const result = resolveRicochet(createLineage({ spec: compiled.spec }), compiled.spec, payload.receipt, projectile);
      assert.equal(result.ok, true);
      outcomes[facing] = { normal: payload.normal, velocity: result.velocity };
      near(Math.hypot(result.velocity.x, result.velocity.z), speed, 0.5);
    } finally { h.destroy(); }
  }
  // Square sends radial fire back toward the anchor; the cant turns it sideways; the edge
  // presents only its end cap — three materially different physical outcomes from one device.
  assert.ok(outcomes.square.velocity.z > 0.9 * 300 || outcomes.square.velocity.z < -0.9 * 300,
    'square returns along the radial');
  assert.ok(Math.abs(outcomes.cant_cw.velocity.x) > 0.5 * 300,
    'the cant turns radial fire laterally');
  assert.ok(
    Math.hypot(outcomes.square.velocity.x - outcomes.cant_cw.velocity.x,
      outcomes.square.velocity.z - outcomes.cant_cw.velocity.z) > 200,
    'square vs cant are measurably different');
});

test('refusal vocabulary covers bad facing, replayed commands, wrong phase, and blocked sockets', () => {
  const h = fixture();
  try {
    // Unknown facing: refused before wallet.
    let receipt = h.build(1, 'front-near', 'sideways');
    assert.equal(receipt.accepted, false);
    assert.equal(receipt.reason, 'unknown_facing');
    assert.equal(h.state.run.credits, 400);
    assert.equal(h.fin(), null);

    // Accepted build; replayed requestId returns the cached receipt with no second body or debit.
    receipt = h.build(2, 'front-near');
    assert.equal(receipt.accepted, true);
    receipt = h.build(2, 'front-near');
    assert.equal(receipt.accepted, true);
    assert.equal(h.state.entityList.filter((e) => e.data?.swarmFortify?.deviceId === 'reflector_fin').length, 1);
    assert.equal(h.state.run.credits, 310);

    // The same socket now refuses as occupied — the fin is physically there.
    receipt = h.build(3, 'front-near', 'square');
    assert.equal(receipt.accepted, false);
    assert.equal(receipt.reason, 'socket_blocked');
    assert.equal(h.state.run.credits, 310);

    // Out of phase: construction is refit/draft work only.
    runSession.transition({ expectedPhase: 'draft', nextPhase: 'wave_intro' });
    receipt = h.build(4, 'port-near', 'square');
    assert.equal(receipt.accepted, false);
    assert.equal(receipt.reason, 'phase_closed');
    assert.equal(h.state.run.credits, 310);
  } finally { h.destroy(); }
});

test('the read model previews the same physical answer the sweep will give', () => {
  const h = fixture();
  try {
    const model = swarmFortify.getReadModel();
    const socket = model.sockets.find((row) => row.id === 'front-near');
    const preview = socket.devices.reflector_fin;
    assert.equal(preview.blocked, false);
    assert.equal(preview.facings.length, SWARM_FORTIFY_FACINGS.length);
    const inward = { x: -socket.x / Math.hypot(socket.x, socket.z), z: -socket.z / Math.hypot(socket.x, socket.z) };
    const byFacing = Object.fromEntries(preview.facings.map((row) => [row.id, row]));
    // Square: a radial shot comes back at the pilot.
    near(byFacing.square.reflected.x, inward.x, 1e-3);
    near(byFacing.square.reflected.z, inward.z, 1e-3);
    // The cants turn it materially.
    assert.ok(Math.abs(byFacing.cant_cw.reflected.x - byFacing.cant_ccw.reflected.x) > 0.5
      || Math.abs(byFacing.cant_cw.reflected.z - byFacing.cant_ccw.reflected.z) > 0.5);
    // All predicted directions are unit vectors — no promised amplification.
    for (const row of preview.facings) {
      near(Math.hypot(row.reflected.x, row.reflected.z), 1, 1e-3);
      near(Math.hypot(row.entryNormal.x, row.entryNormal.z), 1, 1e-3);
      assert.equal(row.halfWidth, 48);
    }
  } finally { h.destroy(); }
});

test('a damaged fin repairs through the canonical hull owner and the run end retires it', () => {
  const h = fixture();
  try {
    h.build(1, 'front-near', 'square');
    const fin = h.fin();
    fin.hull = 60;
    const repairReceipts = [];
    h.bus.on(SWARM_FORTIFY_RECEIPT, (r) => repairReceipts.push(r));
    h.bus.emit(SWARM_FORTIFY_REPAIR_COMMAND, { requestId: 50, runToken: h.runToken, entityId: fin.id });
    const receipt = repairReceipts.at(-1);
    assert.equal(receipt.accepted, true);
    assert.equal(fin.hull, fin.hullMax);
    assert.equal(h.state.run.credits, 310 - 27);
    h.bus.emit('run:ended', { outcome: 'defeat' });
    assert.equal(h.fin(), null);
    assert.equal(h.removed.some((row) => row.id === fin.id && row.options.immediate === true), true);
  } finally { h.destroy(); }
});

test('the visual is a real slab scaled to the physical footprint, not a borrowed icon', () => {
  const h = fixture();
  try {
    h.build(1, 'front-near', 'square');
    const fin = h.fin();
    const shape = foundryPlateShape(fin);
    const factory = createVisualFactory();
    const visual = factory.build(fin);
    assert.ok(visual, 'the factory produces a fin kit');
    assert.equal(visual.userData.visualLanguage, 'fortify-reflector_fin');
    const box = new THREE.Box3().setFromObject(visual);
    // The kit is authored at unit radius then scaled — the footprint tracks the OBB.
    assert.ok(box.max.x > shape.halfWidth * 0.8, `visual width covers the slab (${box.max.x})`);
    assert.ok(box.max.z > shape.halfDepth * 0.8, `visual depth covers the slab (${box.max.z})`);
    const emitter = visual.children.find((child) => child.name === 'FortifyEmitter');
    assert.ok(emitter, 'a bright mirror face exists');
    // Damage reads: the mirror dims when the hull is low.
    fin.hull = 10;
    visual.userData.updateRuntimeState(fin);
    assert.equal(emitter.material.name, 'FortifyDamagedEmitter');
  } finally { h.destroy(); }
});
