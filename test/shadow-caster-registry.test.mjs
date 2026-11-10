// Pole E — maintained shadow-caster registry contract.
// The vendored WebGLShadowMap used to re-walk the whole scene graph per refresh via
// renderObject. The patch installs an Object3D.prototype.castShadow accessor whose setter
// keeps a module-level registry current, then renders the registry flat — each entry
// re-proves ancestor visibility + scene membership by walking its parent chain, then runs
// the unchanged per-object draw gates (layers, isMesh/isLine/isPoints, castShadow, frustum,
// material.visible, getDepthMaterial). These tests pin the vendored contract and verify the
// flat path's candidate set equals a from-scratch DFS of the pre-patch semantics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VENDOR_URL = new URL('../vendor/three.module.js', import.meta.url);
const SRC = readFileSync(fileURLToPath(VENDOR_URL), 'utf8');
const THREE = await import(VENDOR_URL.href);

test('vendored three installs a castShadow accessor feeding a module registry', () => {
  assert.match(SRC, /const _shadowCasterRegistry = new Set\(\)/);
  assert.match(SRC, /const _castShadowValues = new WeakMap\(\)/);
  assert.match(SRC, /Object\.defineProperty\( Object3D\.prototype, 'castShadow', \{/);
  assert.match(SRC, /_shadowCasterRegistry\.add\( this \)/);
  assert.match(SRC, /_shadowCasterRegistry\.delete\( this \)/);
});

test('shadow render() uses the flat registry path except for VSM', () => {
  assert.match(SRC, /function renderShadowCasters\( scene, camera, shadowCamera, light, type \)/);
  assert.match(SRC, /function renderShadowCaster\( object, camera, shadowCamera, light, type \)/);
  // The original recursive path is kept for VSM (receiveShadow-only drawables).
  assert.match(SRC, /this\.type !== VSMShadowMap \)[\s\S]*renderShadowCasters\( scene, camera, shadow\.camera, light, this\.type \)[\s\S]*renderObject\( scene, camera, shadow\.camera, light, this\.type \)/);
  // Ancestor visibility + scene membership are re-proven by a parent-chain walk.
  assert.match(SRC, /while \( node !== scene && node !== null && node\.visible !== false \) node = node\.parent/);
  // The flat path still honors an invisible scene root like renderObject did.
  assert.match(SRC, /renderShadowCasters[\s\S]{0,400}scene\.visible === false \) return/);
});

// Reference: what the pre-patch renderObject recursion considered "reachable flagged nodes"
// — DFS, prune at visible===false, collect nodes whose castShadow is truthy.
function dfsReachableFlagged(root) {
  const out = [];
  (function walk(o) {
    if (o.visible === false) return;
    if (o.castShadow) out.push(o);
    for (const c of o.children) walk(c);
  })(root);
  return new Set(out);
}

function sameSet(a, b) {
  assert.equal(a.length, b.size);
  for (const o of a) assert.ok(b.has(o));
}

test('registry membership tracks flag writes', () => {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  scene.add(mesh);
  assert.equal(mesh.castShadow, false);
  assert.equal(THREE.spacefaceShadowCastersIn(scene).length, 0);
  mesh.castShadow = true;
  sameSet(THREE.spacefaceShadowCastersIn(scene), new Set([mesh]));
  mesh.castShadow = false;
  assert.equal(THREE.spacefaceShadowCastersIn(scene).length, 0);
});

test('flat candidate set equals DFS reachability across reparent/hide/flag churn', () => {
  const scene = new THREE.Scene();
  const a = new THREE.Group(); const b = new THREE.Group(); const c = new THREE.Group();
  scene.add(a); a.add(b); b.add(c);
  const meshes = [];
  for (const parent of [scene, a, b, c]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    parent.add(m); meshes.push(m);
  }
  const expected = () => sameSet(THREE.spacefaceShadowCastersIn(scene), dfsReachableFlagged(scene));

  expected(); // no flags yet — empty
  meshes[0].castShadow = true; meshes[3].castShadow = true;
  expected();
  b.visible = false; expected();               // b subtree pruned
  b.visible = true; a.visible = false; expected();
  a.visible = true;
  c.removeFromParent(); expected();            // detached subtree unreachable
  scene.add(c); expected();                    // re-attached subtree resumes
  meshes[3].castShadow = false; expected();
  meshes[1].castShadow = true; meshes[2].castShadow = true; expected();
});

test('copied flags keep membership consistent; foreign-scene casters are skipped', () => {
  const scene = new THREE.Scene();
  const other = new THREE.Scene();
  const src = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  src.castShadow = true; scene.add(src);
  const dst = new THREE.Mesh();
  dst.copy(src); other.add(dst);
  assert.equal(dst.castShadow, true);
  // dst is registered but unreachable from `scene`; src is unreachable from `other` only if moved.
  assert.deepEqual(new Set(THREE.spacefaceShadowCastersIn(other)), new Set([dst]));
  assert.ok(THREE.spacefaceShadowCastersIn(scene).includes(src));
  // Reparenting a flagged mesh mid-flight switches which scene collects it.
  other.add(src);
  assert.ok(!THREE.spacefaceShadowCastersIn(scene).includes(src));
  assert.ok(THREE.spacefaceShadowCastersIn(other).includes(src));
});

test('invisible scene root yields no candidates (renderObject parity)', () => {
  const scene = new THREE.Scene();
  const m = new THREE.Mesh();
  m.castShadow = true; scene.add(m);
  scene.visible = false;
  assert.equal(THREE.spacefaceShadowCastersIn(scene).length, 0);
});
