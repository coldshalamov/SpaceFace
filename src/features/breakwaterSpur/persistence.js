// persistence.js — Breakwater Spur save section validation/migration plus the
// instance-scoped adapter that parks the row under the 'world.breakwaterSpur'
// envelope key. The adapter installs hooks on the existing save owner — it
// does not replace the save system, and a missing owner degrades gracefully.
//
// The shipped production shape is a plan row inside saveSystem._saveCapturePlan
// (like shipbreakingYardSavePlanEntry); this adapter is the concrete candidate
// seam so the feature works before the controller lands that one line.

import {
  BREAKWATER_ROW_VERSION, BREAKWATER_SAVE_SECTION, BREAKWATER_PHASE,
  BREAKWATER_CHARTER, BREAKWATER_STOCK, BREAKWATER_BOUNDS,
  breakwaterRecordId,
} from './definition.js';
import { createBreakwaterRow } from './project.js';

const PH = BREAKWATER_PHASE;
const installed = new WeakMap();

function finite(n, fallback = 0) { return Number.isFinite(n) ? n : fallback; }
function bool(v) { return v === true; }
function str(v, fallback = '') { return typeof v === 'string' ? v : fallback; }

// Validation + migration: every field bounded and schema-checked; unknown or
// corrupt input degrades to a fresh row with what can be honestly recovered.
export function normalizeBreakwaterSpurRow(data) {
  const fresh = createBreakwaterRow();
  if (!data || typeof data !== 'object') return fresh;
  const row = { ...fresh };

  row.v = BREAKWATER_ROW_VERSION;
  row.phase = Object.values(PH).includes(data.phase) ? data.phase : fresh.phase;
  row.stage = Math.max(0, Math.min(3, finite(data.stage, 0)));
  row.discoveredAt = data.discoveredAt == null ? null : finite(data.discoveredAt, null);
  row.visitCount = Math.max(0, Math.min(999, finite(data.visitCount, 0)));
  row.seq = Math.max(0, finite(data.seq, 0));
  row.restored = true;

  const sv = data.surveyed || {};
  row.surveyed = {
    socket_drive: bool(sv.socket_drive),
    socket_drum: bool(sv.socket_drum),
    console: bool(sv.console),
  };

  for (const s of ['drive', 'drum']) {
    const src = (data.sockets || {})[s] || {};
    row.sockets[s] = {
      status: src.status === 'seated' ? 'seated' : 'empty',
      cartridgeRole: src.cartridgeRole === s ? s : null,
      seatedAt: src.seatedAt == null ? null : finite(src.seatedAt, null),
    };
    const c = (data.cartridges || {})[s] || {};
    const cart = row.cartridges[s];
    cart.worldRecordId = breakwaterRecordId(`cartridge_${s}`);
    cart.status = ['seated','lost','unconfirmed'].includes(c.status) ? c.status : 'loose';
    cart.pendingSeat = c.pendingSeat === true;
    cart.everSpawned = c.everSpawned === true || c.entityId != null || c.damaged === true || c.status === 'seated' || c.status === 'unconfirmed';
    // Socket/cartridge consistency: seated requires both sides to agree.
    if (row.sockets[s].status !== 'seated' && cart.status === 'seated') cart.status = 'loose';
    if (row.sockets[s].status === 'seated' && cart.status !== 'seated') {
      row.sockets[s].status = 'empty'; row.sockets[s].cartridgeRole = null;
    }
    cart.hullMax = finite(c.hullMax, cart.hullMax);
    cart.hull = Math.max(0, Math.min(cart.hullMax, finite(c.hull, cart.hullMax)));
    cart.damaged = bool(c.damaged) || cart.hull < cart.hullMax;
    cart.seatedAt = c.seatedAt == null ? null : finite(c.seatedAt, null);
    cart.lostAt = c.lostAt == null ? null : finite(c.lostAt, null);
    cart.lostReason = c.lostReason == null ? null : str(c.lostReason);
    cart.entityId = null; cart.generation = 0;   // live bindings re-verify
  }

  const ll = data.looseLoad;
  row.looseLoad = ll && typeof ll === 'object' && ll.worldRecordId
    ? {
        kind: ll.kind === 'consignment' ? 'consignment' : 'supply',
        worldRecordId: str(ll.worldRecordId),
        status: ['waiting', 'in_transit', 'lost', 'delivered'].includes(ll.status) ? ll.status : 'waiting',
        entityId: null, generation: 0,
      }
    : null;

  const cm = data.commission || {};
  row.commission = {
    status: cm.status === 'paid' ? 'paid' : 'none',
    paidAt: cm.paidAt == null ? null : finite(cm.paidAt, null),
  };

  row.charter = Object.values(BREAKWATER_CHARTER).includes(data.charter) ? data.charter : BREAKWATER_CHARTER.NONE;

  const coop = data.coop || {};
  row.coop.stock = {
    repair: Math.max(0, Math.min(BREAKWATER_STOCK.repairCap, finite(coop.stock?.repair, 0))),
    fuel: Math.max(0, Math.min(BREAKWATER_STOCK.fuelCap, finite(coop.stock?.fuel, 0))),
  };
  const jobs = coop.jobs || {};
  for (const k of ['scrap', 'supply', 'defend']) {
    const j = jobs[k] || {};
    row.coop.jobs[k] = {
      status: ['open', 'scheduled', 'accepted', 'done', 'failed'].includes(j.status) ? j.status : 'open',
      paid: bool(j.paid),
      haulerJobId: k === 'defend' ? (j.haulerJobId == null ? null : str(j.haulerJobId)) : undefined,
    };
    // A scheduled-but-interrupted haul reopens — no ghost schedule survives save.
    if (row.coop.jobs[k].status === 'scheduled') row.coop.jobs[k].status = 'open';
  }

  const bonded = data.bonded || {};
  const bs = bonded.bond || {};
  row.bonded.bond = {
    status: ['none', 'posted', 'refunded', 'forfeited'].includes(bs.status) ? bs.status : 'none',
    postedAt: bs.postedAt == null ? null : finite(bs.postedAt, null),
    pendingAdmission: bs.pendingAdmission === true,
    refundedAt: bs.refundedAt == null ? null : finite(bs.refundedAt, null),
    forfeitedAt: bs.forfeitedAt == null ? null : finite(bs.forfeitedAt, null),
  };
  const bj = bonded.job || {};
  row.bonded.job = {
    status: ['open', 'accepted', 'done', 'failed'].includes(bj.status) ? bj.status : 'open',
    paid: bool(bj.paid),
  };
  // A posted bond whose consignment is gone resolves honestly: delivered loads
  // settle as done; anything else forfeits.
  if (row.bonded.bond.status === 'posted' && !row.looseLoad && !row.bonded.bond.pendingAdmission) {
    if (row.bonded.job.status === 'done') {
      row.bonded.bond.status = 'refunded';
    } else {
      row.bonded.bond.status = 'forfeited';
      row.bonded.job.status = 'failed';
    }
  }

  const freight = data.freight || {};
  const h = freight.hauler;
  row.freight.hauler = h && typeof h.worldRecordId === 'string' && typeof h.jobId === 'string'
    ? {worldRecordId:h.worldRecordId.slice(0,160),jobId:h.jobId.slice(0,160),purpose:h.purpose,phase:h.phase,entityId:null,generation:0} : null;
  row.freight.raiderSpawned = freight.raiderSpawned === true;
  row.freight.itinerary = Array.isArray(freight.itinerary)
    ? freight.itinerary.slice(-BREAKWATER_BOUNDS.itineraryLog)
        .map(r => ({ at: finite(r?.at, 0), text: str(r?.text).slice(0, 160) }))
    : [];

  row.bodySnapshots = {};
  for (const id of [...Object.values(row.cartridges).map(c=>c.worldRecordId),row.looseLoad?.worldRecordId].filter(Boolean)) {
    const snap=data.bodySnapshots?.[id];
    if (snap && typeof snap==='object') row.bodySnapshots[id]=cloneSaveTree(snap);
  }
  row.settledPayouts = {};
  for (const kind of ['scrap','supply','defend','bonded','bond_refund']) {
    const source=data.settledPayouts?.[kind];
    if (typeof source === 'string' && source.length <= 160 && (source.startsWith('breakwater:') || source.startsWith('breakwater-cargo:'))) row.settledPayouts[kind]=source;
  }
  row.pendingPayouts = {};
  for (const kind of ['scrap','supply','defend','bonded','bond_refund']) {
    const pending=data.pendingPayouts?.[kind];
    if (pending && typeof pending.sourceId === 'string' && pending.sourceId.length <= 160
      && (pending.sourceId.startsWith('breakwater:') || pending.sourceId.startsWith('breakwater-cargo:'))) row.pendingPayouts[kind]={sourceId:pending.sourceId};
  }

  const raider=data.raider;
  row.raider = raider && typeof raider.worldRecordId==='string' && raider.worldRecordId.startsWith('breakwater:site_breakwater_spur:raider_')
    ? {worldRecordId:raider.worldRecordId.slice(0,160),entityId:null,generation:0,status:raider.status==='down'?'down':'active'} : null;
  row.receipts = Array.isArray(data.receipts)
    ? data.receipts.slice(-BREAKWATER_BOUNDS.receipts)
        .map(r => ({ at: finite(r?.at, 0), kind: str(r?.kind, 'info'), text: str(r?.text).slice(0, 200) }))
    : [];
  row.seatWatch = { drive: null, drum: null };
  return row;
}

