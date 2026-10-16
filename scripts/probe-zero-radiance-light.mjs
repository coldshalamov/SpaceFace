#!/usr/bin/env node
// A private, frozen fixture of the live game's authored PBR geometry/material and lights.
// The unchanged main probe owns the public route, source overlay and native-process cleanup.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
if (args.includes('--help')) {
  console.log('node scripts/probe-zero-radiance-light.mjs [--label=NAME] [--baseline-source=.devshots/manifest.json]');
  console.log('96 native GPU queries; actual/zero/nonzero light cases, native HDR and RGBA8 fidelity. No production edits.');
  process.exit(0);
}
const label = value('--label') || `zero-radiance-${new Date().toISOString().replace(/[:.]/g, '-')}`;
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error('Invalid --label');
const out = path.join(root, '.devshots', 'main-thread-profile', label);
if (fs.existsSync(out)) throw new Error(`Refusing to reuse output: ${out}`);
fs.mkdirSync(out, { recursive: true });

async function nativeLightAb() {
  const THREE = await import('three');
  const { LOOK_SURFACE_UNIFORMS } = await import('/src/render/look.js');
  const state = window.SF?.state;
  const renderer = state?.render?.renderer;
  const liveScene = state?.render?.scene;
  const liveCamera = state?.render?.camera;
  if (!renderer || !liveScene || !liveCamera?.isPerspectiveCamera) throw new Error('Live flight render owners unavailable');
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '';
  if (!ext || !renderer.capabilities.isWebGL2 || /swiftshader|llvmpipe|software/i.test(gpu)) {
    throw new Error(`Native WebGL2 timer required: ${gpu}`);
  }
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  const resources = [], queries = new Set();
  const timers = state.render.gpuTimers, timersWereEnabled = timers?.enabled ?? false;
  const result = { schema: 'spaceface.zero-radiance-material-ab.v1', diagnosticOnly: true, gpu,
    nativeSize: [width, height], authority: 'frozen live authored material/geometry fixture; whole-game FPS unmeasured',
    fidelityPolicy: 'Exact native RGBA8; finite HDR within one binary16 ULP of each baseline channel (minimum 2^-24)',
    cases: [], fidelity: [], images: {}, cleanup: {} };
  const started = performance.now();
  const checkTime = () => { if (performance.now() - started > 90000) throw new Error('90-second diagnostic bound exceeded'); };
  const checkGl = name => { const error = gl.getError(); if (error !== gl.NO_ERROR || gl.isContextLost()) throw new Error(`${name}: GL error ${error}`); };
  const save = () => ({ target: renderer.getRenderTarget(), viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(), autoClear: renderer.autoClear,
    color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() });
  const restore = s => { renderer.setRenderTarget(s.target); renderer.setViewport(s.viewport); renderer.setScissor(s.scissor);
    renderer.setScissorTest(s.scissorTest); renderer.autoClear = s.autoClear; renderer.setClearColor(s.color, s.alpha); };
  const frozenValue = v => v?.isTexture ? v : v?.clone ? v.clone() : Array.isArray(v) ? v.slice() : v;
  const frozenLook = Object.fromEntries(Object.entries(LOOK_SURFACE_UNIFORMS).map(([name, u]) => [name, frozenValue(u.value)]));
  let originalChunk = null;
  let verifyGeometry = null;
  try {
    if (timers?.getCapability?.().pending || gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) throw new Error('Existing GPU query must remain undisturbed');
    timers?.setEnabled(false); checkGl('before fixture');
    const owner = window.SF.registry.get('render');
    const playerRoot = owner?._meshes?.get(state.playerId);
    const pool = [];
    (playerRoot || liveScene).traverseVisible(object => {
      const m = object.material, g = object.geometry;
      if (!object.isMesh || !object.layers.test(liveCamera.layers) || object.isSkinnedMesh || object.isInstancedMesh || object.isBatchedMesh
        || Array.isArray(m) || !m?.isMeshStandardMaterial || m.transparent || m.opacity < 1
        || !g?.attributes?.position?.array?.length || Object.keys(g.morphAttributes || {}).length) return;
      if (!g.boundingSphere) return;
      pool.push(object);
    });
    const score = o => o.geometry.boundingSphere.radius * Math.max(...o.getWorldScale(new THREE.Vector3()).toArray());
    pool.sort((a, b) => score(b) - score(a));
    const sources = [pool.find(o => !o.material.isMeshPhysicalMaterial)];
    const physical = pool.find(o => o.material.isMeshPhysicalMaterial && o.material.clearcoat > 0);
    if (physical) sources.push(physical);
    if (!sources[0]) throw new Error('No live opaque Standard mesh with retained authored geometry');
    const lightSources = [];
    liveScene.traverseVisible(object => { if (object.isLight) lightSources.push(object); });
    if (renderer.shadowMap.enabled && lightSources.some(light => light.castShadow)) {
      throw new Error('Fixture requires the captured default non-shadow light context; refusing to alter shadow quality');
    }
    originalChunk = THREE.ShaderChunk.lights_physical_pars_fragment;
    const functionAt = originalChunk.indexOf('void RE_Direct_Physical(');
    const braceAt = originalChunk.indexOf('{', functionAt);
    if (functionAt < 0 || braceAt < 0) throw new Error('Shipped direct physical shader contract unavailable');
    const guardedChunk = originalChunk.slice(0, braceAt + 1)
      + '\n if (all(equal(directLight.color, vec3(0.0)))) return;\n' + originalChunk.slice(braceAt + 1);
    const makeMaterial = (source, guarded) => {
      const material = source.clone(); resources.push(material);
      if (source.defines) material.defines = { ...source.defines };
      if (source.extensions) material.extensions = { ...source.extensions };
      const hook = source.onBeforeCompile, key = source.customProgramCacheKey?.() || '';
      material.onBeforeCompile = function (shader, renderer) {
        hook?.call(this, shader, renderer);
        const needle = '#include <lights_physical_pars_fragment>';
        if (!shader.fragmentShader.includes(needle)) throw new Error('PBR direct-light chunk was replaced by an unsupported hook');
        shader.fragmentShader = shader.fragmentShader.replace(needle, guarded ? guardedChunk : originalChunk);
        // The fixture never follows live mood transitions while the two variants link/render.
        for (const name of Object.keys(LOOK_SURFACE_UNIFORMS)) {
          if (shader.uniforms[name]) shader.uniforms[name] = { value: frozenValue(frozenLook[name]) };
        }
      };
      material.customProgramCacheKey = () => `${key}:diagnostic-zero-radiance:${guarded ? 'guard' : 'baseline'}`;
      return material;
    };
    const hdr = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace, depthBuffer: true, stencilBuffer: false, samples: 0 });
    const rgba = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace, depthBuffer: true, stencilBuffer: false, samples: 0 });
    resources.push(hdr, rgba); renderer.initRenderTarget(hdr); renderer.initRenderTarget(rgba);
    const fixtures = sources.map(source => {
      // Resident package geometry deliberately drops CPU normals/UVs/tangents. A clone copies
      // those empty arrays, not their retained GPU buffers. Borrow the immutable owner instead.
      const geometry = source.geometry;
      const attributeWitnesses = Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) =>
        [name, { attribute, version: (attribute.data || attribute).version }]));
      const indexWitness = geometry.index ? { attribute: geometry.index, version: geometry.index.version } : null;
      const mesh = new THREE.Mesh(geometry, makeMaterial(source.material, false));
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(source.matrixWorld); mesh.frustumCulled = false;
      mesh.receiveShadow = source.receiveShadow; mesh.layers.mask = source.layers.mask;
      const materialPair = [mesh.material, makeMaterial(source.material, true)];
      const scene = new THREE.Scene(); scene.add(mesh); scene.environment = liveScene.environment;
      scene.environmentIntensity = liveScene.environmentIntensity; scene.environmentRotation.copy(liveScene.environmentRotation);
      scene.fog = liveScene.fog?.clone() || null;
      const center = geometry.boundingSphere.center.clone().applyMatrix4(source.matrixWorld), radius = score(source);
      const camera = liveCamera.clone(); camera.layers.mask = liveCamera.layers.mask;
      camera.matrixAutoUpdate = true; camera.matrixWorldAutoUpdate = true;
      camera.aspect = width / height;
      const direction = liveCamera.getWorldPosition(new THREE.Vector3()).sub(center).normalize();
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.2;
      camera.position.copy(center).addScaledVector(direction, distance); camera.near = Math.min(camera.near, Math.max(0.01, distance - radius * 2));
      camera.far = Math.max(camera.far, distance + radius * 3); camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrix(); camera.updateMatrixWorld(true);
      const lights = lightSources.map(sourceLight => {
        const light = sourceLight.clone(false); light.position.copy(sourceLight.getWorldPosition(new THREE.Vector3()));
        light.matrixAutoUpdate = true; light.matrixWorldAutoUpdate = true;
        light.quaternion.copy(sourceLight.getWorldQuaternion(new THREE.Quaternion()));
        if (sourceLight.target) { light.target = new THREE.Object3D(); light.target.position.copy(sourceLight.target.getWorldPosition(new THREE.Vector3())); scene.add(light.target); }
        scene.add(light); light.updateMatrix(); light.updateMatrixWorld(true); return light;
      });
      const points = lights.filter(light => light.isPointLight);
      if (!points.length) throw new Error('No actual point-light slots in live scene');
      const originals = points.map(light => ({ color: light.color.clone(), intensity: light.intensity,
        position: light.position.clone(), distance: light.distance, decay: light.decay }));
      return { scene, camera, mesh, materialPair, points, originals, center, radius, source, geometry, attributeWitnesses, indexWitness,
        identity: { mesh: source.name, geometry: source.geometry.uuid, material: source.material.name,
          type: source.material.type, vertices: geometry.attributes.position.count, clearcoat: source.material.clearcoat ?? 0,
          worldRadius: radius,
          borrowedImmutableGpuGeometry: true,
          attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, a]) => [name,
            { id: a.id ?? null, count: a.count, version: (a.data || a).version, cpuBytes: (a.data || a).array?.byteLength ?? null }])),
          lightCounts: Object.fromEntries([...new Set(lights.map(l => l.type))].map(type => [type, lights.filter(l => l.type === type).length])),
          points: originals.map(l => ({ color: l.color.toArray(), intensity: l.intensity, cutoff: l.distance, decay: l.decay })),
          cameraReframed: true, sharedAuthoredTextures: true } };
    });
    result.fixtures = fixtures.map(f => f.identity);
    verifyGeometry = () => fixtures.every(f => f.source.geometry === f.geometry && f.mesh.geometry === f.geometry
      && Object.keys(f.geometry.attributes).length === Object.keys(f.attributeWitnesses).length
      && Object.entries(f.attributeWitnesses).every(([name, w]) => f.geometry.attributes[name] === w.attribute
        && (w.attribute.data || w.attribute).version === w.version)
      && (f.indexWitness ? f.geometry.index === f.indexWitness.attribute && f.geometry.index.version === f.indexWitness.version : !f.geometry.index));
    const lighting = (f, name) => { f.points.forEach((light, i) => {
      const original = f.originals[i]; light.color.copy(original.color); light.intensity = original.intensity;
      light.position.copy(original.position); light.distance = original.distance; light.decay = original.decay;
      if (name === 'zero') { light.intensity = i === 0 ? -0 : 0; }
      if (name === 'nonzero') {
        if (Math.max(light.color.r, light.color.g, light.color.b) === 0) light.color.setRGB(1, 0.5, 0.25);
        light.intensity = Math.max(1, original.intensity) * f.radius * f.radius;
        light.position.copy(f.center).addScaledVector(f.camera.position.clone().sub(f.center).normalize(), f.radius * 1.5);
        light.distance = Math.max(original.distance, f.radius * 8);
      }
    }); f.scene.updateMatrixWorld(true); };
    const draw = (f, arm, target, timed = false) => {
      const old = save(); let query, active = false;
      try {
        f.mesh.material = f.materialPair[arm]; renderer.setRenderTarget(target); renderer.setScissorTest(false);
        renderer.autoClear = false; renderer.setClearColor(0, 0); renderer.clear(true, true, false);
        if (timed) {
          if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) throw new Error('Nested GPU query refused');
          query = gl.createQuery(); queries.add(query); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); active = true;
        }
        const frame = renderer.info.render.frame;
        try { renderer.render(f.scene, f.camera); }
        finally { if (active) { gl.endQuery(ext.TIME_ELAPSED_EXT); active = false; } }
        if (renderer.info.render.frame <= frame || renderer.info.render.calls < 1) throw new Error('Private PBR draw was suppressed');
        return query;
      } finally { if (active) gl.endQuery(ext.TIME_ELAPSED_EXT); restore(old); }
    };
    const warm = async (f, arm, target) => {
      const old = save(); let compilation;
      try { f.mesh.material = f.materialPair[arm]; renderer.setRenderTarget(target); compilation = renderer.compileAsync(f.scene, f.camera); }
      finally { restore(old); }
      let timeout;
      try { await Promise.race([compilation, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('PBR variant link timed out')), 10000); })]); }
      finally { clearTimeout(timeout); }
      draw(f, arm, target); draw(f, arm, target); checkGl('PBR warm');
    };
    const drain = async pending => {
      gl.flush(); const deadline = performance.now() + 10000; const times = [];
      for (const query of pending) {
        while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
          checkTime(); if (performance.now() > deadline) throw new Error('GPU query timeout'); await new Promise(resolve => setTimeout(resolve, 10));
        }
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) throw new Error('GPU timer disjoint');
        times.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(query); queries.delete(query);
      }
      return times;
    };
    const readHdr = () => {
      const old = save();
      try {
        renderer.setRenderTarget(hdr);
        const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
        if (type !== gl.FLOAT && type !== gl.HALF_FLOAT) throw new Error(`Unsupported native HDR read type ${type}`);
        const buffer = type === gl.FLOAT ? new Float32Array(width * height * 4) : new Uint16Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, type, buffer); checkGl('native HDR readback');
        return type === gl.FLOAT ? buffer : Float32Array.from(buffer, THREE.DataUtils.fromHalfFloat);
      } finally { restore(old); }
    };
    const readBytes = () => { const bytes = new Uint8Array(width * height * 4); renderer.readRenderTargetPixels(rgba, 0, 0, width, height, bytes); checkGl('native RGBA8 readback'); return bytes; };
    const png = bytes => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'), image = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++) image.data.set(bytes.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
      // The PNG is a native linear RGBA8 diagnostic view; HDR comparison covers values above1.
      for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
      ctx.putImageData(image, 0, 0); const url = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0; return url;
    };
    const stats = rows => { const sorted = [...rows].sort((a, b) => a - b); return { count: rows.length,
      meanMs: rows.reduce((a, b) => a + b, 0) / rows.length, medianMs: (sorted[(rows.length - 1) >> 1] + sorted[rows.length >> 1]) / 2, maxMs: sorted.at(-1) }; };
    for (let fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex++) {
      const f = fixtures[fixtureIndex]; let zeroHdr;
      for (const name of ['actual', 'zero', 'nonzero']) {
        checkTime(); lighting(f, name);
        await warm(f, 0, hdr); await warm(f, 1, hdr);
        draw(f, 0, hdr); const a = readHdr();
        const program = renderer.properties.get(f.materialPair[0]).currentProgram?.program;
        const nativePointColors = program ? f.points.map((_, i) => {
          const location = gl.getUniformLocation(program, `pointLights[${i}].color`);
          return location ? Array.from(gl.getUniform(program, location)) : null;
        }) : null;
        draw(f, 1, hdr); const b = readHdr();
        let hdrMaxError = 0, hdrChangedChannels = 0, hdrMaxUlpError = 0, hdrExceededOneUlpChannels = 0;
        let nonfinite = 0, coveredPixels = 0, rgbMax = 0, minPositive = Infinity;
        for (let i = 0; i < a.length; i++) {
          if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) nonfinite++;
          if (i % 4 !== 3) { rgbMax = Math.max(rgbMax, a[i]); if (a[i] > 0) minPositive = Math.min(minPositive, a[i]); }
          const error = Math.abs(a[i] - b[i]); if (error > 0) hdrChangedChannels++; hdrMaxError = Math.max(hdrMaxError, error);
          const ulp = Math.max(2 ** -24, 2 ** (Math.floor(Math.log2(Math.abs(a[i]))) - 10));
          hdrMaxUlpError = Math.max(hdrMaxUlpError, error / ulp);
          if (error > ulp) hdrExceededOneUlpChannels++;
          if (i % 4 === 3 && (a[i - 3] > 0 || a[i - 2] > 0 || a[i - 1] > 0)) coveredPixels++;
        }
        if (coveredPixels < 100 || nonfinite) throw new Error(`Invalid native fixture: ${coveredPixels} nonblack pixels, ${nonfinite} nonfinite channels`);
        await warm(f, 0, rgba); const a8 = readBytes(); await warm(f, 1, rgba); const b8 = readBytes();
        let byteMaxError = 0, changedBytes = 0; const diff = new Uint8Array(a8.length);
        for (let i = 0; i < a8.length; i++) { const error = Math.abs(a8[i] - b8[i]); byteMaxError = Math.max(byteMaxError, error); changedBytes += Number(error > 0); diff[i] = i % 4 === 3 ? 255 : Math.min(255, error * 32); }
        result.fidelity.push({ fixtureIndex, name, coveredPixels, hdrMaxError, hdrChangedChannels,
          hdrMaxUlpError, hdrExceededOneUlpChannels, nonfinite,
          baselineHdrRange: { max: rgbMax, minPositive: Number.isFinite(minPositive) ? minPositive : null }, nativePointColors,
          byteMaxError, changedBytes, exactPass: hdrChangedChannels === 0 && changedBytes === 0,
          fidelityPass: nonfinite === 0 && hdrExceededOneUlpChannels === 0 && changedBytes === 0 });
        if (fixtureIndex === 0 && name !== 'zero') result.images[name] = { baseline: png(a8), guard: png(b8), diff32x: png(diff) };
        if (name === 'zero') zeroHdr = a;
        if (name === 'nonzero') {
          let maxVisibleLightDelta = 0;
          for (let i = 0; i < a.length; i++) if (i % 4 !== 3) maxVisibleLightDelta = Math.max(maxVisibleLightDelta, Math.abs(a[i] - zeroHdr[i]));
          if (!(maxVisibleLightDelta > 0)) throw new Error('Nonzero point lights did not illuminate the actual material fixture');
          f.identity.nonzeroLightHdrDelta = maxVisibleLightDelta;
        }
      }
    }
    // Verify the borrowed owner after the fidelity draws, including on a failed fidelity decision.
    result.geometryStable = verifyGeometry();
    if (!result.geometryStable) throw new Error('Borrowed authored geometry identity or attribute versions changed during the experiment');
    // Preserve strict metrics while accepting only the HDR target format's own rounding precision.
    result.exactFidelityPass = result.fidelity.every(entry => entry.exactPass);
    result.fidelityPass = result.fidelity.every(entry => entry.fidelityPass);
    if (!result.fidelityPass) throw new Error('Native RGBA8 or one-binary16-ULP HDR fidelity failed; timed queries were not started');
    const f = fixtures[0];
    for (const name of ['actual', 'zero', 'nonzero']) {
      lighting(f, name); await warm(f, 0, hdr); await warm(f, 1, hdr);
      const blocks = [];
      for (let block = 0; block < 4; block++) {
        const arm = [0, 1, 1, 0][block]; await warm(f, arm, hdr);
        const pending = []; for (let drawIndex = 0; drawIndex < 8; drawIndex++) pending.push(draw(f, arm, hdr, true));
        blocks.push({ arm: arm ? 'guard' : 'baseline', timesMs: await drain(pending) });
      }
      const baseline = stats(blocks.filter(b => b.arm === 'baseline').flatMap(b => b.timesMs));
      const guard = stats(blocks.filter(b => b.arm === 'guard').flatMap(b => b.timesMs));
      result.cases.push({ name, blocks, baseline, guard, meanGainPercent: (1 - guard.meanMs / baseline.meanMs) * 100 });
    }
    result.geometryStable = verifyGeometry();
    if (!result.geometryStable) throw new Error('Borrowed authored geometry identity or attribute versions changed during the experiment');
    result.issued = result.cases.reduce((n, c) => n + c.baseline.count + c.guard.count, 0);
    result.completedQueries = result.issued; result.exactFidelityPass = result.fidelity.every(f => f.exactPass);
    result.elapsedMs = performance.now() - started; result.completed = true;
  } catch (error) { result.completed = false; result.error = error.stack || String(error); }
  finally {
    if (verifyGeometry) result.geometryStable = verifyGeometry();
    for (const query of queries) gl.deleteQuery(query); queries.clear();
    for (const resource of resources.reverse()) resource.dispose();
    timers?.setEnabled(timersWereEnabled);
    result.cleanup = { ownedQueriesRemaining: queries.size, ownedResourcesDisposed: resources.length,
      gameTimersRestored: (timers?.enabled ?? false) === timersWereEnabled,
      shippedShaderChunkUnchanged: originalChunk == null || THREE.ShaderChunk.lights_physical_pars_fragment === originalChunk };
  }
  return result;
}

