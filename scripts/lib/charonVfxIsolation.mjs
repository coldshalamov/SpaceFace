import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const CHARON_VFX_ISOLATION_LABEL = 'Temporary VFX ownership isolation; diagnostic only, never visual readiness or acceptance.';

// Runs only inside the already-open diagnostic page. The token fences late begin calls after
// a timed-out host request. It never changes gameplay, camera, renderer settings or admission.
export function charonVfxIsolationPageOperation({ action, token, deadline }) {
  const key = Symbol.for('spaceface.charonVfxIsolationDiagnostic');
  const render = window.SF?.state?.render;
  const api = render?.perfVfxIsolation;
  const count = () => Number.isFinite(render?.presentCount) ? render.presentCount : null;
  const existing = window[key];
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
    return { restored: true, changed: true, presentCount: count() };
  }
  if (action === 'sample') return { presentCount: count(), isolation: api?.inspect?.() ?? null };
  if (action !== 'begin') throw new Error('Unknown VFX diagnostic operation');
  if (Date.now() >= deadline) return { skipped: 'deadline-exhausted' };
  if (existing?.token === token && existing.closed) return { skipped: 'begin-cancelled' };
  if (!api || !['hideAll', 'restore', 'inspect'].every(name => typeof api[name] === 'function')) return { skipped: 'api-unavailable' };
  if (api.inspect()?.active !== false) return { skipped: 'isolation-already-active-or-unknown' };
  if (count() === null) return { skipped: 'present-count-unavailable' };
  const record = { token, api, closed: false, changed: true };
  window[key] = record;
  // Arm cleanup before hideAll, which may partially mutate then throw.
  api.hideAll();
  if (api.inspect()?.active !== true) throw new Error('VFX isolation activation not verified');
  return { changed: true, presentCount: count(), isolation: api.inspect() };
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
    { action, token, deadline: workEnd }), cutoff);
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
