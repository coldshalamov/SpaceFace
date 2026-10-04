import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { openingProgramSubjectKey } from '../src/render/openingSubmissionPlan.js';
import {
  admitOpeningUnitsAcrossSlices,
  materialHasCompiledProgram,
  touchSubjectOnExactTarget,
  uniqueAdmissionUnits,
  withOnlySubjectsDrawable,
} from '../src/render/openingGpuAdmission.js';
import {
  createPackageDetachManifest,
  detachPackageTexture,
  isPackageTextureDetached,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';
import { openingCompileIssueKey } from '../src/render/renderer.js';
import { revealSubjectWithAncestors } from '../src/render/compilePresentSlice.js';

test('compile issue key distinguishes onBeforeCompile bodies a sampled fingerprint would merge', () => {
  // Two patches with identical length and identical first/middle/last chars: three's program
  // cache reads the FULL customProgramCacheKey() (the default returns onBeforeCompile
  // source), so these link separately — a partial fingerprint would merge them and skip the
  // compile the round then pays mid-flight.
  const makePatch = (mid) => {
    // Same length, same first/last/middle char, different body content.
    const body = mid === 'a'
      ? 'shader.uniforms.uA.value += 0.0;'
      : 'shader.uniforms.uB.value += 0.0;';
    return new Function('shaderobject', 'renderer', body);
  };
  const patchA = makePatch('a');
  const patchB = makePatch('b');
  const srcA = patchA.toString();
  const srcB = patchB.toString();
  assert.equal(srcA.length, srcB.length);
  assert.equal(srcA[0], srcB[0]);
  assert.equal(srcA[srcA.length >> 1], srcB[srcB.length >> 1]);
  assert.equal(srcA[srcA.length - 1], srcB[srcB.length - 1]);

  const geo = new THREE.BoxGeometry();
  const matA = new THREE.MeshStandardMaterial();
  const matB = new THREE.MeshStandardMaterial();
  matA.onBeforeCompile = patchA;
  matB.onBeforeCompile = patchB;
  const meshA = new THREE.Mesh(geo, matA);
  const meshB = new THREE.Mesh(geo, matB);
  assert.notEqual(openingCompileIssueKey(meshA), openingCompileIssueKey(meshB));

  const matC = new THREE.MeshStandardMaterial();
  matC.onBeforeCompile = patchA;
  const meshC = new THREE.Mesh(geo, matC);
  assert.equal(openingCompileIssueKey(meshA), openingCompileIssueKey(meshC),
    'identical patch bodies share the issue signature');
});

test('compile issue key covers the r184 object/geometry program flags, not just names', () => {
  const mat = new THREE.MeshStandardMaterial();
  const box = () => new THREE.BoxGeometry();

  const geoRGB = box();
  geoRGB.setAttribute('color', new THREE.BufferAttribute(new Float32Array(72), 3));
  const geoRGBA = box();
  geoRGBA.setAttribute('color', new THREE.BufferAttribute(new Float32Array(96), 4));
  const vertexColored = new THREE.MeshStandardMaterial({ vertexColors: true });
  assert.notEqual(
    openingCompileIssueKey(new THREE.Mesh(geoRGB, vertexColored)),
    openingCompileIssueKey(new THREE.Mesh(geoRGBA, vertexColored)),
    'vertexAlphas splits on color.itemSize 4, so attribute keys carry itemSize');

  const morph1 = box();
  morph1.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(72), 3)];
  const morph2 = box();
  morph2.morphAttributes.position = [
    new THREE.BufferAttribute(new Float32Array(72), 3),
    new THREE.BufferAttribute(new Float32Array(72), 3),
  ];
  assert.notEqual(
    openingCompileIssueKey(new THREE.Mesh(morph1, mat)),
    openingCompileIssueKey(new THREE.Mesh(morph2, mat)),
    'morphTargetsCount rides the key — a 1-target and 2-target morph link separately');

  assert.notEqual(
    openingCompileIssueKey(new THREE.Mesh(box(), mat)),
    openingCompileIssueKey(new THREE.InstancedMesh(box(), mat, 4)),
    'instancing is a different program from a direct draw');

  const instPlain = new THREE.InstancedMesh(box(), mat, 4);
  const instColor = new THREE.InstancedMesh(box(), mat, 4);
  instColor.setColorAt(0, new THREE.Color(1, 0, 0));
  assert.notEqual(
    openingCompileIssueKey(instPlain), openingCompileIssueKey(instColor),
    'instancingColor is a program flag');

  const instMorph = new THREE.InstancedMesh(box(), mat, 4);
  instMorph.morphTexture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  assert.notEqual(
    openingCompileIssueKey(instPlain), openingCompileIssueKey(instMorph),
    'instancingMorph is a program flag');

  const batchedPlain = new THREE.BatchedMesh(4, 256, 256, mat);
  const batchedColor = new THREE.BatchedMesh(4, 256, 256, mat);
  batchedColor._colorsTexture = new THREE.DataTexture(new Uint8Array(16), 1, 1);
  assert.notEqual(
    openingCompileIssueKey(batchedPlain), openingCompileIssueKey(batchedColor),
    'batchingColor is a program flag');

  const twin = new THREE.Mesh(box(), mat);
  assert.equal(openingCompileIssueKey(twin), openingCompileIssueKey(new THREE.Mesh(box(), mat)),
    'genuinely identical signatures still share the issue key');
  assert.equal(openingCompileIssueKey({ isMesh: true }), null,
    'an unkeyable subject stays null and therefore never dedupes');
});

