/** The normal production pipeline must preserve the certified workfleet graph. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { CERES_WORKFLEET_CONTRACT as contract } from '../src/data/ceresWorkfleet.js';
import { createCeresWorkfleetPropulsionDriver } from '../src/render/ceresWorkfleetVisuals.js';
import { inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';
import { validateMotionBank } from '../src/contracts/motionBank.js';
import { readGlbJson, sceneFromGlbJson, sealMotionBankRef } from '../scripts/lib/renderPackageRuntimeTable.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// A scoped compiler canary can be checked before the shared runtime closure is
// resealed. Its source/release inputs still come from the production manifests.
const packageRoot = process.env.CERES_WORKFLEET_PACKAGE_ROOT || root;
const bytes = path => readFileSync(resolve(path.startsWith('assets/ships/release/render-packages/') ? packageRoot : root, path));
const readJson = path => JSON.parse(bytes(path));
const digest = value => createHash('sha256').update(value).digest('hex');
const parts = [
  ['breaker', 'ceres-breaker'],
  ['cradle', 'ceres-section-cradle'],
  ['cutterHead', 'ceres-breaker-cutter-head'],
];
const pilots = readJson('assets/ships/render-packages/pilots.json');
const release = readJson(pilots.releaseManifest);
const manifest = readJson('assets/ships/parts/parts_manifest.json');
const fleet = readJson('tools/blender/forge/fleet.json');
const near = (actual, expected, label) => {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-4, `${label}: ${index}`));
};
const parents = doc => new Map(doc.nodes.flatMap(node => (node.children || []).map(index => [doc.nodes[index].name, node.name])));
const triangles = (doc, node) => (doc.meshes[node.mesh]?.primitives || [])
  .reduce((sum, primitive) => sum + doc.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3, 0);

for (const [part, key] of parts) {
  test(`${key}: registered source, compressed release and compiled graph keep exact identity and anatomy`, () => {
    const asset = contract.assets[part];
    const sourcePath = `assets/ships/parts/${asset.file}`;
    const releasePath = `assets/ships/release/parts/${asset.file}`;
    const pilot = pilots.pilots.find(row => row.key === key);
    assert.ok(pilot, 'Normal production pilot exists');
    assert.equal(pilot.runtimeAssetId, asset.assetId);
    assert.equal(pilot.sourceUrl, releasePath);
    assert.equal(pilot.sceneRoot, true, 'Scene-root semantics preserve moving-child parentage');
    const row = release.assets.find(row => row.id === asset.partId);
    assert.equal(row.source, sourcePath);
    assert.equal(row.release, releasePath);
    assert.equal(row.sourceSha256, digest(bytes(sourcePath)));
    assert.equal(row.releaseSha256, digest(bytes(releasePath)));
    assert.equal(pilot.releaseSha256, row.releaseSha256);
    const accepted = manifest.parts.find(row => row.id === asset.partId);
    assert.equal(accepted.file, asset.file);
    assert.equal(accepted.mount, 'origin');
    assert.equal(accepted.triangleMetric, 'lod0');
    assert.ok(manifest.runtimeSlots[part === 'breaker' ? 'hull' : 'place'].includes(asset.file));
    assert.equal(fleet.ships[asset.id].asset_id, asset.assetId);
    const pair = inspectReleaseAssetPair(sourcePath, releasePath, { root });
    assert.equal(pair.ok, true, JSON.stringify(pair.issues));

    const source = readGlbJson(bytes(sourcePath));
    const certificate = source.asset.extras.ceresWorkfleet;
    assert.equal(certificate.geometryContractSha256, digest(bytes('src/data/ceresWorkfleet.js')));
    assert.equal(certificate.sourceScale, 2);
    const sourceParents = parents(source);
    const sourceNodes = new Map(source.nodes.map(node => [node.name, node]));
    for (const path of [releasePath, `${pilot.outputDir}/render.glb`]) {
      const graph = readGlbJson(bytes(path));
      assert.deepEqual(graph.asset.extras.ceresWorkfleet, certificate, 'Full geometry certificate survives compression and compilation');
      const targetParents = parents(graph);
      const targetNodes = new Map(graph.nodes.map(node => [node.name, node]));
      assert.ok(!targetNodes.has('COLLISION_HULL'), 'Never replace a receiving void with a convex hull');
      for (const [name, node] of sourceNodes) {
        const target = targetNodes.get(name);
        assert.ok(target, `${path}: ${name} survives`);
        assert.equal(targetParents.get(name), sourceParents.get(name), `${name}: parent survives`);
        if (node.mesh !== undefined) assert.equal(triangles(graph, target), triangles(source, node), `${name}: no downstream simplification`);
        if (/^(MOTION_|SOCKET_|SF_)/.test(name)) {
          near(target.translation || [0, 0, 0], node.translation || [0, 0, 0], `${name}: translation`);
          near(target.rotation || [0, 0, 0, 1], node.rotation || [0, 0, 0, 1], `${name}: rotation`);
          near(target.scale || [1, 1, 1], node.scale || [1, 1, 1], `${name}: scale`);
        }
      }
      assert.equal(graph.nodes.filter(node => node.name.startsWith('COLLISION_')).length, certificate.collision.boxes.length);
      if (part === 'breaker') assert.ok(targetNodes.has('SOCKET_Engine_Main'));
    }

    const metadata = readJson(pilot.metadataUrl);
    const render = readGlbJson(bytes(`${pilot.outputDir}/render.glb`));
    const scene = sceneFromGlbJson(render);
    const flat = [];
    scene.traverse(node => flat.push(node));
    for (const solid of certificate.collision.boxes) {
      const index = flat.findIndex(node => node.name === `COLLISION_${solid.name}`);
      assert.ok(index >= 0 && metadata.runtime.hidden.includes(index), `${solid.name}: real compound helper never renders`);
    }
    for (const node of metadata.nodes.filter(node => node.nodeName.startsWith('MOTION_'))) {
      assert.equal(node.role, 'dynamic', `${node.nodeName}: native machinery remains movable`);
      assert.ok(metadata.nodes.some(child => child.parentId === node.id && child.nodeName.startsWith('LOD0_')));
    }
  });
}

const vector = value => [value.x, value.y, value.z];
function assertPropulsionGraph(graph, asset, label) {
  const channels = asset.propulsion.channels;
  const nodes = new Map(graph.nodes.map(node => [node.name, node]));
  const meshes = new Set();
  assert.deepEqual(graph.asset.extras.ceresWorkfleet.propulsion, asset.propulsion, `${label}: exact channel certificate`);
  for (const channel of channels) {
    const socket = nodes.get(channel.socket);
    assert.ok(socket && socket.mesh === undefined, `${label}: real socket ${channel.socket}`);
    near(socket.translation || [0, 0, 0], vector(channel.mouth).map(value => value / contract.sourceScale), `${label}: mouth`);
    assert.deepEqual(socket.extras.spaceface.forward.map(value => value || 0), vector(channel.exhaustDirection), `${label}: exact exhaust direction`);
    for (const [lod, name] of channel.coreMeshes.entries()) {
      assert.equal(name, `LOD${lod}_${channel.coreHook}_glow_drive`);
      const node = nodes.get(name);
      assert.ok(node && graph.meshes[node.mesh]?.primitives.length === 1, `${label}: independently mutable ${name}`);
      assert.ok(!meshes.has(node.mesh), `${label}: channel/LOD core never shares geometry identity`);
      meshes.add(node.mesh);
      assert.equal(node.extras.ceresThruster.channel, channel.id);
      assert.deepEqual(node.extras.ceresThruster.exhaustNormal, vector(channel.exhaustDirection));
      assert.deepEqual(node.extras.ceresThruster.mouthWU, vector(channel.mouth));
      assert.ok(triangles(graph, node) > 0, `${label}: core has real geometry`);
    }
  }
}

for (const [part, key] of parts.filter(([part]) => part !== 'cradle')) {
  test(`${key}: exact channels remain separate dynamic surfaces through the production pipeline`, () => {
    const asset = contract.assets[part];
    const channels = asset.propulsion.channels;
    const pilot = pilots.pilots.find(row => row.key === key);
    const accepted = manifest.parts.find(row => row.id === asset.partId);
    const hooks = channels.flatMap(channel => channel.coreMeshes);
    assert.deepEqual(accepted.hooks, hooks, 'Manifest validates every exact authored LOD hook');
    assert.deepEqual(fleet.ships[asset.id].hooks, hooks, 'Normal publisher retains exact hook validation');
    assert.deepEqual(pilot.dynamicNameIncludes, fleet.ships[asset.id].dynamicNameIncludes);
    const metadata = readJson(pilot.metadataUrl);
    for (const path of [`assets/ships/parts/${asset.file}`, pilot.sourceUrl, `${pilot.outputDir}/render.glb`]) {
      assertPropulsionGraph(readGlbJson(bytes(path)), asset, path);
    }
    for (const channel of channels) for (const name of channel.coreMeshes) {
      const node = metadata.nodes.find(node => node.nodeName === name);
      assert.equal(node?.role, 'dynamic', `${name}: independently driven metadata`);
      assert.ok(metadata.dynamicGroups.some(group => group.nodeId === node.id && group.kind === 'dynamic-surface'));
    }
    const corrupted = readGlbJson(bytes(`${pilot.outputDir}/render.glb`));
    corrupted.nodes.find(node => node.name === channels[0].socket).extras.spaceface.forward = vector(channels[0].forceDirection);
    assert.throws(() => assertPropulsionGraph(corrupted, asset, 'opposed socket'), /exact exhaust direction/);
  });

  test(`${key}: compiled all-LOD cores admit independent mutable materials per channel and owner`, () => {
    const asset = contract.assets[part];
    const pilot = pilots.pilots.find(row => row.key === key);
    const graph = readGlbJson(bytes(`${pilot.outputDir}/render.glb`));
    const shared = new THREE.MeshStandardMaterial({ emissiveIntensity: 3 });
    // The decoded graph can share one immutable source material across all cores.
    // Admission must clone it per channel and owner while retaining LOD continuity.
    const drivers = [0, 1].map(occupantGeneration => {
      const scene = sceneFromGlbJson(graph);
      for (const channel of asset.propulsion.channels) for (const name of channel.coreMeshes) {
        const core = scene.getObjectByName(name);
        assert.ok(core?.isMesh, `${name}: compiled decode topology`);
        core.material = shared;
      }
      const entity = { type: part === 'breaker' ? 'ship' : 'wreck', mesh: scene, occupantGeneration,
        data: { ceresWorkfleetRole: part, placeId: asset.id,
          worldRecordId: contract.identities[part === 'breaker' ? 'worker' : part] } };
      return createCeresWorkfleetPropulsionDriver(scene, entity);
    });
    try {
      const owned = drivers.flatMap(driver => driver.binding.samples.map(sample => {
        const materials = new Set(sample.meshes.map(mesh => mesh.material));
        assert.equal(materials.size, 1, 'One channel is continuous across all three LODs');
        const material = [...materials][0];
        assert.notEqual(material, shared);
        assert.equal(material.emissiveIntensity, 0, 'Admission begins dark');
        return material;
      }));
      assert.equal(new Set(owned).size, asset.propulsion.channels.length * 2, 'No opposing channel or owner shares mutable radiance');
      owned[0].emissiveIntensity = 2;
      assert.ok(owned.slice(1).every(material => material.emissiveIntensity === 0));
      assert.equal(shared.emissiveIntensity, 3, 'Immutable source material is untouched');
    } finally {
      for (const driver of drivers) {
        driver.dispose();
        for (const sample of driver.binding.samples) for (const { material } of sample.materials) material.dispose();
      }
      shared.dispose();
    }
  });
}

test('compressed production geometry retains every native solid and both passive-stop faces at each LOD', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const [part, key] of parts) {
    const asset = contract.assets[part];
    const pilot = pilots.pilots.find(row => row.key === key);
    for (const path of [pilot.sourceUrl, `${pilot.outputDir}/render.glb`]) {
      const document = await io.readBinary(new Uint8Array(bytes(path)));
      await document.transform(dequantize());
      const nodes = document.getRoot().listNodes();
      const vertices = node => {
        const m = node.getWorldMatrix();
        return node.getMesh().listPrimitives().flatMap(primitive => {
          const attribute = primitive.getAttribute('POSITION');
          return Array.from({ length: attribute.getCount() }, (_, i) => {
            const [x, y, z] = attribute.getElement(i, []);
            return [m[0] * x + m[4] * y + m[8] * z + m[12],
              m[1] * x + m[5] * y + m[9] * z + m[13],
              m[2] * x + m[6] * y + m[10] * z + m[14]].map(value => value * contract.sourceScale);
          });
        });
      };
      for (const solid of asset.states?.open.boxes || asset.boxes) {
        const points = vertices(nodes.find(node => node.getName() === `COLLISION_${solid.id}`));
        for (const [axis, coordinate] of ['x', 'y', 'z'].entries()) {
          const low = Math.min(...points.map(point => point[axis]));
          const high = Math.max(...points.map(point => point[axis]));
          // The standard 14-bit position compression has a measured sub-centimetre
          // bound here. This is transport precision, not an enlarged contact shape.
          assert.ok(Math.abs(low - (solid.center[coordinate] - solid.size[coordinate] / 2)) < .02);
          assert.ok(Math.abs(high - (solid.center[coordinate] + solid.size[coordinate] / 2)) < .02);
        }
      }
      const solids = asset.states?.open.boxes || asset.boxes;
      for (const node of nodes.filter(node => node.getMesh() && node.getExtras().nonRender !== true)) {
        for (const point of vertices(node)) {
          const outside = Math.min(...solids.map(solid => Math.hypot(
            Math.max(0, Math.abs(point[0] - solid.center.x) - solid.size.x / 2),
            Math.max(0, Math.abs(point[2] - solid.center.z) - solid.size.z / 2),
          )));
          assert.ok(outside < .02, `${path}: ${node.getName()} has ${outside} WU of unrepresented flight-plane metal`);
        }
      }
      if (part !== 'breaker') continue;
      const stop = asset.states.open.boxes.find(box => box.id === 'load_stop');
      const face = stop.center.x + stop.size.x / 2;
      for (const lod of [0, 1, 2]) {
        const points = nodes.filter(node => node.getName().startsWith(`LOD${lod}_`) && node.getMesh()).flatMap(vertices);
        for (const side of [-1, 1]) assert.ok(points.some(point => Math.abs(point[0] - face) < .02
          && Math.abs(point[1]) <= 5.02 && point[2] * side >= 4 && point[2] * side <= 10), `${path}: LOD${lod} real stop face ${side}`);
      }
    }
  }
});

for (const [part, key] of parts.slice(0, 2)) {
  test(`${key}: motion bank is source-sealed and its compiled rest transforms are unchanged`, async () => {
    const asset = contract.assets[part];
    const pilot = pilots.pilots.find(row => row.key === key);
    const metadata = readJson(pilot.metadataUrl);
    const bank = validateMotionBank(readJson(`assets/ships/motions/${key}.motion.json`));
    assert.equal(bank.sourceAssetId, asset.assetId);
    assert.equal(bank.sourceGlbSha256, digest(bytes(`assets/ships/parts/${asset.file}`)));
    assert.deepEqual(await sealMotionBankRef(pilot, metadata, { repoRoot: root }), metadata.runtime.motionBank);
    for (const binding of bank.bindings) assert.deepEqual(binding.requiredAtLod, [0, 1, 2]);
    assert.ok(bank.clips.every(clip => !clip.loop), 'No ambient animation overrides physical state');
  });
}
