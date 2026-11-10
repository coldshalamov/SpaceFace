import { hash32 } from '../../core/rng.js';
import { createYardLayout, YARD_LAYOUT_IDS, SHIPBREAKING_YARD_SITE as SITE } from './layouts.js';

export const YARD_SCHEMA = 1;
export const TERMINAL_PARTS = new Set(['delivered', 'lost']);
export const TERMINAL_JOBS = new Set(['complete', 'abandoned']);
const JOB_STATES = new Set(['offered', 'working', 'parked', 'complete', 'abandoned']);
const PART_STATES = new Set(['attached', 'free', 'delivered', 'lost']);
const LINK_STATES = new Set(['connected', 'released', 'broken']);
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const bounded = (v, lo, hi, fallback = lo) => Math.max(lo, Math.min(hi, finite(v, fallback)));
const integer = (v, hi = 1e9) => Math.floor(bounded(v, 0, hi));
const clone = value => JSON.parse(JSON.stringify(value));
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z)
  && Math.abs(p.x) <= 1e8 && Math.abs(p.z) <= 1e8 ? { x: p.x, z: p.z } : null;

export function freshYardState(seed = 1) {
  return { schema: YARD_SCHEMA, seed: seed >>> 0, discovered: false, sectorId: SITE.sectorId,
    anchor: null, revision: 0, nextJob: 1, activeJobId: null, jobs: {}, slots: {},
    cycles: Object.fromEntries(YARD_LAYOUT_IDS.map(id => [id, 0])), history: [],
    stats: { spentCr: 0, earnedCr: 0, deliveredParts: 0, lostParts: 0, completedJobs: 0 } };
}

export function createYardJob(row, layoutId) {
  const serial = row.nextJob++;
  const cycle = row.cycles[layoutId] || 0;
  const variant = (hash32(row.seed, layoutId) + cycle) % 6;
  const layout = createYardLayout(layoutId, variant);
  if (!layout || !row.anchor) throw new Error('A yard lot requires a known layout and berth.');
  const berth = SITE.berthOffsets[YARD_LAYOUT_IDS.indexOf(layoutId)];
  return { id: `shipbreaking:${row.seed}:${serial}`, serial, layoutId, variant,
    status: 'offered', paidCr: 0, paidAt: null, closedAt: null,
    sectorId: SITE.sectorId, anchor: { x: row.anchor.x + berth.x, z: row.anchor.z + berth.z },
    modules: Object.fromEntries(layout.modules.map(m => [m.id, {
      status: 'attached', condition: m.condition, hull: m.maxHull * m.condition, pose: null,
      receipt: null, lossReason: null,
    }])),
    couplings: Object.fromEntries(layout.couplings.map(c => [c.id, { status: 'connected' }])),
    hazard: { vented: !layout.hazard, burst: false }, recoveredCr: 0,
  };
}

export function yardPartValue(module, record) {
  return Math.max(0, Math.floor(module.valueCr * bounded(record?.condition, 0, 1)));
}

