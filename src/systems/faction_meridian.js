// Meridian identity mechanics — build_map §34 row 516, expansion bible 02 §2.
//
//   * CARGO SPINES — a tug pulls containers on rigid couplers; a flail you can steal. A
//     coupler snaps when the joint's relative speed or stretch crosses the authored
//     thresholds (a thrown rock into a container does exactly that), and every container
//     behind the break becomes loose mass. Drift a loose container back to the tail and
//     it re-links — re-coupling the train is a physical act, not a menu.
//   * HULL TICKERS — flank light-strips scroll the live price of the cargo inside. A
//     container drifting loose bleeds value on its ticker down to the salvage floor;
//     re-linked or held, the ticker freezes.
//   * TOLL PYLONS are data-only here (faction.mts.custom.tollPylon) — the lane's toll
//     authority already owns the charge.
//
// Data contract (stamps this system reads):
//   entity.data.spineId      — the train this body belongs to (string)
//   entity.data.spineIndex   — order in the train; index 0 is the tug (never goes loose)
//   entity.data.cargoValueCr — the ticker's live value
// Stamps this system writes:
//   entity.data.spineLoose   — true once the coupler ahead of it snapped
//   entity.data.lostFromSpineId — the train it fell off (story + recouple bookkeeping)
//   entity.data.tickerValueCr / data.scanLabel — the readable countdown
//
// Determinism: geometry + dt only; no RNG, no wall clock.
// Registration hunks (manifest id 'faction_meridian') live with this file's row.

import { faction as MTS } from '../data/factions/mts.js';

const SPINE = (MTS.custom && MTS.custom.cargoSpine) || {};
const TICKER = (MTS.custom && MTS.custom.hullTicker) || {};
const SNAP_SPEED = Math.max(1, Number(SPINE.couplerSnapSpeed) || 55);
const STRETCH_WU = Math.max(1, Number(SPINE.couplerStretchWu) || 90);
const RECOUPLE_WU = Math.max(1, Number(SPINE.recoupleWu) || 38);
const BLEED_PER_S = Math.max(0, Number(TICKER.valueBleedPerS) || 90);
const FLOOR_CR = Math.max(0, Number(TICKER.salvageFloorCr) || 400);

function entityListOf(state) {
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
}

function ensureState(state) {
  const s = state.meridian || (state.meridian = {});
  if (!s.snaps || typeof s.snaps !== 'object') s.snaps = {};        // spineId -> [{atIndex, tailIds, t}]
  if (!s.floorHit || typeof s.floorHit !== 'object') s.floorHit = {}; // containerId -> true
  return s;
}

function relSpeed(a, b) {
  const av = a.vel || { x: 0, z: 0 }, bv = b.vel || { x: 0, z: 0 };
  return Math.hypot(av.x - bv.x, av.z - bv.z);
}

function fmtCr(v) {
  return `${Math.max(0, Math.round(v)).toLocaleString('en-US')} CR`;
}

