// faction_archive.js — W-ARCHIVE (build_map §34.5 row 527, bible 02 §12).
//
// The Archive's weapon is Redaction. Done-when:
//   · Censor frigate: pulses Redaction on a beat — engines and HUD go dark
//   · escape by swinging: clear the field radius early by riding the Line out (E-29)
//   · page drones copy your logs; copied secrets become trade goods later
//   · Index Head: hold the Line and scan — read an object's provenance
//   · reading-room interior (authored spec data)
//   · they never destroy: redaction disables, nothing here kills
//
// Deterministic: pulse and copy clocks read simTime; the drone approach is kinematic.

import {
  ARCHIVE_REDACTION,
  ARCHIVE_PAGE_DRONES,
  ARCHIVE_READING_ROOM,
  ARCHIVE_INDEX_HEAD,
  ARCHIVE_BARKS,
} from '../data/factions/archive.js';

const FACTION_ID = 'faction_archive';
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

/** Fresh serializable Archive record: the redaction field, copied logs, the writ ledger. */
export function ensureArchiveState(state) {
  if (!state.archive || typeof state.archive !== 'object') {
    state.archive = { redaction: null, copiedLogs: [], droneCopies: 0 };
  }
  const a = state.archive;
  if (a.redaction === undefined) a.redaction = null;
  if (!Array.isArray(a.copiedLogs)) a.copiedLogs = [];
  if (!Number.isFinite(a.droneCopies)) a.droneCopies = 0;
  return a;
}

/** True while the player is inside a live redaction: engines and HUD are dark. */
export function isRedacted(state) {
  const a = ensureArchiveState(state);
  return !!(a.redaction && a.redaction.active);
}

/** What the HUD/flight lanes read: darkness means momentum and the Line only. */
export function redactionBlackout(state) {
  const a = ensureArchiveState(state);
  if (!a.redaction || !a.redaction.active) return { enginesDark: false, hudDark: false };
  return { enginesDark: ARCHIVE_REDACTION.enginesDark, hudDark: ARCHIVE_REDACTION.hudDark };
}

