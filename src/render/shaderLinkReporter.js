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

import { contextLossGeneration, programHandleContext } from './programHandleContext.js';

const guardedPrograms = new WeakSet();
// Programs released while still linking. gl.deleteProgram frees the driver id at once, but
// every isReady()/COMPLETION_STATUS query the app issued queued a service-side link-completion
// task in Chromium — those tasks then run glGetProgramiv on the dead id and warn
// GL_INVALID_VALUE 'Program object expected' in same-millisecond batches with no JS location.
// The GL teardown defers until the link settles; the wrapped isReady() reports dead-generation
// handles ready so a lost context still releases its deferred destroys.
const deferredDestroys = new WeakSet();
const DESTROY_DEFER_MAX_MS = 8000;
const DESTROY_DEFER_POLL_MS = 250;

export function installShaderLinkReporter(renderer, options = {}) {
  const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
  if (!gl || !renderer.debug || !renderer.info) return false;
  const report = typeof options.report === 'function' ? options.report : reportLinkFailure;
  const timing = options.timing && typeof options.timing === 'object' ? options.timing : {};
  renderer.debug.checkShaderErrors = false;
  guardProgramList(renderer, gl, report, timing);
  const canvas = renderer.domElement;
  if (canvas && typeof canvas.addEventListener === 'function') {
    // three rebuilds its program list when the context is restored; its own listener runs first.
    canvas.addEventListener('webglcontextrestored', () => guardProgramList(renderer, gl, report, timing), false);
  }
  return true;
}

// renderer.info.programs is three's program cache list (WebGLPrograms pushes every new program).
function guardProgramList(renderer, gl, report, timing) {
  const programs = renderer.info && renderer.info.programs;
  if (!Array.isArray(programs) || Object.prototype.hasOwnProperty.call(programs, 'push')) return;
  for (const program of programs) guardFirstUse(program, gl, report, timing);
  const push = Array.prototype.push;
  Object.defineProperty(programs, 'push', {
    configurable: true,
    enumerable: false,
    writable: true,
    value(...items) {
      for (const item of items) guardFirstUse(item, gl, report, timing);
      return push.apply(this, items);
    },
  });
}

// three's WebGLProgram runs its first-use step (uniform and attribute discovery) from whichever of
// getUniforms / getAttributes is called first. Check the link just before that, once, then hand three
// its own accessors back so later draws pay nothing.
function guardFirstUse(program, gl, report, timing = {}) {
  if (!program || guardedPrograms.has(program)) return;
  if (typeof program.getUniforms !== 'function' || typeof program.getAttributes !== 'function') return;
  guardedPrograms.add(program);
  const getUniforms = program.getUniforms;
  const getAttributes = program.getAttributes;
  const generation = contextLossGeneration(gl);
  const beforeFirstUse = (self) => {
    self.getUniforms = getUniforms;
    self.getAttributes = getAttributes;
    checkLinkStatus(self, gl, report, generation);
  };
  program.getUniforms = function getUniformsAfterLinkCheck() {
    beforeFirstUse(this);
    return getUniforms.call(this);
  };
  program.getAttributes = function getAttributesAfterLinkCheck() {
    beforeFirstUse(this);
    return getAttributes.call(this);
  };
  // isReady() is the one readiness query every poll path shares — and three's own poll calls it on
  // the raw program object with no context guard. A program minted before a context loss (or while
  // the context sits inside its lost window) keeps a JS wrapper whose handle the restored driver no
  // longer recognises: every isReady() on it warns GL_INVALID_VALUE and can never report ready.
  // Answer "ready" instead — the link is gone, the material re-acquires a fresh program on its next
  // real draw, and no waiter should keep polling a handle that cannot finish.
  const isReady = program.isReady;
  if (typeof isReady === 'function') {
    program.isReady = function isReadyContextSafe() {
      try {
        // A destroyed program cannot finish linking; answer ready so waiters stop polling
        // instead of querying the freed handle (INVALID_VALUE on the dead object).
        if (this.program == null) return true;
        if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return true;
        if (programHandleContext(gl).generation !== generation) return true;
      } catch (_) { /* fall through to the real query */ }
      return isReady.call(this);
    };
  }
  const destroy = program.destroy;
  if (typeof destroy === 'function') {
    program.destroy = function destroyAfterLinkSettles() {
      // this.program goes undefined inside three's destroy — a second destroy() must not
      // re-issue deleteProgram on the dead handle (that warns the same INVALID_VALUE class).
      if (this.program == null) {
        deferredDestroys.delete(this);
        return;
      }
      let linking = false;
      try { linking = this.isReady() === false; } catch (_) { linking = false; }
      if (linking) {
        deferProgramDestroy(this, destroy, timing);
        return;
      }
      // Ready now — drop any pending defer so the poll cannot run the teardown twice.
      deferredDestroys.delete(this);
      return destroy.call(this);
    };
  }
}

function deferProgramDestroy(program, destroy, timing = {}) {
  if (deferredDestroys.has(program)) return;
  deferredDestroys.add(program);
  const setTimer = timing.setTimer || ((callback, ms) => setTimeout(callback, ms));
  const now = timing.now || (() => Date.now());
  const pollMs = timing.pollMs ?? DESTROY_DEFER_POLL_MS;
  const deadline = now() + (timing.maxWaitMs ?? DESTROY_DEFER_MAX_MS);
  const poll = () => {
    // A direct destroy() while deferred already tore the program down — or decided the
    // link was ready — so this poll's query would hit a dead handle.
    if (!deferredDestroys.has(program)) return;
    let settled = now() >= deadline;
    if (!settled) {
      try { settled = program.isReady() !== false; } catch (_) { settled = true; }
    }
    if (!settled) {
      setTimer(poll, pollMs);
      return;
    }
    deferredDestroys.delete(program);
    try { destroy.call(program); } catch (_) { /* teardown must not abort on a dead handle */ }
  };
  setTimer(poll, pollMs);
}

function checkLinkStatus(program, gl, report, generation) {
  if (!program.program) return;
  let linked = true;
  try {
    if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return;
    // A handle minted before a context loss is never a valid query target after it: the restored
    // driver no longer recognises the object and glGetProgramiv warns GL_INVALID_VALUE. The program
    // is rebuilt from the material's next real draw; there is no link status left to read.
    if (programHandleContext(gl).generation !== generation) return;
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
