/** Candidate-only source container using the exact existing shipping precision and texture encodes. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as equal } from 'node:util';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { reorder } from '@gltf-transform/functions';
import { textureEncodingKey } from '../../../scripts/lib/cachedKtx2.mjs';
import { RELEASE_MESHOPT_OPTIONS } from '../../../scripts/lib/releaseMeshoptProfile.mjs';
import { parseGlb, sha, encodingRecipe, bindings, eligibleImage } from './texture_cache_seed.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE = 'assets/ships/parts/places/place_station_trade_hub.glb';
const RELEASE = 'assets/ships/release/parts/places/place_station_trade_hub.glb';
const OUTPUT = '.devshots/helios-remaster/trade-hub-compact/place_station_trade_hub.glb';
const RECORD = 'tools/blender/helios_remaster/trade_hub_compact.json';
const read = file => readFileSync(resolve(ROOT, file));
const check = (ok, message) => { if (!ok) throw new Error(message); };
const sourceBytes = read(SOURCE), releaseBytes = read(RELEASE);
const source = parseGlb(sourceBytes), release = parseGlb(releaseBytes);
check(releaseBytes.length < 100_000_000, 'Existing shipping asset exceeds 100 MB');
check(equal(source.doc.asset.extras, release.doc.asset.extras), 'Canonical asset identity changed');
check(equal(source.doc.scenes, release.doc.scenes), 'Scene identity/hierarchy changed');
for (const kind of ['nodes', 'materials']) {
  check(source.doc[kind].length === release.doc[kind].length, `${kind} count changed`);
  for (const item of source.doc[kind]) {
    const peers = release.doc[kind].filter(x => x.name === item.name);
    check(peers.length === 1 && equal(item.extras, peers[0].extras), `${kind} identity/markers changed: ${item.name}`);
    if (kind === 'nodes') {
      for (const key of ['children', 'mesh', 'skin', 'camera'])
        check(equal(item[key], peers[0][key]), `Node attachment changed: ${item.name}/${key}`);
      if (item.mesh === undefined) check(equal(item, peers[0]), `Socket/helper contract changed: ${item.name}`);
    }
  }
}
const { profiles, decodeImage } = encodingRecipe(read('scripts/build-sg04-release-assets.mjs').toString());
const donorBindings = new Map(bindings(release, profiles).map(b => [b.key, b]));
const sourceBindings = bindings(source, profiles), imageRecords = new Map();
for (const binding of sourceBindings) {
  const donor = donorBindings.get(binding.key);
  check(donor, `No exact release component/material/channel binding: ${binding.key}`);
  const image = source.doc.images[binding.imageIndex], donorImage = release.doc.images[donor.imageIndex];
  check(image.name && image.name === donorImage.name, `Image name mismatch: ${image.name}`);
  check(binding.mime === 'image/png' && donor.mime === 'image/ktx2', `Unexpected image type: ${image.name}`);
  const eligible = eligibleImage(binding.bytes, binding.bytes, donor.bytes, binding.options, decodeImage);
  check(eligible.ok, `KTX quality contract mismatch: ${image.name}: ${eligible.reason}`);
  const key = textureEncodingKey(binding.bytes, binding.options);
  const cached = read(`.devshots/ktx2-cache/${key}.ktx2`), digest = sha(cached);
  check(digest === read(`.devshots/ktx2-cache/${key}.ktx2.sha256`).toString(), `Invalid encode cache: ${image.name}`);
  check(digest === sha(donor.bytes), `Release image differs from current source encode: ${image.name}`);
  let record = imageRecords.get(binding.imageIndex);
  if (!record) {
    record = { sourceImage: binding.imageIndex, releaseImage: donor.imageIndex, name: image.name,
      sourceSha256: sha(binding.bytes), ktx2Sha256: digest, currentEncoderCacheKey: key,
      width: eligible.width, height: eligible.height, mipLevels: eligible.levels, channels: [] };
    imageRecords.set(binding.imageIndex, record);
  }
  record.channels.push(binding.path);
}
check(imageRecords.size === source.doc.images.length, 'Every source image must have a verified release binding');

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const authored = await io.readBinary(sourceBytes), shipping = await io.readBinary(releaseBytes);
// Reproduce only the shipping vertex permutation on the in-memory comparison copy. No quantization
// or encoding is performed here. This establishes direct vertex correspondence to the shipping file.
await authored.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
const shippingNodes = new Map(shipping.getRoot().listNodes().map(n => [n.getName(), n]));
let maximumPositionErrorM = 0, comparedVertices = 0, comparedPrimitives = 0, maximumErrorNode = '';
const perNode = [], a = [], b = [], worldA = [], worldB = [];
function point(out, p, m) {
  for (let axis = 0; axis < 3; axis++) out[axis] = m[axis] * p[0] + m[4 + axis] * p[1] + m[8 + axis] * p[2] + m[12 + axis];
}
for (const node of authored.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const peer = shippingNodes.get(node.getName()), peerMesh = peer?.getMesh();
  check(peerMesh?.getName() === mesh.getName(), `Mesh identity changed: ${node.getName()}`);
  const primitives = mesh.listPrimitives(), peerPrimitives = peerMesh.listPrimitives();
  check(primitives.length === peerPrimitives.length, `Primitive count changed: ${node.getName()}`);
  const matrixA = node.getWorldMatrix(), matrixB = peer.getWorldMatrix();
  let nodeError = 0;
  for (let i = 0; i < primitives.length; i++) {
    const prim = primitives[i], other = peerPrimitives[i];
    check(prim.getMaterial()?.getName() === other.getMaterial()?.getName(), `Primitive material changed: ${node.getName()}/${i}`);
    const pa = prim.getAttribute('POSITION'), pb = other.getAttribute('POSITION');
    check(pa.getCount() === pb.getCount(), `Vertex count changed: ${node.getName()}/${i}`);
    const ia = prim.getIndices().getArray(), ib = other.getIndices().getArray();
    check(ia.length === ib.length && prim.getMode() === other.getMode(), 'Topology count/mode changed');
    for (let j = 0; j < ia.length; j += 3) {
      let cyclicMatch = false;
      for (let r = 0; r < 3; r++) if (ia[j] === ib[j + r] && ia[j + 1] === ib[j + (r + 1) % 3]
        && ia[j + 2] === ib[j + (r + 2) % 3]) cyclicMatch = true;
      check(cyclicMatch, `Triangle topology changed: ${node.getName()}/${i}/${j}`);
    }
    for (let j = 0; j < pa.getCount(); j++) {
      pa.getElement(j, a); pb.getElement(j, b); point(worldA, a, matrixA); point(worldB, b, matrixB);
      const error = Math.hypot(worldA[0] - worldB[0], worldA[1] - worldB[1], worldA[2] - worldB[2]);
      nodeError = Math.max(nodeError, error);
      if (error > maximumPositionErrorM) { maximumPositionErrorM = error; maximumErrorNode = node.getName(); }
    }
    comparedVertices += pa.getCount(); comparedPrimitives++;
  }
  perNode.push({ name: node.getName(), maximumPositionErrorM: nodeError });
}
check(sha(read(SOURCE)) === sha(sourceBytes) && sha(read(RELEASE)) === sha(releaseBytes), 'Input changed during preparation');
mkdirSync(resolve(ROOT, dirname(OUTPUT)), { recursive: true });
// Reuse the actual shipping container, avoiding a second geometry quantization or texture encode.
writeFileSync(resolve(ROOT, OUTPUT), releaseBytes);
const record = { asset: 'place_station_trade_hub', scope: 'Candidate-only source storage using existing shipping precision',
  command: 'node tools/blender/helios_remaster/trade_hub_compact.mjs', source: SOURCE, donorRelease: RELEASE,
  candidate: OUTPUT, sourceSha256: sha(sourceBytes), releaseSha256: sha(releaseBytes), candidateSha256: sha(read(OUTPUT)),
  sourceBytes: sourceBytes.length, candidateBytes: releaseBytes.length, under100DecimalMB: true,
  geometry: { losslessVersusUncompressedAuthoredSource: false, shippingProfile: RELEASE_MESHOPT_OPTIONS,
    exactShippingContainer: true, additionalPositionErrorVersusShippingReleaseM: 0,
    maximumPositionErrorM, maximumErrorNode, comparedVertices, comparedPrimitives,
    allTrianglesPreservedAllowingCyclicCornerRotation: true, vertexComparison: 'same shipping reorder; world-space paired vertices',
    nodeMaterialIdentityAndMarkersPreserved: true, nonMeshHelperFieldsUnchanged: true,
    sourceToolchainMeshoptReadPassed: true, perNode },
  textures: { imageCount: imageRecords.size, bindingCount: sourceBindings.length,
    sameCurrentCachedEncoderBytesAsRelease: true, images: [...imageRecords.values()] },
  authoring: 'NodeIO with MeshoptDecoder, dequantize, then KTX extraction remains supported; sector_places.prepare.mjs demonstrates that decode path. Its original donor revision remains pinned for reproducible remaster authorship.',
  promotion: 'Parent owns source promotion and source-derived manifests; no source, release or manifest was edited by this helper.' };
writeFileSync(resolve(ROOT, RECORD), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ candidate: OUTPUT, record: RECORD, sourceBytes: record.sourceBytes,
  candidateBytes: record.candidateBytes, candidateSha256: record.candidateSha256,
  maximumPositionErrorM, comparedVertices, comparedPrimitives, imageCount: imageRecords.size }, null, 2));
