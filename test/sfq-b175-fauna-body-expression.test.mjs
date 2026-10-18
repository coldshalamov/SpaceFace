import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { faunaSpeciesById } from '../src/data/alienFauna.js';
import { readFaunaMotion, resolveFaunaApproachDrive } from '../src/data/faunaMotionRead.js';

function createFaunaEntity(speciesId, driveState = 'drift') {
  return {
    id: 4242,
    alive: true,
    data: {
      strainId: 'charon_grave',
      ecology: {
        speciesId,
        driveState,
      },
    },
  };
}

test('SFQ-B175: buildFaunaMesh attaches updateAuthoredMotion and stamps initial motion read', () => {
  const ram = createFaunaEntity('bristle_ram', 'charge');
  const mesh = buildFaunaMesh(ram);
  assert.ok(mesh, 'fauna mesh built');
  assert.equal(typeof mesh.userData.updateAuthoredMotion, 'function', 'updateAuthoredMotion attached');
  assert.equal(mesh.userData.faunaDriveState, 'charge');
  assert.equal(mesh.userData.faunaMotionRead, 'defense');
});

test('SFQ-B175: Bristle Ram visibly expresses charging vs fleeing vs drifting', () => {
  const ram = createFaunaEntity('bristle_ram', 'drift');
  const mesh = buildFaunaMesh(ram);
  const fn = mesh.userData.updateAuthoredMotion;

  // 1. Drifting: calm resting posture
  ram.data.ecology.driveState = 'drift';
  fn(ram, 1.0, {});
  const driftPitch = mesh.rotation.x;
  const driftScaleY = mesh.scale.y;
  const quill = mesh.children.find((c) => c.name === 'br_quill');
  assert.ok(quill, 'quill found');
  const driftQuillX = quill.rotation.x;

  // 2. Charging: body pitches forward aggressively, quills flare forward
  ram.data.ecology.driveState = 'charge';
  fn(ram, 1.0, {});
  assert.ok(mesh.rotation.x < -0.1, `charging body pitches forward: got ${mesh.rotation.x}`);
  assert.ok(quill.rotation.x < driftQuillX, `quills flare forward: charge ${quill.rotation.x} vs drift ${driftQuillX}`);
  assert.equal(mesh.userData.faunaMotionRead, 'defense');

  // 3. Fleeing: body flattens, quills tuck back, child lateral thrashing
  ram.data.ecology.driveState = 'flee';
  fn(ram, 1.0, {});
  assert.ok(mesh.scale.y < driftScaleY * 0.95, `fleeing body flattens: flee ${mesh.scale.y} vs drift ${driftScaleY}`);
  assert.ok(quill.rotation.x > driftQuillX, `quills tuck back: flee ${quill.rotation.x} vs drift ${driftQuillX}`);
  assert.notEqual(quill.rotation.y, 0, `quills and body parts thrash laterally: got ${quill.rotation.y}`);
  assert.equal(mesh.userData.faunaMotionRead, 'retreat');
});

test('SFQ-B175: Preserves snapshot pose - root position and yaw are never stomped by authored motion', () => {
  const ram = createFaunaEntity('bristle_ram', 'charge');
  const mesh = buildFaunaMesh(ram);
  const fn = mesh.userData.updateAuthoredMotion;

  // Simulate snapshot pose having positioned and oriented the mesh in world space
  mesh.position.set(450.5, 0, -820.25);
  mesh.rotation.y = 2.35; // heading yaw

  // Run all 3 motion branches
  for (const drive of ['charge', 'flee', 'drift']) {
    ram.data.ecology.driveState = drive;
    fn(ram, 1.5, {});

    // Root world position and heading yaw must remain exactly untouched
    assert.equal(mesh.position.x, 450.5, `root.position.x preserved in ${drive}`);
    assert.equal(mesh.position.y, 0, `root.position.y preserved in ${drive}`);
    assert.equal(mesh.position.z, -820.25, `root.position.z preserved in ${drive}`);
    assert.equal(mesh.rotation.y, 2.35, `root.rotation.y heading yaw preserved in ${drive}`);
  }
});

