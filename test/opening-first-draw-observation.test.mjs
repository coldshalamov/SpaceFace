import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  beginOpeningFirstDrawObservation,
  captureOpeningAdmissionIdentity,
  captureOpeningAdmissionIdentitySteps,
} from '../src/render/openingGpuAdmission.js';
import {
  OPENING_SUBMISSION_PLAN_SCHEMA,
  captureOpeningResourceIdentitySets,
  createOpeningSubmissionReceipt,
  validateOpeningSubmissionReceipt,
} from '../src/render/openingSubmissionPlan.js';
import { render } from '../src/render/renderer.js';

function fixture() {
  const scene = new THREE.Scene();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  leaf.name = 'opening-hull';
  scene.add(leaf);
  const bindings = new WeakMap([[leaf.material, {
    programs: new Map([['opening', {}]]), currentProgram: { cacheKey: 'opening' },
  }]]);
  const renderer = {
    info: { programs: [{ cacheKey: 'opening' }, { cacheKey: 'retiring-cache' }],
      memory: { geometries: 4, textures: 5 }, render: { calls: 0 } },
    properties: { get: (material) => bindings.get(material) || {} },
    renderBufferDirect(_camera, _scene, _geometry, _material, object) {
      if (object.userData.guardSkipped) return undefined;
      object.userData.duringDraw?.();
      this.info.render.calls++;
      return undefined;
    },
  };
  const plan = {
    schema: OPENING_SUBMISSION_PLAN_SCHEMA, complete: true, scene,
    route: {}, compileSubjects: [leaf], textureRefs: [],
    firstPlayablePipelineSet: { complete: true },
    resourceIdentitySets: captureOpeningResourceIdentitySets([leaf]),
  };
  const receipt = createOpeningSubmissionReceipt(renderer, plan);
  const census = captureOpeningAdmissionIdentity(renderer, scene, plan);
  const preSubmitValidation = validateOpeningSubmissionReceipt(receipt, renderer);
  assert.equal(preSubmitValidation.ok, true);
  const begin = () => beginOpeningFirstDrawObservation(renderer, { plan, receipt, preSubmitValidation });
  const draw = (object = leaf) => renderer.renderBufferDirect(null, scene, object.geometry, object.material, object, null);
  const owner = Object.assign(Object.create(render), {
    renderer, scene, _openingFirstDrawDiagnosticsDeferred: true,
    state: { mode: 'flight', render: { openingSubmissionPlan: plan,
      openingSubmissionReceipt: receipt, openingFirstDrawIdentityCensus: census } },
  });
  return { renderer, scene, leaf, bindings, plan, receipt, census, begin, draw, owner };
}

function finishDiagnostics(f, observation, betweenSlices = () => {}) {
  const iterator = f.owner._finishOpeningFirstDrawDiagnosticsSteps(
    observation.before.currentCounts, f.census, f.plan, observation,
  );
  let step = iterator.next();
  betweenSlices();
  while (!step.done) step = iterator.next();
  return f.owner.state.render.openingSubmissionValidation;
}

test('later contact VFX, cache retirement and geometry mutation cannot rewrite first-submit evidence', () => {
  const f = fixture();
  const original = f.renderer.renderBufferDirect;
  const observer = f.begin();
  f.draw();
  const observation = observer.finish();
  assert.strictEqual(f.renderer.renderBufferDirect, original);
  const validation = finishDiagnostics(f, observation, () => {
    const later = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    later.name = 'SF_CombatContactMatter';
    f.scene.add(later);
    f.leaf.geometry = new THREE.SphereGeometry();
    f.renderer.info.programs.pop();
    f.renderer.info.memory.geometries--;
    f.renderer.info.memory.textures = 0;
  });
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.firstVisibleGpuCounts, undefined);
  assert.deepEqual(f.owner.state.render.openingFirstVisibleGpuCounts.delta, { programs: 0, geometries: 0 });
  assert.deepEqual(f.owner.state.render.openingFirstVisibleGpuCounts.lateAdmissions.lateAdmissions, []);
  assert.strictEqual(observer.finish(), observation, 'finalization cannot sample a later frame again');
});

test('resource retirement inside first submit is not classified as an admission', () => {
  const f = fixture();
  const observer = f.begin();
  f.leaf.userData.duringDraw = () => {
    f.renderer.info.programs.pop();
    f.renderer.info.memory.geometries--;
    f.renderer.info.memory.textures = 0;
  };
  f.draw();
  const observation = observer.finish();
  assert.equal(finishDiagnostics(f, observation).ok, true);
  assert.equal(f.owner.state.render.openingFirstVisibleGpuCounts.geometryOnlyBrick, false);
  assert.deepEqual(f.owner.state.render.openingFirstVisibleGpuCounts.delta, { programs: -1, geometries: -1 });
});

