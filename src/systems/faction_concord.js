// Concord identity mechanics — build_map §34 row 515, expansion bible 02 §1.
//
//   * COMMANDERS — Concord formations hold shape around a commander hull. Fling or kill it
//     and the rest LOCK their last formation and coast rigid — the game's best bowling-pin
//     set (E-02). A locked formation never re-forms on its own: the FF is a new commander,
//     which this system will happily adopt if one is stamped into the squad.
//   * CLAMP TENDER — a flat hull with two oversized clamp arms that grabs loose CARGO,
//     never ships (E-03's tug-of-war starts here). Out-pull the clamp (drag the body past
//     the break radius) or kill the tender and the cargo comes loose.
//
// Data contract (stamps this system writes):
//   member.data.formationLocked   — true once the wing coasts rigid
//   member.data.ai.passive        — locked members stop maneuvering; physics keeps their vel
//   tender.data.clampTargetId     — the loose body in the tender's arms
//   body.data.clampedBy           — the tender holding it
//
// Membership contract (stamps it reads): entities carry `data.ai.squadId` (encounter and
// presence spawns already stamp it) and a commander is `data.formationCommander === true`,
// `data.ai.squadSocket === 'lead'`, or `data.ai.encounterRole === 'formation-commander'`.
// A tender is `data.clampTender === true` or role 'clamp-tender'.
//
// Determinism: state.simTime/state.tick only; no RNG anywhere — the lock is geometry.
// Registration hunks (manifest id 'faction_concord') live with this file's row.

import { faction as SCN } from '../data/factions/scn.js';

const CFG = (SCN.custom && SCN.custom.commander) || {};
const TENDER = (SCN.custom && SCN.custom.clampTender) || {};
const LOCK_RADIUS_WU = Math.max(1, Number(CFG.lockRadiusWu) || 120);
const GRAB_RADIUS_WU = Math.max(1, Number(TENDER.grabRadiusWu) || 200);
const BREAK_RADIUS_WU = Math.max(GRAB_RADIUS_WU, Number(TENDER.breakRadiusWu) || 320);
const MAX_CLAMP_MASS_T = Math.max(1, Number(TENDER.maxClampMassT) || 400);
const HOLD_OFFSET_WU = 34;      // where the arms pin a clamped body

function entityListOf(state) {
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
}

function ensureState(state) {
  const s = state.concord || (state.concord = {});
  if (!s.lockedFormations || typeof s.lockedFormations !== 'object') s.lockedFormations = {};
  if (!s.clamps || typeof s.clamps !== 'object') s.clamps = {};
  return s;
}

function squadIdOf(e) {
  const ai = e && e.data && e.data.ai;
  return (ai && (ai.squadId || ai.formationId)) || (e.data && e.data.formationId) || null;
}

function isCommander(e) {
  const d = e && e.data || {};
  const ai = d.ai || {};
  return d.formationCommander === true
    || ai.squadSocket === 'lead'
    || ai.encounterRole === 'formation-commander'
    || d.role === 'formation-commander';
}

function isTender(e) {
  const d = e && e.data || {};
  const ai = d.ai || {};
  return d.clampTender === true
    || ai.encounterRole === 'clamp-tender'
    || d.factionRole === 'clamp-tender'
    || d.role === 'clamp-tender';
}

// A Clamp Tender has no rule for a hull — only loose mass: cargo pods, containers, wrecks'
// leavings, thrown debris. Ships are never grabbable no matter how light.
function isClampableBody(e) {
  if (!e || e.alive === false || !e.pos || e.type === 'ship') return false;
  const d = e.data || {};
  if ((Number(e.mass) || 0) > MAX_CLAMP_MASS_T) return false;
  return e.type === 'pickup' || d.kind === 'cargo' || !!d.commodityId
    || !!d.freightCustodyPod || d.parentType === 'debris' || d.cargoBody === true
    || e.type === 'container';
}

