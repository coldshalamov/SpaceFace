// SF-261 — one measured material-key per render contract, residual noise only.
// After SF-256's single-draw-path landing the residual question is whether the
// renderer-owned seams still mint duplicate keys for the same contract. Measured:
// cloned hull materials that canonicalize to one family key produce one compile-issue
// key, and the only uuid-keyed maps in owned code are per-object dedupe Sets inside a
// single admission pass — never program/draw-contract keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import { openingCompileIssueKey } from '../src/render/renderer.js';
import {
  canonicalizeObjectSurfaceProgramKeys,
  canonicalizeInstalledSurfaceProgramKey,
} from '../src/render/illustratedSurface.js';

function mesh(material, geometry = new THREE.BoxGeometry(1, 1, 1)) {
  const m = new THREE.Mesh(geometry, material);
  m.isMesh = true;
  return m;
}

test('two clones carrying uuid noise canonicalize to one family key and one compile-issue key', () => {
  const base = new THREE.MeshStandardMaterial({ color: 0x336699, roughness: 0.7 });
  // Simulate the leftover unique keys a compose clone can carry: type name + uuid + GLSL fragment.
  base.customProgramCacheKey = () =>
    `MeshStandardMaterial|${THREE.MathUtils.generateUUID()}|vec3 sf = normalize(vNormal);|standard`;
  const twin = base.clone();
  twin.customProgramCacheKey = () =>
    `MeshStandardMaterial|${THREE.MathUtils.generateUUID()}|float q = roughnessFactor * 0.5;|standard`;

  const root = new THREE.Group();
  const a = mesh(base);
  const b = mesh(twin);
  root.add(a, b);
  const changed = canonicalizeObjectSurfaceProgramKeys(root);
  assert.ok(changed >= 2, 'both clones get canonicalized');

  const keyA = openingCompileIssueKey(a);
  const keyB = openingCompileIssueKey(b);
  assert.ok(keyA && keyB, 'both materials remain keyable');
  assert.equal(keyA, keyB,
    'same render contract after canonicalization must mint one compile-issue key');
});

test('materials with genuinely different contracts still key differently — no over-collapse', () => {
  const opaque = new THREE.MeshStandardMaterial({ color: 0x336699 });
  const glow = new THREE.MeshStandardMaterial({
    color: 0x336699, transparent: true, opacity: 0.5, emissive: new THREE.Color(0x88ccff),
  });
  canonicalizeInstalledSurfaceProgramKey(opaque);
  canonicalizeInstalledSurfaceProgramKey(glow);
  const a = openingCompileIssueKey(mesh(opaque));
  const b = openingCompileIssueKey(mesh(glow));
  assert.notEqual(a, b, 'transparent emissive is a different contract and must stay distinct');
});

test('the compile-issue key never splits on equal-material clones of one cached key', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x224466 });
  canonicalizeInstalledSurfaceProgramKey(material);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const first = openingCompileIssueKey(mesh(material, geometry));
  // A second mesh sharing the exact material+geometry objects must reuse the cached key.
  const second = openingCompileIssueKey(mesh(material, geometry));
  assert.equal(first, second);
});

test('uuid strings in owned renderer seams feed per-object dedupe, never program keys', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  // The only uuid-keyed expressions are single-pass primitive/subject dedupe keys:
  // `geometry.uuid:material.uuid` pair keys inside one catalog/warm walk. They dedupe
  // repeated OBJECTS within one pass — they never feed customProgramCacheKey or a
  // program-family key, so per-clone uuids cannot mint duplicate programs.
  const uuidKeyUses = source.match(/\w*[Kk]ey\s*=\s*`[^`\n]*\.uuid[^`\n]*`/g) || [];
  assert.ok(uuidKeyUses.length >= 3, 'expected the single-pass uuid dedupe keys');
  for (const expr of uuidKeyUses) {
    assert.match(expr, /geometry\.uuid|geom\.uuid/,
      `uuid key "${expr}" dedupes geometry-bearing objects, not material contracts`);
  }
  // And the compile-issue key itself is the deliberate full-cpck seam, not a uuid.
  assert.match(source, /key \+= `\|cpck:\$\{cpck\}`/, 'the honest full-string dedupe stays');
});
