// worldClock.js — PULSE-TIME (build_map row 439), the calendar's announcer.
//
// data/worldCalendar.js is the pure clock face; this system is the bell-ringer: once per
// calendar tick it reads the face for the player's current context (docked berth, else the
// sector) and, on each real transition, speaks the change where the player can hear it:
//
//   shift change    → PA line via comms:popup (ambient) while docked
//   rush hour       → calendar:rushHour event; the side-event planner already thickens traffic
//   shift end       → bar pressure (generateContacts reads barPressureAt)
//   market day      → news:publish headline + price fold via marketDayMults (stationTradeMults)
//   festival        → news:publish headline + comms line + price tilt in the same fold
//   storm season    → news:publish headline when the sector's 7-day season turns stormy
//
// Ownership: writes only state.calendar.emitted (the transition dedupe keys, capped) — every
// announcement fires exactly once per transition. Reads everything else. CALENDAR clock.
// No RNG: the calendar itself is a pure function of simTime.

import { calendarAt } from '../data/worldCalendar.js';
import { SECTORS as SECTORS_REF } from '../data/sectors.js';

const SCHEMA_VERSION = 1;
const EMIT_CAP = 48;

function freshState() {
  return { schemaVersion: SCHEMA_VERSION, emitted: [] };
}

export const worldClock = {
  name: 'worldClock',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._ensureState();
  },

  newGame() {
    this.state.calendar = freshState();
  },

  serialize() {
    return JSON.parse(JSON.stringify(this._ensureState()));
  },

  deserialize(data) {
    const src = data && typeof data === 'object' ? data : {};
    this.state.calendar = {
      schemaVersion: SCHEMA_VERSION,
      emitted: Array.isArray(src.emitted) ? src.emitted.slice(-EMIT_CAP).map(String) : [],
    };
    return this.state.calendar;
  },

  _ensureState() {
    if (!this.state.calendar || typeof this.state.calendar !== 'object') {
      this.state.calendar = freshState();
    }
    if (!Array.isArray(this.state.calendar.emitted)) this.state.calendar.emitted = [];
    return this.state.calendar;
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s) return;
    const simTime = Number(s.simTime) || 0;
    const stationId = s.ui && s.ui.docked ? (s.ui.dockedStationId || null) : null;
    const sectorId = s.world && s.world.currentSectorId || null;
    const stationTypeId = stationId ? stationTypeOf(s, stationId) : null;
    const cal = calendarAt({ simTime, sectorId, stationId, stationTypeId });
    const own = this._ensureState();
    const emitOnce = (key, fn) => {
      if (own.emitted.includes(key)) return;
      own.emitted.push(key);
      if (own.emitted.length > EMIT_CAP) own.emitted.splice(0, own.emitted.length - EMIT_CAP);
      fn();
    };

    // Storm season — sector-scoped, announces whether the player is docked or flying.
    if (cal.storm) {
      const key = `storm:${cal.storm.season}:${sectorId}`;
      if (!cal.storm.stormy) emitOnce(key, () => {});
      else emitOnce(key, () => {
        this._news({
          text: `${cal.storm.label.toUpperCase()} ON THE SECTOR WIRE: ${stormLine(cal.storm.kind)}`,
          sourceRef: `calendar:storm:${sectorId}:${cal.storm.season}`,
          eventId: `calendar:storm:${sectorId}:${cal.storm.season}`,
        });
        this.bus && this.bus.emit('calendar:stormSeason', {
          sectorId, kind: cal.storm.kind, season: cal.storm.season, endsInS: cal.storm.endsInS,
        });
      });
    }

    // Festival — world-wide day; every berth that observes it hears the wire once.
    if (cal.festival) {
      const key = `festival:${cal.festival.id}:${cal.dayOfYear}:${cal.year}`;
      emitOnce(key, () => {
        this._news({
          text: cal.festival.text,
          sourceRef: `calendar:${cal.festival.id}:${cal.year}:${cal.dayOfYear}`,
          eventId: `calendar:${cal.festival.id}:${cal.year}:${cal.dayOfYear}`,
        });
        this.bus && this.bus.emit('calendar:festival', {
          festivalId: cal.festival.id, name: cal.festival.name,
          day: cal.day, dayOfYear: cal.dayOfYear,
        });
      });
    }

    if (!stationId) return;   // berth-scoped events wait for a berth

    // Market day at the docked berth.
    if (cal.marketDay && cal.marketDay.active) {
      const key = `market:${stationId}:${cal.marketDay.day}`;
      emitOnce(key, () => {
        this._news({
          text: `MARKET DAY AT ${stationNameOf(s, stationId)}: open floor on ${cal.marketDay.weekdayName} — sellers undercut, buyers pay up.`,
          sourceRef: `calendar:market:${stationId}:${cal.marketDay.day}`,
          eventId: `calendar:market:${stationId}:${cal.marketDay.day}`,
        });
        this.bus && this.bus.emit('calendar:marketDay', {
          stationId, day: cal.marketDay.day, weekday: cal.marketDay.weekday,
          buyMult: 0.94, sellMult: 1.06,
        });
      });
    }

    // Shift change at the docked berth — the PA says whose watch just started.
    if (cal.shift) {
      const key = `shift:${stationId}:${cal.day}:${cal.shift.index}`;
      emitOnce(key, () => {
        this._popup({
          sender: stationNameOf(s, stationId),
          text: `${cap(cal.shift.name)} is on the floor.${cal.festival ? ' ' + (cal.festival.barLine || '') : ''}`,
          event: 'calendar:shiftChanged',
          payload: { stationId, shift: cal.shift.id, index: cal.shift.index, day: cal.day },
        });
      });
    }

    // Rush hour edge at the docked berth.
    if (cal.rush && cal.rush.active) {
      const key = `rush:${stationId}:${cal.day}:${cal.rush.kind}:${cal.shift.index}`;
      emitOnce(key, () => {
        this.bus && this.bus.emit('calendar:rushHour', {
          stationId, kind: cal.rush.kind, label: cal.rush.label, active: true,
        });
        this._popup({
          sender: 'Dock control',
          text: `Traffic advisory: ${cal.rush.label}. Hold your lane.`,
          event: null,
        });
      });
    }
  },

  _popup({ sender, text, event, payload }) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    if (event && payload) this.bus.emit(event, payload);
    this.bus.emit('comms:popup', {
      id: `cal:${(event || 'note').replace(/[^a-z0-9]+/gi, '-')}:${payload && payload.day != null ? payload.day : ''}`,
      sender, text, category: 'ambient', ttl: 7,
    });
  },

  _news({ text, sourceRef, eventId }) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('news:publish', {
      text, kind: 'events', source: 'calendar-wire', sourceRef, eventId,
    });
  },
};

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function stormLine(kind) {
  switch (kind) {
    case 'ion_storm': return 'scope blackout fronts cycle through the week; follow your engine and the radio.';
    case 'solar_wind': return 'crosswind carries hulls and tow loads all week; leave slack on the line.';
    case 'meteor_shower': return 'moving iron all week; dangerous approaches, rich mining.';
    default: return 'clear weather holds.';
  }
}

function stationNameOf(state, stationId) {
  // Station display names live on the sector records.
  const reg = state && state.content && state.content.sectors;
  const lists = [reg ? (Array.isArray(reg) ? reg : Object.values(reg)) : null, SECTORS_REF];
  for (const list of lists) {
    for (const sec of list || []) {
      for (const st of sec.stations || []) {
        if (st.id === stationId && st.name) return st.name;
      }
    }
  }
  return String(stationId).replace(/^station_/, '').replace(/_/g, ' ');
}

function stationTypeOf(state, stationId) {
  // Station type lives on the sector records (station.type) or a materialized station entity.
  const reg = state && state.content && state.content.sectors;
  const lists = [reg ? (Array.isArray(reg) ? reg : Object.values(reg)) : null, SECTORS_REF];
  for (const list of lists) {
    for (const sec of list || []) {
      for (const st of sec.stations || []) {
        if (st.id === stationId) return st.type || null;
      }
    }
  }
  const ent = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(stationId) : null;
  return (ent && ent.data && ent.data.stationTypeId) || null;
}

export default worldClock;
