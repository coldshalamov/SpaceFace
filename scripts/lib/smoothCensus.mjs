// Draw census for the smoothness referee (scripts/probe-smooth-electron.mjs --census).
//
// In a short tail window after the judged one (wrapping the renderer distorts timing, so it never
// runs while frames are being judged) this counts, per presented world frame:
//   - every WebGL call by name (how many uniform uploads, buffer uploads, program and texture binds),
//   - every draw the scene makes: who owns it (the named ancestor under the scene), its material,
//     program, geometry, triangles and instance count, and how often the material or the program
//     changes between consecutive draws (each material change re-uploads that material's uniforms),
//   - the scene graph itself: nodes, visible nodes, meshes, nodes that recompute their matrix.
// The two functions below run inside the page.

export function installSmoothCensus() {
  const S = window.SF.state;
  const r = S.render.renderer;
  const gl = r.getContext();
  const C = { gl: {}, glOrig: {}, draws: [], frames: 0, startPres: (S.render.worldSubmittedFrames | 0), on: true, glRef: gl, rRef: r };
  window.__smCensus = C;
  const names = ['useProgram', 'bindTexture', 'activeTexture', 'bindVertexArray', 'bindBuffer', 'bindFramebuffer', 'bufferSubData', 'bufferData', 'texImage2D', 'texSubImage2D',
    'uniform1f', 'uniform1i', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv', 'uniformMatrix3fv', 'uniformMatrix4fv', 'uniform1iv',
    'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'enable', 'disable', 'blendFunc', 'blendFuncSeparate', 'blendEquation', 'blendEquationSeparate',
    'depthMask', 'depthFunc', 'cullFace', 'frontFace', 'colorMask', 'viewport', 'scissor', 'clear', 'stencilFunc', 'stencilOp', 'stencilMask', 'polygonOffset', 'lineWidth',
    'getParameter', 'getError', 'getProgramParameter', 'getShaderParameter', 'getUniformLocation', 'getAttribLocation', 'getExtension', 'readPixels', 'clientWaitSync', 'fenceSync', 'finish', 'flush',
    'blitFramebuffer', 'invalidateFramebuffer', 'drawBuffers', 'bindBufferBase', 'bindBufferRange', 'generateMipmap', 'createProgram', 'linkProgram', 'compileShader', 'vertexAttribPointer', 'enableVertexAttribArray', 'vertexAttribDivisor'];
  for (const n of names) {
    const fn = gl[n];
    if (typeof fn !== 'function') continue;
    C.glOrig[n] = Object.prototype.hasOwnProperty.call(gl, n) ? fn : null;
    let bytes = 0;
    gl[n] = n === 'bufferSubData' || n === 'bufferData'
      ? function (target, a, b, srcOffset, length) {
        C.gl[n] = (C.gl[n] || 0) + 1;
        const d = n === 'bufferSubData' ? b : a;
        // The ranged form passes the whole array plus an element offset and count: count what is sent.
        const per = (d && d.BYTES_PER_ELEMENT) || 1;
        if (n === 'bufferSubData' && d && d.byteLength) bytes = length > 0 ? length * per : d.byteLength - (srcOffset > 0 ? srcOffset * per : 0);
        else bytes = d && d.byteLength ? d.byteLength : 0;
        C.gl[`${n}Bytes`] = (C.gl[`${n}Bytes`] || 0) + bytes;
        return fn.apply(this, arguments);
      }
      : function () { C.gl[n] = (C.gl[n] || 0) + 1; return fn.apply(this, arguments); };
  }
  const ownerOf = (object) => {
    // The nearest ancestor that names what this is: an entity view, a set piece, a pool.
    let o = object; let best = ''; let depth = 0;
    while (o && depth < 40) {
      const ud = o.userData || {};
      const tag = ud.entityType || ud.kind || ud.sfKind || ud.hullId || ud.assetId || ud.packageId || '';
      if (o.parent && o.parent.isScene) { best = `${o.name || o.type}${tag ? `<${tag}>` : ''}`; break; }
      if (!best && (o.name || tag)) best = `${o.name || o.type}${tag ? `<${tag}>` : ''}`;
      o = o.parent; depth++;
    }
    return best || (object && object.type) || '?';
  };
  const rootOf = (object) => { let o = object; let d = 0; while (o && o.parent && !o.parent.isScene && d < 60) { o = o.parent; d++; } return o ? (o.name || o.type) : '?'; };
  // Who uploads vertex data: three.js calls attribute.onUploadCallback() right after each upload,
  // so the bytes sent since the previous callback belong to that attribute. Attributes are mapped
  // to the drawable that owns their geometry by one walk of the scene.
  C.uploads = new Map(); C.uploadMark = 0; C.attrOwner = new Map(); C.protoOrig = [];
  const mapOwners = () => {
    const scenes = new Set([S.render.scene]);
    for (const sc of scenes) {
      if (!sc || !sc.traverse) continue;
      sc.traverse((o) => {
        const g = o.geometry; if (!g || !g.attributes) return;
        const label = `${rootOf(o)} > ${ownerOf(o)}`;
        const note = (a, name) => { if (!a) return; const key = a.isInterleavedBufferAttribute ? a.data : a; if (!C.attrOwner.has(key)) C.attrOwner.set(key, `${label} :: ${name}${a.isInterleavedBufferAttribute ? ' (interleaved)' : ''} [${(key.array && key.array.byteLength) || 0} B buffer]`); };
        for (const [name, a] of Object.entries(g.attributes)) note(a, name);
        note(g.index, 'index');
        if (o.isInstancedMesh) { note(o.instanceMatrix, 'instanceMatrix'); note(o.instanceColor, 'instanceColor'); }
      });
    }
  };
  C.mapOwners = mapOwners;
  const bytesNow = () => (C.gl.bufferSubDataBytes || 0) + (C.gl.bufferDataBytes || 0);
  const patchProto = (sample) => {
    let p = sample ? Object.getPrototypeOf(sample) : null;
    while (p && p !== Object.prototype) {
      if (Object.prototype.hasOwnProperty.call(p, 'onUploadCallback') && !C.protoOrig.some((x) => x.p === p)) {
        const orig = p.onUploadCallback;
        C.protoOrig.push({ p, orig });
        p.onUploadCallback = function () {
          const now = bytesNow(); const sent = now - C.uploadMark; C.uploadMark = now;
          let who = C.attrOwner.get(this);
          if (!who) { mapOwners(); who = C.attrOwner.get(this) || `(not in the scene) [${(this.array && this.array.byteLength) || 0} B buffer]`; }
          const o = C.uploads.get(who) || { n: 0, bytes: 0 }; o.n++; o.bytes += sent; C.uploads.set(who, o);
          return orig.apply(this, arguments);
        };
      }
      p = Object.getPrototypeOf(p);
    }
  };
  try {
    mapOwners();
    let plain = null; let inter = null;
    for (const key of C.attrOwner.keys()) { if (key.isInterleavedBuffer) inter = inter || key; else plain = plain || key; if (plain && inter) break; }
    patchProto(plain); patchProto(inter);
    C.uploadMark = bytesNow();
  } catch (_) { /* census only */ }
  C.rbdOrig = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (C.on && C.draws.length < 40000) {
      let tris = 0;
      try {
        const idx = geometry.index; const pos = geometry.attributes && geometry.attributes.position;
        const dr = geometry.drawRange || { start: 0, count: Infinity };
        const count = Math.min(dr.count, idx ? idx.count : pos ? pos.count : 0);
        const inst = object.isInstancedMesh ? object.count : geometry.isInstancedBufferGeometry ? (geometry.instanceCount === Infinity ? (geometry._maxInstanceCount || 1) : geometry.instanceCount) : 1;
        tris = Math.round((object.isMesh ? count / 3 : object.isLine ? count / 2 : count) * Math.max(0, inst));
      } catch (_) { /* census only */ }
      const prog = r.properties && r.properties.get ? r.properties.get(material) : null;
      C.draws.push({ f: (S.render.worldSubmittedFrames | 0), root: rootOf(object), owner: ownerOf(object), obj: object.name || object.type, mat: material.id, matType: material.type, matName: material.name || '', matVer: material.version,
        par: (object.parent && (object.parent.name || object.parent.type)) || '', rootId: (() => { let o = object; let d = 0; while (o && o.parent && !o.parent.isScene && d < 60) { o = o.parent; d++; } return o ? o.id : 0; })(), mau: object.matrixAutoUpdate === true,
        prog: prog && prog.currentProgram ? prog.currentProgram.id : -1, geo: geometry.id, tris, inst: object.isInstancedMesh ? object.count : 0, transparent: material.transparent === true,
        target: (r.getRenderTarget && r.getRenderTarget()) ? (r.getRenderTarget().texture && r.getRenderTarget().texture.name) || 'target' : 'screen', scene: scene && (scene.name || scene.type) });
    }
    return C.rbdOrig.apply(this, arguments);
  };
  return true;
}