export const factionMeridian = {
  name: 'faction_meridian',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    ensureState(this.state);
  },

  update(dt, state) {
    const mer = ensureState(state);
    const now = Number(state.simTime) || 0;
    const step = Number(dt) > 0 ? Number(dt) : 1 / 60;
    const entities = entityListOf(state);

    // Group spine members; a body is a member while it carries spineId+spineIndex and lives.
    const spines = new Map();
    const loose = [];
    for (const e of entities) {
      if (!e || e.alive === false || !e.pos) continue;
      const d = e.data || {};
      if (d.spineLoose === true) { loose.push(e); continue; }
      if (typeof d.spineId !== 'string' || !Number.isFinite(d.spineIndex)) continue;
      let spine = spines.get(d.spineId);
      if (!spine) spines.set(d.spineId, spine = []);
      spine.push(e);
    }

    // ── 1. couplers break ──────────────────────────────────────────────────────────────
    for (const [spineId, members] of spines) {
      members.sort((a, b) => a.data.spineIndex - b.data.spineIndex);
      // A spine whose lead is gone is not a spine: every remaining body is loose mass.
      // (The tug carries index 0; kill it and the whole train spills.)
      let breakAt = -1;
      if (members.length && members[0].data.spineIndex > 0) breakAt = 0;
      // Find the first broken joint: the gap between member i-1 and i fails on relative
      // speed (a hit), stretch (a tear), or a dead link ahead of it.
      for (let i = 1; breakAt < 0 && i < members.length; i++) {
        const prev = members[i - 1], cur = members[i];
        if (prev.data.spineLoose === true) { breakAt = i; break; }
        const dx = cur.pos.x - prev.pos.x, dz = cur.pos.z - prev.pos.z;
        const dist = Math.hypot(dx, dz);
        if (relSpeed(prev, cur) > SNAP_SPEED || dist > STRETCH_WU) { breakAt = i; break; }
      }
      if (breakAt >= 0) {
        const tail = members.slice(breakAt);
        for (const m of tail) {
          const d = m.data || (m.data = {});
          d.spineLoose = true;
          d.lostFromSpineId = spineId;
          delete d.spineId;
          delete d.spineIndex;
        }
        (mer.snaps[spineId] || (mer.snaps[spineId] = []))
          .push({ atIndex: breakAt, tailIds: tail.map((m) => m.id), t: now });
        this.bus && this.bus.emit('meridian:couplerSnapped', {
          spineId, atIndex: breakAt, tailIds: tail.map((m) => m.id), t: now,
        });
        this.bus && this.bus.emit('comms:log', {
          from: 'MTS SPINE',
          text: `Coupler ${breakAt} gone — ${tail.length} container${tail.length === 1 ? '' : 's'} loose.`,
          kind: 'encounter',
        });
      }
    }

    // ── 2. loose containers re-couple ───────────────────────────────────────────────────
    // The tail of each surviving spine is the only dock: drift a loose body to it and the
    // joint closes behind it. The lead of a dead spine can never re-head a train.
    const tails = new Map();
    for (const [spineId, members] of spines) {
      if (!members.length) continue;
      tails.set(spineId, members[members.length - 1]);
    }
    for (const body of loose) {
      const d = body.data || (body.data = {});
      let best = null, bestId = null, bestD2 = RECOUPLE_WU * RECOUPLE_WU;
      for (const [spineId, tail] of tails) {
        if (tail === body || tail.alive === false) continue;
        const dx = body.pos.x - tail.pos.x, dz = body.pos.z - tail.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = tail; bestId = spineId; }
      }
      if (!best) continue;
      d.spineLoose = false;
      d.spineId = bestId;
      d.spineIndex = (best.data.spineIndex || 0) + 1;
      this.bus && this.bus.emit('meridian:containerRecoupled', {
        spineId: bestId, id: body.id, index: d.spineIndex,
        fromSpineId: d.lostFromSpineId || null, t: now,
      });
      delete d.lostFromSpineId;
      // The just-linked body is the new tail — chain re-couples in one pass, no stall.
      tails.set(bestId, body);
    }

    // ── 3. hull tickers count a drifting container down ─────────────────────────────────
    for (const e of entities) {
      if (!e || e.alive === false) continue;
      const d = e.data || {};
      if (!Number.isFinite(d.cargoValueCr)) continue;
      const isLoose = d.spineLoose === true;
      if (isLoose && d.cargoValueCr > FLOOR_CR) {
        d.cargoValueCr = Math.max(FLOOR_CR, d.cargoValueCr - BLEED_PER_S * step);
        if (d.cargoValueCr <= FLOOR_CR && !mer.floorHit[e.id]) {
          mer.floorHit[e.id] = true;
          this.bus && this.bus.emit('meridian:tickerFloor', { id: e.id, floorCr: FLOOR_CR, t: now });
        }
      }
      const value = Math.round(d.cargoValueCr);
      if (d.tickerValueCr !== value) {
        d.tickerValueCr = value;
        if (isLoose) d.scanLabel = `LOOSE MTS CONTAINER — ${fmtCr(value)} ▼`;
        else if (typeof d.spineId === 'string') d.scanLabel = `MTS SPINE CONTAINER — ${fmtCr(value)}`;
      }
    }
  },
};

export default factionMeridian;
