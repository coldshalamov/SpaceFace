import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  modelTruthFlashOrigin,
  modelTruthPlumeSocketName,
  modelTruthRow,
  modelTruthShotOrigin,
  modelTruthSocketWorld,
  modelTruthTrailSocketName,
} from '../src/data/modelTruth.js';
import {
  shotWorldFromRow,
  weaponSocketNameForSlot,
  weaponSocketNames,
} from '../src/data/modelTruthMounts.js';

// SFQ-B172 — engines, guns and clamps visibly attach to the hulls they belong to. The hornet is
// the shipped case: its authored hardware is twin wingtip cannon pods and twin close-coupled
// drive nozzles (tools/blender/forge/ships/hornet.py), but the exporter's generic centerline
// stations (SOCKET_Weapon_Front at the nose, SOCKET_Engine_Main / SOCKET_Trail_Main mid-notch
// between the bells, generic Trail_Port/Starboard outboard of the bells) were the only stations
// in the manifest, so fire, plume and wake all resolved off the modeled hardware. The authored
// hardpoint sockets are now the manifest truth, and an integrated forge hull must not grow
// fabricated centerline stations at runtime.

const ROOT = resolve(import.meta.dirname, '..');

// Fixed seed for the scenario fixture (repo convention, seed 4242). The attach contract is
// deterministic geometry: the seed only picks where the hull sits and how it is turned, and the
// assertions hold for any pose.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(4242);
const POSE = { x: -40 + rng() * 80, z: -40 + rng() * 80, rot: rng() * Math.PI * 2 };

function hornet() {
  const row = modelTruthRow('ship_hornet');
  assert.ok(row, 'ship_hornet is a live model-truth row');
  return {
    id: 'ship_hornet',
    type: 'ship',
    alive: true,
    pos: { x: POSE.x, z: POSE.z },
    rot: POSE.rot,
    radius: row.gameplay.entityRadius || 16,
    data: { defId: 'ship_hornet' },
  };
}

function rowSocket(row, name) {
  return (row.sockets || []).find((socket) => socket.name === name) || null;
}

function readGlbSceneExtras(relPath) {
  const bytes = readFileSync(resolve(ROOT, relPath));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'glb magic');
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const scene = json.scenes[json.scene || 0];
  return { json, extras: scene.extras || null };
}

test('hornet manifest carries the authored pod hardpoints, not a fabricated centerline gun', () => {
  const row = modelTruthRow('ship_hornet');
  const weapons = weaponSocketNames(row);
  assert.deepEqual(weapons, ['SOCKET_Weapon_Port', 'SOCKET_Weapon_Starboard'],
    'the twin tip cannon pods are the only weapon stations');
  assert.equal(rowSocket(row, 'SOCKET_Weapon_Front'), null,
    'no centerline weapon station is authored or fabricated in the manifest');

  const port = rowSocket(row, 'SOCKET_Weapon_Port');
  const starboard = rowSocket(row, 'SOCKET_Weapon_Starboard');
  // glTF axes: +X forward, +Z starboard; Blender port (+Y) exports to -Z. The pods sit on the
  // tip rail at Blender y=±4.15 with muzzles at x=-1.05 (hornet.py SOCKETS).
  assert.ok(Math.abs(port.position[0] + 1.05) < 0.15, `port muzzle x near the barrel face, got ${port.position[0]}`);
  assert.ok(Math.abs(starboard.position[0] - port.position[0]) < 1e-6, 'pod muzzles share the same x');
  assert.ok(Math.abs(port.position[2] + starboard.position[2]) < 1e-6, 'pods are mirrored about the keel');
  assert.ok(Math.abs(Math.abs(port.position[2]) - 4.15) < 0.15,
    `stations sit at the modeled pod, got |z|=${Math.abs(port.position[2])}`);
  assert.ok(Math.abs(port.position[1]) < 0.2, 'stations sit in the barrel plane, not above the wing');
});

test('hornet engine and wake stations sit on the twin nozzle bells, not mid-notch', () => {
  const row = modelTruthRow('ship_hornet');
  assert.equal(rowSocket(row, 'SOCKET_Engine_Main'), null, 'no centerline drive station is authored');
  assert.equal(rowSocket(row, 'SOCKET_Trail_Main'), null, 'no centerline wake station is authored');

  for (const side of ['Port', 'Starboard']) {
    const engine = rowSocket(row, `SOCKET_Engine_${side}`);
    const trail = rowSocket(row, `SOCKET_Trail_${side}`);
    assert.ok(engine && trail, `${side} carries both a bell station and a wake station`);
    // The bells face -X with lips at Blender x=-5.2, y=±0.5 (forge.py nozzle: lip at center).
    assert.ok(Math.abs(Math.abs(engine.position[2]) - 0.5) < 0.1,
      `${side} bell station on the nozzle axis, got |z|=${Math.abs(engine.position[2])}`);
    assert.ok(Math.abs(Math.abs(trail.position[2]) - Math.abs(engine.position[2])) < 1e-6,
      `${side} wake station trails its own bell, not a fabricated wide pair`);
    assert.ok(trail.position[0] < engine.position[0], `${side} wake station sits aft of the bell lip`);
    assert.ok(Math.abs(engine.position[0] + 5.2) < 0.15,
      `${side} bell station at the exhaust face, got x=${engine.position[0]}`);
  }
});