test('SFQ-B175: Approach simulation on seed 4242 drives distinct visual body expressions', () => {
  const ramSpecies = faunaSpeciesById('bristle_ram');
  const grazerSpecies = faunaSpeciesById('glassback');

  const ramEntity = createFaunaEntity('bristle_ram', 'drift');
  const grazerEntity = createFaunaEntity('glassback', 'drift');

  const ramMesh = buildFaunaMesh(ramEntity);
  const grazerMesh = buildFaunaMesh(grazerEntity);

  // Close approach (playerD = 40): ram resolves to charge, grazer resolves to flee
  const ramDrive = resolveFaunaApproachDrive(ramSpecies, { playerD: 40, reacted: true, currentDrive: 'drift' });
  const grazerDrive = resolveFaunaApproachDrive(grazerSpecies, { playerD: 40, reacted: true, currentDrive: 'drift' });

  assert.equal(ramDrive, 'charge');
  assert.equal(grazerDrive, 'flee');

  ramEntity.data.ecology.driveState = ramDrive;
  grazerEntity.data.ecology.driveState = grazerDrive;

  ramMesh.userData.updateAuthoredMotion(ramEntity, 0.5, {});
  grazerMesh.userData.updateAuthoredMotion(grazerEntity, 0.5, {});

  // Ram expresses aggressive forward posture
  assert.ok(ramMesh.rotation.x < -0.1, 'ram expresses forward charge');
  assert.equal(ramMesh.userData.faunaMotionRead, 'defense');

  // Grazer expresses tuck/retreat
  assert.ok(grazerMesh.scale.y < 0.9, 'grazer expresses flattened flee profile');
  assert.equal(grazerMesh.userData.faunaMotionRead, 'retreat');

  // Distant watch (playerD = 10000): both resolve to quiet (drift / forage)
  const ramFar = resolveFaunaApproachDrive(ramSpecies, { playerD: 10000, reacted: true, currentDrive: 'drift' });
  const grazerFar = resolveFaunaApproachDrive(grazerSpecies, { playerD: 10000, reacted: true, currentDrive: 'drift' });

  assert.equal(readFaunaMotion(ramFar), 'quiet');
  assert.equal(readFaunaMotion(grazerFar), 'quiet');

  ramEntity.data.ecology.driveState = ramFar;
  grazerEntity.data.ecology.driveState = grazerFar;

  ramMesh.userData.updateAuthoredMotion(ramEntity, 0.5, {});
  grazerMesh.userData.updateAuthoredMotion(grazerEntity, 0.5, {});

  assert.equal(ramMesh.userData.faunaMotionRead, 'quiet');
  assert.equal(grazerMesh.userData.faunaMotionRead, 'quiet');
});

test('SFQ-B175: Reduced motion suppresses dynamic oscillations while preserving informative posture', () => {
  const ram = createFaunaEntity('bristle_ram', 'flee');
  const mesh = buildFaunaMesh(ram);
  const fn = mesh.userData.updateAuthoredMotion;
  const quill = mesh.children.find((c) => c.name === 'br_quill');

  // Full motion flee thrashes child parts
  fn(ram, 1.0, { reducedMotion: false });
  assert.notEqual(quill.rotation.y, 0, 'full motion has lateral thrash');

  // Reduced motion flee eliminates thrash oscillation
  fn(ram, 1.0, { reducedMotion: true });
  assert.equal(quill.rotation.y, 0, 'reduced motion eliminates lateral thrash');

  // But still preserves flattened profile posture
  assert.ok(mesh.scale.y < 0.9, 'reduced motion retains readable flat profile posture');

  // Reduced motion charging still preserves forward pitch
  ram.data.ecology.driveState = 'charge';
  fn(ram, 1.0, { reducedMotion: true });
  assert.ok(mesh.rotation.x < -0.1, 'reduced motion retains forward pitch posture');
});
