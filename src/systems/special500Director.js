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

import { SPECIAL500_ALL as SPECIAL500 } from '../data/special500/index.js';
import { CAL_DAY_S, CAL_YEAR_DAYS } from '../data/worldCalendar.js';
import { alive, situationMemory } from './crSituationKit.js';

const CHECK_S = 0.5;

// Runtime-only bookkeeping (receipts, throttle, last sector) — deliberately NOT
// on state, so nothing here touches the save schema. Durable state lives in
// state.story.flags only.
const RUNTIME = new WeakMap();

function runtime(state) {
  let rt = RUNTIME.get(state);
  if (!rt) {
    rt = { lastSectorId: null, nextCheckAt: 0 };
    RUNTIME.set(state, rt);
  }
  return rt;
}

// Live-world reads. The catalog was authored against state.player.sectorId/x/z, which
// the real player record does not carry: the live sector is state.world.currentSectorId
// and the hull position is the player entity's pos.
function currentSectorId(state) {
  const w = state && state.world;
  return (w && w.currentSectorId) || (state && state.player && state.player.sectorId) || null;
}

function playerPos(state) {
  const ent = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
  const p = (ent && ent.pos) || (state && state.player && state.player.pos) || state.player;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, z: p.z };
  return null;
}

// A catalog anchor is a world id (station id, poi id, or unique-wreck id). Sources, in
// priority order:
//   1. a live entity stamped data.uniqueWreckId — the hull of a runtime-owned wreck POI
//      (its active.pois row has no authored pos, so the entity is the only true position);
//   2. state.world.active.stations / .pois — the world owner publishes these for the
//      loaded sector, INCLUDING runtime-owned POIs that have no marker entity;
//   3. any live entity with data.stationId / data.poiId.
// The index is rebuilt every check and never persisted: a miss now (sector not loaded,
// station not spawned) retries next check, and nothing goes stale across sector change or
// Continue.
function buildAnchorIndex(state) {
  const index = new Map();
  const put = (id, pos) => {
    if (id && pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) && !index.has(id)) {
      index.set(id, { x: pos.x, z: pos.z });
    }
  };
  const entities = state && state.entities;
  const live = [];
  if (entities && typeof entities.values === 'function') {
    for (const e of entities.values()) {
      const d = e && e.data;
      if (d && e.pos && alive(e) && (d.uniqueWreckId || d.stationId || d.poiId)) live.push(e);
    }
  }
  for (const e of live) put(e.data.uniqueWreckId, e.pos);
  const active = state && state.world && state.world.active;
  if (active) {
    for (const row of active.stations || []) {
      if (row) { put(row.stationId, row.pos); put(row.id, row.pos); }
    }
    for (const row of active.pois || []) {
      if (row) put(row.poiId, row.pos);
    }
  }
  for (const e of live) { put(e.data.stationId, e.pos); put(e.data.poiId, e.pos); }
  return index;
}

/** Anchor id aliases: a catalog row may name the POI id of a runtime-owned unique wreck. */
const ANCHOR_ALIAS = Object.freeze({
  poi_helios_choir_tender: 'wreck_choir_tender',
});

function resolveAnchor(index, anchorId) {
  if (!anchorId) return null;
  const alias = ANCHOR_ALIAS[anchorId];
  // an aliased unique wreck has no authored position: its active.pois row carries a
  // scatter fallback, so only the live hull is a true anchor.
  if (alias) return index.get(alias) || null;
  return index.get(anchorId) || null;
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
    for (const off of this.off || []) { if (typeof off === 'function') off(); }
    this.bus = ctx.bus;
    this.events = [...new Set(SPECIAL500
      .filter((e) => e.trigger && e.trigger.type === 'receipt' && e.trigger.event)
      .map((e) => e.trigger.event))];
    this.off = [];
    for (const ev of this.events) {
      const off = this.bus.on(ev, (payload) => { const l = pendingFor(ev); if (l.length < 64) l.push(payload); });
      this.off.push(off);
    }
  },

  update(dt, state) {
    const rt = runtime(state);
    const now = state.simTime;
    // (a clock that ran backwards — new game on a reused state — re-opens the throttle)
    if (now < rt.nextCheckAt && now >= rt.nextCheckAt - CHECK_S * 2) return;
    rt.nextCheckAt = now + CHECK_S;
    // per-check receipt window: a receipt makes its entries eligible for this
    // check only, then clears — receipts do not accumulate.
    const receipts = new Map(PENDING_RECEIPTS);
    PENDING_RECEIPTS.clear();

    const flags = (state.story && state.story.flags) || {};
    const pos = playerPos(state);
    const sectorId = currentSectorId(state);
    const dayIndex = Math.floor(now / CAL_DAY_S);

    let anchors = null; // built lazily, once per check, only if a proximity row is reached
    for (const e of SPECIAL500) {
      if (e.dormant) continue; // authored-but-unarmed: entry.dormantReason says why
      const t = e.trigger || {};
      // after: extra gate — every listed entry id must already have fired (chains that the
      // single trigger slot cannot express, e.g. proximity AND the predecessor beat).
      if (e.after && !e.after.every((id) => firedAt(state, id) != null)) continue;
      // notBeforeS: the authored "N days in" gate — a pure simTime floor.
      if (e.notBeforeS && now < e.notBeforeS) continue;
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
          if (!pos) break;
          if (!anchors) anchors = buildAnchorIndex(state);
          const anchor = resolveAnchor(anchors, t.nearStation);
          if (!anchor) break;
          const dx = pos.x - anchor.x;
          const dz = pos.z - anchor.z;
          ok = dx * dx + dz * dz <= t.wu * t.wu;
          break;
        }
        case 'receipt': {
          const heard = t.event ? receiptMatches(receipts.get(t.event), t.where) : 0;
          if (!heard) break;
          // nth: fire on the Nth matching receipt (default 1). The running count is a
          // save-carried flag so "third escape" survives Continue.
          const nth = t.nth > 1 ? t.nth | 0 : 1;
          if (nth > 1) {
            const key = `${flagKey(e.id)}.n`;
            const total = ((flags[key] | 0) + heard);
            if (state.story && state.story.flags) state.story.flags[key] = Math.min(total, nth);
            ok = total >= nth;
          } else {
            ok = true;
          }
          break;
        }
        case 'hashDaily':
          ok = seededChance(`${e.id}|${dayIndex}|${(state.meta && state.meta.seed) || 0}`) < (t.chance || 0);
          break;
        case 'simWindow':
          ok = now >= t.startS && now <= t.endS;
          break;
        case 'flag':
          // min: the flag must be a counter at or above this value (e.g. quill_copied >= 2)
          ok = !!(t.requires && (t.min != null ? Number(flags[t.requires]) >= t.min : flags[t.requires]));
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
      recordMemory(state, e.id, currentSectorId(state));
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

// Receipts can arrive between update checks; they park here (event -> payload list) until
// the next update drains them into that check's eligibility window.
const PENDING_RECEIPTS = new Map();

function pendingFor(ev) {
  let list = PENDING_RECEIPTS.get(ev);
  if (!list) { list = []; PENDING_RECEIPTS.set(ev, list); }
  return list;
}

// How many of this window's payloads satisfy the declarative `where` filter
// ({ key: value } shallow equality on the payload). No filter = every receipt counts.
function receiptMatches(payloads, where) {
  if (!payloads || !payloads.length) return 0;
  if (!where) return payloads.length;
  let n = 0;
  for (const p of payloads) {
    if (p && typeof p === 'object' && Object.keys(where).every((k) => p[k] === where[k])) n++;
  }
  return n;
}