test('family customProgramCacheKey values do not collapse distinct maps into one opening program', () => {
  const family = () => 'spaceface-common-rock-pbr';
  const mapA = new THREE.Texture();
  mapA.name = 'rock-albedo-a';
  const mapB = new THREE.Texture();
  mapB.name = 'rock-albedo-b';
  const a = new THREE.MeshStandardMaterial({ map: mapA });
  const b = new THREE.MeshStandardMaterial({ map: mapB });
  a.customProgramCacheKey = family;
  b.customProgramCacheKey = family;
  assert.notEqual(openingProgramSubjectKey(a), openingProgramSubjectKey(b));
});

test('unique admission units keep one subject per material and per geometry', () => {
  const shared = new THREE.MeshStandardMaterial();
  const geo = new THREE.BoxGeometry();
  const hull = new THREE.Mesh(geo, shared);
  const wing = new THREE.Mesh(geo, shared);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const units = uniqueAdmissionUnits([hull, wing, canopy]);
  assert.equal(units.materialCount, 2);
  assert.equal(units.geometryCount, 2);
  assert.equal(units.programSubjects.length, 2);
  assert.equal(units.geometrySubjects.length, 2);

  const ready = new Set([shared]);
  const skipped = uniqueAdmissionUnits([hull, wing, canopy], {
    skipReadyMaterial: (material) => ready.has(material),
  });
  assert.equal(skipped.programSubjects.length, 1);
  assert.equal(skipped.programSubjects[0], canopy);
  assert.equal(materialHasCompiledProgram(shared, () => ({ currentProgram: { id: 1 } })), true);
  assert.equal(materialHasCompiledProgram(shared, () => ({})), false);
});

test('opening GPU admission compiles and touches one unique subject per yield', async () => {
  const order = [];
  const a = { id: 'a', material: { uuid: 'ma' }, geometry: { uuid: 'ga' } };
  const b = { id: 'b', material: { uuid: 'mb' }, geometry: { uuid: 'gb' } };
  const result = await admitOpeningUnitsAcrossSlices({
    subjects: [a, b],
    compileOne: async (subject) => { order.push(`compile:${subject.id}`); },
    touchOne: (subject) => { order.push(`touch:${subject.id}`); },
    yieldToMain: async () => { order.push('yield'); },
  });
  assert.equal(result.subjects, 2);
  assert.deepEqual(order, ['compile:a', 'touch:a', 'yield', 'compile:b', 'touch:b']);
});

