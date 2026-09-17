// PQ-195.00: the SP-07 assembly and the capture fork are readable objects.
// Fixed-seed/data geometry contracts: the spindle fills its 16 WU collision body
// (never the 6 WU pod stretched), the fork machine agrees with the capture volume,
// and both are wired on the ordinary route (data ids, manifests, bindings, sim).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import {
  BREAKAWAY_CAPTURE_FORK,
  BREAKAWAY_FORK_VISUAL,
  BREAKAWAY_SP07,
  BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  PQ019_CAPSULE,
  PQ019_FACILITIES,
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
  projectBreakawayForkMouth,
} from '../src/data/heistFacilities.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  WORLD_SITE_ASSET_BINDINGS,
  validateWorldSiteAssetBinding,
} from '../src/data/worldSiteAssetBindings.js';
import { forEachDressingRow } from '../src/world/dressingTable.js';

const SP07_PART_ID = 'place_breakaway_sp07';
const FORK_PART_ID = 'place_breakaway_fork';
const SEED = 19500;

function parseGlb(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${path}: GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${path}: GLB version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${path}: declared length`);
  let json = null;
  let binary = null;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) json = JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString('utf8').trim());
    if (type === 0x004e4942) binary = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
  }
  assert.ok(json, `${path}: JSON chunk`);
  assert.ok(binary, `${path}: BIN chunk`);
  return { bytes, json, binary };
}

// Minimal float32 POSITION reader for the unquantized canonical sources.
function sourceVertexXZ(path) {
  const { json, binary } = parseGlb(path);
  const points = [];
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION];
      assert.ok(accessor, `${path}: POSITION accessor`);
      assert.equal(accessor.componentType, 5126, `${path}: float positions`);
      assert.equal(accessor.type, 'VEC3', `${path}: vec3 positions`);
      const view = json.bufferViews[accessor.bufferView];
      const stride = view.byteStride || 12;
      const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
      for (let i = 0; i < accessor.count; i++) {
        const at = base + i * stride;
        points.push([binary.readFloatLE(at), binary.readFloatLE(at + 8)]);
      }
    }
  }
  assert.ok(points.length > 0, `${path}: vertices`);
  return points;
}

function boot(seed = SEED) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: [physics, world, heistFacilities] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  return { sim, state, system: sim.registry.get('heistFacilities') };
}

function forkRows(state) {
  const rows = [];
  forEachDressingRow(state, (row) => {
    if (row.data?.heistFacilityId === 'lawful_catcher'
      && row.data?.heistFacilityRole === 'lawful_catcher_fork') rows.push(row);
  });
  return rows;
}

test('SP-07 data names its own authored body, never the stretched pod', () => {
  assert.equal(BREAKAWAY_SP07.stableId, 'payload_sp07');
  assert.equal(BREAKAWAY_SP07.authoredPayloadAssetId, SP07_PART_ID);
  assert.notEqual(BREAKAWAY_SP07.authoredPayloadAssetId, PQ019_CAPSULE.authoredPayloadAssetId);
  assert.ok(!('visualScale' in BREAKAWAY_SP07), 'no stretch factor on the payload');
  assert.equal(BREAKAWAY_SP07.radius, 16);
  assert.equal(BREAKAWAY_SP07.mass, 180);
  assert.equal(BREAKAWAY_SP07.hull, 480);
  const variant = heistLaunchVariant(BREAKAWAY_THIRD_SHIFT_VARIANT_ID);
  assert.equal(variant.payload.authoredPayloadAssetId, SP07_PART_ID);
  assert.equal(variant.custody, 'capture_fork');
});

test('SP-07 silhouette fills its 16 WU collision body', () => {
  const points = sourceVertexXZ(`assets/ships/parts/places/${SP07_PART_ID}.glb`);
  let maxR = 0;
  for (const [x, z] of points) maxR = Math.max(maxR, Math.hypot(x, z));
  assert.ok(maxR <= BREAKAWAY_SP07.radius,
    `circumradius ${maxR.toFixed(3)} stays inside the 16 WU body`);
  assert.ok(maxR >= BREAKAWAY_SP07.radius - 1.5,
    `circumradius ${maxR.toFixed(3)} fills the 16 WU body instead of the 6 WU pod`);
});

test('SP-07 reads as machinery at thumbnail, not asteroid or fighter', () => {
  const points = sourceVertexXZ(`assets/ships/parts/places/${SP07_PART_ID}.glb`);
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const longSpan = maxX - minX;
  const shortSpan = maxZ - minZ;
  // A caged spindle: elongated along +X, never a sphere-ish rock blob.
  assert.ok(longSpan / shortSpan > 1.3, `spindle aspect ${longSpan.toFixed(1)}/${shortSpan.toFixed(1)}`);
  // The asymmetric service spine breaks top/bottom symmetry (checked on Y below).
  const { json, binary } = parseGlb(`assets/ships/parts/places/${SP07_PART_ID}.glb`);
  let minY = Infinity; let maxY = -Infinity;
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const accessor = json.accessors[primitive.attributes.POSITION];
      const view = json.bufferViews[accessor.bufferView];
      const stride = view.byteStride || 12;
      const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
      for (let i = 0; i < accessor.count; i++) {
        const y = binary.readFloatLE(base + i * stride + 4);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  assert.ok(maxY > Math.abs(minY) + 2, `raised spine breaks symmetry (y ${minY.toFixed(1)}..${maxY.toFixed(1)})`);
});

test('SP-07 tow sockets are pinned fore and aft on the long axis', () => {
  const { json } = parseGlb(`assets/ships/parts/places/${SP07_PART_ID}.glb`);
  const nodes = new Map(json.nodes.map((node) => [node.name, node]));
  for (const [name, expected] of Object.entries({
    socket_tow_front: [14, 0, 0],
    socket_tow_aft: [-14, 0, 0],
    socket_service: [3, 11, 0],
  })) {
    const node = nodes.get(name);
    assert.ok(node, `source node ${name}`);
    assert.deepEqual(node.translation, expected, `${name} translation`);
  }
  const binding = WORLD_SITE_ASSET_BINDINGS[SP07_PART_ID];
  assert.ok(binding, 'spindle binding');
  assert.deepEqual(Object.keys(binding.sockets).sort(),
    ['socket_service', 'socket_tow_aft', 'socket_tow_front']);
});

test('fork machine geometry agrees with the capture volume it visualizes', () => {
  const { json } = parseGlb(`assets/ships/parts/places/${FORK_PART_ID}.glb`);
  const nodes = new Map(json.nodes.map((node) => [node.name, node]));
  assert.deepEqual(nodes.get('socket_mouth')?.translation, [0, 0, 0], 'mouth is the origin');
  assert.deepEqual(nodes.get('socket_seat')?.translation, [44, 0, 0], 'seat inside the bay');
  assert.ok(44 < BREAKAWAY_CAPTURE_FORK.depth, 'seat sits inside the usable depth');
  assert.deepEqual(nodes.get('socket_service')?.translation, [77, 5.5, 0]);
  const packet = JSON.parse(readFileSync(
    'assets/ships/breakaway_v1/source_candidates/manifest.json', 'utf8'));
  const forkContract = packet.assets.find((row) => row.file === 'capture-fork.glb').contract;
  assert.equal(forkContract.innerHalfWidth, BREAKAWAY_CAPTURE_FORK.halfWidth);
  assert.equal(forkContract.usableDepth, BREAKAWAY_CAPTURE_FORK.depth);
  assert.equal(forkContract.origin, 'mouth plane');
  assert.equal(forkContract.inward, '+X');
  assert.equal(BREAKAWAY_FORK_VISUAL.placeId, FORK_PART_ID);
  assert.equal(BREAKAWAY_FORK_VISUAL.placeScale, 1);
});

test('spindle and fork bindings are exact in source, release, and release manifest', () => {
  const releaseManifest = JSON.parse(readFileSync('assets/ships/release/release_manifest.json', 'utf8'));
  const released = new Map(releaseManifest.assets.map((entry) => [entry.id, entry]));
  for (const partId of [SP07_PART_ID, FORK_PART_ID]) {
    const binding = WORLD_SITE_ASSET_BINDINGS[partId];
    assert.ok(binding, `${partId}: binding`);
    assert.equal(validateWorldSiteAssetBinding(binding), true, `${partId}: binding validates`);
    const releaseEntry = released.get(partId);
    assert.ok(releaseEntry, `${partId}: release manifest row`);
    for (const kind of ['source', 'release']) {
      const contract = binding[kind];
      const bytes = readFileSync(contract.path);
      assert.equal(bytes.length, contract.bytes, `${partId}/${kind}: bytes`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), contract.sha256, `${partId}/${kind}: sha`);
      assert.equal(releaseEntry[`${kind}Sha256`], contract.sha256);
      assert.equal(releaseEntry[`${kind}Bytes`], contract.bytes);
    }
  }
});

test('spindle and fork parts rows match their canonical sources', () => {
  const manifest = JSON.parse(readFileSync('assets/ships/parts/parts_manifest.json', 'utf8'));
  const byId = new Map(manifest.parts.map((part) => [part.id, part]));
  for (const partId of [SP07_PART_ID, FORK_PART_ID]) {
    const row = byId.get(partId);
    assert.ok(row, `${partId}: parts row`);
    assert.equal(row.category, 'places');
    const bytes = readFileSync(`assets/ships/parts/places/${partId}.glb`);
    assert.equal(bytes.length, row.bytes, `${partId}: row bytes`);
    assert.ok(manifest.runtimeSlots.place.includes(`places/${partId}.glb`), `${partId}: runtime slot`);
  }
});

test('the fork machine materializes at the capture mouth on the ordinary route', () => {
  const t = boot(SEED);
  const rows = forkRows(t.state);
  assert.equal(rows.length, 1, 'one fork machine on the dressing table');
  const fork = rows[0];
  assert.equal(fork.data.placeId, FORK_PART_ID);
  assert.equal(fork.data.placeScale, 1);
  assert.equal(fork.data.worldDressing, true);
  assert.equal(fork.collides || false, false, 'the machine visual never collides');
  const mouth = projectBreakawayForkMouth();
  const global = sectorLocalToGlobalForSector({ x: mouth.x, z: mouth.z }, PQ019_HEIST_SECTOR_ID);
  assert.ok(Math.abs(fork.pos.x - global.x) < 1e-9, 'fork sits on the capture mouth (x)');
  assert.ok(Math.abs(fork.pos.z - global.z) < 1e-9, 'fork sits on the capture mouth (z)');
  assert.ok(Math.abs(fork.rot - Math.atan2(mouth.nz, mouth.nx)) < 1e-12, 'fork faces inward +X');
  // Idempotent: re-materializing rebinds the same row instead of spawning a second machine.
  t.system.materializeForSector(PQ019_HEIST_SECTOR_ID);
  assert.equal(forkRows(t.state).length, 1, 'still one fork after re-materialize');
});

test('the fork machine leaves with its sector', () => {
  const t = boot(SEED + 1);
  assert.equal(forkRows(t.state).length, 1, 'fork present in Tethys');
  t.system._dematerializeSector(PQ019_HEIST_SECTOR_ID);
  assert.equal(forkRows(t.state).length, 0, 'fork gone after sector exit');
});

test('a launched Third Shift load carries the SP-07 identity', () => {
  const t = boot(SEED + 2);
  t.system.requestLaunchSchedule({
    scheduleId: 'pq19500-sp07-route',
    launchAtSimT: t.state.simTime,
    variantId: BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  });
  t.sim.step(SIM_DT);
  const loads = [...(t.state.entityList || [])].filter((entity) => entity?.alive !== false
    && entity.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId);
  assert.equal(loads.length, 1, 'one SP-07 body launched');
  assert.equal(loads[0].data.authoredPayloadAssetId, SP07_PART_ID);
  assert.equal(loads[0].radius, 16);
  assert.equal(loads[0].type, 'payload');
});