const payload = path.join(out, 'payload.js'); fs.writeFileSync(payload, `(${nativeLightAb.toString()})()\n`);
const childArgs = ['scripts/probe-main-thread-profile.mjs', `--label=${label}`, '--domain-profile=station',
  '--settle-ms=3000', '--travel-ms=25000', `--eval-file=${payload}`];
if (value('--baseline-source')) childArgs.push(`--baseline-source=${value('--baseline-source')}`);
console.log(`Diagnostic command: ${process.execPath} ${childArgs.join(' ')}`);
const child = spawn(process.execPath, childArgs, { cwd: root, env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' }, stdio: 'inherit', windowsHide: true });
console.log(`Owned launcher PID: ${child.pid}`);
const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); });
const resultPath = path.join(out, 'eval-result.json');
if (!fs.existsSync(resultPath)) process.exit(exitCode || 1);
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8')), images = result.images || {}; result.images = {};
for (const [name, arms] of Object.entries(images)) {
  result.images[name] = {};
  for (const [arm, url] of Object.entries(arms)) {
    const filename = `${name}-${arm}.png`; fs.writeFileSync(path.join(out, filename), Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64')); result.images[name][arm] = filename;
  }
}
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
const summary = { output: out, completed: result.completed, fidelityPolicy: result.fidelityPolicy,
  exactFidelityPass: result.exactFidelityPass, fidelityPass: result.fidelityPass, geometryStable: result.geometryStable,
  issued: result.issued, completedQueries: result.completedQueries, cases: result.cases.map(({ name, baseline, guard, meanGainPercent }) => ({ name, baseline, guard, meanGainPercent })),
  fidelity: result.fidelity, fixtures: result.fixtures, cleanup: result.cleanup, error: result.error };
fs.writeFileSync(path.join(out, 'report.md'), `# Native zero-radiance PBR material experiment\n\nDiagnostic only; no whole-game FPS claim or production change.\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
console.log(JSON.stringify(summary, null, 2)); process.exitCode = exitCode || (result.completed ? 0 : 1);