test('a readiness batch issues every compile before the drain, and every touch after it', async () => {
  // `renderer.compile()` under KHR_parallel_shader_compile only STARTS the driver link, so the
  // cohort must reach the driver before the first wait. Two orderings are load-bearing here:
  // no compile may wait on the one before it (that is the 25.8 s serialization this removes), and
  // no touch may run before the drain (a draw against an unlinked program pays the same stall).
  const order = [];
  const a = { id: 'a', material: { uuid: 'ma' }, geometry: { uuid: 'ga' } };
  const b = { id: 'b', material: { uuid: 'mb' }, geometry: { uuid: 'gb' } };
  let drained = false;
  const result = await admitOpeningUnitsAcrossSlices({
    subjects: [a, b],
    beginReadinessBatch: () => ({
      async drain() { order.push('drain'); drained = true; return { contextLost: false }; },
      close() { order.push('close'); },
    }),
    compileOne: (subject) => {
      order.push(`compile:${subject.id}`);
      return Promise.resolve(`compiled:${subject.id}`);
    },
    touchOne: (subject) => {
      assert.equal(drained, true, `touch:${subject.id} ran before the batch drained`);
      order.push(`touch:${subject.id}`);
    },
    yieldToMain: async () => { order.push('yield'); },
  });
  assert.equal(result.subjects, 2);
  assert.equal(result.batched, true);
  assert.deepEqual(order, [
    'compile:a', 'yield', 'compile:b',
    'drain', 'close',
    'touch:a', 'yield', 'touch:b',
  ]);
  assert.deepEqual(result.results.map((entry) => entry.compiled), ['compiled:a', 'compiled:b']);
});

test('a batch that throws mid-issue still closes, so no compile is left suspended', async () => {
  const order = [];
  const a = { id: 'a', material: { uuid: 'ma' }, geometry: { uuid: 'ga' } };
  await assert.rejects(
    admitOpeningUnitsAcrossSlices({
      subjects: [a],
      beginReadinessBatch: () => ({
        async drain() { throw new Error('drain failed'); },
        close() { order.push('close'); },
      }),
      compileOne: () => Promise.resolve(null),
      touchOne: () => { order.push('touch'); },
    }),
    /drain failed/,
  );
  assert.deepEqual(order, ['close'], 'close must run even when the drain throws');
});

test('exact-target touch hides other drawables and restores them', () => {
  const scene = new THREE.Scene();
  const keep = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(keep, other);
  const rendered = [];
  const renderer = {
    autoClear: true,
    getRenderTarget() { return null; },
    setRenderTarget() {},
    render(targetScene) { rendered.push(targetScene); },
  };
  withOnlySubjectsDrawable(scene, [keep], () => {
    assert.equal(keep.visible, true);
    assert.equal(other.visible, false);
  });
  assert.equal(other.visible, true);
  const receipt = touchSubjectOnExactTarget(renderer, null, keep, {}, scene);
  assert.equal(receipt.skipped, false);
  assert.equal(rendered.length, 1);
  assert.equal(other.visible, true);
});

test('an exact-target touch reaches a subject parked under a hidden holder', () => {
  // The straggler sweep collects pools whose holders are visible:false at cook time. A bare
  // withOnlySubjectsDrawable re-hid a drawable ancestor mid-touch, render() skipped the whole
  // subtree, and the "touch" drew nothing — the program still linked inside the first
  // presented bloomScene. The holder is a Mesh on purpose: only a drawable ancestor exercises
  // the keep-set.
  const scene = new THREE.Scene();
  const holder = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const keep = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  holder.add(keep);
  scene.add(holder, other);
  holder.visible = false;
  const rendered = [];
  const renderer = {
    autoClear: true,
    getRenderTarget() { return null; },
    setRenderTarget() {},
    render() {
      rendered.push({ holder: holder.visible, keep: keep.visible, other: other.visible });
    },
  };
  const restore = revealSubjectWithAncestors(keep);
  let receipt;
  try {
    receipt = touchSubjectOnExactTarget(renderer, null, keep, {}, scene);
  } finally {
    restore();
  }
  assert.equal(receipt.skipped, false);
  assert.deepEqual(rendered, [{ holder: true, keep: true, other: false }],
    'the revealed chain stays drawable so the subject actually renders');
  assert.equal(holder.visible, false, 'holder hidden again after the touch');
  assert.equal(other.visible, true, 'hidden drawables restored');
});

