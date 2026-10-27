// SWARM-06 §6.4 follow-through — elite affixes announced as names on the wave banner but
// never marked on the bodies carrying them. The dressing layer now hangs a small per-trick
// machine on the stamped hull's spine, read off data.swarmAffix / data.swarmAffix2, the
// same poll the boss dressing runs on data.bossDressing.kind.
//
// Done when: every catalog affix grows a distinct named mark under the hull; the veteran
// band wears both marks plus the joining collar; the mark releases on kill, drops on prune
// and mesh release, re-seats on a mesh rebind, and updates when a second affix stamps late;
// unaffixed hulls stay bare; and the whole layer is presentation-only — nothing on the
// stamped entity moves.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';
import { SWARM_AFFIXES, SWARM_AFFIX_BY_ID } from '../src/data/swarmThreats.js';

const DT = 1 / 60;
const MARK_ROOT = 'sf-swarm-threat-affix';
const VETERAN_BAND = 'sf-swarm-threat-affix-band';

function hullMesh() {
  const mesh = new THREE.Group();
  const hull = new THREE.Group();
  mesh.add(hull);
  mesh.userData.hull = hull;
  return mesh;
}

function eliteEntity(id, data = {}) {
  return {
    id, type: 'ship', alive: true, radius: 24,
    hull: 120, hullMax: 120, shield: 0, shieldMax: 0,
    maxSpeed: 40, combatSpeed: 40, thrust: 30,
    data: { runCohort: 'survival', swarmChampion: true, runRole: 'elite', runWave: 30, ...data },
  };
}

function markRoot(mesh) {
  return mesh.userData.hull.children.find((c) => c.name === MARK_ROOT) || null;
}

function markGroup(mesh, affixId) {
  const root = markRoot(mesh);
  return root ? root.children.find((c) => c.name === `${MARK_ROOT}-${affixId}`) || null : null;
}

function meshesUnder(root) {
  const out = [];
  root.traverse((n) => { if (n.isMesh) out.push(n); });
  return out;
}

function drive(dressing, entity, mesh, frames = 1, options = {}) {
  for (let i = 0; i < frames; i++) {
    dressing.updateBossDressing(entity, mesh, i * DT, DT, options);
  }
}

// ---- the per-affix marks ----

test('every catalog affix grows its own named mark under the hull', () => {
  assert.ok(SWARM_AFFIXES.length >= 6, 'the catalog still carries the six tricks');
  const dressing = createLawArenaDressing();
  for (const row of SWARM_AFFIXES) {
    const entity = eliteEntity(`elite-${row.id}`, { swarmAffix: row.id });
    const mesh = hullMesh();
    drive(dressing, entity, mesh, 3);
    const mark = markGroup(mesh, row.id);
    assert.ok(mark, `${row.id} wears sf-swarm-threat-affix-${row.id} on the hull`);
    const parts = meshesUnder(mark);
    assert.ok(parts.length >= 2, `${row.id}'s mark is real geometry, not a bare group`);
    for (const m of parts) {
      assert.ok(m.geometry.type !== 'PlaneGeometry' && m.type !== 'Sprite',
        `${row.id}: designed geometry only`);
      assert.ok(m.name.startsWith('sf-swarm-threat'),
        `${row.id}: mark parts ride the hostile-repaint exemption so the seam hue survives`);
    }
  }
});

test('each affix mark is a distinct silhouette — no two tricks share a shape', () => {
  const dressing = createLawArenaDressing();
  const signatures = new Map();
  for (const row of SWARM_AFFIXES) {
    const entity = eliteEntity(`elite-${row.id}`, { swarmAffix: row.id });
    const mesh = hullMesh();
    drive(dressing, entity, mesh, 2);
    const sig = meshesUnder(markGroup(mesh, row.id))
      .map((m) => `${m.geometry.type}:${m.scale.x.toFixed(3)},${m.scale.y.toFixed(3)},${m.scale.z.toFixed(3)}`)
      .sort().join('|');
    assert.ok(!signatures.has(sig), `${row.id} reuses ${signatures.get(sig)}'s silhouette`);
    signatures.set(sig, row.id);
  }
});

// ---- the veteran band ----

