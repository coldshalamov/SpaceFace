// WebGL context instrumentation — the single mechanism behind counter families A through E.
//
// WHY ONE MECHANISM RATHER THAN FIVE
// ----------------------------------
// Shader compiles, render-target allocations, texture uploads, buffer uploads and draw/state changes
// look like five unrelated problems in source, but at the driver boundary they are all just GL calls.
// Wrapping the context catches every one of them in the same place — including the ones that are
// INVISIBLE in application source, which is the whole reason this system exists:
//
//     material.needsUpdate = true;   // -> gl.compileShader + gl.linkProgram: 50-300 ms
//     renderTarget.setSize(w, h);    // -> gl.renderbufferStorage + gl.texImage2D: VRAM realloc
//     texture.needsUpdate = true;    // -> gl.texImage2D: a synchronous upload
//
// None of those three call sites contains a GL call, a loop, or anything a reader would flag as
// expensive. Per-call-site hooks would have to be placed at exactly the spots nobody suspects.
// Wrapping the context requires suspecting nothing, and it also catches the work THREE does on its
// own behalf, which application-level hooks cannot see at all.
//
// INSTANCE SHADOWING, NOT PROTOTYPE PATCHING
// ------------------------------------------
// Every wrapper is assigned onto the context OBJECT (`gl.drawElements = ...`), never onto
// `WebGL2RenderingContext.prototype`. Two consequences, both required:
//   1. Zero cost when off is literal. Disabled means the wrapper was never installed, so there is no
//      call site to skip — not even a boolean read on the hottest calls in the frame.
//   2. It cannot leak. A second context (a lab harness, a thumbnail renderer, another test in the
//      same page) is unaffected, and `uninstall()` restores the object to its original state.
//
// THIS DEOPTIMISES THE FRAME. THAT IS ACCEPTED, AND IT IS WHY TIER 2 IS A SEPARATE RUN.
// `apply(this, arguments)` around `drawElements` and `bufferSubData` is real overhead on the hottest
// calls there are. Counts are unaffected — an integer does not care that it was expensive to obtain,
// which is the entire Tier-1 argument. Timings captured in the same run are NOT merely contended,
// they are instrument-distorted, which is worse because it is invisible. Never populate a Tier-2
// field from a run with this installed.

const DRAW_METHODS = Object.freeze([
  ['drawArrays', false],
  ['drawElements', false],
  ['drawArraysInstanced', true],
  ['drawElementsInstanced', true],
  ['drawRangeElements', false],
]);

/** Byte size of a bufferData/bufferSubData payload, whichever overload was used. */
function payloadBytes(value) {
  if (value == null) return 0;
  // bufferData(target, size, usage) — the allocation-only overload passes a byte count.
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  // ArrayBuffer and every TypedArray/DataView expose byteLength.
  if (typeof value.byteLength === 'number') return value.byteLength;
  return 0;
}

/**
 * Byte size of the exact WebGL2 bufferSubData source slice.
 *
 * Three r184 calls `bufferSubData(target, dstOffset, array, range.start, range.count)` for
 * BufferAttribute update ranges. The last two arguments are component indexes, so charging the
 * source view's complete byteLength turns every partial upload into a false full-capacity sample.
 * WebGL1's three-argument overload still transfers the complete source view.
 */
function bufferSubDataPayloadBytes(value, srcOffset, length, argumentCount) {
  const totalBytes = payloadBytes(value);
  if (argumentCount < 5 || !Number.isInteger(srcOffset) || srcOffset < 0
      || !Number.isInteger(length) || length < 0) return totalBytes;
  const bytesPerElement = Number(value && value.BYTES_PER_ELEMENT) || 1;
  const availableElements = Math.floor(totalBytes / bytesPerElement);
  const boundedStart = Math.min(srcOffset, availableElements);
  const boundedLength = Math.min(length, availableElements - boundedStart);
  return boundedLength * bytesPerElement;
}

/**
 * Install counting wrappers on a live WebGL context.
 *
 * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
 * @param {object} counters - a createPerfCounters() instance
 * @returns {{uninstall: function, wrapped: string[]}} - uninstall restores every original method
 */