test('an exact-target touch parks a detached subject in the lighting scene for the draw', () => {
  // Authored ships compile while their composed root is still detached (pre-commit prepare).
  // renderer.render() draws the lighting scene's graph, not the subject — a detached subject's
  // "touch" drew nothing and its bloom-target variant linked inside the first presented frame.
  const scene = new THREE.Scene();
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(other);
  const detached = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  detached.add(leaf);
  const seenParents = [];
  const renderer = {
    autoClear: true,
    getRenderTarget() { return null; },
    setRenderTarget() {},
    render() {
      seenParents.push({ parentIsScene: detached.parent === scene, leafVisible: leaf.visible });
    },
  };
  const receipt = touchSubjectOnExactTarget(renderer, null, detached, {}, scene);
  assert.equal(receipt.skipped, false);
  assert.deepEqual(seenParents, [{ parentIsScene: true, leafVisible: true }],
    'the parked subject is under the lighting scene during the render');
  assert.equal(detached.parent, null, 'the subject is detached again after the touch');
});

test('an exact-target touch restores a foreign-parented subject after parking it', () => {
  const scene = new THREE.Scene();
  const staging = new THREE.Group();
  const subject = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  staging.add(subject);
  const renderer = {
    autoClear: true,
    getRenderTarget() { return null; },
    setRenderTarget() {},
    render() { assert.equal(subject.parent, scene); },
  };
  touchSubjectOnExactTarget(renderer, null, subject, {}, scene);
  assert.equal(subject.parent, staging, 'the original parent keeps the subject');
});

test('an exact-target touch restores a foreign subject to its original child index', () => {
  // partsLibrary resolves authored nodes through index-based paths (objectPathFromRoot); a
  // park that appends on restore silently renumbers the parent's children and corrupts any
  // path captured before the touch. The restore must splice the subject back where it sat.
  const scene = new THREE.Scene();
  const staging = new THREE.Group();
  const before = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const subject = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const after = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  staging.add(before, subject, after);
  const renderer = {
    autoClear: true,
    getRenderTarget() { return null; },
    setRenderTarget() {},
    render() { assert.equal(subject.parent, scene); },
  };
  const receipt = touchSubjectOnExactTarget(renderer, null, subject, {}, scene);
  assert.equal(receipt.skipped, false);
  assert.deepEqual(staging.children, [before, subject, after],
    'the subject returns to index 1 — not appended at the end');
});

test('an exact-target touch draws a frustum-cullable subject and restores the flag', () => {
  // The touch exists to link the subject's program on the exact target — a subject outside the
  // camera frustum (a parked detached root at its pre-commit pose) would be culled and stay
  // cold. Same contract bloom.js and compilePresentSlice.js already keep for their warm draws.
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  const subject = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  holder.add(subject);
  subject.add(leaf);
  scene.add(holder);
  const seen = [];
  const renderer = {
    autoClear: true,
    getRenderTarget() { return null; },
    setRenderTarget() {},
    render() {
      seen.push({
        holder: holder.frustumCulled,
        subject: subject.frustumCulled,
        leaf: leaf.frustumCulled,
      });
    },
  };
  const receipt = touchSubjectOnExactTarget(renderer, null, subject, {}, scene);
  assert.equal(receipt.skipped, false);
  assert.deepEqual(seen, [{ holder: false, subject: false, leaf: false }],
    'subject subtree and ancestors draw regardless of camera aim');
  assert.equal(holder.frustumCulled, true, 'ancestor culling restored');
  assert.equal(subject.frustumCulled, true, 'subject culling restored');
  assert.equal(leaf.frustumCulled, true, 'leaf culling restored');
});

