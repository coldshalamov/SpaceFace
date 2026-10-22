// faction_choir.js — W-CHOIR (build_map §34.5 row 528, bible 02 §8).
//
// "The relic reports home. The shrine is home." Done-when:
//   · Bell ships pulse resonance on a beat — crystal inside the field hums, then
//     shatters; a shatter hums crystal near it, so thrown crystal chains (E-23)
//   · ribbon VFX: every pulse emits `choir:bellPulse` carrying the ribbon spec
//   · the Carried Relic pings your position to every Choir ship inside a shrine's
//     reach; crack the casing on a rock above impact speed before the shrine
//     radius, or arrive with the choir behind you (E-22)
//   · Bell Head: whatever your Line slams rings, and the ring shatters nearby
//     crystal the same way a Bell does
//   · the mark: cracked relics delivered to a shrine pile up as tribute
//
// Deterministic: pulse and ping clocks read simTime; no wall time, no Math.random.

import {
  CHOIR_BELLS,
  CHOIR_RIBBONS,
  CHOIR_CARRIED_RELIC,
  CHOIR_BELL_HEAD,
  CHOIR_SHRINE,
  CHOIR_BARKS,
} from '../data/factions/choir.js';

const FACTION_ID = 'faction_choir';
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };
const relSpeed = (a, b) => Math.hypot(a.vel.x - b.vel.x, a.vel.z - b.vel.z);
const touching = (a, b) => dist2(a.pos, b.pos) <= (a.radius + b.radius + 2) ** 2;

/** Crystal is a material, not a type — any body stamped crystalline answers the bell. */
export function isCrystal(e) {
  const d = e && e.data;
  if (!d) return false;
  return d.material === 'crystal' || d.substance === 'crystal'
    || d.asteroidType === 'ast_crystalline' || d.typeId === 'ast_crystalline';
}

/** Fresh serializable Choir record: shatter count, shrine tribute, the sacrilege ledger. */
export function ensureChoirState(state) {
  if (!state.choir || typeof state.choir !== 'object') {
    state.choir = { shatters: 0, tribute: [], alarms: 0 };
  }
  const c = state.choir;
  if (!Number.isFinite(c.shatters)) c.shatters = 0;
  if (!Array.isArray(c.tribute)) c.tribute = [];
  if (!Number.isFinite(c.alarms)) c.alarms = 0;
  return c;
}

