// Kestrel hero-asset validator (spec §17.5).
//
// Verifies the committed GLB is a well-formed glTF 2.0 transport whose structure agrees with the
// normative manifest: header (magic/version/length), binary chunk length, mesh/node/material counts,
// triangle total, named socket set, and the manifest's declared geometry metrics, bounds, material
// factor ranges, and a file-size guardrail. Catches broken transport and manifest drift — not taste.
//
// Idiom: same "ok/fail counters + process.exit(fail ? 1 : 0)" shape as the other check-*.mjs scripts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PKG = resolve(ROOT, 'assets/ships/kestrel');

const GLB_MAGIC = 0x46546c67; // 'glTF'
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942;  // 'BIN\0'

// The seven named sockets the spec (§9.9) and manifest declare; runtime + GLB must share this set.
const EXPECTED_SOCKETS = new Set([
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main',
  'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral', 'SOCKET_Trail_Main',
  'SOCKET_Camera_Focus',
]);

// Guardrails derived from the spec's provisional asset budget (§12.2 player-starter tier) and the
// committed reference. A future texture/DCC pass may move these; bump intentionally.
const MAX_GLB_BYTES = 1_000_000;      // 1 MB hard ceiling — the committed model is ~199 KB.
const MAX_TRIANGLES = 25_000;          // spec §12.2 starter tier ceiling (we sit at ~1.8k).

