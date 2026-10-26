import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installShaderLinkReporter } from '../src/render/shaderLinkReporter.js';
import { createVeilSettle } from '../src/render/veilSettle.js';

const LINK_STATUS = 0x8b82;

function fakeGl({ linked = true, lost = false } = {}) {
  const calls = [];
  return {
    LINK_STATUS,
    calls,
    lost,
    isContextLost() { return this.lost; },
    getProgramParameter(program, pname) {
      calls.push(['getProgramParameter', pname]);
      return pname === LINK_STATUS ? linked : null;
    },
    getProgramInfoLog() {
      calls.push(['getProgramInfoLog']);
      return 'link failed ';
    },
    getShaderInfoLog(shader) {
      calls.push(['getShaderInfoLog', shader]);
      return `${shader} log`;
    },
  };
}

function fakeCanvas() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type) {
      const listener = listeners.get(type);
      if (listener) listener({ type });
    },
  };
}

// Shaped like three's WebGLProgram: own accessors that run one first-use step between them.
function fakeProgram() {
  let firstUses = 0;
  let cached;
  const firstUse = () => {
    if (cached === undefined) {
      firstUses += 1;
      cached = { discovered: true };
    }
    return cached;
  };
  return {
    name: 'TestMaterial',
    type: 'ShaderMaterial',
    program: { id: 'gl-program' },
    vertexShader: 'vertex',
    fragmentShader: 'fragment',
    get firstUses() { return firstUses; },
    getUniforms() { return firstUse(); },
    getAttributes() { return firstUse(); },
  };
}

function fakeRenderer(gl) {
  return {
    debug: { checkShaderErrors: true },
    info: { programs: [] },
    domElement: fakeCanvas(),
    getContext: () => gl,
  };
}

test('three log reads are off and a linked program costs one link-status read, once', () => {
  const gl = fakeGl();
  const renderer = fakeRenderer(gl);
  assert.equal(installShaderLinkReporter(renderer), true);
  assert.equal(renderer.debug.checkShaderErrors, false);

  const program = fakeProgram();
  renderer.info.programs.push(program);
  assert.equal(renderer.info.programs.length, 1);
  program.getUniforms();
  program.getUniforms();
  program.getAttributes();

  assert.deepEqual(gl.calls, [['getProgramParameter', LINK_STATUS]]);
  assert.equal(program.firstUses, 1);
});

test('a program that failed to link is reported with its logs and marked not runnable', () => {
  const gl = fakeGl({ linked: false });
  const renderer = fakeRenderer(gl);
  const reports = [];
  const originalError = console.error;
  console.error = (message) => reports.push(String(message));
  try {
    installShaderLinkReporter(renderer);
    const program = fakeProgram();
    renderer.info.programs.push(program);
    program.getAttributes();
    program.getUniforms();

    assert.equal(reports.length, 1);
    assert.match(reports[0], /^THREE\.WebGLProgram: Shader Error/);
    assert.match(reports[0], /Material Name: TestMaterial/);
    assert.match(reports[0], /Program Info Log: link failed\n/);
    assert.match(reports[0], /Vertex Shader Log: vertex log/);
    assert.match(reports[0], /Fragment Shader Log: fragment log/);
    assert.equal(program.diagnostics.runnable, false);
    assert.equal(program.firstUses, 1);
  } finally {
    console.error = originalError;
  }
});

test('the rebuilt program list is guarded after a context restore', () => {
  const gl = fakeGl();
  const renderer = fakeRenderer(gl);
  installShaderLinkReporter(renderer);
  renderer.info.programs = [];
  renderer.domElement.dispatch('webglcontextrestored');

  const program = fakeProgram();
  renderer.info.programs.push(program);
  program.getUniforms();
  assert.deepEqual(gl.calls, [['getProgramParameter', LINK_STATUS]]);
});