test('fire control resolves through the authored hardpoints — no hull-center or nose fallback', () => {
  const row = modelTruthRow('ship_hornet');
  const entity = hornet();

  assert.equal(weaponSocketNameForSlot(row, 0), 'SOCKET_Weapon_Port');
  assert.equal(weaponSocketNameForSlot(row, 1), 'SOCKET_Weapon_Starboard');
  // Overflow fits fall back to the first authored station — always a modeled gun.
  assert.equal(weaponSocketNameForSlot(row, 5), 'SOCKET_Weapon_Port');

  for (const [slot, name] of [[0, 'SOCKET_Weapon_Port'], [1, 'SOCKET_Weapon_Starboard']]) {
    const origin = modelTruthShotOrigin(entity, { slotIndex: slot });
    assert.ok(origin, `slot ${slot} shot origin resolves`);
    const expected = shotWorldFromRow(row, entity, slot);
    assert.ok(Math.hypot(origin.x - expected.x, origin.z - expected.z) < 1e-6,
      `slot ${slot} fire control and the mount agree`);
    const offHull = Math.hypot(origin.x - entity.pos.x, origin.z - entity.pos.z);
    assert.ok(offHull > entity.radius * 0.2,
      `slot ${slot} fires from the pod, not the hull center (offset ${offHull.toFixed(2)} WU)`);
    // Outboard component dominates: pods fire from the wingtips, not the nose centerline.
    const c = Math.cos(entity.rot), s = Math.sin(entity.rot);
    const dx = origin.x - entity.pos.x, dz = origin.z - entity.pos.z;
    const lateral = Math.abs(dx * -s + dz * c);
    const forward = Math.abs(dx * c + dz * s);
    assert.ok(lateral > forward, `slot ${slot} origin is a wingtip, not a nose point`);
  }

  const flash = modelTruthFlashOrigin(entity, { slotIndex: 0 });
  const shot = modelTruthShotOrigin(entity, { slotIndex: 0 });
  assert.ok(Math.hypot(flash.x - shot.x, flash.z - shot.z) < 1e-6, 'muzzle flash rides the same mount');
});

test('plume and wake picks name authored stations that exist on the body', () => {
  const row = modelTruthRow('ship_hornet');
  const entity = hornet();

  const plumeName = modelTruthPlumeSocketName(entity);
  const trailName = modelTruthTrailSocketName(entity);
  assert.equal(plumeName, 'SOCKET_Engine_Port', 'plume pick is an authored bell station');
  assert.equal(trailName, 'SOCKET_Trail_Port', 'wake pick is an authored trail station');
  assert.ok(rowSocket(row, plumeName), 'plume station exists in the manifest');
  assert.ok(rowSocket(row, trailName), 'wake station exists in the manifest');
  const plumeWorld = modelTruthSocketWorld(entity, plumeName);
  const trailWorld = modelTruthSocketWorld(entity, trailName);
  assert.ok(plumeWorld && trailWorld, 'both stations resolve to world positions');
  assert.ok(trailWorld.z !== plumeWorld.z || trailWorld.x < plumeWorld.x, 'wake station is behind the bell');
});

test('the authored body declares integratedHardpoints, so the runtime plants no generic stations', () => {
  const { extras, json } = readGlbSceneExtras('assets/ships/parts/wholeships/hornet_production_v1.glb');
  const asset = extras && extras.spacefaceAsset;
  assert.ok(asset, 'hornet GLB carries the spaceface asset contract');
  assert.equal(asset.integratedHardpoints, true, 'the body owns its hardware');
  assert.equal(asset.surfaceGeometryRemaster, 'forge-v1', 'forge-v1 body');

  const authored = new Set(json.nodes.map((n) => n.name).filter((n) => n.startsWith('SOCKET_')));
  assert.equal(authored.has('SOCKET_Weapon_Front'), false, 'no centerline gun station in the GLB');
  assert.equal(authored.has('SOCKET_Engine_Main'), false, 'no centerline drive station in the GLB');
  assert.equal(authored.has('SOCKET_Trail_Main'), false, 'no centerline wake station in the GLB');
  assert.ok(authored.has('SOCKET_Weapon_Port') && authored.has('SOCKET_Weapon_Starboard'),
    'pod stations are in the GLB');
  assert.ok(authored.has('SOCKET_Engine_Port') && authored.has('SOCKET_Engine_Starboard'),
    'bell stations are in the GLB');

  // The variant hull shares the build and inherits the hardpoint contract.
  const variant = readGlbSceneExtras('assets/ships/parts/wholeships/hornet_scn_interdictor.glb');
  assert.equal(variant.extras && variant.extras.spacefaceAsset
    && variant.extras.spacefaceAsset.integratedHardpoints, true, 'variant is integrated too');
  const variantSockets = new Set(variant.json.nodes.map((n) => n.name).filter((n) => n.startsWith('SOCKET_')));
  assert.equal(variantSockets.has('SOCKET_Weapon_Front'), false, 'variant carries no fabricated centerline gun');
});