export function normalizeYardState(raw, seed = 1) {
  const out = freshYardState(seed);
  if (!raw || raw.schema !== YARD_SCHEMA || typeof raw !== 'object') return out;
  out.seed = integer(raw.seed, 0xffffffff);
  out.discovered = raw.discovered === true;
  out.anchor = point(raw.anchor);
  out.revision = integer(raw.revision, Number.MAX_SAFE_INTEGER - 1000);
  out.nextJob = Math.max(1, integer(raw.nextJob, Number.MAX_SAFE_INTEGER - 1000));
  for (const layoutId of YARD_LAYOUT_IDS) {
    out.cycles[layoutId] = integer(raw.cycles?.[layoutId]);
    const id = raw.slots?.[layoutId];
    const saved = typeof id === 'string' && id.length < 100 ? raw.jobs?.[id] : null;
    if (!saved || saved.layoutId !== layoutId || saved.id !== id || !JOB_STATES.has(saved.status)) continue;
    const serial = integer(saved.serial, Number.MAX_SAFE_INTEGER - 1000);
    if (id !== `shipbreaking:${out.seed}:${serial}` || serial < 1 || !point(saved.anchor)) continue;
    out.nextJob = Math.max(out.nextJob, serial + 1);
    const variant = integer(saved.variant, 5);
    const layout = createYardLayout(layoutId, variant);
    const job = { id, serial, layoutId, variant, status: saved.status,
      paidCr: saved.status === 'offered' ? 0 : layout.fee,
      paidAt: Number.isFinite(saved.paidAt) ? Math.max(0, saved.paidAt) : null,
      closedAt: Number.isFinite(saved.closedAt) ? Math.max(0, saved.closedAt) : null,
      sectorId: SITE.sectorId, anchor: point(saved.anchor), modules: {}, couplings: {},
      hazard: { vented: saved.hazard?.vented === true || !layout.hazard, burst: saved.hazard?.burst === true }, recoveredCr: 0 };
    for (const module of layout.modules) {
      const old = saved.modules?.[module.id];
      const hull = bounded(old?.hull, 0, module.maxHull);
      const record = { status: PART_STATES.has(old?.status) ? old.status : 'lost',
        condition: Math.min(bounded(old?.condition, 0, 1), hull / module.maxHull), hull,
        pose: null, receipt: null, lossReason: typeof old?.lossReason === 'string' ? old.lossReason.slice(0, 180) : null };
      const p = old?.pose;
      if (point(p) && ['vx', 'vz', 'rot', 'spin'].every(k => Number.isFinite(p[k]))
        && Math.hypot(p.vx, p.vz) < 1e5 && Math.abs(p.spin) < 1e5) {
        record.pose = { x: p.x, z: p.z, vx: p.vx, vz: p.vz, rot: p.rot, spin: p.spin };
      }
      const receipt = old?.receipt;
      const receiptId = `${id}:${module.id}:delivery`;
      if (receipt?.id === receiptId && receipt.moduleId === module.id && receipt.jobId === id
        && Number.isSafeInteger(receipt.credits) && receipt.credits >= 0 && receipt.credits <= module.valueCr
        && Number.isFinite(receipt.at) && receipt.at >= 0 && job.status !== 'offered') {
        record.receipt = { id: receiptId, jobId: id, moduleId: module.id, credits: receipt.credits,
          condition: bounded(receipt.condition, 0, 1), at: receipt.at, stationId: SITE.stationId };
        record.status = 'delivered';
        job.recoveredCr += receipt.credits;
      } else if (receipt || record.status === 'delivered') {
        // A malformed delivery cannot turn back into a payable source on load.
        record.status = 'lost'; record.lossReason = 'invalid_delivery_receipt';
      }
      if (record.hull <= 0 && record.status !== 'delivered') record.status = 'lost';
      if (job.status === 'abandoned' && !TERMINAL_PARTS.has(record.status)) record.status = 'lost';
      job.modules[module.id] = record;
    }
    for (const coupling of layout.couplings) {
      const status = saved.couplings?.[coupling.id]?.status;
      job.couplings[coupling.id] = { status: LINK_STATES.has(status) ? status : 'broken' };
      const restLength = saved.couplings?.[coupling.id]?.restLength;
      if (Number.isFinite(restLength) && restLength >= 0 && restLength <= 40) job.couplings[coupling.id].restLength = restLength;
      if ([coupling.a, coupling.b].some(id => TERMINAL_PARTS.has(job.modules[id].status))) {
        job.couplings[coupling.id].status = 'broken';
      }
    }
    for (const module of layout.modules) if (!TERMINAL_PARTS.has(job.modules[module.id].status)) {
      job.modules[module.id].status = layout.couplings.some(c => (c.a === module.id || c.b === module.id)
        && job.couplings[c.id].status === 'connected') ? 'attached' : 'free';
    }
    if (Object.values(job.modules).every(m => TERMINAL_PARTS.has(m.status)) && job.status !== 'offered') {
      job.status = saved.status === 'abandoned' ? 'abandoned' : 'complete';
    } else if (job.status === 'complete') job.status = 'parked';
    out.jobs[id] = job; out.slots[layoutId] = id;
  }
  out.activeJobId = out.jobs[raw.activeJobId]?.status === 'working' ? raw.activeJobId : null;
  // There can be only one active work ticket; paid parked originals retain their condition.
  for (const job of Object.values(out.jobs)) if (job.status === 'working' && job.id !== out.activeJobId) job.status = 'parked';
  for (const key of Object.keys(out.stats)) out.stats[key] = integer(raw.stats?.[key]);
  out.history = (Array.isArray(raw.history) ? raw.history : []).slice(-12).filter(h => h && typeof h.id === 'string')
    .map(h => ({ id: h.id.slice(0, 100), layoutId: YARD_LAYOUT_IDS.includes(h.layoutId) ? h.layoutId : 'lark',
      paidCr: integer(h.paidCr), recoveredCr: integer(h.recoveredCr), outcome: h.outcome === 'abandoned' ? 'abandoned' : 'complete' }));
  return out;
}

export function snapshotYardState(row) { return clone(normalizeYardState(row, row.seed)); }

export function isYardAdventure(state) {
  return !!state && (!state.run || state.run.kind === 'adventure') && !state.survival?.active
    && !state.racing?.active && !state.race?.active && !state.orbitalGallery?.active
    && !state.kineticLeague?.active && !state.tutorial?.active && !state.replay?.active && !state._ephemeralRacing
    && !state.physicsVenueSession && !state.physicsVenue?.active;
}