test('a lost context or a released program is never queried', () => {
  const gl = fakeGl({ linked: false });
  const renderer = fakeRenderer(gl);
  const reports = [];
  installShaderLinkReporter(renderer, { report: (program) => reports.push(program) });

  gl.lost = true;
  const onLostContext = fakeProgram();
  renderer.info.programs.push(onLostContext);
  onLostContext.getUniforms();

  gl.lost = false;
  const released = fakeProgram();
  released.program = undefined;
  renderer.info.programs.push(released);
  released.getAttributes();

  assert.deepEqual(gl.calls, []);
  assert.deepEqual(reports, []);
  assert.equal(onLostContext.firstUses, 1);
  assert.equal(released.firstUses, 1);
});

test('installing twice guards each program once', () => {
  const gl = fakeGl();
  const renderer = fakeRenderer(gl);
  installShaderLinkReporter(renderer);
  installShaderLinkReporter(renderer);
  const program = fakeProgram();
  renderer.info.programs.push(program);
  program.getUniforms();
  assert.deepEqual(gl.calls, [['getProgramParameter', LINK_STATUS]]);
});

test('a still-linking program is queried once on the draw path, then polled off it', async () => {
  const COMPLETION_STATUS_KHR = 0x82cf;
  const calls = [];
  let complete = false;
  const gl = {
    LINK_STATUS,
    calls,
    lost: false,
    isContextLost() { return this.lost; },
    getExtension(name) {
      return name === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR } : null;
    },
    getProgramParameter(program, pname) {
      calls.push(['getProgramParameter', pname]);
      return pname === COMPLETION_STATUS_KHR ? complete : true;
    },
    getProgramInfoLog() { return ''; },
    getShaderInfoLog() { return ''; },
  };
  const renderer = fakeRenderer(gl);
  installShaderLinkReporter(renderer);
  const program = fakeProgram();
  renderer.info.programs.push(program);
  const completionQueries = () => calls.filter((c) => c[1] === COMPLETION_STATUS_KHR).length;

  // The first bind arms the settle poll; every further bind while the link is in flight
  // answers unsettled without touching the GPU process.
  program.getUniforms();
  program.getUniforms();
  program.getAttributes();
  assert.equal(completionQueries(), 1);
  assert.equal(program.firstUses, 1);
  assert.equal(program.getUniforms.name, 'getUniformsAfterLinkCheck');

  // The shared poll re-asks off the draw path; once the driver finishes, the next bind
  // restores three's accessors and runs the one LINK_STATUS read, exactly as before.
  complete = true;
  await new Promise((resolve) => setTimeout(resolve, 50));
  program.getUniforms();
  program.getUniforms();
  assert.ok(completionQueries() >= 2);
  assert.deepEqual(calls.filter((c) => c[1] === LINK_STATUS), [['getProgramParameter', LINK_STATUS]]);
  assert.equal(program.getUniforms.name, 'getUniforms');
});

test('unused admission never forces a linking program and services ready siblings within the budget', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const COMPLETION_STATUS_KHR = 0x82cf;
  const gl = fakeGl();
  const complete = new Map();
  const queries = [];
  gl.getExtension = () => ({ COMPLETION_STATUS_KHR });
  gl.getProgramParameter = (handle, pname) => {
    queries.push([handle, pname]);
    return pname === COMPLETION_STATUS_KHR ? complete.get(handle) === true : true;
  };
  const renderer = fakeRenderer(gl);
  installShaderLinkReporter(renderer);
  const linking = fakeProgram();
  const ready = fakeProgram();
  complete.set(ready.program, true);
  renderer.info.programs.push(linking, ready);
  const pool = renderer.userData.spacefaceUnusedPrograms;

  assert.equal(pool.drain(1), 2, 'an incomplete link stays pending');
  assert.equal(linking.firstUses, 0, 'uniform introspection would block on this link');
  assert.equal(ready.firstUses, 0, 'one drain probes at most one program');
  assert.deepEqual(queries, [[linking.program, COMPLETION_STATUS_KHR]]);

  assert.equal(pool.drain(1), 1, 'a ready sibling must not starve behind the linking program');
  assert.equal(ready.firstUses, 1);
  assert.equal(linking.firstUses, 0);
  complete.set(linking.program, true);
  t.mock.timers.tick(16);
  assert.equal(pool.drain(1), 0);
  assert.equal(linking.firstUses, 1, 'the same program is introspected once it is ready');
  assert.equal(queries.filter(([handle, pname]) => handle === linking.program && pname === LINK_STATUS).length, 1);
});

