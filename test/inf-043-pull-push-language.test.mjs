import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';

// INF-043 — pull and push distinguishable without reading. The shared transport cue is the
// radial span of the working-surface strips: Well scythes run outer->inner (inward verb),
// Repulsor shells run inner->outer (outward verb). This test reads geometry only (path radii
// + member ribs + role) — never tint — so the distinction holds in grayscale by construction.

const RADIUS = 190;
const field = (kind) => ({
  id: kind, kind, center: { x: 30, z: -25 }, dir: { x: 1, z: 0 },
  radius: RADIUS, halfWidth: 52, halfAngleRad: 0.56, engaged: true,
});
const state = (active) => ({
  simTime: 0, fields: { active }, settings: { video: {} },
  massSeed: { seedId: 'one', phase: 'active', lockAt: 0, activeAt: 1, warnAt: 4, expireAt: 7 },
});
function prime(kind) {
  const owner = new FieldForcePresentation(new THREE.Scene());
  const s = state([field(kind)]);
  owner.update(0, s);
  s.simTime = 0.5;
  owner.update(0.5, s);
  return owner;
}
// Working-surface strips: BODY role (1), polar path (0), membrane member (ribs 5).
function workingStrips(owner, code) {
  const path = owner.batch.attributes[1];
  const shape = owner.batch.attributes[2];
  const behavior = owner.batch.attributes[7];
  const pivot = owner.batch.attributes[8];
  const out = [];
  for (let i = 0; i < owner.mesh.count; i++) {
    if (behavior.getX(i) !== code) continue; // family animation code: 2 = well, 3 = repulsor
    if (behavior.getY(i) !== 0) continue; // BODY role only: rims/hardware excluded
    if (path.getX(i) !== 0) continue; // polar strips only
    if (pivot.getZ(i) !== 5) continue; // membrane member only
    out.push({ r0: path.getW(i), r1: shape.getX(i) });
  }
  return out;
}

test('INF-043: well working surface runs outer->inner (inward verb), inside the boundary', () => {
  const owner = prime('well');
  try {
    const strips = workingStrips(owner, 2);
    assert.equal(strips.length, 5, 'the five scythes carry the inward verb');
    for (const s of strips) {
      assert.ok(s.r0 > s.r1 * 2, `scythe spans inward (r0=${s.r0} r1=${s.r1})`);
      assert.ok(s.r0 <= RADIUS, 'scythe starts inside the truth boundary');
    }
  } finally { owner.dispose(); }
});

test('INF-043: repulsor shells run inner->outer (outward verb), nested inside the boundary', () => {
  const owner = prime('repulsor');
  try {
    const strips = workingStrips(owner, 3);
    assert.equal(strips.length, 12, 'three fronts x four sectors carry the outward verb');
    const bands = strips.map((s) => [s.r0, s.r1]).sort((a, b) => a[0] - b[0]);
    for (const s of strips) {
      assert.ok(s.r1 > s.r0, `shell band spans outward (r0=${s.r0} r1=${s.r1})`);
      assert.ok(s.r1 <= RADIUS, 'shell ends inside the truth boundary');
      assert.ok(s.r0 >= RADIUS * 0.45, 'throat stays clear of crest geometry');
    }
    assert.ok(bands[0][0] < bands[4][0] && bands[4][0] < bands[8][0], 'fronts nest outward in three bands');
  } finally { owner.dispose(); }
});

test('INF-043: strip counts are unchanged (no reskin, no new strips)', () => {
  for (const [kind, count] of [['well', 19], ['repulsor', 23]]) {
    const owner = prime(kind);
    try {
      assert.equal(owner.mesh.count, count, `${kind} keeps its authored strip count`);
    } finally { owner.dispose(); }
  }
});
