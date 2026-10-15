// Serialized by addInitScript only for MOBILE_PROBE_DRAW_ERRORS=1. This is an
// attribution run, never a frame-time measurement. No production code is changed.
export function installMobileDrawErrorObserver({ maxWitnesses = 8 } = {}) {
  if (globalThis.__SF_MOBILE_DRAW_ERRORS__) return;
  const limit = Math.max(1, Math.min(8, Math.floor(maxWitnesses) || 8));
  const rows = [], notes = [], wrappers = [], seen = new Set();
  const renderers = new WeakSet(), contexts = new WeakSet(), identities = new WeakMap();
  let nextId = 0, current = null, recording = true, stopped = false;
  let renderersObserved = 0, checkedDraws = 0, invalidDraws = 0, priorErrors = 0;
  const text = v => typeof v === 'string' ? v.slice(0, 240) : null;
  const number = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const scalar = v => text(v) ?? number(v);
  const identity = v => {
    if (!v || (typeof v !== 'object' && typeof v !== 'function')) return scalar(v);
    if (!identities.has(v)) identities.set(v, ++nextId);
    return identities.get(v);
  };
  const note = error => { if (notes.length < 8) notes.push(String(error?.message || error).slice(0, 300)); };
  function replace(object, key, wrapped) {
    const original = object[key];
    try {
      object[key] = wrapped;
      if (object[key] !== wrapped) throw new Error(`cannot observe ${key}`);
      wrappers.push({ object, key, original, wrapped });
      return true;
    } catch (error) { note(error); return false; }
  }
  function errors(gl) {
    const found = [];
    try {
      for (let i = 0; i < 8; i++) {
        const code = gl.getError();
        if (code === gl.NO_ERROR) break;
        found.push(code);
        if (code === gl.CONTEXT_LOST_WEBGL) break;
      }
    } catch (error) { note(error); }
    return found;
  }
  function attribute(a) {
    if (!a) return null;
    const record = a.isInterleavedBufferAttribute ? a.data : a;
    return { count: number(a.count), itemSize: number(a.itemSize), version: number(record?.version),
      bytes: number(record?.array?.byteLength), arrayType: text(record?.array?.constructor?.name),
      stride: number(record?.stride), offset: number(a.offset), normalized: a.normalized === true };
  }
  function witness(gl, method, args, codes, before) {
    const { renderer, geometry, material, object, group } = current;
    const key = [identity(renderer), identity(geometry), identity(material), identity(object), method].join(':');
    if (seen.has(key)) return;
    seen.add(key);
    const parents = [], visited = new Set();
    for (let node = object; node && parents.length < 8 && !visited.has(node); node = node.parent) {
      visited.add(node);
      const data = node.userData || {}, pkg = data.spacefaceRenderPackage || data.spacefaceFlightRenderPackage;
      parents.push({ name: text(node.name), type: text(node.type), uuid: text(node.uuid),
        entityId: scalar(data.presentationEntityId ?? data.sfBoundEntityId ?? data.entityId ?? data.sfEntityId),
        assetId: text(pkg?.assetId), contentHash: text(pkg?.contentHash), templatePath: text(data.spacefaceFlightTemplatePath) });
    }
    const mark = geometry?.userData?.spacefaceCpuDetach;
    let program = null;
    try { program = identity(gl.getParameter(gl.CURRENT_PROGRAM)); } catch (error) { note(error); }
    rows.push({ at: typeof performance !== 'undefined' ? number(performance.now()) : null,
      renderer: identity(renderer), canvasId: text(renderer.domElement?.id),
      method, args: Array.from(args, number), errors: codes, preDrawErrors: before, program,
      object: parents[0] || null, parents,
      geometry: { uuid: text(geometry?.uuid), name: text(geometry?.name),
        detach: mark ? { kind: text(mark.kind), contentHash: text(mark.contentHash), ordinal: number(mark.ordinal) } : null,
        drawRange: { start: number(geometry?.drawRange?.start), count: number(geometry?.drawRange?.count) },
        index: attribute(geometry?.index),
        attributes: Object.fromEntries(Object.entries(geometry?.attributes || {}).slice(0, 16)
          .map(([name, value]) => [name, attribute(value)])) },
      material: { uuid: text(material?.uuid), name: text(material?.name), type: text(material?.type) },
      group: group ? { start: number(group.start), count: number(group.count), materialIndex: number(group.materialIndex) } : null });
  }
  function observe(event) {
    const renderer = event?.detail;
    if (stopped || renderer?.isWebGLRenderer !== true || renderers.has(renderer)) return;
    try {
      const gl = renderer.getContext();
      if (!gl || typeof gl.getError !== 'function' || typeof renderer.renderBufferDirect !== 'function') return;
      const inner = renderer.renderBufferDirect;
      if (!replace(renderer, 'renderBufferDirect', function (camera, scene, geometry, material, object, group) {
        const previous = current;
        current = { renderer, geometry, material, object, group };
        try { return Reflect.apply(inner, this, arguments); }
        finally { current = previous; }
      })) return;
      renderers.add(renderer);
      renderersObserved++;
      if (contexts.has(gl)) return;
      contexts.add(gl);
      for (const method of ['drawElements', 'drawElementsInstanced', 'drawRangeElements']) {
        const draw = gl[method];
        if (typeof draw !== 'function') continue;
        replace(gl, method, function () {
          if (!recording || stopped || !current) return Reflect.apply(draw, this, arguments);
          checkedDraws++;
          // Do not attribute an earlier upload/state error to this actual draw.
          const before = errors(gl);
          priorErrors += before.length;
          const result = Reflect.apply(draw, this, arguments);
          const after = errors(gl);
          if (after.includes(gl.INVALID_OPERATION)) {
            invalidDraws++;
            try { witness(gl, method, arguments, after, before); } catch (error) { note(error); }
            if (rows.length >= limit || invalidDraws >= 32) recording = false;
          }
          return result;
        });
      }
    } catch (error) { note(error); }
  }
  const target = globalThis.__THREE_DEVTOOLS__ || new EventTarget();
  if (!globalThis.__THREE_DEVTOOLS__) globalThis.__THREE_DEVTOOLS__ = target;
  const supported = typeof target.addEventListener === 'function';
  if (supported) target.addEventListener('observe', observe);
  else note('existing Three devtools target does not support observation');
  globalThis.__SF_MOBILE_DRAW_ERRORS__ = {
    snapshot: () => ({ hook: 'three-devtools-observe', supported, available: renderersObserved > 0,
      reason: renderersObserved ? null : supported ? 'no-renderer-observed' : 'three-observer-unavailable',
      renderersObserved, checkedDraws,
      invalidDraws, priorErrors, captureStopped: !recording, stopped, notes: notes.slice(),
      witnesses: JSON.parse(JSON.stringify(rows)) }),
    stop() {
      stopped = true;
      if (supported) target.removeEventListener('observe', observe);
      for (const row of wrappers) if (row.object[row.key] === row.wrapped) row.object[row.key] = row.original;
    },
  };
}