test('a batched admission touches every issued unit even when the deadline lapses mid-issue', async () => {
  // The brick this removes: an issued-but-never-drawn unit pays its final link/bufferData inside
  // the first presented scene pass. The deadline gates issuing; an issued subject is always
  // drawn. Units the issue loop never reached stay budget-gated — their touch would pay a full
  // blocking link under the shell. The injected clock makes the lapse deterministic.
  const order = [];
  const subjects = ['a', 'b', 'c'].map((id) => ({
    id, material: { uuid: `m${id}` }, geometry: { uuid: `g${id}` },
  }));
  let tick = 0;
  const result = await admitOpeningUnitsAcrossSlices({
    subjects,
    deadlineMs: 5,
    now: () => (tick += 2),
    beginReadinessBatch: () => ({
      async drain() { order.push('drain'); return { contextLost: false }; },
      close() { order.push('close'); },
    }),
    compileOne: (subject) => {
      order.push(`compile:${subject.id}`);
      return Promise.resolve(`compiled:${subject.id}`);
    },
    touchOne: (subject) => { order.push(`touch:${subject.id}`); },
    yieldToMain: async () => {},
  });
  assert.equal(result.issued, 1, 'the clock ran the deadline out after one issue');
  assert.equal(result.touched, 1, 'the issued unit still drew; unissued units stayed gated');
  assert.deepEqual(order, ['compile:a', 'drain', 'close', 'touch:a']);
  assert.deepEqual(result.results.map((entry) => entry.compiled), ['compiled:a']);
});

test('a throwing touch reports the row and still draws the rest of the cohort', async () => {
  const order = [];
  const subjects = ['a', 'b', 'c'].map((id) => ({
    id, material: { uuid: `m${id}` }, geometry: { uuid: `g${id}` },
  }));
  const result = await admitOpeningUnitsAcrossSlices({
    subjects,
    beginReadinessBatch: () => ({
      async drain() { return { contextLost: false }; },
      close() {},
    }),
    compileOne: (subject) => Promise.resolve(`compiled:${subject.id}`),
    touchOne: (subject) => {
      order.push(`touch:${subject.id}`);
      if (subject.id === 'b') throw new Error('touch b failed');
    },
  });
  assert.equal(result.touched, 3, 'a bad touch must not abandon the cohort');
  assert.deepEqual(order, ['touch:a', 'touch:b', 'touch:c']);
  assert.equal(result.results[0].touchError, null);
  assert.match(String(result.results[1].touchError), /touch b failed/);
  assert.equal(result.results[2].touchError, null);
});

test('a grouped touch never straddles the issued boundary', async () => {
  const order = [];
  const subjects = ['a', 'b', 'c'].map((id) => ({
    id, material: { uuid: `m${id}` }, geometry: { uuid: `g${id}` },
  }));
  let tick = 0;
  const result = await admitOpeningUnitsAcrossSlices({
    subjects,
    deadlineMs: 5,
    now: () => (tick += 2),
    beginReadinessBatch: () => ({
      async drain() { return { contextLost: false }; },
      close() {},
    }),
    compileOne: (subject) => Promise.resolve(`compiled:${subject.id}`),
    touchMany: (group) => { order.push(`touch:${group.map((s) => s.id).join('')}`); return group.length; },
    touchBatchSize: 2,
    yieldToMain: async () => {},
  });
  assert.equal(result.issued, 1);
  // Without the clamp, batch [a,b] would draw the never-issued b under the shell.
  assert.deepEqual(order, ['touch:a']);
  assert.equal(result.touched, 1);
});

test('one rejected compile still draws the rest of the issued cohort', async () => {
  // Promise.all used to reject the cohort on one bad compile, skipping every later touch —
  // a single straggler error left the whole settle un-touched and linking in-flight.
  const order = [];
  const subjects = ['a', 'b', 'c'].map((id) => ({
    id, material: { uuid: `m${id}` }, geometry: { uuid: `g${id}` },
  }));
  const result = await admitOpeningUnitsAcrossSlices({
    subjects,
    beginReadinessBatch: () => ({
      async drain() { return { contextLost: false }; },
      close() {},
    }),
    compileOne: (subject) => (subject.id === 'b'
      ? Promise.reject(new Error('compile b failed'))
      : Promise.resolve(`compiled:${subject.id}`)),
    touchOne: (subject) => { order.push(`touch:${subject.id}`); },
  });
  assert.equal(result.touched, 3, 'every issued unit is drawn once');
  assert.deepEqual(order, ['touch:a', 'touch:b', 'touch:c']);
  assert.deepEqual(result.results.map((entry) => entry.compiled),
    ['compiled:a', null, 'compiled:c'], 'the rejected compile records null, not a cohort abort');
});