export const choirResonance = {
  name: 'choirResonance',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._pulseAt = new Map(); // bellId -> next pulse simTime
    this._ringAt = new Map();  // holderId -> last Bell Head ring simTime
    ensureChoirState(this.state);
  },

  /** Hum a crystal: it answers the resonance for `humS`, then lets go. */
  _hum(e, simTime, humS) {
    e.data = e.data || {};
    if (Number.isFinite(e.data.choirHumAt)) return; // already singing
    e.data.choirHumAt = simTime;
    e.data.choirHumDur = humS;
  },

  /** One pulse out of a Bell (or a Bell Head ring): hum every crystal in reach. */
  _pulse(state, sourceId, pos, radius, humS, kind) {
    for (const e of state.entityList) {
      if (!e || e.alive === false || !isCrystal(e)) continue;
      if (dist2(e.pos, pos) <= radius * radius) this._hum(e, state.simTime, humS);
    }
    this.bus.emit('choir:bellPulse', {
      kind, sourceId, pos: { x: pos.x, z: pos.z }, radius,
      ribbons: { count: CHOIR_RIBBONS.ribbonCount, palette: CHOIR_RIBBONS.palette },
      tick: state.tick,
    });
  },

  /** Crystal whose hum has run its duration shatters — and hums its neighbours. */
  _shatterCrystal(state, dt) {
    for (const e of [...state.entityList]) {
      if (!e || e.alive === false || !isCrystal(e)) continue;
      const humAt = e.data.choirHumAt;
      if (!Number.isFinite(humAt)) continue;
      const dur = Number(e.data.choirHumDur) || CHOIR_BELLS.humDurationS;
      if (state.simTime < humAt + dur) continue;
      const c = ensureChoirState(state);
      c.shatters += 1;
      const pos = { x: e.pos.x, z: e.pos.z };
      this.bus.emit('choir:crystalShattered', {
        entityId: e.id, pos, shards: CHOIR_BELLS.shatterShardCount, tick: state.tick,
      });
      // The chain: a shattering crystal hums any crystal close enough to hear it.
      for (const n of state.entityList) {
        if (!n || n.alive === false || n.id === e.id || !isCrystal(n)) continue;
        if (dist2(n.pos, pos) <= CHOIR_BELLS.chainRadius * CHOIR_BELLS.chainRadius) {
          this._hum(n, state.simTime, CHOIR_BELLS.chainHumS);
        }
      }
      this.helpers.removeEntity(e.id, { reason: 'choir_resonance' });
    }
  },

  // ── Bells (E-23) ───────────────────────────────────────────────────────────────
  _tickBells(state) {
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.choirBell !== true) continue;
      const at = this._pulseAt.get(e.id) ?? -1;
      if (state.simTime >= at) {
        this._pulseAt.set(e.id, state.simTime + CHOIR_BELLS.pulsePeriodS);
        this._pulse(state, e.id, e.pos, CHOIR_BELLS.pulseRadius, CHOIR_BELLS.humDurationS, 'bell');
        this.bus.emit('comms:log', { text: CHOIR_BARKS.home, speaker: 'Ascendant Choir' });
      }
    }
  },

  // ── The Carried Relic (E-22) ───────────────────────────────────────────────────
  _tickRelics(state) {
    const c = ensureChoirState(state);
    for (const relic of state.entityList) {
      if (!relic || relic.alive === false || relic.data?.carriedRelic !== true) continue;
      const rd = relic.data;
      // Crack first: a hard enough meeting with a solid body opens the casing.
      if (rd.casingCracked !== true) {
        for (const b of state.entityList) {
          if (!b || b.alive === false || b.id === relic.id) continue;
          if (b.type !== 'asteroid' && b.type !== 'wreck' && b.type !== 'debris') continue;
          if (!touching(relic, b)) continue;
          if (relSpeed(relic, b) < CHOIR_CARRIED_RELIC.crackImpactSpeed) continue;
          rd.casingCracked = true;
          this.bus.emit('choir:relicCracked', { relicId: relic.id, tick: state.tick });
          this.bus.emit('comms:log', { text: CHOIR_CARRIED_RELIC.crackLine, speaker: 'Ascendant Choir' });
          break;
        }
      }
      // Shrine reach: it pings the carrier's position to every Choir ship.
      const shrine = this._nearestShrine(state, relic.pos);
      if (!shrine) continue;
      const d2shrine = dist2(relic.pos, shrine.pos);
      if (rd.casingCracked !== true) {
        if (d2shrine <= CHOIR_CARRIED_RELIC.pingRadius ** 2
            && state.simTime >= (rd.lastPingAt ?? -Infinity) + CHOIR_CARRIED_RELIC.pingPeriodS) {
          rd.lastPingAt = state.simTime;
          for (const s of state.entityList) {
            if (!s || s.alive === false || s.factionId !== FACTION_ID) continue;
            s.data = s.data || {};
            s.data.relicPing = { x: relic.pos.x, z: relic.pos.z, at: state.simTime };
          }
          this.bus.emit('choir:relicPing', {
            relicId: relic.id, pos: { x: relic.pos.x, z: relic.pos.z }, tick: state.tick,
          });
          this.bus.emit('comms:log', { text: CHOIR_CARRIED_RELIC.sealedLine, speaker: 'Ascendant Choir' });
        }
        // Cross the shrine radius sealed — the whole choir is behind you.
        if (d2shrine <= CHOIR_CARRIED_RELIC.shrineRadius ** 2 && rd.alarmRaised !== true) {
          rd.alarmRaised = true;
          c.alarms += 1;
          for (const s of state.entityList) {
            if (!s || s.alive === false || s.factionId !== FACTION_ID) continue;
            s.data = s.data || {};
            s.data.relicHunt = { targetId: relic.id, at: state.simTime };
          }
          this.bus.emit('choir:relicAlarm', {
            relicId: relic.id, shrineId: shrine.id, tick: state.tick,
          });
          this.bus.emit('comms:log', { text: CHOIR_CARRIED_RELIC.alarmLine, speaker: 'Ascendant Choir' });
        }
      } else if (d2shrine <= CHOIR_CARRIED_RELIC.shrineRadius ** 2 && rd.tributed !== true) {
        // Delivered cracked: the shrine piles up what you brought.
        rd.tributed = true;
        c.tribute.push({ relicId: relic.id, shrineId: shrine.id, at: state.simTime });
        this.bus.emit('choir:tribute', {
          relicId: relic.id, shrineId: shrine.id, tick: state.tick,
        });
      }
    }
  },

  _nearestShrine(state, pos) {
    let best = null, bestD = Infinity;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.choirShrine !== true) continue;
      const d = dist2(e.pos, pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  },

  // ── Bell Head: whatever your Line slams rings ──────────────────────────────────
  _bellHeads(state) {
    for (const holder of state.entityList) {
      if (!holder || holder.alive === false || holder.data?.lineHeadId !== CHOIR_BELL_HEAD.id) continue;
      const tether = holder.tether || (holder.id === state.playerId ? state.player?.tether : null);
      const held = tether && tether.active ? state.entities.get(tether.targetId) : null;
      if (!held || held.alive === false) continue;
      const lastRing = this._ringAt.get(holder.id) ?? -Infinity;
      if (state.simTime - lastRing < CHOIR_BELL_HEAD.ringCooldownS) continue;
      // The slam: the held object meets anything solid at ring speed.
      for (const b of state.entityList) {
        if (!b || b.alive === false || b.id === held.id || b.id === holder.id) continue;
        if (b.type === 'shard' || b.type === 'vfx') continue;
        if (!touching(held, b)) continue;
        if (relSpeed(held, b) < CHOIR_BELL_HEAD.ringMinImpactSpeed) continue;
        this._ringAt.set(holder.id, state.simTime);
        this._pulse(state, holder.id, held.pos, CHOIR_BELL_HEAD.ringRadius,
          CHOIR_BELL_HEAD.humDurationS, 'head');
        this.bus.emit('choir:bellHeadRing', {
          holderId: holder.id, heldId: held.id, hitId: b.id,
          pos: { x: held.pos.x, z: held.pos.z }, tick: state.tick,
        });
        break;
      }
    }
  },

  update(dt, state) {
    ensureChoirState(state);
    this._tickBells(state);
    this._shatterCrystal(state, dt);
    this._tickRelics(state);
    this._bellHeads(state);
  },
};

export { CHOIR_SHRINE };
export default choirResonance;
