// faction_vael.js — W-VAEL (build_map §34.5 row 524, bible 02 §6).
//
// The Vael's contracts bite physically. Done-when:
//   · Override Tender presence — it carries the lien anchor
//   · the Lien Anchor: a contract clamp that adds mass — telegraphed, contract jobs only,
//     and transferable by throwing it (LOG: `LIEN TRANSFERRED: <name> NOW OWES THE VAEL.`)
//   · Page Nine (E-18): mid-job the addendum activates and the clamp lands
//   · script-etched hull text (scan line; page 9 readable at close range)
//   · Override Head: while the Line holds a ship you fire its thrusters
//
// Deterministic: telegraph clocks and clamps read simTime only; rep/credits ride events.

import {
  VAEL_LIEN,
  VAEL_PAGE_NINE,
  VAEL_OVERRIDE_HEAD,
  VAEL_HULL_SCRIPT,
  VAEL_BARKS,
} from '../data/factions/vael.js';

const FACTION_ID = 'faction_vael';
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

/** Fresh serializable Vael record: the lien ledger is the faction's memory. */
export function ensureVaelState(state) {
  if (!state.vael || typeof state.vael !== 'object') {
    state.vael = { liens: {}, telegraphs: {}, pageNine: null, transferredCount: 0 };
  }
  const v = state.vael;
  if (!v.liens || typeof v.liens !== 'object') v.liens = {};
  if (!v.telegraphs || typeof v.telegraphs !== 'object') v.telegraphs = {};
  if (v.pageNine === undefined) v.pageNine = null;
  if (!Number.isFinite(v.transferredCount)) v.transferredCount = 0;
  return v;
}

/** True while the player is inside contract work — the lien only bites there. */
export function vaelContractJobActive(state) {
  const v = ensureVaelState(state);
  if (v.pageNine && v.pageNine.armed) return true;
  if (v.contractJobActive === true) return true;
  const active = state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  return active.some((m) => m && (m.contractJob === true || m.kind === 'contract' || m.type === 'contract' || m.kind === 'contract_haul'));
}

/** Live lien-anchor entities clamped to a host. */
export function lienAnchorFor(state, hostId) {
  for (const e of state.entityList) {
    if (e && e.alive !== false && e.data?.lienAnchor === true && e.data.hostId === hostId) return e;
  }
  return null;
}