export function collectSmoothCensus() {
  const C = window.__smCensus; if (!C) return null;
  const S = window.SF.state;
  C.on = false;
  for (const [n, f] of Object.entries(C.glOrig)) { if (f) C.glRef[n] = f; else delete C.glRef[n]; }
  C.rRef.renderBufferDirect = C.rbdOrig;
  for (const { p, orig } of C.protoOrig || []) p.onUploadCallback = orig;
  const frames = Math.max(1, (S.render.worldSubmittedFrames | 0) - C.startPres);
  const per = (v) => +(v / frames).toFixed(1);
  const out = { frames, gl: {}, drawsPerFrame: per(C.draws.length) };
  for (const [k, v] of Object.entries(C.gl).sort((a, b) => b[1] - a[1])) out.gl[k] = per(v);
  let uniforms = 0; for (const [k, v] of Object.entries(C.gl)) if (/^uniform/.test(k)) uniforms += v;
  out.uniformCallsPerFrame = per(uniforms);
  // changes between consecutive draws
  let matChanges = 0; let progChanges = 0; let geoChanges = 0;
  for (let i = 1; i < C.draws.length; i++) { const a = C.draws[i - 1]; const b = C.draws[i]; if (a.f !== b.f) continue; if (a.mat !== b.mat) matChanges++; if (a.prog !== b.prog) progChanges++; if (a.geo !== b.geo) geoChanges++; }
  out.materialChangesPerFrame = per(matChanges); out.programChangesPerFrame = per(progChanges); out.geometryChangesPerFrame = per(geoChanges);
  out.distinct = { materials: new Set(C.draws.map((d) => d.mat)).size, programs: new Set(C.draws.map((d) => d.prog)).size, geometries: new Set(C.draws.map((d) => d.geo)).size };
  const group = (keyFn, top) => {
    const m = new Map();
    for (const d of C.draws) {
      const k = keyFn(d); let o = m.get(k);
      if (!o) m.set(k, o = { draws: 0, tris: 0, mats: new Set(), progs: new Set(), geos: new Set(), inst: 0 });
      o.draws++; o.tris += d.tris; o.mats.add(d.mat); o.progs.add(d.prog); o.geos.add(d.geo); if (d.inst) o.inst++;
    }
    return [...m.entries()].sort((a, b) => b[1].draws - a[1].draws).slice(0, top).map(([k, o]) => ({ key: k, drawsPerFrame: per(o.draws), trisPerFrame: Math.round(o.tris / frames), materials: o.mats.size, programs: o.progs.size, geometries: o.geos.size, instancedDrawsPerFrame: per(o.inst) }));
  };
  out.uploads = [...(C.uploads || new Map()).entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 40)
    .map(([who, o]) => ({ who, uploadsPerFrame: per(o.n), kbPerFrame: +(o.bytes / frames / 1024).toFixed(1) }));
  out.byTarget = group((d) => `${d.target} / ${d.scene}`, 12);
  out.byRoot = group((d) => d.root, 40);
  out.byOwner = group((d) => `${d.root} > ${d.owner}`, 60);
  out.byMaterial = group((d) => `${d.matType} "${d.matName}"${d.transparent ? ' (transparent)' : ''}`, 40);
  out.byProgram = group((d) => `program ${d.prog}`, 25);
  // The busiest owners, draw by draw (one representative root of each kind): what a merge would join.
  out.detail = [];
  for (const row of out.byRoot.slice(0, 7)) {
    const mine = C.draws.filter((d) => d.root === row.key);
    const firstRoot = mine.length ? mine[0].rootId : 0;
    const lastF = mine.length ? mine[mine.length - 1].f : 0;
    const one = mine.filter((d) => d.rootId === firstRoot && d.f === lastF);
    out.detail.push({ root: row.key, instancesInWindow: new Set(mine.map((d) => d.rootId)).size, drawsInOne: one.length,
      draws: one.map((d) => ({ obj: d.obj, parent: d.par, mat: `${d.matType} "${d.matName}"#${d.mat}`, prog: d.prog, geo: d.geo, tris: d.tris, moves: d.mau })) });
  }
  // Materials whose version moves between frames: each bump makes three.js rebuild the program key.
  const verSeen = new Map(); const bumps = new Map();
  for (const d of C.draws) {
    const prev = verSeen.get(d.mat);
    if (prev !== undefined && prev !== d.matVer) { const k = `${d.matType} "${d.matName}" on ${d.root}`; bumps.set(k, (bumps.get(k) || 0) + 1); }
    verSeen.set(d.mat, d.matVer);
  }
  out.materialVersionBumps = [...bumps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => ({ what: k, perFrame: per(n) }));
  // scene graph
  const scene = S.render && S.render.scene;
  const c = { nodes: 0, visibleNodes: 0, meshes: 0, visibleDrawables: 0, instanced: 0, autoMatrix: 0, visibleAutoMatrix: 0, frustumCulledOff: 0, lights: 0, onBeforeRender: 0 };
  if (scene) {
    const noop = Object.getPrototypeOf(scene).onBeforeRender;
    scene.traverse((o) => { c.nodes++; if (o.matrixAutoUpdate) c.autoMatrix++; if (o.isLight) c.lights++; if (o.isMesh) c.meshes++; });
    scene.traverseVisible((o) => {
      c.visibleNodes++; if (o.matrixAutoUpdate) c.visibleAutoMatrix++;
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      c.visibleDrawables++; if (o.isInstancedMesh) c.instanced++; if (o.frustumCulled === false) c.frustumCulledOff++; if (o.onBeforeRender !== noop) c.onBeforeRender++;
    });
    c.topLevel = scene.children.length;
    c.biggestSubtrees = scene.children.map((ch) => { let n = 0; let v = 0; ch.traverse(() => { n++; }); if (ch.visible) ch.traverseVisible(() => { v++; }); return { name: ch.name || ch.type, nodes: n, visibleNodes: v }; })
      .sort((a, b) => b.visibleNodes - a.visibleNodes).slice(0, 25);
  }
  out.scene = c;
  const info = C.rRef.info;
  out.three = info ? { programs: info.programs ? info.programs.length : null, geometries: info.memory.geometries, textures: info.memory.textures } : null;
  window.__smCensus = null;
  return out;
}

