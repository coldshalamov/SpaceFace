// src/systems/special500Director.js — runtime for the special-500 catalog.
//
// Evaluates the ratified catalog (src/data/special500/) against sim time, the
// player's sector/position, bus receipts and story flags, and dispatches each
// firing through its channel (comms popup/log, news wire, mail receipt,
// memory record, spectacle tell). One-time semantics persist as
// state.story.flags['special500.<id>']; calendar-recurring entries re-arm per
// world year (state.story.flags['special500.<id>.y']).
//
// Determinism: every trigger reads state.simTime, state.rng-derived hashes of
// (id, dayIndex, seed), proximity, bus receipts or story flags — never wall
// time. Evaluation is throttled and early-outs on the fired-flag lookup, so a
// full catalog costs a few hundred map reads per half-second.

import { SPECIAL500 } from '../data/special500/index.js';
import { CAL_DAY_S, CAL_YEAR_DAYS } from '../data/worldCalendar.js';
import { alive, entityById, situationMemory } from './crSituationKit.js';

const CHECK_S = 0.5;

// Runtime-only bookkeeping (receipts, throttle, last sector) — deliberately NOT
// on state, so nothing here touches the save schema. Durable state lives in
// state.story.flags only.
const RUNTIME = new WeakMap();

function runtime(state) {
  let rt = RUNTIME.get(state);
  if (!rt) {
    rt = { receipts: new Set(), lastSectorId: null, nextCheckAt: 0, anchorCache: new Map() };
    RUNTIME.set(state, rt);
  }
  return rt;
}

// Station/POI entities carry allocated ids; the catalog anchor is their world
// id in data.stationId / data.poiId (or the literal entity id). Resolve once
// per save and cache — stations do not move.
function resolveAnchor(state, rt, anchorId) {
  if (rt.anchorCache.has(anchorId)) {
    const cached = rt.anchorCache.get(anchorId);
    return cached && alive(cached) ? cached : null;
  }
  let found = null;
  const entities = state && state.entities;
  if (entities) {
    if (typeof entities.get === 'function') {
      const direct = entities.get(anchorId);
      if (direct) found = direct;
    }
    if (!found && typeof entities.values === 'function') {
      for (const e of entities.values()) {
        const d = e && e.data;
        if (d && (d.stationId === anchorId || d.poiId === anchorId)) { found = e; break; }
      }
    }
  }
  rt.anchorCache.set(anchorId, found);
  return found && alive(found) ? found : null;
}

function flagKey(id) {
  return `special500.${id}`;
}

function firedAt(state, id) {
  const flags = (state.story && state.story.flags) || {};
  return flags[flagKey(id)];
}

function markFired(state, id, simTime, yearIndex, recurring) {
  if (!state.story) state.story = { flags: {} };
  if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  state.story.flags[flagKey(id)] = simTime;
  if (recurring && Number.isFinite(yearIndex)) {
    state.story.flags[`${flagKey(id)}.y`] = yearIndex;
  }
}

function recordMemory(state, id, sectorId) {
  const memory = situationMemory(state);
  const shapeId = `special500.${id}`;
  const prev = memory.completed[shapeId];
  memory.completed[shapeId] = {
    outcome: 'observed',
    at: state.simTime,
    tick: state.tick | 0,
    encounterId: shapeId,
    sectorId: sectorId || '',
    seed: state.meta && state.meta.seed,
    facts: {},
    visits: ((prev && prev.visits) | 0) + 1,
  };
}