for (const sameObject of [false, true]) {
  test(`${sameObject ? 'same-object replacement' : 'unknown geometry'} submitted during first draw fails with zero net allocation growth`, () => {
    const f = fixture();
    const observer = f.begin();
    const subject = sameObject ? f.leaf
      : new THREE.Mesh(new THREE.BoxGeometry(), f.leaf.material);
    if (sameObject) subject.geometry = new THREE.SphereGeometry();
    else f.scene.add(subject);
    const unknownId = `uuid:${subject.geometry.uuid}`;
    f.draw(subject);
    const observation = observer.finish();
    const validation = finishDiagnostics(f, observation);
    assert.equal(validation.ok, false);
    assert.ok(validation.uncapturedGeometryBufferIds.includes(unknownId));
    assert.equal(f.owner.state.render.openingFirstVisibleGpuCounts.delta.geometries, 0);
    assert.ok(f.owner.state.render.openingFirstVisibleGpuCounts.lateAdmissions.lateAdmissions
      .some((row) => row.geometryAdmitted));
  });
}

test('a new program linked inside the observed draw remains an actual first-draw failure', () => {
  const f = fixture();
  const observer = f.begin();
  f.leaf.userData.duringDraw = () => {
    f.renderer.info.programs.push({ cacheKey: 'unprepared-first-draw' });
    f.bindings.get(f.leaf.material).programs.set('unprepared-first-draw', {});
  };
  f.draw();
  const observation = observer.finish();
  const validation = finishDiagnostics(f, observation);
  assert.equal(validation.ok, false);
  assert.deepEqual(validation.uncapturedProgramKeys, ['unprepared-first-draw']);
});

test('guard-skipped attempts are excluded and the prior wrapper is restored after an exception', () => {
  const f = fixture();
  const original = f.renderer.renderBufferDirect;
  const observer = f.begin();
  const skipped = new THREE.Mesh(new THREE.BoxGeometry(), f.leaf.material);
  skipped.userData.guardSkipped = true;
  f.scene.add(skipped);
  f.draw(skipped);
  const observation = observer.finish();
  assert.equal(observation.draws.length, 0, 'undefined return alone must never count as a submitted draw');
  assert.equal(validateOpeningSubmissionReceipt(f.receipt, f.renderer, f.census, observation).ok, true);
  assert.strictEqual(f.renderer.renderBufferDirect, original);

  const throwing = function () { throw new Error('existing draw wrapper failed'); };
  f.renderer.renderBufferDirect = throwing;
  const failed = f.begin();
  assert.throws(() => f.draw(), /existing draw wrapper failed/);
  assert.strictEqual(f.renderer.renderBufferDirect, throwing);
  failed.cancel();
});

test('a recook between deferred slices still prevents the old plan from publishing a verdict', () => {
  const f = fixture();
  const observer = f.begin(); f.draw();
  const observation = observer.finish();
  const validation = finishDiagnostics(f, observation, () => {
    f.owner.state.render.openingSubmissionPlan = { ...f.plan };
  });
  assert.equal(validation, undefined);
  assert.equal(f.owner.state.render.openingFirstVisibleGpuCounts, undefined);
  assert.equal(f.owner._openingFirstDrawDiagnosticsDeferred, false);
});

test('both existing census drivers freeze resource IDs when they visit an object', () => {
  for (const stepped of [false, true]) {
    const f = fixture();
    let census;
    if (stepped) {
      const iterator = captureOpeningAdmissionIdentitySteps(f.renderer, f.scene, f.plan);
      let step = iterator.next();
      while (!step.done) step = iterator.next();
      census = step.value;
    } else census = captureOpeningAdmissionIdentity(f.renderer, f.scene, f.plan);
    const original = `uuid:${f.leaf.geometry.uuid}`;
    f.leaf.geometry = new THREE.SphereGeometry();
    assert.deepEqual(census.resourceIdentitySets.geometryBufferIds, [original]);
    const validation = validateOpeningSubmissionReceipt(f.receipt, f.renderer, census);
    assert.equal(validation.ok, false, 'a retained Object3D cannot absorb its later unknown geometry into allowed IDs');
  }
});
