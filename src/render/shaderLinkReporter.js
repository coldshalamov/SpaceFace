// Shader link failures, reported without three's per-program log reads.
//
// With renderer.debug.checkShaderErrors on (three's default), the first use of every program reads
// getProgramInfoLog and both shaders' getShaderInfoLog. Each read is a synchronous round trip to the
// GPU process. On the owner's Intel/ANGLE laptop those reads were ~1.3 s of main thread between Launch
// and the first seconds of flight (2026-09-13 launch profile), and they run again for every program
// first drawn in flight. The ship preview context already turns the check off (shipPreviewMount.js).
//
// The failure report is worth keeping, so this keeps it: just before a program's first use it reads
// LINK_STATUS, which Chromium answers from the same program info that first use fetches anyway, and
// only a program that failed to link pays for the logs. renderer.js skips this under ?shaderChecks=1
// so shader work still gets three's full report with the failing source lines.

const guardedPrograms = new WeakSet();

export function installShaderLinkReporter(renderer, options = {}) {
  const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
  if (!gl || !renderer.debug || !renderer.info) return false;
  const report = typeof options.report === 'function' ? options.report : reportLinkFailure;
  renderer.debug.checkShaderErrors = false;
  // KHR_parallel_shader_compile lets a program reach first use while its driver link is still in
  // flight. Querying LINK_STATUS there blocks the main thread until that link finishes — measured
  // ~8 s of serialized waits across the opening programs on Intel/ANGLE (PQ-033.02 boot profile).
  // COMPLETION_STATUS_KHR answers "has the link finished" without the wait: while it reports false
  // we keep the guard installed and let three's own first-use introspection do the blocking the
  // draw needs anyway. Once it reports true the link has settled — LINK_STATUS is then a cached
  // read, so the failure report still runs exactly once per program without paying the link's
  // wall time inside a redundant query.
  const context = {
    gl,
    report,
    parallelCompile: typeof gl.getExtension === 'function'
      ? gl.getExtension('KHR_parallel_shader_compile')
      : null,
    generation: 0,
    programGenerations: new WeakMap(),
  };
  guardProgramList(renderer, context);
  const canvas = renderer.domElement;
  if (canvas && typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('webglcontextlost', () => { context.generation += 1; }, false);
    // three rebuilds its program list when the context is restored; its own listener runs first.
    canvas.addEventListener('webglcontextrestored', () => guardProgramList(renderer, context), false);
  }
  return true;
}

// renderer.info.programs is three's program cache list (WebGLPrograms pushes every new program).
function guardProgramList(renderer, context) {
  const programs = renderer.info && renderer.info.programs;
  if (!Array.isArray(programs) || Object.prototype.hasOwnProperty.call(programs, 'push')) return;
  for (const program of programs) guardFirstUse(program, context);
  const push = Array.prototype.push;
  Object.defineProperty(programs, 'push', {
    configurable: true,
    enumerable: false,
    writable: true,
    value(...items) {
      for (const item of items) guardFirstUse(item, context);
      return push.apply(this, items);
    },
  });
}

// three's WebGLProgram runs its first-use step (uniform and attribute discovery) from whichever of
// getUniforms / getAttributes is called first. Once the driver link has settled we check the result
// exactly once, then hand three its own accessors back so later draws pay nothing.
function guardFirstUse(program, context) {
  if (!program || guardedPrograms.has(program)) return;
  if (typeof program.getUniforms !== 'function' || typeof program.getAttributes !== 'function') return;
  guardedPrograms.add(program);
  context.programGenerations.set(program, context.generation);
  const getUniforms = program.getUniforms;
  const getAttributes = program.getAttributes;
  const beforeFirstUse = (self) => {
    if (!programSettled(self, context.gl, context.parallelCompile)) return;
    self.getUniforms = getUniforms;
    self.getAttributes = getAttributes;
    checkLinkStatus(self, context);
  };
  program.getUniforms = function getUniformsAfterLinkCheck() {
    beforeFirstUse(this);
    return getUniforms.call(this);
  };
  program.getAttributes = function getAttributesAfterLinkCheck() {
    beforeFirstUse(this);
    return getAttributes.call(this);
  };
}

// COMPLETION_STATUS_KHR is the non-blocking readiness read: false while the link is in flight,
// true once it has finished whether it succeeded or not. Without the extension the link is already
// synchronous, so the program is always treated as settled and the check behaves exactly as before.
function programSettled(program, gl, parallelCompile) {
  if (!parallelCompile || !program.program) return true;
  try {
    return gl.getProgramParameter(program.program, parallelCompile.COMPLETION_STATUS_KHR) !== false;
  } catch (_) {
    return true;
  }
}

function checkLinkStatus(program, context) {
  const { gl, report } = context;
  if (!program.program) return;
  let linked = true;
  try {
    if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return;
    // A handle orphaned by context loss (the new context recreates it lazily on the
    // next acquire) reads as GL_INVALID_VALUE on ANGLE when queried. isProgram()
    // answers false for that dead handle without raising — same check bloom.js's
    // readiness wait uses for handles released under it. The call is a synchronous
    // round trip to the GPU process, so it only runs for a wrapper that could carry
    // a stale handle — one guarded before the last context loss.
    if (context.programGenerations.get(program) !== context.generation
        && typeof gl.isProgram === 'function' && gl.isProgram(program.program) === false) return;
    linked = gl.getProgramParameter(program.program, gl.LINK_STATUS) !== false;
  } catch (_) {
    return;
  }
  if (!linked) report(program, gl);
}

export function reportLinkFailure(program, gl) {
  const read = (readLog) => {
    try { return String(readLog() || '').trim(); } catch (_) { return ''; }
  };
  const programLog = read(() => gl.getProgramInfoLog(program.program));
  const vertexLog = read(() => gl.getShaderInfoLog(program.vertexShader));
  const fragmentLog = read(() => gl.getShaderInfoLog(program.fragmentShader));
  program.diagnostics = {
    runnable: false,
    programLog,
    vertexShader: { log: vertexLog, prefix: '' },
    fragmentShader: { log: fragmentLog, prefix: '' },
  };
  console.error(
    'THREE.WebGLProgram: Shader Error - program failed to link\n\n'
      + `Material Name: ${program.name || ''}\n`
      + `Material Type: ${program.type || ''}\n\n`
      + `Program Info Log: ${programLog}\n`
      + `Vertex Shader Log: ${vertexLog}\n`
      + `Fragment Shader Log: ${fragmentLog}\n\n`
      + 'Reload with ?shaderChecks=1 for three\'s full report with the failing source lines.',
  );
}
