// src/systems/crafting.js – Manufacturing system for the builder profession (Phase 7).
//
// Turns raw ore into refined materials, modules, and whole ships per src/data/blueprints.js. This is
// the loop that makes mining matter beyond selling: a miner-among-builders refines bulk ore into
// stock, assembles it into parts, augments their favourite modules up tiers, and ultimately
// manufactures ships from materials — the "build an empire" fantasy.
//
// V2 §3 (cut-list #3): builds now take REAL game-time. Each station has a build queue (capacity 1 =
// strategic — you choose what to commit the fab to). `bp.timeS` is honored: a job consumes inputs
// up front, then accumulates progress over game-time (respects pause/timeScale, not wall-clock),
// and grants the product on completion. Refining stays near-instant; ship manufacturing takes long
// enough that planning your production is a real decision. Recipes with timeS:0 remain instant for
// backward compatibility (basic refining).
import { BLUEPRINTS, BLUEPRINT_BY_ID } from '../data/blueprints.js';
import { COMMODITIES } from '../data/commodities.js';
import { MODULES } from '../data/modules.js';
import { techDisplayName } from '../data/tech.js';
import { addCargo, removeCargo, sellableCargoQuantity } from './cargo.js';
import { getDerivedStats } from './ships.js';
import { instanceIdentityText } from './shipLedger.js';

// Sensible build durations by category when a blueprint doesn't specify one (the data ships with
// timeS:0 everywhere — these defaults make manufacturing feel like a real production loop without
// requiring a data migration). Applied only when bp.timeS is missing/0 AND the category warrants it.
const DEFAULT_TIME_S = {
  refine: 0,       // bulk processing stays instant — it's the "grind ore into stock" tier
  assemble: 20,    // a module takes ~20s of game-time at the fab
  augment: 35,     // augmenting a module up a tier is a delicate job
  ship: 120,       // manufacturing a whole ship is a serious commitment — the empire-building beat
};
const QUEUE_CAPACITY = 1; // one slot per station — capacity IS the strategic constraint
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));

function registryName(map, id) {
  const entry = map.get(id);
  return (entry && entry.name) || String(id || '').replace(/_/g, ' ');
}

function commodityName(id) {
  return registryName(COMMODITY_BY_ID, id);
}

function moduleName(id) {
  return registryName(MODULE_BY_ID, id);
}

