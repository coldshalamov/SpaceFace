// special500DockLedger.js — the per-station dock counter and its counter-family legs
// (special-500 Phase 2, batch 18: SPX-C-01, SP2-098, SP2-053, SP1-184).
//
// One writer for the dock-moment counters: the `dock:docked` receipt both docking producers
// already emit (ui/input.js for a manual dock, world.js for a tow arrival) is the real event,
// and every increment is one receipt — the same add-model achievements.js uses for its `docks`
// career counter. No update(): this system subscribes at init and never ticks.
//
// Plain-named story flags (never the special500. namespace — that is the director's), written
// ONLY here, each once latched before its emit:
//   station_docks       { [stationId]: count } — the counter itself, save-carried whole
//   airlock_crossword   simTime — SP2-098: the first dock that crosses 15 at one station
//   quinns_stool        simTime — SP2-053: the 10th dock at a Quinn bar station
//   berth_void_armed    { stationId, at } — SPX-C-01: the first station to 5 docks (at that
//                       dock it is by definition the most-docked station) — the berth next
//                       door is vacated from here on
//   berth_flood_done    simTime — SPX-C-01: the one flood pulse, keyed to a late day-window,
//                       never repeated, never explained
//   berth_squatter      { stationId, at, deedKind } — SP1-184: the stranger in the habitual
//                       berth (a dock at the current most-docked station once it is
//                       established), once; `deedKind` is the gift precision read
//                       (deedRecord.pickDeedToTell — the stranger's gift matches the record)
//
// Readers (live, each on its own owner): the airlock dressing paints through `graffiti:show`
// (comms.js place-graffiti owner), the flood pulse through `presentation:vfxCue` (the vfx
// owner's cue admission, same two-gate reduced-motion read as bombs.js/hullBurst.js and the
// spectacle registry), Quinn's greeting and the Ceres host through barContacts.js flag reads,
// the stool letter through mail.js's `{ type: 'flag' }` trigger row.
//
// Determinism: counters move on receipts only; the day-window reads state.simTime against
// CAL_DAY_S; the deed pick is deedRecord's own seeded hash. Missing state objects degrade to
// honest no-ops (a dock without a stationId is counted nowhere and writes nothing).

import { CAL_DAY_S } from '../data/worldCalendar.js';
import { pickDeedToTell, DEED_KINDS } from './deedRecord.js';

// The Quinn bar stations (barContacts.js CANONICAL_CONTACTS key 'quinn').
const QUINN_STATIONS = Object.freeze(['station_smuggler', 'station_sker']);

// Thresholds the followups author: crossword at 15 same-station docks, the stool letter at
// 10, the berth-void arms at 5, the squatter needs an established habit.
const CROSSWORD_DOCKS = 15;
const STOOL_DOCKS = 10;
const BERTH_VOID_DOCKS = 5;
const SQUATTER_MIN_DOCKS = 8;

// SPX-C-01's one flood pulse fires on a dock inside this late-day window (a fraction of the
// 600 s sector day), once, never repeated. Outside the window it simply waits for a later dock.
const FLOOD_WINDOW_FRACTION = Object.freeze([0.72, 0.9]);

export function ensureLedgerFlags(state) {
  const story = state.story || (state.story = { flags: {} });
  if (!story.flags || typeof story.flags !== 'object') story.flags = {};
  const flags = story.flags;
  if (!flags.station_docks || typeof flags.station_docks !== 'object' || Array.isArray(flags.station_docks)) {
    flags.station_docks = {};
  }
  return flags;
}