export function formatSmoothCensus(c, { title = '' } = {}) {
  if (!c) return 'CENSUS NOT MADE\n';
  const L = [`DRAW CENSUS${title ? `: ${title}` : ''}`, `per presented world frame, over ${c.frames} frames in a tail window (the wrappers distort timing; counts only)`, ''];
  L.push(`draws ${c.drawsPerFrame}; material changes between consecutive draws ${c.materialChangesPerFrame}; program changes ${c.programChangesPerFrame}; geometry changes ${c.geometryChangesPerFrame}`);
  L.push(`distinct in the window: ${c.distinct.materials} materials, ${c.distinct.programs} programs, ${c.distinct.geometries} geometries; three.js holds ${c.three ? `${c.three.programs} programs, ${c.three.geometries} geometries, ${c.three.textures} textures` : '?'}`);
  L.push(`uniform calls ${c.uniformCallsPerFrame}`);
  L.push('');
  L.push('WEBGL CALLS PER FRAME');
  L.push(Object.entries(c.gl).filter(([, v]) => v >= 0.1).map(([k, v]) => `${k} ${v}`).join(', '));
  const s = c.scene;
  L.push('');
  L.push(`SCENE GRAPH: ${s.nodes} nodes (${s.visibleNodes} visible), ${s.meshes} meshes, ${s.visibleDrawables} visible drawables (${s.instanced} instanced, ${s.frustumCulledOff} never culled, ${s.onBeforeRender} with a per-draw hook), ${s.autoMatrix} nodes recompute their matrix every frame (${s.visibleAutoMatrix} of them visible), ${s.lights} lights, ${s.topLevel} top-level children`);
  L.push('largest visible subtrees: ' + (s.biggestSubtrees || []).slice(0, 14).map((t) => `${t.name} ${t.visibleNodes}/${t.nodes}`).join(', '));
  const table = (name, rows) => {
    L.push(''); L.push(name);
    L.push(`${'draws'.padStart(7)}${'tris'.padStart(9)}${'mats'.padStart(6)}${'progs'.padStart(6)}${'geos'.padStart(6)}${'inst'.padStart(6)}  what`);
    for (const r of rows) L.push(`${String(r.drawsPerFrame).padStart(7)}${String(r.trisPerFrame).padStart(9)}${String(r.materials).padStart(6)}${String(r.programs).padStart(6)}${String(r.geometries).padStart(6)}${String(r.instancedDrawsPerFrame).padStart(6)}  ${r.key}`);
  };
  L.push(''); L.push('VERTEX DATA UPLOADS PER FRAME, by owner (kB, uploads, who :: attribute [size of the whole buffer])');
  for (const u of c.uploads || []) L.push(`${String(u.kbPerFrame).padStart(9)}${String(u.uploadsPerFrame).padStart(7)}  ${u.who}`);
  table('BY RENDER TARGET / SCENE', c.byTarget);
  table('BY TOP-LEVEL SCENE CHILD', c.byRoot);
  table('BY OWNER', c.byOwner);
  table('BY MATERIAL', c.byMaterial);
  table('BY PROGRAM', c.byProgram);
  L.push(''); L.push('MATERIALS RECOMPILED-OR-REKEYED (version moved between frames), per frame');
  for (const b of c.materialVersionBumps || []) L.push(`${String(b.perFrame).padStart(7)}  ${b.what}`);
  for (const d of c.detail || []) {
    L.push(''); L.push(`ONE ${d.root}: ${d.drawsInOne} draws in one frame (${d.instancesInWindow} such roots seen)`);
    L.push(`${'tris'.padStart(7)}${'prog'.padStart(6)}${'geo'.padStart(7)}  moves  object < parent :: material`);
    for (const x of d.draws.slice(0, 60)) L.push(`${String(x.tris).padStart(7)}${String(x.prog).padStart(6)}${String(x.geo).padStart(7)}  ${x.moves ? 'yes  ' : 'no   '}  ${x.obj} < ${x.parent} :: ${x.mat}`);
  }
  return `${L.join('\n')}\n`;
}
