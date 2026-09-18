// Chromium/Electron WEBGL_get_program_binary cache for repeat boots.
// Dummy mesh prewarm is illegal; this stores real linked program binaries keyed by shader source.

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
    if (key && canGet && gl.getProgramParameter(program, gl.LINK_STATUS)) {
      try {
        const binary = gl.getProgramBinary(program);
        if (binary && binary.binary) MEMORY.set(key, binary);
      } catch {
        /* some drivers reject getProgramBinary until COMPLETION_STATUS */
      }
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