/** The per-station dock count, 0 for an unknown station. Read-only. */
export function stationDockCount(state, stationId) {
  const flags = state && state.story && state.story.flags;
  const map = flags && flags.station_docks;
  const n = map && typeof map === 'object' ? map[stationId] : 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** The current most-docked station id, ties broken alphabetically; null before any dock. */
export function mostDockedStationId(state) {
  const flags = state && state.story && state.story.flags;
  const map = flags && flags.station_docks;
  if (!map || typeof map !== 'object') return null;
  let best = null;
  let bestCount = 0;
  for (const id of Object.keys(map).sort()) {
    const n = Math.max(0, Math.floor(Number(map[id])) || 0);
    if (n > bestCount) { best = id; bestCount = n; }
  }
  return best;
}

/**
 * SP2-053's payout nudge: +1 cr on every completed contract offered at a Quinn bar station,
 * for the rest of the game (tiny, real). Pure read of the stool flag; the settlement owner
 * (systems/missions.js) applies it beside its other settled bonuses.
 */
export function quinnStoolPayoutBonus(state, mission) {
  const flags = state && state.story && state.story.flags;
  if (!flags || flags.quinns_stool == null) return 0;
  return mission && QUINN_STATIONS.includes(mission.stationId) ? 1 : 0;
}

// Same two-gate read bombs.js/hullBurst.js and the spectacle registry apply to their tells:
// either accessibility flag drops the cue to the reduced variant inside the vfx owner.
function reducedMotion(state) {
  const settings = state && state.settings;
  const v = settings && settings.video;
  const a = settings && settings.accessibility;
  return !!((v && (v.motionReduce || v.flashReduce)) || (a && a.flashReduce));
}

function stationPos(state, stationId) {
  const active = state && state.world && (state.world.activeSector || state.world.active);
  const rows = (active && active.stations) || [];
  const row = rows.find((r) => r && (r.stationId === stationId || r.id === stationId));
  return row && row.pos && Number.isFinite(row.pos.x) && Number.isFinite(row.pos.z)
    ? { x: row.pos.x, z: row.pos.z } : null;
}

function withinFloodWindow(simTime) {
  const frac = (Number(simTime) || 0) % CAL_DAY_S / CAL_DAY_S;
  return frac >= FLOOD_WINDOW_FRACTION[0] && frac <= FLOOD_WINDOW_FRACTION[1];
}

export function createSpecial500DockLedger() {
  return {
    name: 'special500DockLedger',

    init(ctx) {
      for (const off of this.off || []) { if (typeof off === 'function') off(); }
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      this.off = this.bus ? [this.bus.on('dock:docked', (p) => this._onDocked(p || {}))] : [];
    },

    destroy() {
      for (const off of this.off || []) { try { off(); } catch (e) { /* shutdown */ } }
      this.off = [];
      this.state = null;
      this.bus = null;
    },

    _latch(key, value) {
      const state = this.state;
      const flags = ensureLedgerFlags(state);
      if (flags[key] != null) return false;
      flags[key] = value;
      return true;
    },

    _onDocked(payload) {
      const state = this.state;
      const bus = this.bus;
      if (!state || !bus) return;
      const stationId = typeof payload.stationId === 'string' ? payload.stationId : '';
      if (!stationId) return; // no station identity: counted nowhere, nothing to read
      const now = Number(state.simTime) || 0;
      const flags = ensureLedgerFlags(state);
      const count = stationDockCount(state, stationId) + 1;
      flags.station_docks[stationId] = count;
      const sectorId = (state.world && state.world.currentSectorId) || null;

      // SP2-098 — The Crossword In The Airlock: 15+ docks at the same station, the crossword
      // is on the checklist panel margin. The dressing row paints on the airlock surface the
      // place-graffiti owner already owns; the flag eases the impound grudge exactly once.
      if (count >= CROSSWORD_DOCKS && this._latch('airlock_crossword', now)) {
        bus.emit('graffiti:show', {
          line: 'CHECKLIST PANEL, MARGIN — 5 DOWN: WHAT THE CLAMPS REMEMBER (5). '
            + 'Penciled underneath: DOCKS. Angrier, in grease pencil: WRONG. IT IS GRUDGES (7).',
          where: 'airlock',
          author: 'generations of bored dockers',
          stationId,
          sectorId,
        });
        bus.emit('comms:log', {
          from: 'Airlock checklist panel',
          text: 'The crossword in the checklist margin has an answer penciled in, and a '
            + 'correction under it in grease pencil. Someone has been reading the grudge files.',
          kind: 'special500',
        });
      }

      // SP2-053 — The Third Stool's Letter: ten docks at Quinn's bar. The letter itself is
      // mail.js's flag row; the greeting and the payout nudge read the flag on their owners.
      if (QUINN_STATIONS.includes(stationId) && count >= STOOL_DOCKS
        && this._latch('quinns_stool', now)) {
        bus.emit('comms:log', {
          from: 'Quinn\u2019s Place',
          text: 'The third stool has been reupholstered. Nobody asked for it back.',
          kind: 'special500',
        });
      }

      // SPX-C-01 — The Berth That Moves Out: the first station to its fifth dock is the
      // most-docked station; the berth next door is vacated from here on. The one flood
      // pulse from the departing hull waits for a later dock inside the late day-window.
      if (count >= BERTH_VOID_DOCKS) {
        const armed = this._latch('berth_void_armed', { stationId, at: now });
        if (armed) {
          bus.emit('comms:log', {
            from: 'Dockmaster slate',
            text: 'The berth next to yours was vacated overnight. Swept. Chalked. The slate '
              + 'reads: TENANT TRANSFERRED. NO REASON FILED. NO REASON REQUESTED. One glove '
              + 'left on the cleat, palm up, like it\u2019s waiting for weather.',
            kind: 'special500',
          });
        }
        const arm = flags.berth_void_armed;
        if (arm && arm.stationId === stationId && flags.berth_flood_done == null
          && withinFloodWindow(now)) {
          const pos = stationPos(state, stationId);
          if (pos) {
            flags.berth_flood_done = now;
            bus.emit('presentation:vfxCue', {
              id: 'special500.light',
              lane: 'special500',
              particles: 0,
              lights: 1,
              position: pos,
              magnitude: 1,
              material: 'special500',
              flashReduced: reducedMotion(state),
            });
            bus.emit('comms:log', {
              from: `${stationId} berths`,
              text: 'A departing hull flashed its floods once across your berth before it '
                + 'burned. No call, no sign-off, no reason filed. It does not happen again.',
              kind: 'special500',
            });
          }
        }
      }

      // SP1-184 — The Squatter: dock at the current most-docked station once the habit is
      // established, and your berth has a stranger in it. The gift matches the deed record —
      // that precision is the whole introduction. Once; the formal note is mail.js's row.
      const best = mostDockedStationId(state);
      if (best === stationId && count >= SQUATTER_MIN_DOCKS
        && this._latch('berth_squatter', null)) {
        const deed = pickDeedToTell(state, {
          seed: (state.meta && state.meta.seed) || 0,
          now,
        });
        const gift = deed && DEED_KINDS[deed.kind]
          ? `a ${String(DEED_KINDS[deed.kind].label || deed.kind).toLowerCase()} kit` : 'a sealed tin of good coffee';
        const squatter = { stationId, at: now, deedKind: deed ? deed.kind : null };
        flags.berth_squatter = squatter;
        bus.emit('comms:log', {
          from: 'Your berth',
          text: 'Your berth \u2014 your berth \u2014 has a stranger in it. Berth fee paid, a note '
            + 'on the cleat: "they said someone loves this berth; it looked like just a berth; '
            + `I\u2019m sorry." The gift is ${gift}, chosen with alarming precision.`,
          kind: 'special500',
        });
      }
    },
  };
}

export const special500DockLedger = createSpecial500DockLedger();
