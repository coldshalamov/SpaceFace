import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const CHARON_VFX_ISOLATION_LABEL = 'Temporary VFX ownership isolation; diagnostic only, never visual readiness or acceptance.';

// Runs only inside the already-open diagnostic page. The token fences late begin calls after
// a timed-out host request. It never changes gameplay, camera, renderer settings or admission.
export function charonVfxIsolationPageOperation({ action, token, deadline, observationDeadline }) {
  const key = Symbol.for('spaceface.charonVfxIsolationDiagnostic');
  const render = window.SF?.state?.render;
  const api = render?.perfVfxIsolation;
  const count = () => Number.isFinite(render?.presentCount) ? render.presentCount : null;
  const existing = window[key];
  // Read only the two propulsion owners implicated by the relocation hypothesis. Never call
  // update/rebuild/reset, walk the scene, or copy buffers. Failure cannot interrupt cleanup.
  const propulsion = () => {
    const limits = { playerTrails: 4, npcTrails: 8, samplesPerTrail: 384,
      verticesPerNpc: 256, lagStations: 128, snapshotAsciiBytes: 12000, observationMs: 5 };
    const until = Math.min(Number.isFinite(observationDeadline) ? observationDeadline : deadline,
      Date.now() + limits.observationMs);
    const f = n => Number.isFinite(n) ? n : null;
    const id = v => typeof v === 'number' ? f(v) : typeof v === 'string'
      ? v.slice(0, 64).replace(/[^\x20-\x7e]/g, '?') : null;
    const xyz = p => p ? { x: f(p.x), y: f(p.y), z: f(p.z) } : null;
    const draw = mesh => ({ visible: mesh?.visible === true,
      start: f(mesh?.geometry?.drawRange?.start), count: f(mesh?.geometry?.drawRange?.count) });
    const bounds = (array, stride, n) => {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      let read = 0;
      for (let i = 0; i < n && Date.now() < until; i++) {
        const k = i * stride;
        if (![array?.[k], array?.[k+1], array?.[k+2]].every(Number.isFinite)) continue;
        for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], array[k+j]); max[j] = Math.max(max[j], array[k+j]); }
        read++;
      }
      return { read, requested: n, min: min.map(f), max: max.map(f) };
    };
    try {
      if (!(Date.now() < until)) return { status: 'deadline-exhausted', limits };
      const owner = window.SF?.registry?.get?.('vfx');
      if (!owner) return { status: 'owner-unavailable', limits };
      const stream = owner._energy?.plasmaStream;
      const result = { status: 'observed', evidence: 'CPU owner descriptors only; not GPU pixels or emitter attribution',
        coordinateSpace: 'render-frame-local world units; not galactic-global', limits,
        frameOrigin: { coordinateSpace: 'galactic-global world units',
          x: f(window.SF?.state?.world?.frameOrigin?.x), z: f(window.SF?.state?.world?.frameOrigin?.z),
          sequence: f(window.SF?.state?.world?.frameOriginSeq) },
        camera: xyz(render?.cameraCtrl?.obj?.position), playerId: id(window.SF?.state?.playerId),
        player: stream ? { owner: 'player-plasma-stream', rootVisible: stream.group?.visible === true,
          nozzle: { x: f(stream._prevNx), z: f(stream._prevNz), valid: stream._hasNozzle === true },
          jet: draw(stream._ribbons?.mesh), lag: bounds(stream._centerData, 4,
            Math.min(limits.lagStations, Math.max(0, stream._centerCount | 0))), trails: [] } : null,
        npc: [], npcOwnerCount: f(owner._ribbonTrails?.size) };
      for (let i = 0; stream && i < Math.min(limits.playerTrails, stream._trails?.length || 0) && Date.now() < until; i++) {
        const trail = stream._trails[i];
        const capacity = Math.max(0, trail?.samples | 0);
        const live = Math.min(limits.samplesPerTrail, capacity, Math.max(0, trail?._live | 0));
        let read = 0, breaks = 0, maxSameSegmentWU = 0, maxCrossSegmentWU = 0, prior = null;
        for (let j = 0; j < live && Date.now() < until; j++) {
          const k = (((trail._head | 0) + j) % capacity + capacity) % capacity * 4;
          const p = [trail._path?.[k], trail._path?.[k+1], trail._path?.[k+2], trail._state?.[k+3]];
          if (!p.every(Number.isFinite)) { prior = null; continue; }
          if (prior) {
            const d = Math.hypot(p[0]-prior[0], p[1]-prior[1], p[2]-prior[2]);
            if (Math.abs(p[3]-prior[3]) >= .25) { breaks++; maxCrossSegmentWU = Math.max(maxCrossSegmentWU, d); }
            else maxSameSegmentWU = Math.max(maxSameSegmentWU, d);
          }
          prior = p; read++;
        }
        result.player.trails.push({ owner: 'player-contrail', socketIndex: i, ...draw(trail?.mesh),
          live: f(trail?._live), read, sampleLimit: live, physicalCapacity: capacity,
          coverage: 'capped newest-first CPU samples; not full trail coverage', segmentBreaks: breaks, maxSameSegmentWU: f(maxSameSegmentWU),
          maxCrossSegmentWU: f(maxCrossSegmentWU), pendingTexturePublish: trail?._dirty === true,
          pathTextureVersion: f(trail?._pathTex?.version), note: 'Cross-segment distance is not visible triangle area' });
      }
      if (owner._ribbonTrails instanceof Map) {
        for (const [entityId, trail] of owner._ribbonTrails) {
          if (result.npc.length >= limits.npcTrails || !(Date.now() < until)) break;
          // The pinned owner's getMesh is a pure closure accessor. No geometry builders run.
          const mesh = trail?.getMesh?.(), a = mesh?.geometry?.attributes?.position;
          result.npc.push({ owner: 'npc-ribbon', entityId: id(entityId), ...draw(mesh),
            descriptorBounds: bounds(a?.array, 3, Math.min(limits.verticesPerNpc, Math.max(0, a?.count | 0))),
            note: 'Bounds include retained vertices outside active draw range' });
        }
      }
      result.timeLimited = !(Date.now() < until);
      // Every string above is fixed ASCII or sanitized ASCII. This is a byte cap, not a UTF-16 guess.
      if (JSON.stringify(result).length > limits.snapshotAsciiBytes) return { status: 'output-cap-exceeded', limits };
      return result;
    } catch { return { status: 'inspection-failed', limits }; }
  };

  if (action === 'restore') {
    if (existing?.token !== token) {
      // A begin still waiting in the page transport must not mutate after cleanup ran.
      if (!existing || existing.closed) window[key] = { token, closed: true, changed: false };
      return { restored: true, changed: false, presentCount: count() };
    }
    existing.closed = true;
    if (!existing.changed) return { restored: true, changed: false, presentCount: count() };
    // Restore the exact port we changed, not a replacement from a later initialization.
    existing.api.restore();
    const state = existing.api.inspect();
    if (state?.active !== false) throw new Error('VFX isolation restoration not verified');
    existing.changed = false;
    return { restored: true, changed: true, presentCount: count(), propulsion: propulsion() };
  }
  if (action === 'sample') return { presentCount: count(), isolation: api?.inspect?.() ?? null };
  if (action !== 'begin') throw new Error('Unknown VFX diagnostic operation');
  if (Date.now() >= deadline) return { skipped: 'deadline-exhausted' };
  if (existing?.token === token && existing.closed) return { skipped: 'begin-cancelled' };
  if (!api || !['hideAll', 'restore', 'inspect'].every(name => typeof api[name] === 'function')) return { skipped: 'api-unavailable' };
  if (api.inspect()?.active !== false) return { skipped: 'isolation-already-active-or-unknown' };
  if (count() === null) return { skipped: 'present-count-unavailable' };
  const beforePropulsion = propulsion();
  // Inspection has its own small cap, but it must not spend the caller's remaining hide window.
  if (Date.now() >= deadline) return { skipped: 'deadline-exhausted', propulsion: beforePropulsion };
  const record = { token, api, closed: false, changed: true };
  window[key] = record;
  // Arm cleanup before hideAll, which may partially mutate then throw.
  api.hideAll();
  if (api.inspect()?.active !== true) throw new Error('VFX isolation activation not verified');
  return { changed: true, presentCount: count(), isolation: api.inspect(), propulsion: beforePropulsion };
}