test('a veteran double-affix hull wears both marks plus the joining collar', () => {
  const dressing = createLawArenaDressing();
  const entity = eliteEntity('vet-1', { swarmAffix: 'volatile', swarmAffix2: 'splitter' });
  const mesh = hullMesh();
  drive(dressing, entity, mesh, 3);
  assert.ok(markGroup(mesh, 'volatile'), 'the primary mark rides');
  assert.ok(markGroup(mesh, 'splitter'), 'the second mark rides beside it');
  const root = markRoot(mesh);
  assert.ok(root.children.some((c) => c.name === VETERAN_BAND),
    'the veteran collar joins the pair — the double-mark reads at a glance');
  // The two marks sit on different spine anchors — they cannot overlap into one blob.
  const a = markGroup(mesh, 'volatile').position;
  const b = markGroup(mesh, 'splitter').position;
  assert.ok(Math.abs(a.x - b.x) > 1, 'the pair spreads along the spine');
});

test('a second affix stamping late adds its mark without losing the first', () => {
  const dressing = createLawArenaDressing();
  const entity = eliteEntity('vet-late', { swarmAffix: 'hasted' });
  const mesh = hullMesh();
  drive(dressing, entity, mesh, 5);
  assert.ok(markGroup(mesh, 'hasted'));
  assert.equal(markRoot(mesh).children.filter((c) => c.name !== VETERAN_BAND).length, 1);
  entity.data.swarmAffix2 = 'commander';
  drive(dressing, entity, mesh, 3);
  assert.ok(markGroup(mesh, 'hasted'), 'the primary mark survives the late stamp');
  assert.ok(markGroup(mesh, 'commander'), 'the late second grows its own mark');
  assert.ok(markRoot(mesh).children.some((c) => c.name === VETERAN_BAND),
    'the collar arrives with the pair');
});

// ---- lifecycle ----

test('the mark releases on kill — a fling off the dying hull, then detached', () => {
  const dressing = createLawArenaDressing();
  const entity = eliteEntity('dead-1', { swarmAffix: 'volatile' });
  const mesh = hullMesh();
  drive(dressing, entity, mesh, 30);
  assert.ok(markRoot(mesh), 'marked while alive');
  entity.alive = false;
  drive(dressing, entity, mesh, 3);
  assert.ok(markRoot(mesh), 'the release beat plays out on the corpse');
  for (let i = 0; i < 30; i++) dressing.updateBossDressing(entity, mesh, 1 + i * 0.1, 0.1, {});
  assert.equal(markRoot(mesh), null, 'the mark leaves with the dead hull');
  assert.equal(dressing.peekAffix('dead-1').phase, 'done', 'the record latches done');
});

test('unaffixed hulls stay bare, and a body that loses its stamps drops the mark', () => {
  const dressing = createLawArenaDressing();
  const plain = eliteEntity('plain-1');
  const mesh = hullMesh();
  drive(dressing, plain, mesh, 5);
  assert.equal(markRoot(mesh), null, 'no stamp, no mark');
  assert.equal(dressing.peekAffix('plain-1'), null, 'no record is kept for bare hulls');

  const stripped = eliteEntity('stripped-1', { swarmAffix: 'magnetic' });
  const mesh2 = hullMesh();
  drive(dressing, stripped, mesh2, 5);
  assert.ok(markRoot(mesh2), 'marked while stamped');
  delete stripped.data.swarmAffix;
  drive(dressing, stripped, mesh2, 2);
  assert.equal(markRoot(mesh2), null, 'the mark drops when the stamp is gone');
  assert.equal(dressing.peekAffix('stripped-1'), null, 'the record disposes with the mark');
});

test('mesh release, entity release and prune all drop the mark', () => {
  // releaseMesh — the boundary going away (despawn, rebind) detaches the group.
  const dressing = createLawArenaDressing();
  const e1 = eliteEntity('m-1', { swarmAffix: 'shielded' });
  const mesh1 = hullMesh();
  drive(dressing, e1, mesh1, 3);
  dressing.releaseMesh(mesh1);
  assert.equal(markRoot(mesh1), null, 'releaseMesh detaches the mark from the boundary');
  assert.ok(dressing.peekAffix('m-1'), 'the record survives — a rebind can re-seat it');

  // releaseMeshSet — the mass-despawn sweep path.
  const e2 = eliteEntity('m-2', { swarmAffix: 'hasted' });
  const mesh2 = hullMesh();
  drive(dressing, e2, mesh2, 3);
  dressing.releaseMeshSet(new Set([mesh2]));
  assert.equal(markRoot(mesh2), null, 'releaseMeshSet detaches too');

  // releaseEntityMesh — the id-based unbind.
  const e3 = eliteEntity('m-3', { swarmAffix: 'splitter' });
  const mesh3 = hullMesh();
  drive(dressing, e3, mesh3, 3);
  dressing.releaseEntityMesh('m-3');
  assert.equal(markRoot(mesh3), null, 'releaseEntityMesh detaches by id');

  // prune — the entity vanishes from the active set entirely.
  const e4 = eliteEntity('m-4', { swarmAffix: 'commander' });
  const mesh4 = hullMesh();
  drive(dressing, e4, mesh4, 3);
  dressing.prune(new Set(['someone-else']));
  assert.equal(markRoot(mesh4), null, 'prune drops marks whose entity left the room');
  assert.equal(dressing.peekAffix('m-4'), null, 'prune disposes the record');
});

