import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { applySpawnInfos, applyEntityVitals, createReadModel } from '../scripts/lib/simReadModel.mjs';
import { attachSwarmSpecialistVisual } from '../src/render/swarmSpecialistVisuals.js';
import { wrapShipWithAuthoredParts, disposeDetachedObject } from '../src/render/partsLibrary.js';
import { swarmSpecialistPresentationFrame, foldSwarmSpecialistPresentation } from '../src/data/swarmSpecialistPresentation.js';

test('specialist tells stay off the fallback boundary while authored admission is pending', () => {
  const actor = { id: 91, type: 'ship', alive: true, radius: 8, pos: { x: 0, z: 0 },
    data: { lootTableId: 'warden_escort', swarmSpecialist: { kind: 'warden', phase: 'active',
      targetX: 50, targetZ: 0, linkHp: 10, linkMaxHp: 10 } } };
  const fallback = new THREE.Group();
  fallback.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  const boundary = wrapShipWithAuthoredParts(actor, fallback, { releaseMode: true });
  boundary.userData.updateAuthoredMotion(actor, 1, {}, {});
  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(boundary.getObjectByName('SF_SWARM_WARDEN_LINK'), undefined);
});

test('specialist tell resources follow the authored boundary teardown', () => {
  const actor = { data: { lootTableId: 'warden_escort', swarmSpecialist: {
    kind: 'warden', phase: 'active', targetX: 50, targetZ: 0, linkHp: 10, linkMaxHp: 10,
  } }, pos: { x: 0, z: 0 } };
  const root = new THREE.Group();
  assert.equal(attachSwarmSpecialistVisual(root, actor), true);
  root.userData.swarmSpecialistVisual.update(actor, 1);
  const link = root.getObjectByName('SF_SWARM_WARDEN_LINK');
  assert.equal(link.visible, true);
  let geometryDisposed = 0, materialDisposed = 0;
  link.geometry.addEventListener('dispose', () => geometryDisposed++);
  link.material.addEventListener('dispose', () => materialDisposed++);
  disposeDetachedObject(root);
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
});