export const vaelLiens = {
  name: 'vaelLiens',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    ensureVaelState(this.state);
  },

  /** E-18: arm the addendum on a running hazard job — the clamp comes mid-job. */
  armPageNine(state, { jobId = null } = {}) {
    const v = ensureVaelState(state);
    v.pageNine = { jobId, armed: true, armedAt: state.simTime };
    this.bus.emit('vael:pageNineArmed', { jobId, tick: state.tick });
    this.bus.emit('comms:log', { text: VAEL_PAGE_NINE.armLine, speaker: 'Vael tender' });
    return v.pageNine;
  },

  /** The telegraph: readable wind-up before the clamp. */
  _telegraphTenders(state) {
    const v = ensureVaelState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false) return;
    const contract = vaelContractJobActive(state);
    const already = lienAnchorFor(state, player.id) != null;
    const range2 = VAEL_LIEN.clampRange * VAEL_LIEN.clampRange;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.overrideTender !== true) continue;
      const near = dist2(e.pos, player.pos) <= range2;
      const tg = v.telegraphs[e.id];
      if (!contract || already || !near) { if (tg) delete v.telegraphs[e.id]; continue; }
      if (!tg) {
        v.telegraphs[e.id] = { tenderId: e.id, targetId: player.id, fireAt: state.simTime + VAEL_LIEN.telegraphS };
        this.bus.emit('vael:lienTelegraph', { tenderId: e.id, fireAt: state.simTime + VAEL_LIEN.telegraphS, tick: state.tick });
        this.bus.emit('comms:log', { text: VAEL_LIEN.telegraphLine, speaker: 'Override Tender' });
        continue;
      }
      if (state.simTime >= tg.fireAt) {
        delete v.telegraphs[e.id];
        this._clampLien(state, player, e);
      }
    }
  },

  /** The clamp lands: a physical anchor body plus the mass on the host's hull. */
  _clampLien(state, host, tender) {
    const v = ensureVaelState(state);
    if (lienAnchorFor(state, host.id)) return null;
    const anchor = this.helpers.spawnEntity({
      type: 'payload', team: 1, factionId: FACTION_ID,
      pos: { x: host.pos.x + host.radius + 12, z: host.pos.z },
      vel: { x: host.vel.x, z: host.vel.z }, rot: 0,
      radius: 9, mass: VAEL_LIEN.anchorMass, hull: 200, hullMax: 200, collides: true,
      data: {
        lienAnchor: true, hostId: host.id, clampMass: VAEL_LIEN.anchorMass,
        throwable: true, scannable: true,
        name: 'Lien Anchor',
        scanLabel: `LIEN ANCHOR · +${VAEL_LIEN.anchorMass}t clamped mass · throw it at somebody`,
      },
    });
    host.mass += VAEL_LIEN.anchorMass;
    host.data = host.data || {};
    host.data.lienMass = (Number(host.data.lienMass) || 0) + VAEL_LIEN.anchorMass;
    v.liens[anchor.id] = {
      anchorId: anchor.id, hostId: host.id, mass: VAEL_LIEN.anchorMass,
      attachedAt: state.simTime, attachedTick: state.tick,
      tenderId: tender ? tender.id : null, pageNine: !!(v.pageNine && v.pageNine.armed),
    };
    if (v.pageNine && v.pageNine.armed) v.pageNine.armed = false; // the addendum fired
    this.bus.emit('vael:lienClamped', {
      anchorId: anchor.id, hostId: host.id, mass: VAEL_LIEN.anchorMass, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: VAEL_LIEN.clampLine, speaker: 'Vael tender' });
    this.bus.emit('toast', { text: `LIEN CLAMPED — +${VAEL_LIEN.anchorMass}t on your hull`, tone: 'warn' });
    return anchor;
  },

  /**
   * Anchors ride their host until thrown. A thrown anchor that reaches a hostile hull
   * transfers the debt: `LIEN TRANSFERRED: <name> NOW OWES THE VAEL.`
   */
  _tickAnchors(state, dt) {
    const v = ensureVaelState(state);
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.lienAnchor !== true) continue;
      const lien = v.liens[e.id] || (v.liens[e.id] = {
        anchorId: e.id, hostId: e.data.hostId, mass: e.data.clampMass || VAEL_LIEN.anchorMass,
        attachedAt: state.simTime, attachedTick: state.tick,
      });
      const host = state.entities.get(e.data.hostId);
      if (e.data.detached !== true) {
        // Clamped: ride just off the host's hull.
        if (!host || host.alive === false) { this._releaseLien(state, e, lien); continue; }
        const rr = host.radius + e.radius + 6;
        const dx = e.pos.x - host.pos.x, dz = e.pos.z - host.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        // A fling reads as separation moving fast relative to the host — a host that
        // moves hard just drags its debt along (the anchor rides, it does not let go).
        const rel = Math.hypot(e.vel.x - host.vel.x, e.vel.z - host.vel.z);
        if (d > rr && rel >= VAEL_LIEN.flingSpeedMin) {
          e.data.detached = true;
          e.data.detachedTick = state.tick;
          this.bus.emit('vael:lienThrown', { anchorId: e.id, hostId: host.id, tick: state.tick });
        } else {
          e.pos.x = host.pos.x + (dx / d) * rr;
          e.pos.z = host.pos.z + (dz / d) * rr;
          e.vel.x = host.vel.x; e.vel.z = host.vel.z;
        }
        continue;
      }
      // Detached and flying (its own vel carries it; physics owns the pose from here):
      // a hostile hull in the way inherits the debt.
      const speed = Math.hypot(e.vel.x, e.vel.z);
      if (speed < VAEL_LIEN.flingSpeedMin) continue;
      for (const body of state.entityList) {
        if (body === e || !body || body.alive === false) continue;
        if (body.id === e.data.hostId || body.id === state.playerId) continue;
        if (body.type !== 'ship' && body.type !== 'machine') continue;
        if (VAEL_LIEN.transferToHostilesOnly && body.team === 0) continue;
        const rr = e.radius + (Number(body.radius) || 0) + 4;
        if (dist2(e.pos, body.pos) > rr * rr) continue;
        this._transferLien(state, e, lien, body);
        break;
      }
    }
  },

  /** The debt finds a new name. */
  _transferLien(state, anchor, lien, newHost) {
    const v = ensureVaelState(state);
    const oldHost = state.entities.get(anchor.data.hostId);
    if (oldHost) {
      oldHost.mass = Math.max(0, (Number(oldHost.mass) || 0) - lien.mass);
      if (oldHost.data) oldHost.data.lienMass = Math.max(0, (Number(oldHost.data.lienMass) || 0) - lien.mass);
    }
    newHost.mass = (Number(newHost.mass) || 0) + lien.mass;
    newHost.data = newHost.data || {};
    newHost.data.lienMass = (Number(newHost.data.lienMass) || 0) + lien.mass;
    anchor.data.hostId = newHost.id;
    anchor.data.detached = false;
    lien.hostId = newHost.id;
    lien.transferredAt = state.simTime;
    v.transferredCount += 1;
    const name = newHost.data?.name || newHost.data?.callsign || `HULL-${newHost.id}`;
    const line = VAEL_LIEN.transferLogTemplate.replace('{name}', String(name).toUpperCase());
    this.bus.emit('vael:lienTransferred', {
      anchorId: anchor.id, fromId: oldHost ? oldHost.id : null, toId: newHost.id, name, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: line, speaker: 'LOG' });
    this.bus.emit('comms:log', { text: VAEL_BARKS.transferred, speaker: 'Vael tender' });
    this.bus.emit('toast', { text: line, tone: 'good' });
  },

  /** Settle the addendum in credits — the clean way out. */
  payoffLien(state, { anchorId = null } = {}) {
    const v = ensureVaelState(state);
    const player = state.entities.get(state.playerId);
    let paid = 0;
    for (const e of state.entityList.slice()) {
      if (!e || e.alive === false || e.data?.lienAnchor !== true) continue;
      if (anchorId != null && e.id !== anchorId) continue;
      if (player && e.data.hostId !== player.id) continue;
      const lien = v.liens[e.id];
      const mass = lien ? lien.mass : e.data.clampMass || VAEL_LIEN.anchorMass;
      paid += Math.round(mass * VAEL_LIEN.payoffPerTonne);
      this._releaseLien(state, e, lien);
    }
    if (paid > 0) {
      this.bus.emit('economy:chargeCredits', { amount: paid, reason: 'vael_lien_payoff' });
      this.bus.emit('comms:log', { text: VAEL_LIEN.payoffLine, speaker: 'Vael tender' });
      this.bus.emit('vael:lienPaid', { amount: paid, tick: state.tick });
    }
    return paid;
  },

  /** Cut the clamp free — legal, and the Vael remember it. */
  cutLienLoose(state, { anchorId = null } = {}) {
    const v = ensureVaelState(state);
    const player = state.entities.get(state.playerId);
    let cut = 0;
    for (const e of state.entityList.slice()) {
      if (!e || e.alive === false || e.data?.lienAnchor !== true) continue;
      if (anchorId != null && e.id !== anchorId) continue;
      if (player && e.data.hostId !== player.id) continue;
      this._releaseLien(state, e, v.liens[e.id]);
      cut += 1;
    }
    if (cut > 0) {
      this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: VAEL_LIEN.cutLooseRepLoss, reason: 'vael_lien_cut' });
      this.bus.emit('vael:lienCut', { count: cut, tick: state.tick });
    }
    return cut;
  },

  _releaseLien(state, anchor, lien) {
    const host = state.entities.get(anchor.data.hostId);
    const mass = lien ? lien.mass : anchor.data.clampMass || VAEL_LIEN.anchorMass;
    if (host) {
      host.mass = Math.max(0, (Number(host.mass) || 0) - mass);
      if (host.data) host.data.lienMass = Math.max(0, (Number(host.data.lienMass) || 0) - mass);
    }
    delete ensureVaelState(state).liens[anchor.id];
    this.helpers.removeEntity(anchor.id, { reason: 'vael_lien_released' });
  },

  /** Override Head: while the Line holds a ship you fire ITS thrusters. */
  _overrideHead(state, dt) {
    for (const holder of state.entityList) {
      if (!holder || holder.alive === false || holder.data?.lineHeadId !== VAEL_OVERRIDE_HEAD.id) continue;
      const tether = holder.tether || (holder.id === state.playerId ? state.player?.tether : null);
      const target = tether && tether.active ? state.entities.get(tether.targetId) : null;
      if (!target || target.alive === false) continue;
      const aim = holder.id === state.playerId
        ? Number(state.input?.aimAngle) || 0
        : Number(holder.rot) || 0;
      target.vel.x += Math.cos(aim) * VAEL_OVERRIDE_HEAD.thrustAccel * dt;
      target.vel.z += Math.sin(aim) * VAEL_OVERRIDE_HEAD.thrustAccel * dt;
      this.bus.emit('vael:overrideThrust', { holderId: holder.id, targetId: target.id, aim, tick: state.tick });
    }
  },

  update(dt, state) {
    ensureVaelState(state);
    this._telegraphTenders(state);
    this._tickAnchors(state, dt);
    this._overrideHead(state, dt);
  },
};

export { VAEL_HULL_SCRIPT };
export default vaelLiens;
