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
  guardProgramList(renderer, gl, report);
  const canvas = renderer.domElement;
  if (canvas && typeof canvas.addEventListener === 'function') {
    // three rebuilds its program list when the context is restored; its own listener runs first.
    canvas.addEventListener('webglcontextrestored', () => guardProgramList(renderer, gl, report), false);
  }
  return true;
}

// renderer.info.programs is three's program cache list (WebGLPrograms pushes every new program).
function guardProgramList(renderer, gl, report) {
  const programs = renderer.info && renderer.info.programs;
  if (!Array.isArray(programs) || Object.prototype.hasOwnProperty.call(programs, 'push')) return;
  for (const program of programs) guardFirstUse(program, gl, report);
  const push = Array.prototype.push;
  Object.defineProperty(programs, 'push', {
    configurable: true,
    enumerable: false,
    writable: true,
    value(...items) {
      for (const item of items) guardFirstUse(item, gl, report);
      return push.apply(this, items);
    },
  });
}

// three's WebGLProgram runs its first-use step (uniform and attribute discovery) from whichever of
// getUniforms / getAttributes is called first. Check the link just before that, once, then hand three
// its own accessors back so later draws pay nothing.
function guardFirstUse(program, gl, report) {
  if (!program || guardedPrograms.has(program)) return;
  if (typeof program.getUniforms !== 'function' || typeof program.getAttributes !== 'function') return;
  guardedPrograms.add(program);
  const getUniforms = program.getUniforms;
  const getAttributes = program.getAttributes;
  const beforeFirstUse = (self) => {
    self.getUniforms = getUniforms;
    self.getAttributes = getAttributes;
    checkLinkStatus(self, gl, report);
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

function checkLinkStatus(program, gl, report) {
  if (!program.program) return;
  let linked = true;
  try {
    if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return;
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
