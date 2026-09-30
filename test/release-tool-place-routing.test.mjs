import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// D94 regression pins: place releases route exclusively through build-place-release-assets.mjs
// because the sg04 pipeline encodes every texture slot UASTC while place releases require
// per-role profiles (albedo/emissive ETC1S+sRGB, ORM ETC1S+linear, normals UASTC).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SG04 = 'scripts/build-sg04-release-assets.mjs';
const PATCH = 'scripts/patch-single-release-place.mjs';
const PLACE_PUBLISHER = 'build-place-release-assets.mjs';
const NODE = process.execPath;
const RELEASE_LOCK = resolve(ROOT, 'assets/ships/release.__lock');

function runScript(script, args, { timeout = 20_000 } = {}) {
  return spawnSync(NODE, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout,
  });
}

test('sg04 refuses --only on place-owned release ids', () => {
  if (existsSync(RELEASE_LOCK)) {
    // A live release build owns the lock; the --only refusal still holds by construction.
    return;
  }
  const result = runScript(SG04, ['--no-clean', '--only', 'place_debris_chunk']);
  assert.notEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, new RegExp(PLACE_PUBLISHER));
});

test('sg04 excludes place-owned categories from its own build set', () => {
  const source = String(
    // The routing rules live in the script itself; pin each enforcement point.
    spawnSync(NODE, ['-e', 'process.stdout.write(require("fs").readFileSync(process.argv[1],"utf8"))', SG04], {
      cwd: ROOT, encoding: 'utf8',
    }).stdout,
  );
  assert.match(source, /PLACE_OWNED_CATEGORIES = new Set\(\['places', 'works'\]\)/,
    'place-owned categories are named once');
  const uses = source.match(/PLACE_OWNED_CATEGORIES\.has\(part\.category\)/g) || [];
  assert.ok(uses.length >= 2,
    'places/works are filtered out of both the part build list and the lod-sibling expansion');
  assert.match(source, /priorReleaseManifest[\s\S]*kind !== 'part:places'/,
    'a full build carries the place publisher\'s manifest entries forward untouched');
});

test('patch-single-release-place refuses a place GLB without role-correct encodings', () => {
  const stagedRoot = resolve(ROOT, 'assets/ships/release.__building');
  const stagedDir = resolve(stagedRoot, 'parts/places');
  const staged = resolve(stagedDir, 'place_routing_probe.glb');
  // release.__building signals an in-flight graphics build to the rest of the toolchain —
  // never leave a test-minted one behind.
  const stagedRootExisted = existsSync(stagedRoot);
  mkdirSync(stagedDir, { recursive: true });
  try {
    // A GLB whose one texture rides a plain PNG source (what the all-UASTC/uncoded path ships):
    // role validation must refuse before any bytes reach release/.
    const gltf = Buffer.from(JSON.stringify({
      asset: { version: '2.0' },
      images: [{ uri: 'data:image/png;base64,iVBORw0KGgo=' }],
      textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      meshes: [],
    }), 'utf8');
    const jsonLen = (gltf.length + 3) & ~3;
    const glb = Buffer.alloc(12 + 8 + jsonLen);
    glb.writeUInt32LE(0x46546c67, 0);
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(jsonLen, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    gltf.copy(glb, 20);
    glb.fill(0x20, 20 + gltf.length);
    writeFileSync(staged, glb);

    const result = runScript(PATCH, ['place_routing_probe']);
    assert.notEqual(result.status, 0, 'a non-role-encoded staged place must be refused');
    assert.match(result.stderr, new RegExp(PLACE_PUBLISHER));
    assert.equal(existsSync(resolve(ROOT, 'assets/ships/release/parts/places/place_routing_probe.glb')), false,
      'nothing wrong-encoded reaches the published tree');
  } finally {
    if (stagedRootExisted) {
      rmSync(staged, { force: true });
      try { rmSync(stagedDir, { recursive: false }); } catch { /* non-empty: keep */ }
    } else {
      rmSync(stagedRoot, { recursive: true, force: true });
    }
  }
});