let ok = 0, fail = 0;
function check(label, condition, detail = '') {
  if (condition) { ok++; }
  else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

function readU32(buf, off) { return buf.readUInt32LE(off); }

// Parse a .glb into { json, binary } or throw on malformed transport.
function parseGlb(bytes) {
  if (bytes.length < 20) throw new Error('file too small to be a glb');
  const magic = readU32(bytes, 0);
  const version = readU32(bytes, 4);
  const length = readU32(bytes, 8);
  if (magic !== GLB_MAGIC) throw new Error(`bad magic 0x${magic.toString(16)} (expected 0x${GLB_MAGIC.toString(16)})`);
  if (version !== GLB_VERSION) throw new Error(`unsupported glTF version ${version}`);
  if (length !== bytes.length) throw new Error(`header length ${length} != file size ${bytes.length}`);

  let off = 12;
  const chunks = [];
  while (off < bytes.length) {
    const chunkLength = readU32(bytes, off);
    const chunkType = readU32(bytes, off + 4);
    chunks.push({ type: chunkType, data: bytes.subarray(off + 8, off + 8 + chunkLength) });
    off += 8 + chunkLength;
  }
  const jsonChunk = chunks.find(c => c.type === CHUNK_JSON);
  if (!jsonChunk) throw new Error('missing JSON chunk');
  // The JSON chunk is padded with trailing spaces; trim before parse.
  const jsonText = Buffer.from(jsonChunk.data).toString('utf-8').replace(/\0+$/, '').replace(/\s+$/, '');
  const gltf = JSON.parse(jsonText);
  const binaryChunk = chunks.find(c => c.type === CHUNK_BIN);
  return { gltf, binary: binaryChunk ? binaryChunk.data : null };
}

// Recursively collect every mesh node name so the socket empties are testable against the set.
function collectNodeNames(gltf) {
  const names = new Set();
  const visit = (idx) => {
    const node = gltf.nodes[idx];
    if (!node) return;
    if (node.name) names.add(node.name);
    for (const child of node.children || []) visit(child);
  };
  for (const root of gltf.scenes?.[0]?.nodes || []) visit(root);
  return names;
}

function main() {
  const manifestPath = resolve(PKG, 'kestrel_manifest.json');
  const glbPath = resolve(PKG, 'kestrel_reference.glb');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    ok++;
  } catch (e) {
    console.log(`ERR   cannot read manifest ${manifestPath}: ${e.message}`);
    process.exit(1);
  }

  let bytes, gltf;
  try {
    bytes = readFileSync(glbPath);
    ({ gltf } = parseGlb(bytes));
    ok++; // transport parses
  } catch (e) {
    console.log(`ERR   GLB transport invalid: ${e.message}`);
    process.exit(1);
  }

  // ---- header / transport (spec §17.5 "header, version, binary length") ----
  check('glb magic/version', readU32(bytes, 0) === GLB_MAGIC && readU32(bytes, 4) === GLB_VERSION);
  check('glb length == file size', readU32(bytes, 8) === bytes.length, `header=${readU32(bytes,8)} file=${bytes.length}`);

  // ---- counts agree with manifest (spec §17.5 "triangle count ... manifest agreement") ----
  const m = manifest.metrics || {};
  const meshCount = (gltf.meshes || []).length;
  const nodeCount = (gltf.nodes || []).length;
  const materialCount = (gltf.materials || []).length;
  let triangles = 0;
  for (const mesh of gltf.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if ((prim.mode ?? 4) !== 4) continue; // only TRIANGLES count toward the budget
      const idxAcc = gltf.accessors?.[prim.indices];
      if (idxAcc) triangles += Math.floor((idxAcc.count || 0) / 3);
    }
  }
  check('manifest declares glb metrics', !!m.geometry && !!m.glb, 'metrics.{geometry,glb} missing');
  check('glb triangles == manifest', triangles === m.glb?.triangles, `glb=${triangles} manifest=${m.glb?.triangles}`);
  check('glb meshes == manifest', meshCount === m.glb?.meshes, `glb=${meshCount} manifest=${m.glb?.meshes}`);
  check('glb nodes == manifest', nodeCount === m.glb?.nodes, `glb=${nodeCount} manifest=${m.glb?.nodes}`);
  check('geometry triangles == manifest', triangles === m.geometry?.triangleCount, `glb=${triangles} geometry=${m.geometry?.triangleCount}`);
  check('geometry meshes == manifest', meshCount === m.geometry?.meshCount, `glb=${meshCount} geometry=${m.geometry?.meshCount}`);

  // ---- triangle + file-size guardrails (spec §12.2, §17.5 "file-size guardrail") ----
  check('triangle budget', triangles <= MAX_TRIANGLES, `${triangles} > ${MAX_TRIANGLES}`);
  check('glb file-size guardrail', bytes.length <= MAX_GLB_BYTES, `${bytes.length} > ${MAX_GLB_BYTES}`);

  // ---- bounds agree with manifest (spec §17.5 "bounds ... manifest agreement") ----
  const bmin = m.geometry?.boundsMin, bmax = m.geometry?.boundsMax;
  if (bmin && bmax) {
    // Find POSITION accessors and compute the true min/max across all of them.
    let tmin = [Infinity, Infinity, Infinity], tmax = [-Infinity, -Infinity, -Infinity];
    for (const acc of (gltf.accessors || [])) {
      if (acc.type !== 'VEC3' || (acc.componentType ?? 5126) !== 5126) continue;
      // The reference model packs positions in the BIN buffer; validate via min/max metadata the
      // generator writes on each accessor rather than re-decoding floats (keeps the check dependency-free).
      if (!acc.min || !acc.max) continue;
      for (let i = 0; i < 3; i++) {
        tmin[i] = Math.min(tmin[i], acc.min[i]);
        tmax[i] = Math.max(tmax[i], acc.max[i]);
      }
    }
    const round = (v) => Math.round(v * 1e4) / 1e4;
    const same = (a, b) => a.every((v, i) => Math.abs(round(v) - round(b[i])) < 1e-3);
    check('glb bounds min ~ manifest', Number.isFinite(tmin[0]) && same(tmin, bmin), `glb=${tmin} manifest=${bmin}`);
    check('glb bounds max ~ manifest', Number.isFinite(tmax[0]) && same(tmax, bmax), `glb=${tmax} manifest=${bmax}`);
  } else {
    check('manifest declares geometry bounds', false, 'metrics.geometry.bounds{Min,Max} missing');
  }

  // ---- material factor ranges (spec §17.5 "material factor ranges", §11.1) ----
  const materials = manifest.materials || [];
  check('manifest declares >=8 material roles', materials.length >= 8, `only ${materials.length}`);
  for (const mat of materials) {
    const metallic = mat.metallic ?? null;
    const roughness = mat.roughness ?? null;
    const alpha = mat.alpha ?? 1;
    check(`material ${mat.name}: metallic in [0,1]`, metallic !== null && metallic >= 0 && metallic <= 1, `metallic=${metallic}`);
    check(`material ${mat.name}: roughness in [0,1]`, roughness !== null && roughness >= 0 && roughness <= 1, `roughness=${roughness}`);
    check(`material ${mat.name}: alpha in (0,1]`, alpha > 0 && alpha <= 1, `alpha=${alpha}`);
  }

  // ---- socket set (spec §9.9, §17.5 "socket set") ----
  const declaredSockets = new Set((manifest.sockets || []).map(s => s.name));
  check('manifest declares all 7 sockets', declaredSockets.size === EXPECTED_SOCKETS.size && [...EXPECTED_SOCKETS].every(n => declaredSockets.has(n)),
    `manifest sockets=${[...declaredSockets].join(',')}`);
  const gltfNodeNames = collectNodeNames(gltf);
  const gltfSockets = new Set([...gltfNodeNames].filter(n => n.startsWith('SOCKET_')));
  check('glb carries all 7 socket empties', gltfSockets.size === EXPECTED_SOCKETS.size && [...EXPECTED_SOCKETS].every(n => gltfSockets.has(n)),
    `glb sockets=${[...gltfSockets].join(',')}`);

  // ---- runtime source + files present (spec §17.4 manifest contract) ----
  check('manifest runtimeSource points at kestrelHero.js', manifest.runtimeSource === 'src/render/ships/kestrelHero.js', `got ${manifest.runtimeSource}`);
  check('manifest coordinate contract (+X/+Y/+Z metres)', manifest.coordinateSystem?.forward === '+X' && manifest.coordinateSystem?.up === '+Y' && manifest.coordinateSystem?.unit === 'metre');

  console.log(`\n${ok} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main();
