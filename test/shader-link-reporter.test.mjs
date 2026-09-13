import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installShaderLinkReporter } from '../src/render/shaderLinkReporter.js';

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

test('the vendored three still has the program internals the reporter relies on', () => {
  const three = readFileSync(new URL('../vendor/three.module.js', import.meta.url), 'utf8');
  assert.match(three, /if \( renderer\.debug\.checkShaderErrors \) \{\s*const programInfoLog = gl\.getProgramInfoLog\( program \)/);
  assert.match(three, /this\.getUniforms = function \(\) \{\s*if \( cachedUniforms === undefined \) \{[^}]*onFirstUse\( this \);/);
  assert.match(three, /this\.getAttributes = function \(\) \{\s*if \( cachedAttributes === undefined \) \{[^}]*onFirstUse\( this \);/);
  assert.match(three, /this\.vertexShader = glVertexShader;\s*this\.fragmentShader = glFragmentShader;/);
  assert.match(three, /programs\.push\( program \);/);
  assert.match(three, /info\.programs = programCache\.programs;/);
});
