#!/usr/bin/env node
// Diagnostic only: the public flight route and native-process cleanup belong to the unchanged
// main-thread probe. This payload borrows the live composite, never a shader approximation.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
if (args.includes('--help')) {
  console.log('node scripts/probe-bloom-contrast-lut.mjs [--label=NAME] [--baseline-source=.devshots/manifest.json] [--settle-ms=25000] [--blocks=8] [--draws=12]');
  console.log('Native exact-material diagnostic; writes .devshots/main-thread-profile/NAME. Never changes production defaults.');
  process.exit(0);
}
const bounded = (name, fallback, min, max) => {
  const n = value(name) == null ? fallback : Number(value(name));
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer ${min}..${max}`);
  return n;
};
const label = value('--label') || `bloom-contrast-lut-${new Date().toISOString().replace(/[:.]/g, '-')}`;
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error('Invalid --label');
const config = { blocks: bounded('--blocks', 8, 4, 12), draws: bounded('--draws', 12, 4, 20) };
if (config.blocks % 2) throw new Error('--blocks must be even for paired alternating arms');
const out = path.join(root, '.devshots', 'main-thread-profile', label);
if (fs.existsSync(out)) throw new Error(`Refusing to reuse diagnostic output: ${out}`);
fs.mkdirSync(out, { recursive: true });

async function nativeAb(config) {
  const THREE = await import('three');
  const { LOOK_MOODS, resolveLookMood } = await import('/src/data/lookMoods.js');
  const state = window.SF?.state;
  const renderer = state?.render?.renderer;
  const bloom = state?.render?.bloom;
  const material = bloom?.openingProgramMaterials?.()[1];
  if (!renderer || !material?.uniforms?.tLookContrastLut) throw new Error('Live composite unavailable');
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!renderer.capabilities.isWebGL2 || !ext) throw new Error('Native WebGL2 GPU timer unavailable');
  const gpu = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = gpu ? gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : '';
  if (/swiftshader|llvmpipe|software/i.test(gpuName)) throw new Error(`Hardware GPU required: ${gpuName}`);
  const started = performance.now();
  const originalLut = bloom.diagnostics().contrastLutRequested;
  const timers = state.render.gpuTimers;
  const originalTimers = timers?.enabled ?? false;
  const resources = [];
  const queries = new Set();
  const result = { schema: 'spaceface.exact-composite-contrast-ab.v1', diagnosticOnly: true,
    gpu: gpuName, nativeSize: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    originalLut, originalTimers, blocks: [], fidelity: [], images: {}, cleanup: {} };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = condition => { if (!condition) throw new Error('A/B exceeded its bounded 90-second payload window'); };
  const assertGl = label => {
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error(`${label}: GL error ${error}`);
    if (gl.isContextLost()) throw new Error(`${label}: context lost`);
  };
  const renderState = () => ({ target: renderer.getRenderTarget(),
    viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(), autoClear: renderer.autoClear,
    clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha() });
  const restoreState = saved => {
    renderer.setRenderTarget(saved.target);
    renderer.setViewport(saved.viewport); renderer.setScissor(saved.scissor);
    renderer.setScissorTest(saved.scissorTest); renderer.autoClear = saved.autoClear;
    renderer.setClearColor(saved.clearColor, saved.clearAlpha);
  };
  const copyValue = v => v?.isTexture ? v : v?.clone ? v.clone() : Array.isArray(v) ? v.slice() : v;
  let frozen;
  let captureRestore = () => {};
  let geometry;
  try {
    // Own TIME_ELAPSED exclusively. The eval branch does not start the main probe's timers.
    if (timers?.getCapability?.().pending) throw new Error('Game has outstanding GPU queries; refusing to disturb them');
    timers?.setEnabled(false);
    if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) throw new Error('A GPU elapsed query is already active');
    assertGl('before snapshot');
    frozen = await new Promise((resolve, reject) => {
      const before = material.onBeforeRender;
      let objectRestore = () => {};
      const timeout = setTimeout(() => { captureRestore(); reject(new Error('No live composite draw within 15 seconds')); }, 15000);
      captureRestore = () => { clearTimeout(timeout); material.onBeforeRender = before; objectRestore(); };
      material.onBeforeRender = function (...drawArgs) {
        before.apply(this, drawArgs);
        const object = drawArgs[4];
        const after = object.onAfterRender;
        objectRestore = () => { object.onAfterRender = after; };
        object.onAfterRender = function (...afterArgs) {
          after.apply(this, afterArgs);
          captureRestore();
          const saved = renderState();
          try {
            const values = Object.fromEntries(Object.entries(material.uniforms)
              .filter(([key]) => key !== 'tLookContrastLut').map(([key, u]) => [key, copyValue(u.value)]));
            const copies = new Map();
            result.inputCopies = [];
            for (const [key, texture] of Object.entries(values)) {
              if (!texture?.isTexture) continue;
              if (!texture.isRenderTargetTexture) throw new Error(`${key} is not the live resolved render target`);
              if (!copies.has(texture)) {
                const { width, height } = texture.image;
                const target = new THREE.WebGLRenderTarget(width, height, {
                  type: texture.type, format: texture.format, internalFormat: texture.internalFormat,
                  minFilter: texture.minFilter, magFilter: texture.magFilter,
                  wrapS: texture.wrapS, wrapT: texture.wrapT, colorSpace: texture.colorSpace,
                  depthBuffer: false, stencilBuffer: false, samples: 0, generateMipmaps: false,
                });
                resources.push(target); renderer.initRenderTarget(target);
                target.texture.flipY = texture.flipY;
                renderer.copyTextureToTexture(texture, target.texture);
                copies.set(texture, target.texture);
                result.inputCopies.push({ uniform: key, width, height, type: texture.type,
                  format: texture.format, internalFormat: texture.internalFormat, resolvedSamples: 0 });
              }
              values[key] = copies.get(texture);
            }
            if (!values.tScene?.isTexture) throw new Error('Live scene sampler was empty');
            gl.finish(); // Resolve/complete all snapshot copies once, outside every timed draw.
            assertGl('frozen input copies');
            result.frozenContrast = values.uLookContrast;
            result.frozenUniforms = Object.fromEntries(Object.entries(values).map(([k, v]) => [k,
              v?.isTexture ? { width: v.image.width, height: v.image.height } : v?.toArray ? v.toArray() : v]));
            result.snapshotFrame = renderer.info.render.frame;
            resolve(values);
          } catch (error) { reject(error); }
          finally { restoreState(saved); }
        };
      };
    });
    const [width, height] = result.nativeSize;
    const output = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace, depthBuffer: false, stencilBuffer: false, samples: 0 });
    resources.push(output); renderer.initRenderTarget(output);
    geometry = new THREE.PlaneGeometry(2, 2);
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(geometry, material); quad.frustumCulled = false; scene.add(quad);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const withInputs = (values, action) => {
      const old = {};
      for (const [key, v] of Object.entries(values)) { old[key] = material.uniforms[key].value; material.uniforms[key].value = v; }
      try { return action(); }
      finally { for (const [key, v] of Object.entries(old)) material.uniforms[key].value = v; material.uniformsNeedUpdate = true; }
    };
    const select = (lut, values) => withInputs(values, () => {
      const diag = bloom.setContrastLutEnabled(lut);
      if (diag.contrastLutEnabled !== lut) throw new Error(`LUT variant selection failed: ${diag.contrastLutReason}`);
    });
    const draw = (values, timed = false) => {
      const saved = renderState();
      let query;
      let active = false;
      try {
        renderer.setRenderTarget(output); renderer.setScissorTest(false); renderer.autoClear = false;
        return withInputs(values, () => {
          material.uniformsNeedUpdate = true;
          if (timed) {
            if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) throw new Error('Nested GPU elapsed query refused');
            query = gl.createQuery(); queries.add(query);
            gl.beginQuery(ext.TIME_ELAPSED_EXT, query); active = true;
          }
          const frameBefore = renderer.info.render.frame;
          try { renderer.render(scene, camera); }
          finally { if (active) { gl.endQuery(ext.TIME_ELAPSED_EXT); active = false; } }
          if (renderer.info.render.frame <= frameBefore || renderer.info.render.calls < 1) {
            throw new Error('Composite draw was suppressed by renderer readiness guard');
          }
          return query;
        });
      } finally {
        if (active) gl.endQuery(ext.TIME_ELAPSED_EXT);
        restoreState(saved);
      }
    };
    const warm = async (lut, values) => {
      select(lut, values);
      // Uniform references are restored synchronously, even while linking completes asynchronously.
      const saved = renderState();
      let compilation;
      try {
        renderer.setRenderTarget(output);
        compilation = withInputs(values, () => renderer.compileAsync(scene, camera));
      } finally { restoreState(saved); }
      let timeout;
      try {
        await Promise.race([compilation,
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Variant link exceeded 10 seconds')), 10000); })]);
      } finally { clearTimeout(timeout); }
      // A live frame may have refreshed the LUT during the asynchronous link wait. Re-sync at
      // the frozen contrast, then upload in these untimed draws with no intervening await.
      select(lut, values);
      draw(values); draw(values); assertGl('warm variant');
    };
    const drain = async pending => {
      gl.flush();
      const deadline = performance.now() + 10000;
      const times = [];
      for (const query of pending) {
        while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
          if (performance.now() > deadline) throw new Error('GPU query did not complete within 10 seconds');
          check(performance.now() - started < 90000); await sleep(10);
        }
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) throw new Error('Disjoint GPU timer result');
        times.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(query); queries.delete(query);
      }
      return times;
    };
    // Warm both programs first, then alternate short blocks. A/B order reverses each pair.
    await warm(false, frozen); await warm(true, frozen);
    for (let block = 0; block < config.blocks; block++) {
      const lut = [false, true, true, false][block % 4];
      await warm(lut, frozen);
      const pending = [];
      for (let i = 0; i < config.draws; i++) pending.push(draw(frozen, true));
      const timesMs = await drain(pending);
      result.blocks.push({ block, arm: lut ? 'lut' : 'analytic', timesMs,
        meanMs: timesMs.reduce((sum, n) => sum + n, 0) / timesMs.length });
    }
    const stats = numbers => {
      const sorted = [...numbers].sort((a, b) => a - b);
      return { count: sorted.length, meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        medianMs: (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2,
        minMs: sorted[0], maxMs: sorted.at(-1) };
    };
    result.timing = Object.fromEntries(['analytic', 'lut'].map(arm => [arm,
      stats(result.blocks.filter(b => b.arm === arm).flatMap(b => b.timesMs))]));
    result.timing.meanGainPercent = (1 - result.timing.lut.meanMs / result.timing.analytic.meanMs) * 100;
    result.timing.pairedGainPercent = [];
    for (let i = 0; i < result.blocks.length; i += 2) {
      const pair = result.blocks.slice(i, i + 2);
      result.timing.pairedGainPercent.push((1 - pair.find(b => b.arm === 'lut').meanMs / pair.find(b => b.arm === 'analytic').meanMs) * 100);
    }
    result.timing.issued = config.blocks * config.draws;
    result.timing.completed = result.blocks.reduce((n, b) => n + b.timesMs.length, 0);
    result.timing.pending = queries.size;
    const read = () => {
      const bytes = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(output, 0, 0, width, height, bytes);
      assertGl('native RGBA8 readback'); return bytes;
    };
    const png = bytes => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y++) image.data.set(bytes.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
      context.putImageData(image, 0, 0);
      const url = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0; return url;
    };
    let worst = null;
    const compare = async (name, values, save = false) => {
      check(performance.now() - started < 90000);
      await warm(false, values); const analytic = read();
      await warm(true, values); const lut = read();
      let maxByteError = 0; let sum = 0; let squared = 0; let pixelsOverOne = 0; let changedPixels = 0;
      const diff = new Uint8Array(analytic.length);
      for (let i = 0; i < analytic.length; i += 4) {
        let changed = false; let over = false;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(analytic[i + c] - lut[i + c]);
          maxByteError = Math.max(maxByteError, d); sum += d; squared += d * d;
          diff[i + c] = Math.min(255, d * 32); changed ||= d > 0; over ||= d > 1;
        }
        diff[i + 3] = 255; changedPixels += Number(changed); pixelsOverOne += Number(over);
      }
      const entry = { name, contrast: values.uLookContrast, toe: values.uToe, maxByteError,
        meanByteError: sum / (width * height * 3), rmsByteError: Math.sqrt(squared / (width * height * 3)),
        changedPixels, pixelsOverOne, pass: maxByteError <= 1 };
      result.fidelity.push(entry);
      if (save) result.images[name] = { analytic: png(analytic), lut: png(lut), diff32x: png(diff) };
      if (!worst || maxByteError > worst.entry.maxByteError ||
        (maxByteError === worst.entry.maxByteError && entry.meanByteError > worst.entry.meanByteError)) {
        worst = { entry, images: { analytic: png(analytic), lut: png(lut), diff32x: png(diff) } };
      }
    };
    await compare('live-scene', frozen, true);
    // Sharp swatches, continuous ramps, black, near the 1e-5 luma branch, saturated and HDR inputs.
    // The shipped composite still owns AA/ink, tone mapping, contrast, toe and sRGB encoding.
    const colors = [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1],
      [0.0001, 0.00001, 0.001], [1, 0.1, 0.01], [2, 1, 0.5], [100, 20, 5]];
    for (const y of [0.999e-5, 1e-5, 1.001e-5, 1e-8, 1e-6, 1e-4, 1e-3]) colors.push([y, y, y]);
    const gridW = 256; const gridH = 128;
    const data = new Float32Array(gridW * gridH * 4);
    for (let y = 0; y < gridH; y++) for (let x = 0; x < gridW; x++) {
      const ramp = x / (gridW - 1);
      const color = y < gridH / 2 ? colors[Math.floor(x / gridW * colors.length)]
        : y < gridH * 3 / 4 ? [ramp, ramp, ramp] : [100 * ramp, 20 * ramp, 5 * ramp];
      const offset = (y * gridW + x) * 4; data.set([...color, 1], offset);
    }
    const texture = new THREE.DataTexture(data, gridW, gridH, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true; resources.push(texture);
    const authored = [...new Set(Object.keys(LOOK_MOODS).map(id => resolveLookMood(id).post.contrast))].sort((a, b) => a - b);
    const contrasts = new Set(authored);
    for (const t of [0.25, 0.5, 0.75]) {
      const eased = t * t * (3 - 2 * t);
      contrasts.add(authored[0] + (authored.at(-1) - authored[0]) * eased);
    }
    result.calibration = { authoredContrasts: authored, testedContrasts: [...contrasts],
      transitionSamples: 'smoothstep between authored contrast extrema at 0.25, 0.5, 0.75', colors,
      fidelityLimit: 'at most one final RGBA8 RGB byte, matching existing LUT fidelity contract' };
    for (const contrast of contrasts) for (const toe of [0, 0.02]) {
      const values = { ...frozen, tScene: texture, tBloom0: texture, tBloom1: texture,
        tBloom2: texture, tDistortion: texture, uDistortion: 0, uBloomW0: 0, uBloomW1: 0,
        uBloomW2: 0, uStrength: 0, uUvScale: new THREE.Vector2(1, 1), uUvOffset: new THREE.Vector2(0, 0),
        uSceneTexel: new THREE.Vector2(1 / gridW, 1 / gridH), uGrade: 1, uToe: toe, uLookContrast: contrast };
      await compare(`calibration-${contrast.toFixed(7)}-toe-${toe}`, values);
    }
    result.images['worst-fidelity'] = worst.images;
    result.worstFidelity = worst.entry;
    result.fidelityPass = result.fidelity.every(entry => entry.pass);
    result.elapsedMs = performance.now() - started;
    result.completed = true;
  } catch (error) {
    result.completed = false; result.error = error.stack || String(error);
  } finally {
    captureRestore();
    for (const query of queries) gl.deleteQuery(query);
    queries.clear();
    bloom.setContrastLutEnabled(originalLut);
    timers?.setEnabled(originalTimers);
    geometry?.dispose();
    for (const resource of resources.reverse()) resource.dispose();
    result.cleanup = { ownedQueriesRemaining: queries.size, ownedResourcesDisposed: resources.length,
      lutRestored: bloom.diagnostics().contrastLutRequested === originalLut,
      gameTimersRestored: (timers?.enabled ?? false) === originalTimers };
  }
  return result;
}

const payload = path.join(out, 'payload.js');
fs.writeFileSync(payload, `(${nativeAb.toString()})(${JSON.stringify(config)})\n`);
const childArgs = ['scripts/probe-main-thread-profile.mjs', `--label=${label}`, '--domain-profile=station',
  `--settle-ms=${bounded('--settle-ms', 25000, 0, 60000)}`, `--eval-file=${payload}`];
if (value('--baseline-source')) childArgs.push(`--baseline-source=${value('--baseline-source')}`);
console.log(`Diagnostic command: ${process.execPath} ${childArgs.join(' ')}`);
const child = spawn(process.execPath, childArgs, { cwd: root,
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' }, stdio: 'inherit', windowsHide: true });
console.log(`Owned launcher PID: ${child.pid}`);
const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); });
const resultPath = path.join(out, 'eval-result.json');
if (!fs.existsSync(resultPath)) process.exit(exitCode || 1);
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
const images = result.images || {};
result.images = {};
for (const [name, variants] of Object.entries(images)) {
  result.images[name] = {};
  for (const [arm, url] of Object.entries(variants)) {
    const filename = `${name}-${arm}.png`;
    fs.writeFileSync(path.join(out, filename), Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'));
    result.images[name][arm] = filename;
  }
}
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
const lines = ['# Native exact-material contrast A/B', '',
  'Diagnostic: unchanged public Adventure route, real composite material, identical copied GPU inputs and uniforms.',
  `Completed: ${result.completed}; native RGB fidelity: ${result.fidelityPass ?? 'unmeasured'}.`,
  `Timing: ${JSON.stringify(result.timing ?? {})}`, `Worst fidelity: ${JSON.stringify(result.worstFidelity ?? {})}`,
  `Cleanup: ${JSON.stringify(result.cleanup)}`, '',
  'This measures the composite draw only. It excludes LUT rebuild/upload cadence during mood transitions and does not enable a production default.',
  ...(result.error ? ['', result.error] : []), ''];
fs.writeFileSync(path.join(out, 'report.md'), lines.join('\n'));
console.log(JSON.stringify({ output: out, completed: result.completed, fidelityPass: result.fidelityPass,
  timing: result.timing, worstFidelity: result.worstFidelity, cleanup: result.cleanup, error: result.error }, null, 2));
process.exitCode = exitCode || (result.completed ? 0 : 1);