/** Optional addendum to existing baseline captures. No new page/server/boot is created.
 * deadline is an absolute host wall-clock cutoff, supplied by the owning diagnostic.
 * Baseline files are never overwritten. Return value must be persisted by that owner.
 */
export async function captureCharonVfxIsolation(page, {
  deadline, outputDir = resolve('scratch/check-ci-report/station-handoff'),
  now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)),
  mkdirFn = mkdir, maxBudgetMs = 12000, restoreReserveMs = 2500,
} = {}) {
  const started = now();
  const end = Math.min(deadline, started + Math.max(1, maxBudgetMs));
  const reserve = Math.max(1000, restoreReserveMs);
  const workEnd = end - reserve;
  const report = { schema: 'spaceface.charonVfxIsolation.v1', label: CHARON_VFX_ISOLATION_LABEL,
    visualAcceptance: false, readinessEvidence: false, status: 'skipped', reason: null,
    screenshots: [], errors: [], restoration: { attempted: false, verified: false }, elapsedMs: 0 };
  if (!Number.isFinite(deadline) || !Number.isFinite(end) || workEnd - started < 1500) {
    report.reason = 'insufficient-remaining-deadline';
    return report;
  }
  // Unique per invocation, including concurrent attempts at the same millisecond.
  const token = `charon-vfx-${started}-${globalThis.crypto.randomUUID()}`;
  const bounded = async (fn, cutoff) => {
    const remaining = cutoff - now();
    if (!(remaining > 0)) throw new Error('VFX diagnostic deadline exhausted');
    let timer;
    try { return await Promise.race([Promise.resolve().then(fn), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('VFX diagnostic operation timed out')), remaining);
    })]); } finally { clearTimeout(timer); }
  };
  const op = (action, cutoff) => bounded(() => page.evaluate(charonVfxIsolationPageOperation,
    { action, token, deadline: workEnd, observationDeadline: cutoff }), cutoff);
  const advance = async (prior, cutoff, active) => {
    if (!Number.isFinite(prior)) throw new Error('Presented-frame baseline unavailable');
    for (;;) {
      const sample = await op('sample', cutoff);
      if (sample.isolation?.active !== active) throw new Error('VFX isolation state changed during capture');
      if (Number.isFinite(sample.presentCount) && sample.presentCount > prior) return sample.presentCount;
      await bounded(() => sleep(Math.min(50, Math.max(1, cutoff - now()))), cutoff);
    }
  };
  const capture = async (label, cutoff) => {
    const path = resolve(outputDir, `${token}-${label}.png`);
    await bounded(() => page.screenshot({ path, type: 'png', timeout: Math.max(1, Math.min(3000, cutoff - now())) }), cutoff);
    report.screenshots.push({ label, path, diagnosticOnly: true, visualAcceptance: false });
  };
  let beginDispatched = false, changed = false;
  try {
    await bounded(() => mkdirFn(outputDir, { recursive: true }), workEnd);
    beginDispatched = true;
    const begin = await op('begin', workEnd);
    report.propulsionBefore = begin.propulsion ?? null;
    if (begin.skipped) { report.reason = begin.skipped; return report; }
    changed = begin.changed === true;
    if (!changed) throw new Error('VFX isolation ownership unconfirmed');
    report.status = 'incomplete';
    report.isolatedPresentCount = await advance(begin.presentCount, workEnd, true);
    await capture('vfx-isolated-diagnostic', workEnd);
  } catch (error) {
    report.status = 'incomplete';
    report.errors.push(String(error?.message || error));
  } finally {
    if (beginDispatched && (changed || report.status === 'incomplete')) {
      report.restoration.attempted = true;
      try {
        // Even a stalled earlier operation cannot suppress the cleanup dispatch. If no
        // observation time remains, request restoration but report its outcome as unknown.
        if (!(end > now())) {
          try { Promise.resolve(page.evaluate(charonVfxIsolationPageOperation,
            { action: 'restore', token, deadline: workEnd })).catch(() => {}); } catch { /* reported below */ }
          throw new Error('Restoration dispatched after deadline; outcome unverified');
        }
        const restored = await op('restore', end);
        report.propulsionRestored = restored.propulsion ?? null;
        report.restoration = { attempted: true, verified: restored.restored === true, changed: restored.changed === true };
        if (!report.restoration.verified) throw new Error('VFX restoration unconfirmed');
        if (changed && report.screenshots.length) {
          report.restoredPresentCount = await advance(restored.presentCount, end, false);
          await capture('vfx-restored-diagnostic', end);
          report.status = 'diagnostic-pair-captured';
        }
      } catch (error) {
        report.errors.push(`Restoration or restored capture: ${String(error?.message || error)}`);
        report.status = report.restoration.verified ? 'incomplete' : 'restoration-unverified';
      }
    }
    report.elapsedMs = Math.max(0, now() - started);
  }
  return report;
}