function fmtQty(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function craftingMaterialBlockerText(bp, materials = []) {
  const missing = materials.find((item) => item && item.have < item.need);
  if (!missing) return 'Not enough materials for ' + ((bp && bp.name) || 'this blueprint');
  const qty = Math.max(0, (Number(missing.need) || 0) - (Number(missing.have) || 0));
  return 'Need ' + fmtQty(qty) + ' ' + commodityName(missing.id) + ' for ' + ((bp && bp.name) || 'this blueprint');
}

export function buildDuration(bp) {
  if (!bp) return 0;
  if (bp.timeS && bp.timeS > 0) return bp.timeS;
  return DEFAULT_TIME_S[bp.category] || 0;
}

function commodityVolume(id) {
  const def = COMMODITY_BY_ID.get(id);
  return def && def.volPerU > 0 ? def.volPerU : 1;
}

/** True when the hold can take `qty` of `commodityId` without exceeding capVolume. */
function cargoCanFit(state, commodityId, qty) {
  const cargo = state && state.player && state.player.cargo;
  if (!cargo) return false;
  const need = Math.max(0, Math.floor(Number(qty) || 0));
  if (need <= 0) return true;
  const free = (Number(cargo.capVolume) || 0) - (Number(cargo.usedVolume) || 0);
  return Math.floor(free / commodityVolume(commodityId)) >= need;
}

/** Instant refine consumes inputs first. Net volume after that swap must still fit. */
function cargoCanFitBlueprintSwap(state, bp) {
  const out = bp && bp.outputs;
  if (!out || out.kind !== 'commodity') return true;
  const cargo = state && state.player && state.player.cargo;
  if (!cargo) return false;
  let used = Number(cargo.usedVolume) || 0;
  for (const id of Object.keys(bp.inputs || {})) {
    used -= (Number(bp.inputs[id]) || 0) * commodityVolume(id);
  }
  used += (Number(out.qty) || 0) * commodityVolume(out.id);
  return used <= (Number(cargo.capVolume) || 0) + 1e-9;
}

/** Where consumeOneModule(p, defId) would take the unit from, mirrored read-only: any loose
 *  inventory instance answers first (its default pick is a plain duplicate), else the first
 *  owned ship carrying the def fitted, in ownedShips order. Returns the FITTED pick as
 *  { owned, shipIndex, slotIndex }, or null when a loose instance (or nothing) would go. */
function fittedSourcePick(p, defId) {
  for (const m of (p && p.moduleInventory) || []) {
    if (m && m.defId === defId) return null;
  }
  const ships = Array.isArray(p && p.ownedShips) ? p.ownedShips : [];
  for (let shipIndex = 0; shipIndex < ships.length; shipIndex++) {
    const owned = ships[shipIndex];
    if (!owned || !Array.isArray(owned.fittings)) continue;
    const slotIndex = owned.fittings.indexOf(defId);
    if (slotIndex >= 0) return { owned, shipIndex, slotIndex };
  }
  return null;
}

/** P03 — an augment can consume its source OFF A FITTED SLOT; when that slot rides on the
 *  flown hull, a capacity-bearing source (a cargo pod) shrinks the hold the moment it is eaten.
 *  The canonical post-consumption capacity is getDerivedStats on the fittings the consume would
 *  leave; the load it must carry is the hold minus the inputs eaten up front. Returns the
 *  refusal sentence when that load overflows, else null. Read-only — build() gates on it
 *  before any mutation. */
function fittedSourceOverflowText(state, bp) {
  const p = state && state.player;
  if (!p || !bp || bp.category !== 'augment' || !bp.fromModule) return null;
  const pick = fittedSourcePick(p, bp.fromModule);
  if (!pick) return null;
  // Only the flown ship's hold is player cargo (same seam unfitModule's overflow guard uses).
  const activeOwned = (Array.isArray(p.ownedShips) ? p.ownedShips : [])[p.activeShipIndex];
  if (!activeOwned || pick.owned !== activeOwned) return null;
  const cargo = p.cargo;
  if (!cargo) return null;
  const afterFittings = pick.owned.fittings.slice();
  afterFittings[pick.slotIndex] = null;
  const capAfter = getDerivedStats(pick.owned.defId, afterFittings, p).cargoCap;
  let usedAfter = Number(cargo.usedVolume) || 0;
  for (const id of Object.keys(bp.inputs || {})) {
    usedAfter -= (Number(bp.inputs[id]) || 0) * commodityVolume(id);
  }
  if (usedAfter <= capAfter + 1e-9) return null;
  return 'Consuming the fitted ' + moduleName(bp.fromModule)
    + ' would overflow the hold — free cargo space first';
}

function normalizeQueues(raw) {
  const queues = {};
  if (!raw || typeof raw !== 'object') return queues;
  for (const stationId in raw) {
    const job = raw[stationId];
    if (!job || job.done) continue;
    const bpId = typeof job.bpId === 'string'
      ? job.bpId
      : (job.bp && typeof job.bp.id === 'string' ? job.bp.id : null);
    const bp = bpId ? BLUEPRINT_BY_ID.get(bpId) : null;
    if (!bp) continue;
    const total = Number.isFinite(job.total) && job.total > 0 ? job.total : buildDuration(bp);
    if (!(total > 0)) continue;
    const elapsedRaw = Number.isFinite(job.elapsed) ? job.elapsed : 0;
    const elapsed = Math.max(0, Math.min(total, elapsedRaw));
    queues[stationId] = {
      bpId,
      elapsed,
      total,
      done: false,
      stationId: typeof job.stationId === 'string' ? job.stationId : stationId,
    };
  }
  return queues;
}

export const crafting = {
  name: 'crafting',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.ctx = ctx;
    // expose helpers for the UI to call without reaching through ctx
    ctx.crafting = this;
    // Build queues live here: { [stationId]: { bpId, elapsed, total, productSpec } | null }
    if (!this.state.crafting) this.state.crafting = { queues: {} };
  },

  // Lazy refs to sibling systems (they init before crafting via registry order). Using getters keeps
  // us robust if init order ever shifts.
  get _ships() { return this.ctx.registry.get('ships'); },

  // Advance in-progress build jobs by dt of GAME-time (the loop passes sim dt, already gated by
  // timeScale/pause, so a paused game doesn't progress production and a save-load catch-up works).
  update(dt, state) {
    const queues = (state.crafting && state.crafting.queues) || {};
    const completedIds = [];
    const simNow = Number(state && state.simTime) || 0;
    for (const stationId in queues) {
      const job = queues[stationId];
      if (!job || job.done) continue;
      // Re-announce in-flight work so a rig that bound after the original receipt — station
      // unload/reload, deserialize, entity rebuild — still hears the queue. The receipt
      // handler is idempotent on a running loop (clipActive('workLoop') guard), so a
      // throttled re-emit is safe.
      if (simNow - (job._announcedAt || -3) >= 2) {
        job._announcedAt = simNow;
        this.bus.emit('craft:queueChanged', { stationId, active: true });
      }
      job.elapsed += dt;
      if (job.elapsed >= job.total) {
        if (!this._grantProduct(job)) {
          job.elapsed = job.total;
          if (!job.waitingForHold) {
            job.waitingForHold = true;
            this.bus.emit('toast', {
              text: 'Hold full — fabrication waiting to unload',
              kind: 'warn',
              ttl: 3,
            });
          }
          continue;
        }
        job.done = true;
        queues[stationId] = null;
        completedIds.push(stationId);
      }
    }
    // Per-station receipts so consumers (UI refresh, authored-motion rigs) can key on
    // stationId without diffing the queue map themselves.
    for (const stationId of completedIds) {
      this.bus.emit('craft:queueChanged', { stationId, active: false });
    }
  },

  /** All blueprints buildable at a given station type, with availability precomputed for the UI. */
  listFor(stationType) {
    const p = this.state.player;
    return BLUEPRINTS
      .filter((b) => b.stationType === stationType || stationType == null)
      .map((b) => ({ bp: b, ...this.status(b, p) }));
  },

  /** Effective build duration for a blueprint (honors bp.timeS, else DEFAULT_TIME_S by category). */
  buildTime(bp) {
    return buildDuration(bp);
  },

  /** Is the given station's build queue busy? (capacity = 1) */
  isBusy(stationId) {
    const q = this.state.crafting && this.state.crafting.queues && this.state.crafting.queues[stationId];
    return !!(q && !q.done);
  },

  /** Progress 0..1 of the current job at a station (0 if idle). For the UI. */
  progress(stationId) {
    const q = this.state.crafting && this.state.crafting.queues && this.state.crafting.queues[stationId];
    if (!q || q.done || !q.total) return 0;
    return Math.max(0, Math.min(1, q.elapsed / q.total));
  },

  /** Name of the in-progress job at a station, for UI ("BUILDING… <name>"). Null if idle. */
  _currentJobName(stationId) {
    const q = this.state.crafting && this.state.crafting.queues && this.state.crafting.queues[stationId];
    if (!q || q.done) return null;
    const bp = q.bp || BLUEPRINT_BY_ID.get(q.bpId);
    return bp ? bp.name : null;
  },

  /** Per-blueprint availability: tech unlocked? materials present? source module owned (augment)?
   *  + queue free? */
  status(bp, p) {
    p = p || this.state.player;
    const techOk = !bp.requiresTech || p.researchedNodes.includes(bp.requiresTech);
    const mats = this.haveMaterials(bp, p);
    const matsOk = mats.every((m) => m.have >= m.need);
    let sourceOk = true;
    if (bp.category === 'augment' && bp.fromModule) {
      // need at least one instance of the source module in inventory OR currently fitted
      sourceOk = this.countOwnedModule(p, bp.fromModule) > 0;
    }
    return { techOk, matsOk, sourceOk, canBuild: techOk && matsOk && sourceOk, materials: mats };
  },

  /** Material breakdown with have/need for display + gating. P02 — `have` is the cargo-owned
   *  FREE quantity: sealed contract freight and persistent story cargo stay reserved for their
   *  owners even while they ride in the same hold, so they can never feed a fabricator. */
  haveMaterials(bp, p) {
    p = p || this.state.player;
    const state = (this.state && this.state.player === p) ? this.state : { player: p };
    return Object.keys(bp.inputs).map((id) => ({ id, need: bp.inputs[id], have: sellableCargoQuantity(state, id) }));
  },

  /** Consume inputs + enqueue (or grant instantly if timeS=0). Returns true on success.
   *  stationId is the station where the build is committed (each station has its own 1-slot queue). */
  build(bpId, stationId) {
    const bp = BLUEPRINT_BY_ID.get(bpId);
    if (!bp) return false;
    const p = this.state.player;
    const st = this.status(bp, p);
    if (!st.techOk) {
      this.bus.emit('toast', { text: 'Research required: ' + techDisplayName(bp.requiresTech), kind: 'error', ttl: 3 });
      return false;
    }
    if (bp.category === 'augment' && !st.sourceOk) {
      this.bus.emit('toast', { text: 'Need a ' + moduleName(bp.fromModule) + ' to augment', kind: 'error', ttl: 3 });
      return false;
    }
    if (!st.matsOk) {
      this.bus.emit('toast', { text: craftingMaterialBlockerText(bp, st.materials), kind: 'error', ttl: 3 });
      return false;
    }
    // queue capacity gate: one job per station at a time (the strategic constraint)
    const sid = stationId || (this.state.ui && this.state.ui.dockedStationId) || '__any__';
    if (this.buildTime(bp) > 0 && this.isBusy(sid)) {
      this.bus.emit('toast', { text: 'Fab busy — finish the current job first', kind: 'error', ttl: 3 });
      return false;
    }
    if (bp.outputs && bp.outputs.kind === 'commodity' && !cargoCanFitBlueprintSwap(this.state, bp)) {
      this.bus.emit('toast', { text: 'Cargo hold cannot take the finished goods', kind: 'error', ttl: 3 });
      return false;
    }
    // P03 — before consuming an exact fitted source, gate on the canonical post-input-consumption
    // capacity: a cargo pod eaten off the flown hull shrinks the hold under the load it carried.
    const sourceOverflow = fittedSourceOverflowText(this.state, bp);
    if (sourceOverflow) {
      this.bus.emit('toast', { text: sourceOverflow, kind: 'error', ttl: 3 });
      return false;
    }

    // 1) consume input materials from cargo NOW (committed up front; you don't get them back on cancel)
    for (const id in bp.inputs) {
      removeCargo(this.state, id, bp.inputs[id]);
    }
    // 2) for augments, consume one instance of the source module (prefer unfitted inventory)
    if (bp.category === 'augment' && bp.fromModule) {
      this.consumeOneModule(p, bp.fromModule);
    }

    const total = this.buildTime(bp);
    if (total <= 0) {
      // instant path (basic refining): grant immediately, same as before
      if (!this._grantProduct({ bp })) {
        this.bus.emit('toast', { text: 'Cargo hold cannot take the finished goods', kind: 'error', ttl: 3 });
        return false;
      }
      this.bus.emit('craft:complete', { bpId, productId: bp.outputs.id, kind: bp.outputs.kind, qty: bp.outputs.qty });
      this.bus.emit('audio:cue', { id: 'confirm' });
      this.bus.emit('toast', { text: 'Manufactured: ' + bp.name, kind: 'info', ttl: 2.5 });
      return true;
    }

    // enqueue the job — materials already consumed; product granted on completion via update().
    // Store bpId only (NOT the bp object) so the queue is plain serializable data with no live refs.
    const queues = this.state.crafting.queues;
    queues[sid] = { bpId, elapsed: 0, total, done: false, stationId: sid };
    this.bus.emit('craft:queueChanged', { stationId: sid, active: true });
    this.bus.emit('audio:cue', { id: 'confirm' });
    this.bus.emit('toast', { text: 'Fabrication started: ' + bp.name + ' (' + Math.round(total) + 's)', kind: 'info', ttl: 3 });
    return true;
  },

  // Grant the product for an instant build or a completed queued job.
  // Returns false when a commodity product cannot fit — caller must not consume the job.
  _grantProduct(job) {
    const bp = job.bp || BLUEPRINT_BY_ID.get(job.bpId);
    if (!bp) return false;
    const ships = this._ships;
    const out = bp.outputs;
    let grantMsg = '';
    if (out.kind === 'commodity') {
      if (!cargoCanFit(this.state, out.id, out.qty)) return false;
      const added = addCargo(this.state, out.id, out.qty);
      if (added < (out.qty || 0)) {
        if (added > 0) removeCargo(this.state, out.id, added);
        return false;
      }
      grantMsg = '+' + out.qty + ' ' + out.id;
    } else if (out.kind === 'module' || out.kind === 'weapon') {
      for (let i = 0; i < (out.qty || 1); i++) {
        this.state.player.moduleInventory.push({ instanceId: ships.nextInstanceId(), defId: out.id });
      }
      grantMsg = '+' + (out.qty || 1) + ' ' + out.id;
    } else if (out.kind === 'ship') {
      ships.buyShip({ defId: out.id, setActive: false, grant: true });   // crafted: materials were the cost
      grantMsg = 'Ship: ' + out.id;
    }
    if (job.stationId) {
      // completed-queue path: emit the full feedback suite so the UI/toasts react.
      // craft:queueChanged is NOT emitted here — the job is still !done at this point, so
      // isBusy() would report active:true and contradict the active:false receipt update()
      // sends after marking it done (consumers see a same-tick on+off pair).
      this.bus.emit('craft:complete', { bpId: bp.id, productId: out.id, kind: out.kind, qty: out.qty });
      this.bus.emit('toast', { text: '✓ Fabrication complete: ' + bp.name, kind: 'good', ttl: 3.5 });
    }
    return true;
  },

  /** Count instances of a module def in inventory + currently fitted across owned ships. */
  countOwnedModule(p, defId) {
    let n = 0;
    for (const m of (p.moduleInventory || [])) if (m.defId === defId) n++;
    for (const s of (p.ownedShips || [])) for (const fid of (s.fittings || [])) if (fid === defId) n++;
    return n;
  },

  /** Remove one instance of a module def: prefer loose inventory, else unfits it from a ship.
   *  NXI-128 — with `options.instanceId` the caller's selection is consumed exactly; two valid
   *  duplicates sharing a catalog id never let an arbitrary record answer for the named one.
   *  With no selection the plainest duplicate goes first: a pristine catalog copy is consumed
   *  before a recovered or worn instance, so the recorded instance survives its anonymous
   *  twin. Returns the consumed instance record, or null when nothing matched. */
  consumeOneModule(p, defId, options = null) {
    const inv = p.moduleInventory || [];
    const selectedId = options && options.instanceId != null ? options.instanceId : null;
    let idx = -1;
    if (selectedId != null) {
      idx = inv.findIndex((m) => m && m.instanceId === selectedId);
      if (idx < 0 || inv[idx].defId !== defId) return null; // the selection must name a live instance of this def
    } else {
      let firstMatch = -1;
      for (let i = 0; i < inv.length; i++) {
        const m = inv[i];
        if (!m || m.defId !== defId) continue;
        if (firstMatch < 0) firstMatch = i;
        if (!instanceIdentityText(m)) { idx = i; break; }
      }
      if (idx < 0) idx = firstMatch;
    }
    if (idx >= 0) { const [consumed] = inv.splice(idx, 1); return consumed || null; }
    // not in inventory — unfit from the first owned ship that has it fitted; an explicit
    // selection only takes the slot whose fitted record is that instance.
    for (let si = 0; si < (p.ownedShips || []).length; si++) {
      const s = p.ownedShips[si];
      const fittings = s && s.fittings;
      if (!Array.isArray(fittings)) continue;
      const fitted = s.fittedInstances || null;
      const slot = selectedId != null
        ? fittings.findIndex((fid, i) => fid === defId && fitted && fitted[i] && fitted[i].instanceId === selectedId)
        : fittings.indexOf(defId);
      if (slot < 0) continue;
      // Consume through the fitted-instance record — the craft eats the same record the
      // ships owner minted; a bare fittings write would orphan identity on a null slot.
      if (this._ships && typeof this._ships.takeFittedModuleInstance === 'function') {
        return this._ships.takeFittedModuleInstance(si, slot);
      }
      const inst = fitted && fitted[slot] ? { ...fitted[slot] } : null;
      fittings[slot] = null;
      this._ships.recomputeIfActive(si, fittings);
      return inst || { instanceId: null, defId };
    }
    return null;
  },

  serialize() {
    return { queues: normalizeQueues(this.state.crafting && this.state.crafting.queues) };
  },

  newGame() {
    this.state.crafting = { queues: {} };
  },

  deserialize(data) {
    this.state.crafting = { queues: normalizeQueues(data && data.queues) };
  },
};