test('unused admission follows the rebuilt program list after context restoration', () => {
  const renderer = fakeRenderer(fakeGl());
  installShaderLinkReporter(renderer);
  const old = fakeProgram();
  renderer.info.programs.push(old);
  const pool = renderer.userData.spacefaceUnusedPrograms;
  renderer.domElement.dispatch('webglcontextlost');
  renderer.info.programs = [];
  renderer.domElement.dispatch('webglcontextrestored');
  const rebuilt = fakeProgram();
  renderer.info.programs.push(rebuilt);
  assert.equal(pool.size, 1, 'the restored context owns its new program list');
  assert.equal(pool.drain(1), 0);
  assert.equal(rebuilt.firstUses, 1, 'restored programs receive first-use admission');
  assert.equal(old.firstUses, 0, 'dead-generation programs are never queried');
});

test('veil admission remains pending until a KHR program is ready, then performs its first use', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const COMPLETION_STATUS_KHR = 0x82cf;
  let complete = false;
  const gl = fakeGl();
  gl.getExtension = () => ({ COMPLETION_STATUS_KHR });
  gl.getProgramParameter = (handle, pname) => pname === COMPLETION_STATUS_KHR ? complete : true;
  const renderer = fakeRenderer(gl);
  installShaderLinkReporter(renderer);
  const program = fakeProgram();
  renderer.info.programs.push(program);
  let now = 0;
  const idle = [];
  const render = { flightVeilHoldsSim: true, firstPlayableFrameAt: 1 };
  const pending = createVeilSettle(render, {
    now: () => now,
    host: { requestIdleCallback: (cb) => idle.push(cb) },
    unusedPrograms: () => renderer.userData.spacefaceUnusedPrograms,
  });
  assert.equal(pending(), 1);
  assert.equal(program.firstUses, 0);
  for (let i = 0; i < 3; i += 1) idle.shift()({ didTimeout: false, timeRemaining: () => 40 });
  now = 1300;
  assert.equal(pending(), 1, 'idle settle does not admit an unfinished link');
  assert.equal(program.firstUses, 0, 'the loading presenter stays responsive while the link is pending');
  complete = true;
  t.mock.timers.tick(16);
  now += 10;
  assert.equal(pending(), 0);
  assert.equal(program.firstUses, 1);
  assert.equal(render.veilDrain.drained, 1);
});

test('the vendored three still has the program internals the reporter relies on', () => {
  const three = readFileSync(new URL('../vendor/three.module.js', import.meta.url), 'utf8');
  assert.match(three, /if \( renderer\.debug\.checkShaderErrors \) \{\s*const programInfoLog = gl\.getProgramInfoLog\( program \)/);
  assert.match(three, /this\.getUniforms = function \(\) \{\s*if \( cachedUniforms === undefined \) \{[^}]*onFirstUse\( this \);/);
  assert.match(three, /this\.getAttributes = function \(\) \{\s*if \( cachedAttributes === undefined \) \{[^}]*onFirstUse\( this \);/);
  assert.match(three, /this\.vertexShader = glVertexShader;\s*this\.fragmentShader = glFragmentShader;/);
  assert.match(three, /programs\.push\( program \);/);
  assert.match(three, /info\.programs = programCache\.programs;/);
});

test('unused programs are tracked and drained one at a time; released and used ones drop out (oc1v7)', () => {
  const gl = fakeGl();
  const renderer = fakeRenderer(gl);
  installShaderLinkReporter(renderer);
  const a = fakeProgram(); const b = fakeProgram(); const c = fakeProgram();
  renderer.info.programs.push(a, b, c);
  const pool = renderer.userData.spacefaceUnusedPrograms;
  assert.equal(pool.size, 3);
  b.getUniforms();
  assert.equal(pool.size, 2, 'a drawn program is no longer unused');
  renderer.info.programs.splice(renderer.info.programs.indexOf(c), 1);
  assert.equal(pool.size, 1, 'a released program is dropped');
  assert.equal(pool.drain(1), 0);
  assert.equal(a.firstUses, 1, 'drain ran the first use');
  assert.equal(pool.drain(1), 0);
  assert.equal(a.firstUses, 1);
});
