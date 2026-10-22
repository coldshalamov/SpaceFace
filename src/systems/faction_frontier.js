// faction_frontier.js — W-FRONTIER (build_map §34.5 row 532, bible 02 §7).
//
// "Every captain on this board believes they are temporary." Done-when:
//   · six homestead modules plus a frame — tow them in, they snap onto slots
//   · Barn Raising (E-21): all six snapped starts the welders' clock; finish
//     before the tide/gate window or a half-built homestead survives, damaged
//   · a raised homestead persists on the chart, gains traffic on a steady beat,
//     and asks for supply runs when it has been stranded
//   · Weld Head: welds the held object wherever it touches — the bond persists
//     after the Line lets go
//
// Deterministic: every clock reads simTime; snapped modules are kinematic on the frame.

import {
  FRONTIER_MODULES,
  FRONTIER_FRAME,
  FRONTIER_BARN_RAISING,
  FRONTIER_WELD_HEAD,
  FRONTIER_HOMESTEAD,
  FRONTIER_BARKS,
} from '../data/factions/free.js';

const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };
const touching = (a, b) => dist2(a.pos, b.pos) <= (a.radius + b.radius + 2) ** 2;

/** Fresh serializable Frontier record: homesteads on the chart, open supply runs. */
export function ensureFrontierState(state) {
  if (!state.frontier || typeof state.frontier !== 'object') {
    state.frontier = { homesteads: [], supplyRuns: [] };
  }
  const f = state.frontier;
  if (!Array.isArray(f.homesteads)) f.homesteads = [];
  if (!Array.isArray(f.supplyRuns)) f.supplyRuns = [];
  return f;
}

