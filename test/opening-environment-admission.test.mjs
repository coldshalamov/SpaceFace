import assert from 'node:assert/strict';
import test from 'node:test';

import { render } from '../src/render/renderer.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function makeOwner({ firstPresent, compile, touch }) {
  const env = { uuid: 'pmrem-new' };
  const quarks = {
    name: 'SF_QuarksBatchedRenderer',
    visible: true,
    traverse(fn) { fn(this); },
  };
  const scene = {
    environment: env,
    traverse(fn) { fn(this); fn(quarks); },
  };
  const lifecycle = {
    active: true,
    isActive() { return this.active; },
    async wait() { return true; },
  };
  const owner = {
    renderer: {},
    scene,
    cam: { obj: {} },
    state: { mode: 'flight', ui: {}, render: {} },
    bloom: { touchScenePipelines: touch },
    _envMap: env,
    _rendererLifecycle: lifecycle,
    _firstPresentGpuAdmission: firstPresent,
    _environmentAdmissionKey: render._environmentAdmissionKey,
    _queueEnvironmentVariantAdmission: render._queueEnvironmentVariantAdmission,
    _selectPostRoute() { return 'bloom'; },
    _compilePostRoute(route, subject, camera, targetScene) {
      return compile({ route, subject, camera, targetScene });
    },
  };
  return { owner, env, quarks, scene, lifecycle };
}

test('PMREM-key admission holds world submission until exact live effect touch settles', async () => {
  const firstPresent = Promise.resolve();
  const compileGate = deferred();
  const touchGate = deferred();
  const seen = [];
  const { owner, env, quarks, scene } = makeOwner({
    firstPresent,
    compile: (call) => { seen.push({ phase: 'compile', ...call, env: scene.environment }); return compileGate.promise; },
    touch: (subject, camera, targetScene) => {
      seen.push({ phase: 'touch', subject, camera, targetScene, env: scene.environment });
      return touchGate.promise;
    },
  });

  // The earlier first-present pass already resolved without this committed key. A new
  // environment-specific admission must still gate the actual draw decision.
  owner._environmentVariantAdmission = Promise.resolve('old env-less admission');
  const admission = render._queueEnvironmentVariantAdmission.call(owner, env);
  assert.equal(render.drawPreparedFrame.call(owner), false, 'world draw is held during variant admission');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].phase, 'compile');
  assert.equal(seen[0].env, env);
  assert.equal(seen[0].subject, quarks);

  compileGate.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(seen[1].phase, 'touch');
  assert.equal(render.drawPreparedFrame.call(owner), false, 'draw remains held through exact target touch');
  touchGate.resolve();
  await admission;
  assert.equal(owner._environmentVariantAdmissionPending, false);
  assert.equal(owner._environmentVariantAdmissionEnv, env);
  assert.throws(
    () => render.drawPreparedFrame.call(owner),
    /arm/,
    'after admission settles the real draw path is released',
  );
  const replacement = { uuid: 'same-program-key', mapping: env.mapping, image: env.image };
  owner._envMap = replacement;
  scene.environment = replacement;
  assert.equal(render._queueEnvironmentVariantAdmission.call(owner, replacement), null,
    'a texture replacement with the already-admitted shader key needs no extra gate');
});

test('superseded or disposed environment admission cannot publish readiness', async () => {
  const firstPresent = deferred();
  const compileGate = deferred();
  const newTouch = deferred();
  const oldEnv = { uuid: 'old', mapping: 1, image: { height: 64 } };
  const newEnv = { uuid: 'new', mapping: 306, image: { height: 2048 } };
  const calls = [];
  const { owner, scene, lifecycle } = makeOwner({
    firstPresent: firstPresent.promise,
    compile: ({ targetScene }) => {
      calls.push(targetScene.environment);
      return compileGate.promise;
    },
    touch: (_subject, _camera, targetScene) => targetScene.environment === newEnv
      ? newTouch.promise
      : assert.fail('superseded environment must not touch'),
  });
  owner._envMap = oldEnv;
  scene.environment = oldEnv;
  const oldAdmission = render._queueEnvironmentVariantAdmission.call(owner, oldEnv);
  owner._envMap = newEnv;
  scene.environment = newEnv;
  const newAdmission = render._queueEnvironmentVariantAdmission.call(owner, newEnv);
  firstPresent.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [newEnv], 'the superseded env-less key is not admitted or reused');
  compileGate.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await oldAdmission;
  assert.equal(owner._environmentVariantAdmissionPending, true,
    'the stale environment pass cannot release the current draw gate');
  newTouch.resolve();
  await newAdmission;
  assert.equal(owner._environmentVariantAdmissionPending, false);
  assert.equal(owner._environmentVariantAdmissionEnv, newEnv);

  const disposed = makeOwner({ firstPresent: Promise.resolve(), compile: () => assert.fail('inactive owner must not compile'), touch: () => assert.fail('inactive owner must not touch') });
  disposed.lifecycle.active = false;
  const cancelled = render._queueEnvironmentVariantAdmission.call(disposed.owner, disposed.env);
  await cancelled;
  assert.notEqual(disposed.owner._environmentVariantAdmissionPending, true);
});

test('failed admission releases its gate without publishing readiness; a new context key can retry', async () => {
  const env = { uuid: 'env-a', mapping: 306, image: { height: 2048 } };
  let compileCalls = 0;
  let touches = 0;
  const ownerBits = makeOwner({
    firstPresent: Promise.resolve(),
    compile: () => {
      compileCalls += 1;
      return compileCalls === 1 ? Promise.reject(new Error('transient compile failure')) : Promise.resolve();
    },
    touch: () => { touches += 1; return Promise.resolve(); },
  });
  ownerBits.owner._envMap = env;
  ownerBits.scene.environment = env;
  const first = render._queueEnvironmentVariantAdmission.call(ownerBits.owner, env);
  assert.equal(await first, false);
  assert.equal(ownerBits.owner._environmentVariantAdmissionEnvKey ?? null, null,
    'failed compile does not publish the shader key as ready');
  assert.equal(ownerBits.owner._environmentVariantAdmissionPending, false,
    'a settled optional-environment failure releases the draw gate');
  assert.throws(() => render.drawPreparedFrame.call(ownerBits.owner), /arm/,
    'the failure path releases the actual draw decision');

  ownerBits.owner.state.contextRestoreSeq = 1;
  const restored = render._queueEnvironmentVariantAdmission.call(ownerBits.owner, env);
  await restored;
  assert.equal(compileCalls, 2);
  assert.equal(touches, 1);
  assert.match(ownerBits.owner._environmentVariantAdmissionEnvKey, /^1:/);
  assert.equal(ownerBits.owner._environmentVariantAdmissionPending, false);
});
