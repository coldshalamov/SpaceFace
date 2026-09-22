// Chromium/Electron WEBGL_get_program_binary cache for repeat boots.
// Dummy mesh prewarm is illegal; this stores real linked program binaries keyed by shader source.
//
// The naive harvest — read LINK_STATUS immediately after linkProgram — serializes the whole
// warmup: under KHR_parallel_shader_compile the driver link is still in flight, and the query
// blocks the main thread until it finishes. Measured ~8 s of serialized waits across the
// opening programs on Intel/ANGLE (PQ-033.02 boot profile, same cost class as
// shaderLinkReporter's first-use guard). Instead each link queues a pending entry and a
// non-blocking COMPLETION_STATUS_KHR poll drains it: harvest only happens once the driver
// says the link finished, so the cost of getProgramBinary lands on programs already linked.

const MEMORY = new Map();
const shaderSources = new WeakMap();
const programShaders = new WeakMap();

function fnv1a(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function programKey(program) {
  const shaders = programShaders.get(program);
  if (!shaders || !shaders.length) return null;
  let src = '';
  for (let i = 0; i < shaders.length; i++) src += shaderSources.get(shaders[i]) || '';
  return src ? fnv1a(src) : null;
}

export function installProgramBinaryCache(gl) {
  if (!gl || typeof gl.linkProgram !== 'function') return { ok: false, reason: 'no-gl' };
  const ext = typeof gl.getExtension === 'function'
    ? (gl.getExtension('WEBGL_get_program_binary') || gl.getExtension('KHR_get_program_binary'))
    : null;
  const canGet = typeof gl.getProgramBinary === 'function';
  const canSet = typeof gl.programBinary === 'function';
  if (!ext && !(canGet && canSet)) return { ok: false, reason: 'no-extension' };

  if (gl.__spacefaceProgramBinaryCache) return gl.__spacefaceProgramBinaryCache;

  const parallelCompile = typeof gl.getExtension === 'function'
    ? gl.getExtension('KHR_parallel_shader_compile')
    : null;
  const pending = [];
  let drainScheduled = false;

  // Harvest programs whose driver link has finished. COMPLETION_STATUS_KHR answers without
  // blocking; a program reporting false keeps its slot for the next drain. Without the
  // extension links are synchronous anyway, so every pending entry is already settled.
  const drainPending = () => {
    drainScheduled = false;
    // Pending programs' handles died with the context — draining them now would query dead
    // handles through the restored context (INVALID_VALUE noise). Drop the queue wholesale.
    if (typeof gl.isContextLost === 'function' && gl.isContextLost()) {
      pending.length = 0;
      return;
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      const { program, key } = pending[i];
      if (parallelCompile) {
        let done = true;
        try { done = gl.getProgramParameter(program, parallelCompile.COMPLETION_STATUS_KHR) === true; }
        catch { pending.splice(i, 1); continue; }
        if (!done) continue;
      }
      pending.splice(i, 1);
      try {
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) continue;
        const binary = gl.getProgramBinary(program);
        if (binary && binary.binary) MEMORY.set(key, binary);
      } catch {
        /* some drivers reject getProgramBinary until COMPLETION_STATUS */
      }
    }
  };
  const scheduleDrain = () => {
    if (drainScheduled || pending.length === 0) return;
    drainScheduled = true;
    // The next linkProgram call also drains, so this timer only covers the tail of a burst.
    setTimeout(drainPending, 0);
  };

  const origShaderSource = gl.shaderSource.bind(gl);
  const origAttach = gl.attachShader.bind(gl);
  const origLink = gl.linkProgram.bind(gl);

  gl.shaderSource = (shader, source) => {
    shaderSources.set(shader, String(source || ''));
    return origShaderSource(shader, source);
  };
  gl.attachShader = (program, shader) => {
    let list = programShaders.get(program);
    if (!list) {
      list = [];
      programShaders.set(program, list);
    }
    list.push(shader);
    return origAttach(program, shader);
  };
  gl.linkProgram = (program) => {
    const key = programKey(program);
    const cached = key ? MEMORY.get(key) : null;
    if (cached && canSet && cached.binary) {
      try {
        gl.programBinary(program, cached.format, cached.binary);
        if (gl.getProgramParameter(program, gl.LINK_STATUS)) return;
      } catch {
        /* fall through to a real link */
      }
    }
    origLink(program);
    if (key && canGet) {
      pending.push({ program, key });
      drainPending();
      scheduleDrain();
    }
  };

  const installed = {
    ok: true,
    size: () => MEMORY.size,
    clear: () => MEMORY.clear(),
  };
  gl.__spacefaceProgramBinaryCache = installed;
  return installed;
}

export function programBinaryCacheSize() {
  return MEMORY.size;
}