test('production worker transports changing tells into existing rendered specialist ships', async (t) => {
  const lane = createSimHost();
  t.after(() => lane.shutdown());
  const init = await lane.init({ profile: 'production', seed: 4242,
    scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
  const mirror = createReadModel();
  let tick = 0;
  const drain = async () => {
    const reply = structuredClone(await lane.tick({ tick: ++tick, steps: 0,
      ackEnd: init.initRebuild?.end ?? 0 }));
    applySpawnInfos(mirror, reply.spawnInfos);
    applyEntityVitals(mirror, reply.entityVitals);
    return reply;
  };
  const cases = [
    ['warden', 'warden_escort', 'SF_SWARM_WARDEN_LINK', {
      targetId: 999, targetX: 180, targetZ: 15, linkEnergy: 92, linkMaxEnergy: 92, linkHp: 92, linkMaxHp: 92,
    }],
    ['jackal', 'mine_layer_jackal', 'SF_SWARM_JACKAL_MINE_WAKE', {
      salvoCursor: 0, salvoStartedAt: 120, nextSalvoTick: 138,
      salvoPoints: [{ x: -120, z: 50 }, { x: -190, z: 85 }, { x: -260, z: 120 }],
    }],
    ['anchor', 'field_anchor_controller', 'SF_SWARM_ANCHOR_FIELD_EDGE', {
      anchorActive: true, anchorRadius: 220, anchorStrength: 88,
    }],
  ];
  const pivotNames = {
    warden: ['MOTION_WARDEN_SHIELD_PORT', 'MOTION_WARDEN_SHIELD_STARBOARD'],
    jackal: ['MOTION_JACKAL_GATE_PORT', 'MOTION_JACKAL_GATE_STARBOARD'],
    anchor: ['MOTION_ANCHOR_VANE_FORE', 'MOTION_ANCHOR_VANE_PORT', 'MOTION_ANCHOR_VANE_STARBOARD'],
  };
  const actors = cases.map(([kind, enemyId, overlay, facts], i) => ({
    kind, overlay, facts,
    native: lane.host.runtime.spawn({ type: 'ship', physicsBody: false, radius: 8,
      pos: { x: i * 20, y: 0, z: 0 }, vel: { x: 0, z: 0 },
      data: { lootTableId: enemyId, swarmSpecialist: { kind, phase: 'idle', phaseStartedAt: 0 } },
    }),
  }));
  await drain();
  for (const actor of actors) {
    const { native, kind } = actor;
    actor.row = mirror.entities.get(native.id);
    assert.ok(actor.row, `${kind} reaches the production presentation mirror`);
    assert.notEqual(actor.row.data.swarmSpecialist, native.data.swarmSpecialist);
    actor.mesh = new THREE.Group();
    actor.mesh.position.set(100, 0, 50);
    actor.fallback = new THREE.Group(); actor.mesh.add(actor.fallback);
    actor.mesh.userData.swarmVisualContentRoot = actor.fallback;
    assert.equal(attachSwarmSpecialistVisual(actor.mesh, actor.row), true);
    // Authored admission swaps exactly one child, so child-count-only caches are invalid.
    actor.authored = new THREE.Group();
    for (const name of pivotNames[kind]) {
      const pivot = new THREE.Group(); pivot.name = name; actor.authored.add(pivot);
    }
    actor.mesh.remove(actor.fallback); actor.mesh.add(actor.authored);
    actor.mesh.userData.swarmVisualContentRoot = actor.authored;
    Object.assign(native.data.swarmSpecialist, actor.facts, {
      phase: 'windup', phaseStartedAt: 90, phaseEndsAt: 120, anchorActive: false,
    });
  }
  const windup = await drain();
  for (const actor of actors) {
    assert.ok(windup.entityVitals.some(([id, fields]) => id === actor.native.id && fields.swarmSpecialistFrame));
    assert.equal(actor.row.data.swarmSpecialist.phase, 'windup');
    Object.assign(actor.native.data.swarmSpecialist, actor.facts, {
      phase: 'active', phaseStartedAt: 120, phaseEndsAt: 300,
    });
  }
  await drain();
  for (const actor of actors) {
    assert.equal(mirror.entities.get(actor.native.id), actor.row, 'phase updates preserve entity identity');
    actor.mesh.userData.swarmSpecialistVisual.update(actor.row, 2.25);
    assert.equal(actor.mesh.getObjectByName(actor.overlay)?.visible, true, `${actor.kind} effect follows active state`);
    assert.ok(actor.authored.children.some((pivot) => Math.abs(pivot.quaternion.w) < .999),
      `${actor.kind} animates the replacement root despite unchanged child count`);
  }
  const link = actors[0].mesh.getObjectByName('SF_SWARM_WARDEN_LINK');
  const positions = link.geometry.attributes.position.array;
  const endpoint = new THREE.Vector3();
  // Last six vertices form the end cap of the six-sided link.
  const endBase = positions.length - 18;
  for (let i = 0; i < 6; i++) {
    endpoint.x += positions[endBase + i * 3] / 6;
    endpoint.y += positions[endBase + i * 3 + 1] / 6;
    endpoint.z += positions[endBase + i * 3 + 2] / 6;
  }
  actors[0].mesh.localToWorld(endpoint);
  assert.ok(Math.abs(endpoint.x - 280) < .01 && Math.abs(endpoint.z - 65) < .01,
    'world-frame offset maps the ward endpoint relative to the visible source');
  const steady = await drain();
  for (const actor of actors) assert.ok(!steady.entityVitals.some(([id]) => id === actor.native.id),
    'steady tells emit no repeated vitals');

  actors[0].native.data.swarmSpecialist.linkHp = 31;
  actors[0].native.data.swarmSpecialist.targetX = 212;
  actors[1].native.data.swarmSpecialist.salvoPoints[1].z = 97;
  await drain();
  assert.equal(actors[0].row.data.swarmSpecialist.linkHp, 31);
  assert.equal(actors[0].row.data.swarmSpecialist.targetX, 212);
  assert.equal(actors[1].row.data.swarmSpecialist.salvoPoints[1].z, 97);
  assert.equal(actors[1].row.data.swarmSpecialist.salvoStartedAt, 120);

  for (const actor of actors) Object.assign(actor.native.data.swarmSpecialist, {
    phase: 'recovery', phaseStartedAt: 300, phaseEndsAt: 390, anchorActive: false,
  });
  await drain();
  for (const actor of actors) {
    actor.mesh.userData.swarmSpecialistVisual.update(actor.row, 5.2);
    assert.equal(actor.mesh.getObjectByName(actor.overlay).visible, false, `${actor.kind} danger clears in recovery`);
    Object.assign(actor.native.data.swarmSpecialist, { phase: 'active', anchorActive: actor.kind === 'anchor' });
  }
  await drain();
  for (const actor of actors) {
    actor.mesh.userData.swarmSpecialistVisual.update(actor.row, 5.3);
    assert.equal(actor.mesh.getObjectByName(actor.overlay).visible, true);
    delete actor.native.data.swarmSpecialist;
    if (actor.kind === 'warden') delete actor.native.data.lootTableId;
  }
  await drain();
  for (const actor of actors) {
    actor.mesh.userData.swarmSpecialistVisual.update(actor.row, 5.4);
    assert.equal(actor.mesh.getObjectByName(actor.overlay).visible, false,
      'deleting an active tell immediately hides its previous effect');
    assert.equal(actor.row.data.swarmSpecialist, undefined);
  }
});

test('presentation frame stays bounded and invalid payloads cannot replace a live tell', () => {
  const view = { kind: 'jackal', phase: 'windup', targetId: 'x'.repeat(9000), arbitrary: 'not transported',
    salvoPoints: [{ x: 1, z: 2 }, { x: 3, z: 4 }, { x: 5, z: 6 }, { x: 7, z: 8 }] };
  const frame = swarmSpecialistPresentationFrame(view);
  assert.ok(frame.length < 2048);
  assert.equal(JSON.parse(frame).salvoPoints.length, 3);
  assert.equal(JSON.parse(frame).arbitrary, undefined);
  const row = { data: { swarmSpecialist: { kind: 'anchor', phase: 'active' } } };
  const before = row.data.swarmSpecialist;
  for (const invalid of ['{broken', '{}', JSON.stringify({ kind: 'anchor', phase: 'other' }), ' '.repeat(2049)]) {
    foldSwarmSpecialistPresentation(row, { swarmSpecialistFrame: invalid });
    assert.equal(row.data.swarmSpecialist, before);
  }
  foldSwarmSpecialistPresentation(row, { swarmSpecialistFrame: null });
  assert.equal(row.data.swarmSpecialist, undefined);
});