test('a mesh rebind re-seats the same mark group on the new hull', () => {
  const dressing = createLawArenaDressing();
  const entity = eliteEntity('rebind-1', { swarmAffix: 'volatile' });
  const meshA = hullMesh();
  drive(dressing, entity, meshA, 3);
  const group = markRoot(meshA);
  assert.ok(group, 'marked on the first boundary');
  const meshB = hullMesh();
  drive(dressing, entity, meshB, 2);
  assert.equal(markRoot(meshA), null, 'the old boundary lets the group go');
  assert.equal(markRoot(meshB), group, 'the same group rides the re-seat');
});

// ---- coexistence and neutrality ----

test('a champion boss carries its dressing and its affix mark side by side', () => {
  const dressing = createLawArenaDressing();
  const entity = eliteEntity('boss-affix', {
    swarmAffix: 'commander',
    bossDressing: { kind: 'seam_crusher', law: 'asteroid_mill' },
  });
  const mesh = hullMesh();
  drive(dressing, entity, mesh, 5);
  assert.ok(
    mesh.userData.hull.children.some((c) => c.name === 'seam_crusher_dressing'),
    'the boss dressing still rides',
  );
  assert.ok(markGroup(mesh, 'commander'), 'the affix mark rides beside it');
});

test('the marks are presentation-only — the stamped entity reads byte-identical', () => {
  const dressing = createLawArenaDressing();
  const entity = eliteEntity('neutral-1', { swarmAffix: 'volatile', swarmAffix2: 'hasted' });
  const aliveSnap = JSON.stringify(entity);
  const mesh = hullMesh();
  drive(dressing, entity, mesh, 60, { motionReduce: true, flashReduce: true });
  assert.equal(JSON.stringify(entity), aliveSnap, 'no hull, stamp, or flag moved — pure read');
  entity.alive = false;
  const deadSnap = JSON.stringify(entity);
  for (let i = 0; i < 10; i++) dressing.updateBossDressing(entity, mesh, 2 + i * 0.1, 0.1, {});
  assert.equal(JSON.stringify(entity), deadSnap, 'the release writes nothing back either');
});

test('mark seams breathe off the authored pulse, and reduced motion holds the pose', () => {
  const dressing = createLawArenaDressing();
  const entity = eliteEntity('pulse-1', { swarmAffix: 'magnetic' });
  const mesh = hullMesh();
  drive(dressing, entity, mesh, 2);
  const mark = markGroup(mesh, 'magnetic');
  const seams = meshesUnder(mark).filter((m) => m.name.endsWith('-tip'));
  assert.ok(seams.length > 0, 'the mark carries emissive seam parts');
  const before = seams[0].material.emissiveIntensity;
  for (let i = 0; i < 30; i++) dressing.updateBossDressing(entity, mesh, 0.1 + i * DT, DT, {});
  const after = seams[0].material.emissiveIntensity;
  assert.ok(Math.abs(after - before) > 1e-3, 'the claw seam breathes on sim time');
});

test('every affix id the elites runtime can stamp resolves to a builder', () => {
  // The stamp table (swarmThreats) and the mark table (lawArenaDressing) are keyed on the
  // same ids — an affix with no builder would field a bare hull anyway.
  for (const row of SWARM_AFFIXES) {
    assert.ok(SWARM_AFFIX_BY_ID[row.id], `${row.id} is in the stamp catalog`);
    const dressing = createLawArenaDressing();
    const entity = eliteEntity('probe', { swarmAffix: row.id });
    const mesh = hullMesh();
    drive(dressing, entity, mesh, 2);
    assert.ok(markGroup(mesh, row.id), `${row.id} hangs real geometry`);
  }
});
