// Presented-matrix progress: a written mesh.position must advance the
// GPU-visible mesh.matrixWorld on every presented epoch, not eventually.
//
// oct18-recording-1702 records a canvas box/planet rotating while translations
// hold ~2.5 s. Whether mesh.position kept advancing in that recording is
// unproven — this fixture models the rendered-side divergence that produces
// the same signature: the drawn world matrix only advances when the presented
// walk reaches the node. renderer._renderPostRoute calls
// updatePresentedSceneMatrices once per frame and scene.matrixWorldAutoUpdate
// is false, so no later pass rescues a skipped subtree.
//
// Every scenario runs real vendored THREE roots through the production helpers:
// updatePresentedSceneMatrices -> updatePresentedObjectMatrices -> vendored
// Object3D#updateMatrixWorld (signature-skip + sfMatrixFrozen prune), plus the
// production hidden-cull mints freezeHiddenSubtreeMatricesSteps /
// unfreezeHiddenSubtreeMatricesSteps driven with the drain's exact call order
// (renderer.js _drainHiddenFreezeQueue/_drainHiddenUnfreezeQueue): the root's
// matrixAutoUpdate flips and sfHiddenFrozen is consumed at mint start, a parked
// iterator resumes later, and an abandoned mint dies by iter.return() on a
// re-cull (queue:26050-26054), a hide-in-place, a detach, or an external
// refreeze (drain:26294-26300).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import(new URL('../vendor/three.module.js', import.meta.url).href);
const {
  freezeStaticChildMatrices,
  freezeStaticTransformRoot,
  freezeHiddenSubtreeMatricesSteps,
  unfreezeHiddenSubtreeMatricesSteps,
  refreshStaticTransform,
} = await import('../src/render/staticChildMatrices.js');
const { updatePresentedSceneMatrices } = await import('../src/render/presentedSceneMatrices.js');

const worldPos = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
const worldPosArray = (o) => worldPos(o).toArray().map((v) => Math.round(v * 1e6) / 1e6);

// The renderer owns an identity, non-composing scene root — the same shape
// presentedSceneMatrices special-cases in production.
function presentedScene() {
  const scene = new THREE.Scene();
  scene.matrixAutoUpdate = false;
  scene.matrixWorldAutoUpdate = false;
  return scene;
}

const present = (scene) => updatePresentedSceneMatrices(scene);

// Top-down presentation camera (the game view): far above, looking at the
// origin. project() reads camera.matrixWorldInverse/projectionMatrix — real
// NDC, the same quantities the draw resolves against.
function presentedCamera() {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2000);
  camera.position.set(0, 88, 34);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}
const ndc = (camera, object) => worldPos(object).project(camera).toArray();

// The snapshot pose writer grammar (snapshotFence.applySnapshotPoseToMesh):
// plain field writes for live roots, updateMatrix() hook once a root is frozen.
function writePose(root, x, z) {
  root.position.x = x;
  root.position.z = z;
  if (root.matrixAutoUpdate === false) root.updateMatrix();
}

// The hidden-freeze drain's mint choreography for one row (renderer.js
// 26133-26136): the root stops composing, its last pose is captured, and the
// stepped interior freeze mints under it.
function mintHiddenFreeze(root) {
  root.matrixAutoUpdate = false;
  root.updateMatrix();
  root.userData.sfHiddenFrozen = true;
  const iter = freezeHiddenSubtreeMatricesSteps(root);
  while (!iter.next().done) { /* drain to completion */ }
}

// The unfreeze drain's mint-start (renderer.js 26284-26285): the gate flag is
// consumed BEFORE the stepped restore runs. The visible-loop side already
// restored the root's own compose (renderer.js 29300).
function beginHiddenUnfreeze(root) {
  root.userData.sfHiddenFrozen = false;
  root.matrixAutoUpdate = true;
  return unfreezeHiddenSubtreeMatricesSteps(root);
}