export const archiveRedaction = {
  name: 'archiveRedaction',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._pulseAt = new Map(); // censorId -> next pulse simTime
    ensureArchiveState(this.state);
  },

  // ── Redaction (E-29) ───────────────────────────────────────────────────────────
  _tickCensors(state) {
    const a = ensureArchiveState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false) return;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.censorFrigate !== true) continue;
      const at = this._pulseAt.get(e.id) ?? -1;
      const d2 = dist2(e.pos, player.pos);
      const r = ARCHIVE_REDACTION.pulseRadius;
      if (state.simTime >= at && d2 <= r * r) {
        this._pulseAt.set(e.id, state.simTime + ARCHIVE_REDACTION.pulsePeriodS);
        this._redact(state, player, e);
      }
    }
    // Escape: out past the field radius + bonus and the dark lifts early — you swung out.
    const red = a.redaction;
    if (red && red.active) {
      const censor = state.entities.get(red.censorId);
      const gone = !censor || censor.alive === false;
      const escaped = !gone
        && dist2(player.pos, censor.pos) > (ARCHIVE_REDACTION.pulseRadius + ARCHIVE_REDACTION.escapeRadiusBonus) ** 2;
      if (gone || escaped || state.simTime >= red.untilSimTime) {
        this._lift(state, escaped && state.simTime < red.untilSimTime);
      }
    }
  },

  _redact(state, player, censor) {
    const a = ensureArchiveState(state);
    a.redaction = {
      active: true, censorId: censor.id,
      untilSimTime: state.simTime + ARCHIVE_REDACTION.durationS,
      enginesDark: ARCHIVE_REDACTION.enginesDark, hudDark: ARCHIVE_REDACTION.hudDark,
      pulsedAt: state.simTime,
    };
    player.data = player.data || {};
    player.data.redacted = true;
    player.data.enginesDark = ARCHIVE_REDACTION.enginesDark;
    this.bus.emit('archive:redacted', {
      censorId: censor.id, untilSimTime: a.redaction.untilSimTime,
      enginesDark: ARCHIVE_REDACTION.enginesDark, hudDark: ARCHIVE_REDACTION.hudDark, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: ARCHIVE_REDACTION.pulseLine, speaker: 'Archive censor' });
    this.bus.emit('toast', { text: 'REDACTED — engines dark. Swing.', tone: 'warn' });
  },

  _lift(state, escaped) {
    const a = ensureArchiveState(state);
    const player = state.entities.get(state.playerId);
    if (player && player.data) { player.data.redacted = false; player.data.enginesDark = false; }
    const was = a.redaction;
    a.redaction = null;
    this.bus.emit('archive:redactionLifted', { escaped, censorId: was?.censorId ?? null, tick: state.tick });
    if (escaped) {
      this.bus.emit('comms:log', { text: ARCHIVE_REDACTION.escapeLine, speaker: 'Archive censor' });
      this.bus.emit('toast', { text: 'CLEAR — the Archive took notes anyway', tone: 'info' });
    }
  },

  // ── Page drones: copy your logs, leave with them ───────────────────────────────
  _tickPageDrones(state, dt) {
    const a = ensureArchiveState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false) return;
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.data?.pageDrone) continue;
      const d = Math.sqrt(dist2(e.pos, player.pos)) || 1;
      const copies = e.data.droneCopies || 0;
      if (copies >= ARCHIVE_PAGE_DRONES.maxCopiesPerDrone || e.data.departing) {
        // Full notebook — it leaves.
        e.data.departing = true;
        const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
        e.vel.x = (dx / d) * ARCHIVE_PAGE_DRONES.approachSpeed;
        e.vel.z = (dz / d) * ARCHIVE_PAGE_DRONES.approachSpeed;
        e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
        if (d > ARCHIVE_PAGE_DRONES.departRange) this.helpers.removeEntity(e.id, { reason: 'page_drone_departed' });
        continue;
      }
      if (d > ARCHIVE_PAGE_DRONES.copyRange) {
        const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
        e.vel.x = (dx / d) * ARCHIVE_PAGE_DRONES.approachSpeed;
        e.vel.z = (dz / d) * ARCHIVE_PAGE_DRONES.approachSpeed;
        e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
        continue;
      }
      // In range: it holds and copies.
      e.vel.x = player.vel.x; e.vel.z = player.vel.z;
      e.data.copyT = (Number(e.data.copyT) || 0) + dt;
      if (e.data.copyT >= ARCHIVE_PAGE_DRONES.copyTimeS) {
        e.data.copyT = 0;
        e.data.droneCopies = copies + 1;
        a.droneCopies += 1;
        a.copiedLogs.push({
          at: state.simTime, tick: state.tick, sectorId: state.world?.currentSectorId || null,
          tradeGoodId: ARCHIVE_PAGE_DRONES.copiedTradeGoodId,
          note: `flight log page ${a.droneCopies}`,
        });
        this.bus.emit('archive:logCopied', {
          droneId: e.id, copies: a.droneCopies, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: ARCHIVE_PAGE_DRONES.copyLine, speaker: 'Archive' });
      }
    }
  },

  /**
   * Index Head: hold the Line on an object for scanTimeS and read its provenance —
   * owners, mass record, where it has been. The investigation tool for Books 5–7.
   */
  _indexHead(state, dt) {
    for (const holder of state.entityList) {
      if (!holder || holder.alive === false || holder.data?.lineHeadId !== ARCHIVE_INDEX_HEAD.id) continue;
      const tether = holder.tether || (holder.id === state.playerId ? state.player?.tether : null);
      const target = tether && tether.active ? state.entities.get(tether.targetId) : null;
      const d = holder.data;
      if (!target || target.alive === false) { if (d.indexScanT) d.indexScanT = 0; continue; }
      d.indexScanT = (Number(d.indexScanT) || 0) + dt;
      if (d.indexScanT >= ARCHIVE_INDEX_HEAD.scanTimeS && d.indexScanId !== target.id) {
        d.indexScanId = target.id;
        const record = this.provenanceScan(state, target);
        this.bus.emit('archive:indexRead', { holderId: holder.id, targetId: target.id, record, tick: state.tick });
        this.bus.emit('comms:log', {
          text: `INDEX: ${record.label} — ${record.owners.length} owner(s), mass ${record.mass}t${record.provenance ? `, ${record.provenance}` : ''}`,
          speaker: 'Index Head',
        });
      }
    }
  },

  /** The provenance record an Index Head reads off a held object. */
  provenanceScan(state, target) {
    const d = target.data || {};
    const owners = [];
    if (d.ownerId != null) owners.push(d.ownerId);
    if (d.lastThrowerId != null && !owners.includes(d.lastThrowerId)) owners.push(d.lastThrowerId);
    if (d.thrownBy != null && !owners.includes(d.thrownBy)) owners.push(d.thrownBy);
    if (target.factionId && !owners.includes(target.factionId)) owners.push(target.factionId);
    if (d.provenance && typeof d.provenance === 'object') {
      for (const o of Array.isArray(d.provenance.owners) ? d.provenance.owners : []) {
        if (!owners.includes(o)) owners.push(o);
      }
    }
    return {
      entityId: target.id,
      label: d.name || d.typeId || target.type,
      mass: Number(target.mass) || 0,
      owners,
      worldRecordId: d.worldRecordId || null,
      provenance: d.provenance?.summary || d.pieceLabel || null,
      scannedAt: state.simTime,
    };
  },

  update(dt, state) {
    ensureArchiveState(state);
    this._tickCensors(state);
    this._tickPageDrones(state, dt);
    this._indexHead(state, dt);
  },
};

export { ARCHIVE_READING_ROOM };
export default archiveRedaction;