test('a grouped exact-target touch draws every member in one render and hides only the rest', () => {
  // The loading shell touched thousands of Crucible warm subjects one render each, and every
  // render first hid and restored the whole scene graph (~20 s of a launch). A group shares that
  // walk and the render call; each member must still be the drawable it would be alone.
  const scene = new THREE.Scene();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const b = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(a, b, other);
  const seen = [];
  const renderer = {
    autoClear: true,
    getRenderTarget() { return null; },
    setRenderTarget() {},
    render() { seen.push({ a: a.visible, b: b.visible, other: other.visible }); },
  };
  const receipt = touchSubjectOnExactTarget(renderer, null, [a, b], {}, scene);
  assert.equal(receipt.skipped, false);
  assert.equal(receipt.subjects, 2);
  assert.deepEqual(seen, [{ a: true, b: true, other: false }], 'one render, both members drawn, the rest hidden');
  assert.equal(other.visible, true, 'hidden drawables are restored');
  assert.equal(touchSubjectOnExactTarget(renderer, null, [], {}, scene).skipped, true);
});

test('a batched admission can touch in groups: same order, one yield per group', async () => {
  const order = [];
  const subjects = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    id, material: { uuid: `m${id}` }, geometry: { uuid: `g${id}` },
  }));
  const result = await admitOpeningUnitsAcrossSlices({
    subjects,
    beginReadinessBatch: () => ({
      async drain() { order.push('drain'); return { contextLost: false }; },
      close() {},
    }),
    compileOne: (subject) => Promise.resolve(`compiled:${subject.id}`),
    touchOne: () => { throw new Error('touchOne must not run when touchMany is grouping'); },
    touchMany: (group) => { order.push(`touch:${group.map((s) => s.id).join('')}`); return group.length; },
    touchBatchSize: 2,
    yieldToMain: async () => { order.push('yield'); },
  });
  const touches = order.slice(order.indexOf('drain') + 1);
  assert.deepEqual(touches, ['touch:ab', 'yield', 'touch:cd', 'yield', 'touch:e']);
  assert.equal(result.touched, 5, 'every subject still gets a result row');
  assert.deepEqual(result.results.map((entry) => entry.compiled),
    ['compiled:a', 'compiled:b', 'compiled:c', 'compiled:d', 'compiled:e']);
  assert.ok(result.timing && Number.isFinite(result.timing.touchMs), 'the step reports where its time went');
});