// Entity shape: ship root -> packaged hull group -> interior, with a tagged
// cosmetic spinner sibling that must keep animating through every freeze state.
function entityRoot(name = 'entity') {
  const root = new THREE.Group();
  root.name = name;
  const packaged = new THREE.Group();
  packaged.name = `${name}_packaged`;
  root.userData.hull = packaged;
  const spinner = new THREE.Group();
  spinner.name = `${name}_spinner`;
  spinner.userData.animated = true; // runtime-tagged nodes never freeze
  const plate = new THREE.Mesh();
  plate.name = `${name}_plate`;
  plate.position.set(0, 0, 2);
  packaged.add(plate);
  root.add(packaged);
  root.add(spinner);
  return { root, packaged, spinner, plate };
}

test('moving entity root: world matrix and projection advance every presented epoch while the cosmetic sibling spins', () => {
  const scene = presentedScene();
  const camera = presentedCamera();
  const { root, packaged, spinner, plate } = entityRoot('ship');
  const payload = new THREE.Group();
  payload.name = 'payload';
  payload.userData.animated = true; // a runtime-driven node stays live by tag
  packaged.add(payload);
  scene.add(root);
  freezeStaticChildMatrices(packaged);

  const seenRoot = [];
  const seenPlateNdc = [];
  const seenSpin = [];
  const seenPayload = [];
  for (let epoch = 0; epoch < 8; epoch += 1) {
    writePose(root, epoch * 2, epoch * 3);          // logical pose advances
    packaged.rotation.z = epoch * 0.02;             // bank channel (hull grammar)
    spinner.rotation.y = epoch * 0.1;               // cosmetic spin stays alive
    payload.position.x = epoch;                     // dynamic payload write
    present(scene);
    seenRoot.push(worldPos(root).x);
    seenPlateNdc.push(ndc(camera, plate)[0]);
    seenSpin.push(spinner.matrixWorld.elements.slice(0, 4).join(','));
    seenPayload.push(worldPos(payload).x);
  }
  for (let epoch = 1; epoch < 8; epoch += 1) {
    assert.ok(seenRoot[epoch] > seenRoot[epoch - 1],
      `epoch ${epoch}: root matrixWorld translation must advance (was ${seenRoot[epoch - 1]}, now ${seenRoot[epoch]})`);
    assert.notEqual(seenPlateNdc[epoch], seenPlateNdc[epoch - 1],
      `epoch ${epoch}: projected hull position must move on screen`);
    assert.notEqual(seenSpin[epoch], seenSpin[epoch - 1],
      `epoch ${epoch}: cosmetic sibling rotation must keep landing`);
    assert.ok(seenPayload[epoch] > seenPayload[epoch - 1],
      `epoch ${epoch}: payload world translation must advance`);
  }
});

test('mount-frozen root: contract pose writes advance world matrix and projection each presented epoch', () => {
  const scene = presentedScene();
  const camera = presentedCamera();
  const site = new THREE.Group();
  const plate = new THREE.Mesh();
  site.add(plate);
  scene.add(site);
  freezeStaticChildMatrices(site);   // interior compose parks first
  freezeStaticTransformRoot(site);   // then the root's own compose
  assert.equal(site.matrixAutoUpdate, false);
  assert.equal(plate.userData.sfMatrixFrozen, true);

  const seen = [];
  const seenNdc = [];
  for (let epoch = 0; epoch < 6; epoch += 1) {
    writePose(site, 0, epoch * 4);                  // station/wreck/asteroid grammar
    present(scene);
    seen.push(worldPos(site).z);
    seenNdc.push(ndc(camera, site)[1]);
  }
  for (let epoch = 1; epoch < 6; epoch += 1) {
    assert.ok(seen[epoch] > seen[epoch - 1],
      `epoch ${epoch}: frozen root's world translation must advance (was ${seen[epoch - 1]}, now ${seen[epoch]})`);
    assert.notEqual(seenNdc[epoch], seenNdc[epoch - 1],
      `epoch ${epoch}: projected position must move`);
  }
});

