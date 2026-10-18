// Observe real Three.js submissions without changing entity callbacks or transforms.
function installInPage({ maxSamples }) {
  const KEY = '__SF_DRAW_MOTION__';
  if (globalThis[KEY]?.active) return { installed: false, alreadyInstalled: true };
  const raf = [], draw = [], seen = new Map();
  const stats = { rafFrames: 0, drawSamples: 0, maxRafGapMs: 0, samplingErrors: 0, batchedDraws: 0 };
  let active = true, request = 0, renderer = null, original = null, wrapped = null, lastRaf = null;
  const vec = p => p ? [p.x, p.y ?? 0, p.z] : null;
  const world = o => o?.matrixWorld ? [o.matrixWorld.elements[12], o.matrixWorld.elements[13], o.matrixWorld.elements[14]] : null;
  const bounded = (array, row) => { if (array.length >= maxSamples) array.splice(0, maxSamples >> 1); array.push(row); };
  const owner = () => globalThis.SF?.registry?.get?.('render');
  const state = () => globalThis.SF?.state;
  const speed = e => Math.hypot(e?.vel?.x || 0, e?.vel?.z || 0);
  const target = s => s?.player?.tether?.active ? s.player.tether.targetId : null;
  const root = (s, id) => owner()?._meshes?.get(id) || s?.entities?.get(id)?.mesh || null;
  const under = (o, r) => { for (let n = o; n; n = n.parent) if (n === r) return true; return false; };
  function restore() {
    if (renderer && renderer.renderBufferDirect === wrapped) renderer.renderBufferDirect = original;
    renderer = original = wrapped = null;
  }
  function hook(next) {
    if (!next || next === renderer || typeof next.renderBufferDirect !== 'function') return;
    restore(); renderer = next; original = next.renderBufferDirect;
    wrapped = function(camera, scene, geometry, material, object, group) {
      // The original owns every early return, side effect, and exception.
      const result = Reflect.apply(original, this, arguments);
      if (!active || !scene || !object) return result;
      try {
        const s = state(), o = owner();
        if (!s || scene !== o?.scene) return result;
        if (object.isBatchedMesh) stats.batchedDraws++;
        const available = geometry?.index?.count ?? geometry?.attributes?.position?.count ?? 0;
        const count = Math.min(available, geometry?.drawRange?.count ?? Infinity, group?.count ?? Infinity);
        if (!(count > 0)) return result;
        for (const [kind, id] of [['player', s.playerId], ['tether', target(s)]]) {
          if (id == null) continue;
          const r = root(s, id);
          if (!r || !under(object, r)) continue;
          const key = kind + ':' + id;
          if (seen.get(key) === stats.rafFrames) continue;
          seen.set(key, stats.rafFrames);
          const e = s.entities.get(id), fence = o._snapshotFence;
          bounded(draw, { kind, id: String(id), t: performance.now(), raf: stats.rafFrames,
            f: renderer.info?.render?.frame, tick: s.tick, sim: s.simTime, ts: s.timeScale,
            mode: s.mode, mesh: object.name, pos: vec(e?.pos), rpos: vec(r.position),
            vel: vec(e?.vel), spd: speed(e), rw: world(r), mw: world(object), cw: world(camera),
            sample: { time: fence?.latestSnapshot()?.simTime, prior: fence?.previousSnapshot()?.simTime,
              sequence: fence?.sequence, alpha: o._snapshotPresentationAlpha,
              origin: { x: s.frameOrigin?.x, z: s.frameOrigin?.z } } });
          stats.drawSamples++;
        }
      } catch (_) { stats.samplingErrors++; }
      return result;
    };
    renderer.renderBufferDirect = wrapped;
  }
  function frame(t) {
    if (!active) return;
    request = requestAnimationFrame(frame);
    stats.rafFrames++;
    if (lastRaf != null) stats.maxRafGapMs = Math.max(stats.maxRafGapMs, t - lastRaf);
    lastRaf = t;
    const s = state(), o = owner();
    hook(o?.renderer || s?.render?.renderer);
    if (!s) return;
    const e = s.entities?.get(s.playerId), r = root(s, s.playerId), tid = target(s);
    bounded(raf, { n: stats.rafFrames, t, tick: s.tick, sim: s.simTime, ts: s.timeScale,
      mode: s.mode, pos: vec(e?.pos), rpos: vec(r?.position), vel: vec(e?.vel),
      spd: speed(e), tid: tid == null ? null : String(tid), trpos: vec(root(s, tid)?.position) });
  }
  globalThis[KEY] = {
    get active() { return active; },
    snapshot() { return { raf: raf.slice(), draw: draw.slice(), stats: { ...stats } }; },
    dispose() { active = false; cancelAnimationFrame(request); restore(); return { ...stats }; }
  };
  request = requestAnimationFrame(frame);
  return { installed: true };
}
export function installWorldMotionObserver(page, { maxSamples = 20000 } = {}) {
  return page.evaluate(installInPage, { maxSamples: Math.max(64, Math.min(50000, maxSamples)) });
}
export function readWorldMotionObserver(page) {
  return page.evaluate(() => globalThis.__SF_DRAW_MOTION__?.snapshot() || null);
}
export function disposeWorldMotionObserver(page) {
  return page.evaluate(() => globalThis.__SF_DRAW_MOTION__?.dispose() || null);
}