test('a cohort rehydrates a cpu-detached texture its touch would force-upload, before the draw', async () => {
  // D150: packageCpuDetach empties a resident texture's mipmaps after the residency stamp; a
  // later bind whose properties record lacks the upload stamp (a dedupe-shared Source bound
  // under a different upload-cache key, or a record recreated after dispose) re-enters three's
  // uploadTexture and reads mipmaps[0] on the empty array. The admission driver re-attaches
  // just those payloads once per cohort — every touch must bind real bytes.
  resetPackageDetachManifestsForTests();
  const freshTexture = () => {
    const texture = new THREE.CompressedTexture(
      [{ data: new Uint8Array(2048), width: 4, height: 4 }],
      4, 4, THREE.RGBAFormat,
    );
    texture.name = 'forge_panel_albedo';
    texture.needsUpdate = true; // a decoded texture reaches the uploader with version > 0
    return texture;
  };
  const texture = freshTexture();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: texture }));

  let decodes = 0;
  createPackageDetachManifest(
    {
      assetId: 'fixture.admission-detach',
      contentHash: 'a'.repeat(64),
      renderUrl: 'https://fixtures.test/render.glb',
      resources: [texture],
    },
    {
      redecode: async () => {
        decodes += 1;
        const root = new THREE.Group();
        root.add(new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial({ map: freshTexture() }),
        ));
        return { scene: root };
      },
      collectResources: (root) => {
        const found = [];
        root.traverse((object) => {
          for (const material of [object.material].flat().filter(Boolean)) {
            for (const value of Object.values(material)) {
              if (value && value.isTexture) found.push(value);
            }
          }
        });
        return found;
      },
    },
  );
  assert.equal(detachPackageTexture(texture), true, 'payload released after the proven upload');
  assert.equal(texture.mipmaps.length, 0);

  // The renderer's texture-properties map: no record for this texture, so its next bind
  // re-enters the uploader (three's setTexture2D gate).
  const renderer = { properties: new Map() };
  const touchSeesBytes = () => {
    assert.ok(texture.mipmaps.length > 0,
      'the touch must bind real bytes — the detach mirror was re-attached first');
    return { skipped: false };
  };

  // Unbatched route: census runs before the compile+touch interleave.
  const unbatched = await admitOpeningUnitsAcrossSlices({
    subjects: [mesh],
    renderer,
    compileOne: () => Promise.resolve(null),
    touchOne: touchSeesBytes,
    yieldToMain: async () => {},
  });
  assert.equal(unbatched.results.length, 1);
  assert.equal(decodes, 1, 'one re-decode refilled the manifest');
  assert.equal(isPackageTextureDetached(texture), false, 'rehydrate cleared the detached entry');

  // Batched route: the census runs after the readiness drain, still before the touch loop.
  assert.equal(detachPackageTexture(texture), true, 're-detached for the batched pass');
  const batched = await admitOpeningUnitsAcrossSlices({
    subjects: [mesh],
    renderer,
    beginReadinessBatch: () => ({
      async drain() { return { contextLost: false }; },
      close() {},
    }),
    compileOne: () => Promise.resolve('compiled'),
    touchOne: touchSeesBytes,
    yieldToMain: async () => {},
  });
  assert.equal(batched.touched, 1);
  assert.equal(decodes, 2, 'the batched path rehydrates before touching too');

  // A still-stamped detached texture binds its live GPU copy — no re-decode, no refill.
  assert.equal(detachPackageTexture(texture), true);
  renderer.properties.set(texture, { __version: texture.version });
  const stamped = await admitOpeningUnitsAcrossSlices({
    subjects: [mesh],
    renderer,
    compileOne: () => Promise.resolve(null),
    touchOne: () => ({ skipped: false }),
    yieldToMain: async () => {},
  });
  assert.equal(stamped.results.length, 1);
  assert.equal(decodes, 2, 'no rehydrate when the upload stamp still holds');
  assert.equal(isPackageTextureDetached(texture), true, 'stayed released');
  resetPackageDetachManifestsForTests();
});

test('opening compile primes shadows, bakes env cardinality, and slices exact-target touches', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const compileStart = renderer.indexOf('const compileOpeningSubmissionPlan = async');
  const compileEnd = renderer.indexOf('state.render.captureOpeningSubmissionPlan', compileStart);
  const postStart = renderer.indexOf('state.render.preparePostOpeningPipelines');
  const postEnd = renderer.indexOf('state.render.prepareOpeningGpuResources', postStart);
  assert.ok(compileStart >= 0 && compileEnd > compileStart);
  assert.ok(postStart >= 0 && postEnd > postStart);
  const compile = renderer.slice(compileStart, compileEnd);
  const post = renderer.slice(postStart, postEnd);
  assert.match(renderer, /this\._bakeEnv\(\);\s*this\._openingEnvFrozen = true/);
  assert.match(compile, /syncVisiblePointLightBudget/);
  assert.match(compile, /SF_OpeningShadowMapPrime/);
  assert.match(compile, /admitOpeningUnitsAcrossSlices/);
  assert.match(compile, /touchExactTargetSubject/);
  assert.doesNotMatch(post, /now - started >= 0/);
  assert.match(post, /lateCompileRoots\.length > 0/);
  assert.doesNotMatch(post, /pendingCount === 0 && lateEntities\.length > 0/);
});