// The held-root + parked-restore window: with the root signature-clean there is
// no force, so a still-marked mount-frozen ancestor prunes a restored node —
// its flag-armed writes never reach matrixWorld while siblings keep spinning.
test('held root, parked stepped restore: a restored interior node stays presented-reachable', () => {
  const scene = presentedScene();
  const { root, packaged, spinner } = entityRoot('heldShip');
  // A static-frozen intermediate group (no cull stamp — the restore never
  // re-opens its matrixAutoUpdate) as the payload node's parent.
  const mount = new THREE.Group();
  mount.name = 'mount';
  packaged.add(mount);
  scene.add(root);
  // The packaged-commit mint freezes the whole interior — the production shape
  // for authored hulls — including the then-empty mount.
  freezeStaticChildMatrices(packaged);
  assert.equal(mount.userData.sfMatrixFrozen, true, 'interior fully frozen at commit');
  // Runtime content grafted afterwards is what the cull freeze stamps: the
  // vendored add() clears the stale mark chain, leaving a live untagged child
  // under a still mount-frozen group — DFS-first under mount so the restore
  // reaches it before the mint parks, with enough stamped siblings to keep a
  // real residual at abandon.
  const payloadNode = new THREE.Group();
  payloadNode.name = 'tetheredPayload';
  mount.add(payloadNode);
  assert.notEqual(mount.userData.sfMatrixFrozen, true, 'graft released the stale marks');
  assert.equal(payloadNode.matrixAutoUpdate, true, 'grafted node is live and untagged');
  for (let i = 0; i < 1200; i += 1) {
    const f = new THREE.Object3D();
    f.name = `plate${i}`;
    packaged.add(f);
  }

  // Held player-side root: identical pose every epoch -> signature-clean ->
  // force stays false on the presented walk.
  writePose(root, 40, 40);
  present(scene);
  present(scene);
  assert.equal(root.matrixWorldNeedsUpdate, false, 'held root settled');

  // Cull: the hidden freeze stamps every live interior node and marks the
  // fully-frozen chains — mount included, now that payloadNode is frozen.
  root.visible = false;
  mintHiddenFreeze(root);
  assert.equal(payloadNode.userData.sfCullFrozen, true, 'live interior node stamped');
  assert.equal(payloadNode.matrixAutoUpdate, false);
  assert.equal(mount.userData.sfMatrixFrozen, true, 'frozen chain marked over the stamp');
  // Hidden presented epochs keep arriving: pose writes land on fields while
  // the presented pass defers the branch.
  writePose(root, 40, 40);
  present(scene);
  assert.equal(root.matrixWorldNeedsUpdate, true, 'hidden child re-arms for re-entry');

  // Re-show + drain mint-start; park the stepped restore mid-phase so
  // payloadNode is restored while the mount's stale mark still stands.
  root.visible = true;
  const iter = beginHiddenUnfreeze(root);
  const parked = iter.next();
  assert.equal(parked.done, false, 'packaged-scale mint parks mid-restore');
  assert.equal(payloadNode.matrixAutoUpdate, true, 'node restored inside the window');
  assert.notEqual(payloadNode.userData.sfCullFrozen, true);
  present(scene); // consumes the held root's armed flag — world cascade settles

  // Every presented epoch inside the parked window: the payload node keeps
  // taking pose writes (flag-armed contract grammar), the sibling spins.
  let previousSpin = null;
  for (let epoch = 0; epoch < 3; epoch += 1) {
    payloadNode.position.x = 30 + epoch * 3;
    payloadNode.updateMatrix();                    // even an explicit dirty flag must land
    spinner.rotation.y = 0.5 + epoch * 0.1;        // cosmetic sibling stays alive
    present(scene);
    const spin = spinner.matrixWorld.elements.slice(0, 4).join(',');
    if (previousSpin !== null) {
      assert.notEqual(spin, previousSpin, `epoch ${epoch}: cosmetic sibling keeps spinning`);
    }
    previousSpin = spin;
    assert.equal(worldPos(payloadNode).x, 40 + 30 + epoch * 3,
      `epoch ${epoch}: restored node's matrixWorld must track its written position ` +
      `(position.x=${payloadNode.position.x}) — a clean sfMatrixFrozen ancestor ` +
      'must not prune-hide the restored node');
  }

  // The drain abandon: re-cull / hide-in-place / detach kills the parked mint
  // mid-restore. sfHiddenFrozen must still describe the residual stamps or no
  // path ever re-mints the restore.
  try { iter.return(); } catch (_) { /* discard proceeds, as the drain does */ }
  let residual = 0;
  root.traverse((n) => { if (n.userData && n.userData.sfCullFrozen === true) residual += 1; });
  assert.ok(residual > 0, 'a mid-mint kill leaves stamped descendants unrestored');
  assert.equal(root.userData.sfHiddenFrozen, true,
    'residual sfCullFrozen stamps must re-arm the hidden-frozen gate — otherwise the ' +
    'next show never re-queues a restore and the subtree stays frozen while visible');
});