export const frontierHomesteads = {
  name: 'frontierHomesteads',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    ensureFrontierState(this.state);
  },

  // ── E-21 Barn Raising: modules snap on, welders run, the window looms ──────────
  _tickRaising(state, dt) {
    const f = ensureFrontierState(state);
    for (const frame of state.entityList) {
      if (!frame || frame.alive === false || frame.data?.homesteadFrame !== true) continue;
      const fd = frame.data;
      fd.slots = fd.slots || {};
      if (fd.homesteadRaised === true || fd.barnDone === true) continue;
      // Snap: an unsnapped module inside range locks to the next open slot.
      for (const e of state.entityList) {
        if (!e || e.alive === false || e.data?.snapped === true) continue;
        if (typeof e.data?.homesteadModule !== 'string') continue;
        if (dist2(e.pos, frame.pos) > FRONTIER_FRAME.snapRange ** 2) continue;
        const kind = e.data.homesteadModule;
        if (fd.slots[kind]) continue; // one of each
        fd.slots[kind] = e.id;
        e.data.snapped = true;
        e.data.slotKind = kind;
        // Park it on the frame ring at its slot index — kinematic, physics leaves it be.
        const idx = Object.keys(fd.slots).length - 1;
        const a = (idx / FRONTIER_FRAME.moduleSlots) * Math.PI * 2;
        e.data.slotOffset = {
          dx: Math.cos(a) * (frame.radius + e.radius + 4),
          dz: Math.sin(a) * (frame.radius + e.radius + 4),
        };
        this.bus.emit('frontier:moduleSnapped', {
          frameId: frame.id, moduleId: e.id, kind,
          count: Object.keys(fd.slots).length, tick: state.tick,
        });
        if (!Number.isFinite(fd.raiseDeadline)) {
          // The first module starts the window — the tide does not wait for you.
          fd.raiseDeadline = state.simTime + FRONTIER_BARN_RAISING.windowS;
          this.bus.emit('comms:log', { text: FRONTIER_BARN_RAISING.startLine, speaker: 'Frontier board' });
        }
      }
      // Snapped modules ride the frame ring.
      for (const kind of Object.keys(fd.slots)) {
        const e = state.entities.get(fd.slots[kind]);
        if (e && e.data?.slotOffset) {
          e.pos.x = frame.pos.x + e.data.slotOffset.dx;
          e.pos.z = frame.pos.z + e.data.slotOffset.dz;
          e.vel.x = 0; e.vel.z = 0;
        }
      }
      const snappedCount = Object.keys(fd.slots).length;
      // All six snapped: hold the line while the welders work.
      if (snappedCount >= FRONTIER_FRAME.moduleSlots) {
        fd.weldT = (Number(fd.weldT) || 0) + dt;
        if (fd.weldT >= FRONTIER_BARN_RAISING.weldTimeS) {
          fd.homesteadRaised = true;
          fd.barnDone = true;
          this._raiseHomestead(state, frame, false);
        }
      }
      // FF: the window closes first — a half-built homestead survives, damaged.
      if (Number.isFinite(fd.raiseDeadline) && state.simTime >= fd.raiseDeadline
          && fd.barnDone !== true) {
        fd.barnDone = true;
        fd.damaged = true;
        frame.hull = Math.max(1, Math.floor(frame.hullMax * FRONTIER_BARN_RAISING.partialPenaltyHull));
        this._raiseHomestead(state, frame, true);
      }
    }
  },

  _raiseHomestead(state, frame, partial) {
    const f = ensureFrontierState(state);
    const rec = {
      entityId: frame.id,
      pos: { x: frame.pos.x, z: frame.pos.z },
      sectorId: state.world?.currentSectorId || null,
      modules: Object.keys(frame.data?.slots || {}),
      raisedAt: state.simTime, lastSupplyAt: state.simTime,
      partial, traffic: 0, supplies: 0, stranded: false,
    };
    f.homesteads.push(rec);
    frame.data.homestead = true;
    this.bus.emit(partial ? 'frontier:barnPartial' : 'frontier:homesteadRaised', {
      homesteadId: frame.id, modules: rec.modules, tick: state.tick,
    });
    this.bus.emit('comms:log', {
      text: partial ? FRONTIER_BARKS.owe : FRONTIER_BARKS.raised, speaker: 'Frontier board',
    });
    this.bus.emit('toast', {
      text: partial ? 'HOMESTEAD STANDS — DAMAGED' : 'HOMESTEAD RAISED',
      tone: partial ? 'warn' : 'info',
    });
  },

  // ── Raised homesteads persist: traffic on a beat, supply asks when stranded ────
  _tickHomesteads(state) {
    const f = ensureFrontierState(state);
    for (const rec of f.homesteads) {
      const ent = state.entities.get(rec.entityId);
      if (!ent || ent.alive === false) continue;
      // Traffic grows on its beat — the homestead is alive on the chart.
      const beats = Math.floor((state.simTime - rec.raisedAt) / FRONTIER_HOMESTEAD.trafficPeriodS);
      if (beats > rec.traffic) {
        rec.traffic = beats;
        this.bus.emit('frontier:trafficTick', { homesteadId: rec.entityId, traffic: beats, tick: state.tick });
      }
      // Stranded: left alone past the limit, it asks the board for a supply run.
      if (!rec.stranded && state.simTime - rec.lastSupplyAt > FRONTIER_HOMESTEAD.strandedAfterS) {
        rec.stranded = true;
        f.supplyRuns.push({ homesteadId: rec.entityId, askedAt: state.simTime });
        this.bus.emit('frontier:supplyRunAsked', { homesteadId: rec.entityId, tick: state.tick });
        this.bus.emit('comms:log', { text: FRONTIER_BARN_RAISING.strandedLine, speaker: 'Frontier homestead' });
      }
      // Supplies land: a pod close enough is taken aboard.
      for (const e of state.entityList) {
        if (!e || e.alive === false || e.data?.supplyCargo !== true) continue;
        if (dist2(e.pos, ent.pos) > FRONTIER_HOMESTEAD.supplyRadius ** 2) continue;
        e.data.supplyCargo = false;
        rec.supplies += 1;
        rec.stranded = false;
        rec.lastSupplyAt = state.simTime;
        this.helpers.removeEntity(e.id, { reason: 'frontier_supply_landed' });
        this.bus.emit('frontier:supplyDelivered', {
          homesteadId: rec.entityId, supplies: rec.supplies, tick: state.tick,
        });
      }
    }
  },

  // ── Weld Head: the held object welds wherever it touches ───────────────────────
  _tickWeldHeads(state, dt) {
    for (const holder of state.entityList) {
      if (!holder || holder.alive === false || holder.data?.lineHeadId !== FRONTIER_WELD_HEAD.id) continue;
      const tether = holder.tether || (holder.id === state.playerId ? state.player?.tether : null);
      const held = tether && tether.active ? state.entities.get(tether.targetId) : null;
      if (!held || held.alive === false || held.data?.weldedTo != null) continue;
      const hd = held.data || {};
      // Find the joint: the held object touching something solid.
      let joint = null;
      for (const b of state.entityList) {
        if (!b || b.alive === false || b.id === held.id || b.id === holder.id) continue;
        if (b.type === 'shard' || b.type === 'vfx' || b.type === 'machine') continue;
        if (!touching(held, b)) continue;
        joint = b; break;
      }
      if (!joint || (hd.weldTargetId != null && hd.weldTargetId !== joint.id)) {
        hd.weldT = 0; hd.weldTargetId = joint ? joint.id : undefined;
        continue;
      }
      hd.weldTargetId = joint.id;
      hd.weldT = (Number(hd.weldT) || 0) + dt;
      if (hd.weldT >= FRONTIER_WELD_HEAD.weldTimeS) {
        hd.weldedTo = joint.id;
        hd.weldedAt = state.simTime;
        hd.weldOffset = { dx: held.pos.x - joint.pos.x, dz: held.pos.z - joint.pos.z };
        this.bus.emit('frontier:welded', {
          holderId: holder.id, heldId: held.id, jointId: joint.id, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: FRONTIER_BARKS.board, speaker: 'Frontier board' });
      }
    }
    // Welded objects ride their joint — the bond outlives the Line.
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.weldedTo == null) continue;
      const joint = state.entities.get(e.data.weldedTo);
      if (!joint || joint.alive === false) { e.data.weldedTo = null; continue; }
      const off = e.data.weldOffset || { dx: 0, dz: 0 };
      e.pos.x = joint.pos.x + off.dx;
      e.pos.z = joint.pos.z + off.dz;
      e.vel.x = joint.vel.x; e.vel.z = joint.vel.z;
    }
  },

  update(dt, state) {
    ensureFrontierState(state);
    this._tickRaising(state, dt);
    this._tickHomesteads(state);
    this._tickWeldHeads(state, dt);
  },
};

export { FRONTIER_MODULES };
export default frontierHomesteads;