// The canonical section path: data.world.breakwaterSpur — nested inside the
// world section exactly like alienEcology/opticSpent. The shipped production
// shape is two lines in world.serialize/deserializeChunked delegating to this
// module's serializer (see handoff/integration.patch); this adapter is the
// concrete candidate seam so the feature persists before that edit lands —
// it folds the row into the captured world bag rather than adding an envelope
// key, so both routes produce the identical section path.
export function serializeBreakwaterSpurState(state) {
  const row = state?.world?.breakwaterSpur;
  return row ? cloneSaveTree(row) : {};
}

export function deserializeBreakwaterSpurState(state, raw) {
  if (!state?.world) return;
  state.world.breakwaterSpur = normalizeBreakwaterSpurRow(raw);
}

function cloneSaveTree(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

// Instance-scoped adapter on the exact shipped save owner, same seam the
// salvageTender candidate uses. It injects the section INSIDE the world bag
// (no new envelope key, no checksum-order change: the world's own serialize
// slot already carries the byte layout) and adopts the detached row before the
// original restore's save:loaded event rebinds persistent bodies.
export function installBreakwaterSpurSaveAdapter(save, runtime) {
  if (!save || !runtime || typeof save._saveCapturePlan !== 'function'
    || typeof save._serializeDataSteps !== 'function'
    || typeof save._restoreChunks !== 'function') return () => {};
  const active = installed.get(save);
  if (active) return active.release;
  const before = {
    plan: save._saveCapturePlan, steps: save._serializeDataSteps, restore: save._restoreChunks,
  };
  function injectWorld(data) {
    if (!data || typeof data !== 'object') return;
    if (!data.world || typeof data.world !== 'object') data.world = {};
    data.world.breakwaterSpur = runtime.serialize() || {};
  }
  function plan() {
    // The plan drives the worker/chunked capture lane; world captures via
    // _callSerialize('world'), so the fold happens in the row for 'world'.
    const rows = before.plan.call(this).map(([key, fn]) => {
      if (key !== 'world' || key.__bwFolded) return [key, fn];
      return [key, () => {
        const world = typeof fn === 'function' ? fn.call(this) : fn;
        if (world && typeof world === 'object') world.breakwaterSpur = runtime.serialize() || {};
        return world;
      }];
    });
    return rows;
  }
  function* steps() {
    const data = yield* before.steps.call(this);
    injectWorld(data);
    yield 'serialize:breakwaterSpur';
    return data;
  }
  function* restore(session) {
    // save:restoring already suspended producers; adopt the detached row before
    // the original restore rebinds persistent bodies by worldRecordId.
    runtime.deserialize(session?.data?.world?.breakwaterSpur);
    return yield* before.restore.call(this, session);
  }
  save._saveCapturePlan = plan;
  save._serializeDataSteps = steps;
  save._restoreChunks = restore;
  const release = () => {
    if (save._saveCapturePlan === plan) save._saveCapturePlan = before.plan;
    if (save._serializeDataSteps === steps) save._serializeDataSteps = before.steps;
    if (save._restoreChunks === restore) save._restoreChunks = before.restore;
    installed.delete(save);
  };
  installed.set(save, { release });
  return release;
}