test('abandoned stepped restore re-arms the gate so a later mint finishes the prefix', () => {
  const scene = presentedScene();
  const { root, packaged } = entityRoot('flapShip');
  for (let i = 0; i < 1200; i += 1) packaged.add(new THREE.Object3D());
  scene.add(root);
  freezeStaticChildMatrices(packaged);
  // A live interior node added after the static mint — the cull freeze stamps
  // it, and its DFS-late slot keeps it unrestored when the mint parks.
  const payloadNode = new THREE.Group();
  payloadNode.name = 'latePayload';
  packaged.add(payloadNode);
  assert.equal(payloadNode.matrixAutoUpdate, true);

  writePose(root, 5, 5);
  present(scene);
  root.visible = false;
  mintHiddenFreeze(root);
  root.visible = true;
  const iter = beginHiddenUnfreeze(root);
  iter.next();                                     // parked before payloadNode restores
  try { iter.return(); } catch (_) { /* drain abandon */ }
  assert.equal(root.userData.sfHiddenFrozen, true,
    'the abandoned mint must hand the gate flag back for the still-stamped prefix');
  assert.equal(payloadNode.userData.sfCullFrozen, true,
    'the unrestored node still carries its stamp for the next mint');

  // The next show re-queues through the same production entry point and the
  // restore mints to completion — the healed end state presents correctly.
  root.userData.sfHiddenFrozen = false;            // queue->drain consumes it again
  const redo = unfreezeHiddenSubtreeMatricesSteps(root);
  while (!redo.next().done) { /* drain */ }
  for (let epoch = 0; epoch < 3; epoch += 1) {
    payloadNode.position.x = 7 + epoch;
    payloadNode.updateMatrix();
    writePose(root, 5, 5);                          // held root
    present(scene);
    assert.equal(worldPos(payloadNode).x, 5 + 7 + epoch,
      `epoch ${epoch}: healed node tracks its writes`);
  }
});

test('completed stepped restore inside a held root leaves every write landing (control)', () => {
  const scene = presentedScene();
  const { root, packaged, spinner } = entityRoot('wellShip');
  const mount = new THREE.Group();
  const payloadNode = new THREE.Group();
  mount.add(payloadNode);
  packaged.add(mount);
  scene.add(root);
  freezeStaticChildMatrices(mount);  // interior compose parks first
  freezeStaticTransformRoot(mount);  // then the mount root's own compose

  writePose(root, 9, 9);
  present(scene);
  root.visible = false;
  mintHiddenFreeze(root);
  root.visible = true;
  const iter = beginHiddenUnfreeze(root);
  while (!iter.next().done) { /* complete the restore */ }
  // The completed restore honestly re-marks the mount-frozen interior
  // (payloadNode was never cull-stamped, so it keeps its parked compose) —
  // writes to it go through refreshStaticTransform, the sanctioned dirty path
  // that clears the mark chain and refreshes the subtree worlds immediately.
  assert.equal(mount.userData.sfMatrixFrozen, true, 'still-frozen mount re-marked');

  let previousSpin = null;
  for (let epoch = 0; epoch < 3; epoch += 1) {
    writePose(root, 9, 9);                          // held root
    payloadNode.position.x = 2 + epoch;
    refreshStaticTransform(payloadNode);
    spinner.rotation.y = epoch * 0.25;
    present(scene);
    const spin = spinner.matrixWorld.elements.slice(0, 4).join(',');
    if (previousSpin !== null) assert.notEqual(spin, previousSpin, `epoch ${epoch}: spinner alive`);
    previousSpin = spin;
    assert.equal(worldPos(payloadNode).x, 9 + 2 + epoch, `epoch ${epoch}: restored node presents its write`);
  }
});