function dist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export const factionConcord = {
  name: 'faction_concord',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    ensureState(this.state);
  },

  update(dt, state) {
    const scn = ensureState(state);
    const now = Number(state.simTime) || 0;
    const entities = entityListOf(state);
    void dt;

    // ── 1. commanders and the rigid lock ────────────────────────────────────────────────
    // Group live Concord hulls by squad. A squad with no living commander inside the lock
    // radius freezes: every member keeps its current velocity and stops maneuvering.
    const squads = new Map();
    for (const e of entities) {
      if (!e || !e.pos) continue;
      if (e.factionId !== 'faction_scn') continue;
      const squadId = squadIdOf(e);
      if (!squadId) continue;
      let squad = squads.get(squadId);
      if (!squad) squads.set(squadId, squad = { members: [], commanders: [] });
      // Dead commanders still join the commander list — the lock event names the mast
      // the wing just lost. Only the living hold the formation and the centroid.
      if (isCommander(e)) squad.commanders.push(e);
      if (e.alive !== false) squad.members.push(e);
    }

    for (const [squadId, squad] of squads) {
      if (squad.members.length < 2) continue;
      const alreadyLocked = scn.lockedFormations[squadId] === true;

      // Centroid of the wing (excluding commanders — the mast is the thing that leaves).
      let cx = 0, cz = 0, n = 0;
      for (const m of squad.members) {
        if (isCommander(m)) continue;
        cx += m.pos.x; cz += m.pos.z; n += 1;
      }
      if (n === 0) { cx = squad.members[0].pos.x; cz = squad.members[0].pos.z; n = 1; }
      cx /= n; cz /= n;

      // The commander is "present" while at least one mast is alive and inside the lock
      // radius of its own wing. Fling it past the radius — or kill it — and the lock lands.
      let commanderPresent = false;
      for (const c of squad.commanders) {
        if (c.alive === false) continue;
        if (dist2(c.pos, { x: cx, z: cz }) <= LOCK_RADIUS_WU * LOCK_RADIUS_WU) {
          commanderPresent = true;
          break;
        }
      }

      if (!commanderPresent) {
        if (!alreadyLocked) {
          scn.lockedFormations[squadId] = true;
          for (const m of squad.members) {
            const d = m.data || (m.data = {});
            d.formationLocked = true;
            const ai = d.ai || (d.ai = {});
            ai.passive = true;
            ai.lockedDrift = true;   // tacticalAI reads passive; this is the honest reason
          }
          this.bus && this.bus.emit('concord:formationLocked', {
            squadId,
            memberIds: squad.members.map((m) => m.id),
            commanderIds: squad.commanders.map((c) => c.id),
            t: now,
          });
          this.bus && this.bus.emit('comms:log', {
            from: 'SCN WING',
            text: 'Commander down — holding last formation.',
            kind: 'encounter',
          });
        }
      } else if (alreadyLocked) {
        // FF: a NEW commander inside the radius un-locks the wing — it re-forms around the
        // mast. Members keep the rigid stamp in their history but maneuver again.
        const hasLiveMast = squad.commanders.some((c) => c.alive !== false);
        if (hasLiveMast) {
          scn.lockedFormations[squadId] = false;
          for (const m of squad.members) {
            const d = m.data || {};
            d.formationLocked = false;
            const ai = d.ai || {};
            ai.lockedDrift = false;
          }
          this.bus && this.bus.emit('concord:formationReformed', { squadId, t: now });
        }
      }
    }

    // ── 2. clamp tenders — grab loose cargo, never ships ────────────────────────────────
    const tenders = entities.filter((e) => e && e.alive !== false && e.pos && e.factionId === 'faction_scn' && isTender(e));
    const liveTenderIds = new Set(tenders.map((t) => t.id));

    for (const tender of tenders) {
      const td = tender.data || (tender.data = {});
      let held = td.clampTargetId ? state.entities.get(td.clampTargetId) : null;

      // A clamped body that died, despawned, or was out-pulled comes loose.
      if (held) {
        const gone = held.alive === false || !held.pos;
        const torn = !gone && dist2(held.pos, tender.pos) > BREAK_RADIUS_WU * BREAK_RADIUS_WU;
        if (gone || torn) {
          const hd = held.data || (held.data = {});
          if (hd.clampedBy === tender.id) delete hd.clampedBy;
          delete scn.clamps[held.id];
          this.bus && this.bus.emit('concord:clampReleased', {
            tenderId: tender.id, bodyId: held.id, reason: gone ? 'body_gone' : 'out_pulled', t: now,
          });
          td.clampTargetId = null;
          held = null;
        }
      }

      if (!held) {
        // Take the nearest loose mass in reach — cargo only, by faction law.
        let best = null; let bestD2 = GRAB_RADIUS_WU * GRAB_RADIUS_WU;
        for (const body of entities) {
          if (body === tender || !isClampableBody(body)) continue;
          if (body.data && body.data.clampedBy && body.data.clampedBy !== tender.id) continue;
          const d2 = dist2(body.pos, tender.pos);
          if (d2 < bestD2) { bestD2 = d2; best = body; }
        }
        if (best) {
          const bd = best.data || (best.data = {});
          bd.clampedBy = tender.id;
          td.clampTargetId = best.id;
          scn.clamps[best.id] = { tenderId: tender.id, sinceS: now };
          this.bus && this.bus.emit('concord:clampAttached', {
            tenderId: tender.id, bodyId: best.id, massT: Math.round((Number(best.mass) || 0) * 10) / 10, t: now,
          });
          held = best;
        }
      }

      // Drag the clamped body in the arms — a rigid hold beside the hull, not a tow line.
      if (held) {
        const hx = tender.pos.x + HOLD_OFFSET_WU, hz = tender.pos.z;
        const dx = hx - held.pos.x, dz = hz - held.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        // Strong but finite pull: the body tracks the hold point, and a faster player pull
        // still wins the tug because the hold only writes velocity, never position.
        const pull = Math.min(60, d * 4);
        held.vel = {
          x: (tender.vel ? tender.vel.x : 0) + (dx / d) * pull,
          z: (tender.vel ? tender.vel.z : 0) + (dz / d) * pull,
        };
      }
    }

    // Tenders that left the field drop their clamps — the bodies fall loose.
    for (const bodyId of Object.keys(scn.clamps)) {
      const rec = scn.clamps[bodyId];
      if (liveTenderIds.has(rec.tenderId)) continue;
      const body = state.entities.get(bodyId);
      if (body && body.data && body.data.clampedBy === rec.tenderId) delete body.data.clampedBy;
      delete scn.clamps[bodyId];
    }
  },
};

export default factionConcord;