export function installGlInstrumentation(gl, counters) {
  if (!gl || !counters) throw new TypeError('installGlInstrumentation requires a context and counters');
  // Double-installing would double every count, and the second uninstall would restore a wrapper
  // rather than the original — leaving a permanently instrumented context behind.
  if (gl.__sfInstrumentation) return gl.__sfInstrumentation;

  const originals = new Map();
  const wrapped = [];

  function wrap(name, make) {
    const original = gl[name];
    if (typeof original !== 'function') return;   // absent on WebGL1; simply not counted
    originals.set(name, original);
    gl[name] = make(original);
    wrapped.push(name);
  }

  // --- A: shader programs ---------------------------------------------------------------------
  // linkProgram is the definitive signal. Polling `renderer.info.programs` across frames misses any
  // program created and released between two samples, and can never say who caused it.
  wrap('linkProgram', (original) => function linkProgram() {
    counters.countShaderLink();
    return original.apply(this, arguments);
  });
  wrap('compileShader', (original) => function compileShader() {
    counters.countShaderCompile();
    return original.apply(this, arguments);
  });

  // --- B: render targets ----------------------------------------------------------------------
  wrap('createFramebuffer', (original) => function createFramebuffer() {
    counters.countRenderTargetAllocation();
    return original.apply(this, arguments);
  });
  // A resize reallocates the depth/stencil attachment through this call, which is the part that
  // stalls the pipeline; the colour attachment shows up as a texImage2D below.
  wrap('renderbufferStorage', (original) => function renderbufferStorage(target, format, width, height) {
    counters.countRenderTargetResize(width, height);
    return original.apply(this, arguments);
  });
  wrap('renderbufferStorageMultisample', (original) => function renderbufferStorageMultisample(target, samples, format, width, height) {
    counters.countRenderTargetResize(width, height);
    return original.apply(this, arguments);
  });

  // --- C: textures ----------------------------------------------------------------------------
  wrap('texImage2D', (original) => function texImage2D() {
    counters.countTextureUpload(true);
    return original.apply(this, arguments);
  });
  wrap('texSubImage2D', (original) => function texSubImage2D() {
    counters.countTextureUpload(false);
    return original.apply(this, arguments);
  });
  wrap('texStorage2D', (original) => function texStorage2D() {
    counters.countTextureUpload(true);
    return original.apply(this, arguments);
  });
  wrap('generateMipmap', (original) => function generateMipmap() {
    counters.countMipmapGeneration();
    return original.apply(this, arguments);
  });

  // --- D: buffers -----------------------------------------------------------------------------
  // The full-vs-partial split is the signal that matters: dynamicBufferRanges.js exists to turn full
  // reallocations into narrow sub-updates, and this is the independent check that it is working.
  wrap('bufferData', (original) => function bufferData(target, data) {
    counters.countBufferUpload(true, payloadBytes(data));
    return original.apply(this, arguments);
  });
  wrap('bufferSubData', (original) => function bufferSubData(target, offset, data, srcOffset, length) {
    counters.countBufferUpload(
      false,
      bufferSubDataPayloadBytes(data, srcOffset, length, arguments.length),
    );
    return original.apply(this, arguments);
  });

  // --- E: draw and state ----------------------------------------------------------------------
  for (const [name, instanced] of DRAW_METHODS) {
    wrap(name, (original) => function draw() {
      counters.countDraw(instanced);
      return original.apply(this, arguments);
    });
  }
  // Count only genuine switches. THREE calls useProgram unconditionally on many paths, so counting
  // every call would measure THREE's call pattern rather than the GPU state changes we care about —
  // and the healthy-value test ("switches should be close to the number of distinct programs used")
  // would then be meaningless.
  let lastProgram = null;
  wrap('useProgram', (original) => function useProgram(program) {
    if (program !== lastProgram) {
      lastProgram = program;
      counters.countProgramSwitch();
    }
    return original.apply(this, arguments);
  });
  let lastTexture = null;
  wrap('bindTexture', (original) => function bindTexture(target, texture) {
    if (texture !== lastTexture) {
      lastTexture = texture;
      counters.countTextureBind();
    }
    return original.apply(this, arguments);
  });

  const handle = {
    wrapped,
    uninstall() {
      for (const [name, original] of originals) gl[name] = original;
      originals.clear();
      wrapped.length = 0;
      delete gl.__sfInstrumentation;
    },
  };
  gl.__sfInstrumentation = handle;
  return handle;
}