// FNV-1a → [0,1); the seeded daily chance, stable for a save's seed.
export function seededChance(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

function calendarMatches(t, simTime, lastFiredYear) {
  const dayIndex = Math.floor(simTime / CAL_DAY_S);
  const yearIndex = Math.floor(dayIndex / CAL_YEAR_DAYS);
  if (lastFiredYear != null && lastFiredYear >= yearIndex) return -1;
  const dayOfYear = dayIndex % CAL_YEAR_DAYS;
  if (dayOfYear !== t.dayOfYear) return -1;
  if (t.everyYears && yearIndex % t.everyYears !== 0) return -1;
  const withinDay = simTime % CAL_DAY_S;
  const w0 = (t.windowS && t.windowS[0]) || 0;
  const w1 = (t.windowS && t.windowS[1]) != null ? t.windowS[1] : CAL_DAY_S;
  if (withinDay < w0 || withinDay > w1) return -1;
  return yearIndex;
}

export const special500Director = {
  name: 'special500',

  init(ctx) {
    this.bus = ctx.bus;
    this.events = [...new Set(SPECIAL500
      .filter((e) => e.trigger && e.trigger.type === 'receipt' && e.trigger.event)
      .map((e) => e.trigger.event))];
    this.off = [];
    for (const ev of this.events) {
      const off = this.bus.on(ev, () => PENDING_RECEIPTS.add(ev));
      this.off.push(off);
    }
  },

  update(dt, state) {
    const rt = runtime(state);
    const now = state.simTime;
    if (now < rt.nextCheckAt) return;
    rt.nextCheckAt = now + CHECK_S;
    // per-check receipt window: a receipt makes its entries eligible for this
    // check only, then clears — receipts do not accumulate.
    const receipts = rt.receipts;
    for (const ev of PENDING_RECEIPTS) receipts.add(ev);
    PENDING_RECEIPTS.clear();

    const flags = (state.story && state.story.flags) || {};
    const player = state.player || {};
    const sectorId = player.sectorId || null;
    const dayIndex = Math.floor(now / CAL_DAY_S);

    for (const e of SPECIAL500) {
      const t = e.trigger || {};
      if (firedAt(state, e.id) != null && !(e.recurring && t.type === 'calendar')) continue;
      // sector scoping: a catalog entry bound to sectors fires only there
      if (e.sectors && e.sectors.length) {
        if (!sectorId || !e.sectors.includes(sectorId)) continue;
      }
      let yearIndex = -1;
      let ok = false;
      switch (t.type) {
        case 'calendar':
          yearIndex = calendarMatches(t, now, e.recurring ? flags[`${flagKey(e.id)}.y`] : null);
          ok = yearIndex >= 0;
          break;
        case 'sectorEntry':
          ok = !!(sectorId && rt.lastSectorId !== sectorId &&
            (!e.sectors || !e.sectors.length || e.sectors.includes(sectorId)));
          break;
        case 'proximity': {
          if (!Number.isFinite(player.x) || !Number.isFinite(player.z)) break;
          const anchor = resolveAnchor(state, rt, t.nearStation);
          if (!anchor) break;
          const dx = player.x - anchor.x;
          const dz = player.z - anchor.z;
          ok = dx * dx + dz * dz <= t.wu * t.wu;
          break;
        }
        case 'receipt':
          ok = t.event ? receipts.has(t.event) : false;
          break;
        case 'hashDaily':
          ok = seededChance(`${e.id}|${dayIndex}|${(state.meta && state.meta.seed) || 0}`) < (t.chance || 0);
          break;
        case 'simWindow':
          ok = now >= t.startS && now <= t.endS;
          break;
        case 'flag':
          ok = !!(t.requires && flags[t.requires]);
          break;
        default:
          break;
      }
      if (!ok) continue;
      this.fire(e, state, rt, yearIndex);
    }

    if (sectorId) rt.lastSectorId = sectorId;
  },

  fire(e, state, rt, yearIndex) {
    markFired(state, e.id, state.simTime, yearIndex, e.recurring);
    if (e.channel === 'memory' || e.channel === 'spectacle') {
      recordMemory(state, e.id, state.player && state.player.sectorId);
    }
    const p = e.payload || {};
    if (e.channel === 'comms') {
      this.bus.emit('comms:popup', {
        id: `special500.${e.id}.${state.tick | 0}`,
        category: 'ambient',
        sender: p.from || e.title,
        text: p.text || e.title,
        ttl: p.ttl || 5,
      });
    } else if (e.channel === 'commsLog' || e.channel === 'spectacle') {
      this.bus.emit('comms:log', {
        from: p.from || e.title,
        text: p.text || e.title,
        kind: 'special500',
      });
    } else if (e.channel === 'news') {
      this.bus.emit('news:publish', {
        text: p.text || e.title,
        kind: p.kind || 'incidents',
        source: 'watch-relay',
        sourceRef: `special500:${e.id}`,
        eventId: `special500:${e.id}`,
      });
    } else if (e.channel === 'mail') {
      this.bus.emit(p.event || `special500:${e.id}`);
    }
  },
};

// Receipts can arrive between update checks; they park here until the next
// update drains them into that check's eligibility window.
const PENDING_RECEIPTS = new Set();