test('fragment graft under a marked subtree presents on its first epoch; removal and re-admission stay clean', () => {
  const scene = presentedScene();
  const camera = presentedCamera();
  const { root, packaged } = entityRoot('miner');
  const mount = new THREE.Group();
  packaged.add(mount);
  scene.add(root);
  freezeStaticTransformRoot(mount);
  assert.equal(mount.userData.sfMatrixFrozen, true);

  writePose(root, 12, 12);
  present(scene);
  present(scene); // settle signatures — the prune path is what must not trap the graft

  // Fragment admission: vendored add() clears ancestor marks, so the grafted
  // fragment's world matrix resolves on the very next presented epoch even
  // though every ancestor is signature-clean.
  const fragment = new THREE.Group();
  fragment.name = 'fragment';
  fragment.position.set(3, 0, 4);
  mount.add(fragment);
  assert.notEqual(mount.userData.sfMatrixFrozen, true, 'add() releases the stale mark chain');
  const rock = new THREE.Mesh();
  rock.position.set(0, 1, 0);
  fragment.add(rock);
  present(scene);
  assert.deepEqual(worldPosArray(rock), [15, 1, 16], 'admitted fragment resolves immediately');
  const beforeNdc = ndc(camera, rock);
  fragment.position.x = 5;
  fragment.updateMatrix();
  present(scene);
  assert.deepEqual(worldPosArray(rock), [17, 1, 16], 'fragment tracks follow-up writes');
  assert.notDeepEqual(ndc(camera, rock), beforeNdc, 'projected fragment position moves');

  // Removal, re-freeze, re-admission: the second graft must not inherit a
  // stale mark chain either.
  mount.remove(fragment);
  freezeStaticTransformRoot(mount);
  assert.equal(mount.userData.sfMatrixFrozen, true);
  const fragment2 = new THREE.Group();
  fragment2.position.set(-2, 0, 1);
  mount.add(fragment2);
  present(scene);
  assert.deepEqual(worldPosArray(fragment2), [10, 0, 13], 're-admitted fragment resolves');
});

test('fragment graft during a parked restore window clears the stale mark itself', () => {
  const scene = presentedScene();
  const { root, packaged } = entityRoot('windowShip');
  const mount = new THREE.Group();
  for (let i = 0; i < 1100; i += 1) mount.add(new THREE.Object3D());
  packaged.add(mount);
  scene.add(root);
  freezeStaticChildMatrices(root);                 // full interior freeze incl. mount
  assert.equal(mount.userData.sfMatrixFrozen, true);

  writePose(root, 20, 20);
  present(scene);
  root.visible = false;
  mintHiddenFreeze(root);
  root.visible = true;
  const iter = beginHiddenUnfreeze(root);
  iter.next(); // parked: marks from the cull mint still stand until re-mark

  // A fragment bound mid-window under the still-marked mount must not inherit
  // the prune — vendored add() clears the chain at graft time.
  const fragment = new THREE.Group();
  fragment.position.set(1, 0, 2);
  mount.add(fragment);
  assert.notEqual(mount.userData.sfMatrixFrozen, true, 'graft clears the stale mark');
  present(scene);
  assert.deepEqual(worldPosArray(fragment), [21, 0, 22],
    'mid-window graft presents its world transform');
  while (!iter.next().done) { /* finish restore */ }
});
