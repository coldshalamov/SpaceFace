// Helix identity mechanics — build_map §34 row 526, expansion bible 02 §9.
//
//   * TOO-PERFECT FALSE FLAGS — a Helix pack wears Reach red or Meridian gold and flies
//     exact geometry at matched speeds; the perfection is the tell. Break the pattern —
//     fling one member off its slot — and every transponder in the pack flips to HELIX.
//     The flip is instant and pack-wide: paperwork arrives all at once.
//   * LIEN DRONES — small, polite, adhesive. One sticks a fine to your hull, rides it as
//     dead mass while it files, then lets go dead. Scrape it off (kill it) inside the
//     dwell and nothing files.
//
// Data contract (stamps this system reads):
//   member.data.helixFalseFlag — entity is masked as another faction
//   member.data.helixPack      — pack id its slots are measured against
//   member.data.helixSlot      — {dx, dz} authored slot offset from pack centroid
//   drone.data.lienDrone       — the sticky paperwork body
// Stamps this system writes:
//   member.factionId = 'faction_helix' + member.data.falseFlagDropped / data.wasMaskedFaction
//   ship.data.lienStuck / ship.data.lienMassT / ship.data.lienFiledCr
//
// Determinism: pure geometry + simTime; no RNG, no wall clock.
// Registration hunks (manifest id 'faction_helix') live with this file's row.

import { faction as HELIX } from '../data/factions/helix.js';

const FLAG = (HELIX.custom && HELIX.custom.falseFlag) || {};
const LIEN = (HELIX.custom && HELIX.custom.lienDrone) || {};
const PATTERN_BREAK_WU = Math.max(1, Number(FLAG.patternBreakWu) || 70);
const ATTACH_WU = Math.max(1, Number(LIEN.attachWu) || 40);
const FILE_AFTER_S = Math.max(1, Number(LIEN.fileAfterS) || 12);
const FINE_CR = Math.max(0, Number(LIEN.fineCr) || 150);
const LIEN_MASS_T = Math.max(0, Number(LIEN.lienMassT) || 6);

function entityListOf(state) {
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
}

function ensureState(state) {
  const s = state.helix || (state.helix = {});
  if (!s.droppedPacks || typeof s.droppedPacks !== 'object') s.droppedPacks = {};
  if (!s.liensFiled || typeof s.liensFiled !== 'object') s.liensFiled = {};
  return s;
}

