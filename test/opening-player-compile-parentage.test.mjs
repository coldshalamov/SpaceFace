import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { collectUniqueCompileSubjects, compileSubjectsAcrossPresents } from '../src/render/compilePresentSlice.js';

const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const start = source.indexOf('const compileForCurrentTarget = ') + 'const compileForCurrentTarget = '.length;
const end = source.indexOf('\n    const recordAuthoredAdmissionBlockingSlice', start);
assert.ok(start > 0 && end > start);
const compileExpression = source.slice(start, end).trim().replace(/;$/, '');

function fixture() {
  const scene = new THREE.Scene(), player = new THREE.Group(), other = new THREE.Group();
  player.name = 'Authored_Kestrel_Boundary';
  player.userData.authoredAssetState = 'authored';
  const hull = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  hull.name = 'Authored_Kestrel_Hull'; player.add(hull);
  other.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  scene.add(player, other);
  const state = { mode: 'loading', simTime: 0, playerId: 1, render: { firstPlayableFrameAt: null } };
  const owner = { _meshes: new Map([[1, player], [2, other]]), _selectPostRoute: () => 'bloom', _shadowSettingOn: false };
  let resolve, reject;
  const admission = new Promise((yes, no) => { resolve = yes; reject = no; });
  const compiled = [];
  const bindings = {
    state, renderer: {}, THREE, shouldSliceFlightAdmission: () => false, makeGpuQueuePacer: () => null,
    compileSubjectColorAndDepth: subject => { compiled.push(subject); return admission; },
    collectUniqueCompileSubjects, openingCompileIssueKey: subject => subject.material?.uuid || subject.uuid,
    beginScenePipelineReadinessBatch: () => null, compileSubjectsAcrossPresents,
    observePipelineAdmission: promise => promise, admissionPaceYield: async () => {},
    postTaskAtBackgroundPriorityBounded: async callback => callback(), pacedFrameSpend: () => 0,
    PACED_FRAME_BUDGET_MS: 4, notePacedFrameSpend() {},
    captureObjectHome: object => ({ object, parent: object.parent }),
    restoreObjectHome: home => home.parent?.add(home.object),
  };
  const compile = new Function(...Object.keys(bindings), `return (${compileExpression});`)
    .call(owner, ...Object.values(bindings));
  return { scene, player, other, hull, state, compiled, compile, resolve, reject };
}

function visibleInScene(root, scene) {
  for (let node = root; node; node = node.parent) {
    if (node.visible === false) return false;
    if (node === scene) return true;
  }
  return false;
}

test('a loading compile still pending at first flight never removes the admitted authored player from its scene', async () => {
  const f = fixture();
  const pending = f.compile([f.player, f.other], {});
  try {
    f.state.mode = 'flight';
    assert.equal(f.state.simTime, 0);
    assert.strictEqual(f.player.parent, f.scene, 'a pending compile must not park the player under an unmounted staging Group');
    assert.equal(visibleInScene(f.player, f.scene), true);
    const submitted = [];
    f.scene.traverseVisible(object => { if (object.isMesh) submitted.push(object); });
    assert.ok(submitted.includes(f.hull), 'the actual authored hull participates in the first scene submission');
  } finally { f.resolve({ ready: true }); await pending; }
});

test('player compile cancellation preserves parentage and never steals a successor binding', async () => {
  const f = fixture();
  const pending = f.compile([f.player, f.other], {});
  const observed = pending.catch(error => error);
  await Promise.resolve();
  const successor = new THREE.Scene(); successor.add(f.player);
  f.reject(new Error('admission superseded'));
  assert.match((await observed).message, /superseded/);
  assert.strictEqual(f.player.parent, successor, 'the retired compile owns no parentage restore after a new scene adopts the player');
});