export const factionHelix = {
  name: 'faction_helix',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    ensureState(this.state);
  },

  update(dt, state) {
    const hx = ensureState(state);
    const now = Number(state.simTime) || 0;
    void dt;
    const entities = entityListOf(state);

    // ── 1. too-perfect packs: break the pattern, drop the flag ─────────────────────────
    const packs = new Map();
    for (const e of entities) {
      if (!e || e.alive === false || !e.pos) continue;
      const d = e.data || {};
      if (d.helixFalseFlag !== true || typeof d.helixPack !== 'string') continue;
      let pack = packs.get(d.helixPack);
      if (!pack) packs.set(d.helixPack, pack = []);
      pack.push(e);
    }

    for (const [packId, members] of packs) {
      if (hx.droppedPacks[packId] || members.length < 2) continue;
      let cx = 0, cz = 0;
      for (const m of members) { cx += m.pos.x; cz += m.pos.z; }
      cx /= members.length; cz /= members.length;

      // A member off its authored slot by more than the break radius ruins the geometry —
      // that is the throw landing. The breaker is the FARTHEST member off-slot: a flung
      // hull drags the centroid after it, leaving everyone technically displaced, so the
      // one who left home hardest is the throw the law should name.
      let breaker = null;
      let worstD2 = PATTERN_BREAK_WU * PATTERN_BREAK_WU;
      for (const m of members) {
        const slot = (m.data && m.data.helixSlot) || { dx: 0, dz: 0 };
        const ex = cx + (Number(slot.dx) || 0), ez = cz + (Number(slot.dz) || 0);
        const dx = m.pos.x - ex, dz = m.pos.z - ez;
        const d2 = dx * dx + dz * dz;
        if (d2 > worstD2) { worstD2 = d2; breaker = m; }
      }
      if (!breaker) continue;

      // Every flag in the pack drops at once — the paperwork was always Helix's.
      for (const m of members) {
        const d = m.data || (m.data = {});
        d.wasMaskedFaction = m.factionId;
        d.falseFlagDropped = true;
        d.helixFalseFlag = false;
        m.factionId = 'faction_helix';
        if (d.ai) d.ai.maskBroken = true;
        d.scanLabel = 'HELIX ADJUDICATOR — LAWFUL INTERDICTION';
      }
      hx.droppedPacks[packId] = { breakerId: breaker.id, t: now, memberIds: members.map((m) => m.id) };
      this.bus && this.bus.emit('helix:flagsDropped', {
        packId, breakerId: breaker.id,
        memberIds: members.map((m) => m.id),
        maskFactionId: breaker.data.wasMaskedFaction, t: now,
      });
      this.bus && this.bus.emit('comms:log', {
        from: 'HELIX ADJUDICATOR',
        text: 'Lawful interdiction. Read the invoice first.',
        kind: 'encounter',
      });
    }

    // ── 2. lien drones: stick, ride, file ───────────────────────────────────────────────
    for (const drone of entities) {
      if (!drone || drone.alive === false || !drone.pos) continue;
      const dd = drone.data || {};
      if (dd.lienDrone !== true) continue;

      const stuckId = dd.lienOn;
      if (stuckId) {
        const ship = entities.find((e) => e && e.id === stuckId) || (state.entities && state.entities.get(stuckId));
        if (!ship || ship.alive === false || !ship.pos) {
          dd.lienOn = null;
          continue;
        }
        // It rides the hull it is fining — dead mass on the scale while it files.
        drone.pos.x = ship.pos.x;
        drone.pos.z = ship.pos.z;
        drone.vel = ship.vel ? { x: ship.vel.x, z: ship.vel.z } : { x: 0, z: 0 };
        if (now - (dd.lienAtS || 0) >= FILE_AFTER_S) {
          const sd = ship.data || (ship.data = {});
          sd.lienFiledCr = (Number(sd.lienFiledCr) || 0) + FINE_CR;
          delete sd.lienStuck;
          delete sd.lienMassT;
          hx.liensFiled[ship.id] = (Number(hx.liensFiled[ship.id]) || 0) + FINE_CR;
          this.bus && this.bus.emit('helix:lienFiled', {
            droneId: drone.id, shipId: ship.id, fineCr: FINE_CR,
            totalCr: hx.liensFiled[ship.id], t: now,
          });
          this.bus && this.bus.emit('comms:log', {
            from: 'HELIX LIEN DESK',
            text: `LIEN FILED: ${FINE_CR} cr. The addendum reaches farther than the job does.`,
            kind: 'encounter',
          });
          drone.alive = false; // the paperwork is delivered; the drone is a husk
        }
        continue;
      }

      // Unstuck drones hunt the nearest non-Helix hull in reach — the player counts too.
      let best = null, bestD2 = ATTACH_WU * ATTACH_WU;
      for (const ship of entities) {
        if (!ship || ship === drone || ship.alive === false || !ship.pos) continue;
        if (ship.type !== 'ship' && ship.id !== (state.playerId || null)) continue;
        if (ship.factionId === 'faction_helix') continue;
        if (ship.data && ship.data.lienStuck) continue;      // one lien per hull — orderly
        const dx = ship.pos.x - drone.pos.x, dz = ship.pos.z - drone.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = ship; }
      }
      if (best) {
        const bd = best.data || (best.data = {});
        bd.lienStuck = drone.id;
        bd.lienMassT = LIEN_MASS_T;
        dd.lienOn = best.id;
        dd.lienAtS = now;
        this.bus && this.bus.emit('helix:lienStuck', {
          droneId: drone.id, shipId: best.id, fineCr: FINE_CR, massT: LIEN_MASS_T, t: now,
        });
      }
    }
  },
};

export default factionHelix;
